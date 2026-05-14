/**
 * Lightweight RSS fetcher — no external dependencies.
 * Runs at Astro build time (Node.js environment).
 */

export interface RSSItem {
  title: string;
  url: string;
  excerpt: string;       // plain text, ~200 chars
  pubDate: Date;
  author: string;
  categories: string[];
  image?: string;        // og:image or media:thumbnail if present
  partnerName: string;
  partnerSite: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Decode common HTML entities to plain text. */
function decodeEntities(str: string): string {
  return str
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#8216;|&#8217;|&lsquo;|&rsquo;/g, "'")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&#038;|&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, "")   // remaining numeric entities
    .replace(/&[a-z]+;/g, ""); // remaining named entities
}

/** Strip HTML tags and collapse whitespace. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Truncate to ~maxLen chars on a word boundary. */
function truncate(s: string, maxLen = 200): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
}

/** Pull the first <tag>...</tag> match from XML text. */
function grab(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, "").trim() : "";
}

/** Pull all matches of <tag>...</tag>. */
function grabAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, "").trim());
  }
  return results;
}

/** Try to extract an image URL from item XML (media:thumbnail, enclosure, or og meta). */
function extractImage(itemXml: string): string | undefined {
  // media:thumbnail
  let m = itemXml.match(/media:thumbnail[^/]*url="([^"]+)"/i);
  if (m) return m[1];
  // enclosure
  m = itemXml.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image/i);
  if (m) return m[1];
  // img inside content:encoded
  m = itemXml.match(/<img[^>]+src="([^"]+)"/i);
  if (m) return m[1];
  return undefined;
}

// ── Main fetch ────────────────────────────────────────────────────────────────

export async function fetchRSS(
  feedUrl: string,
  partnerName: string,
  partnerSite: string,
  limit = 6
): Promise<RSSItem[]> {
  let xml: string;
  try {
    const res = await fetch(feedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BeefNews/1.0; +https://beefnews.org)",
        "Accept": "text/html, application/rss+xml, application/xml, */*",
        "Accept-Encoding": "gzip, deflate",
      },
      // 8s timeout via AbortController
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    xml = await res.text();
  } catch (err) {
    console.warn(`[rss] Failed to fetch ${feedUrl}:`, err);
    return [];
  }

  // Split into <item> blocks
  const itemBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];

  return itemBlocks.slice(0, limit).map((block): RSSItem => {
    const title   = decodeEntities(grab(block, "title"));
    const url     = grab(block, "link") || grab(block, "guid");
    const rawDesc = grab(block, "description") || grab(block, "content:encoded");
    const excerpt = truncate(decodeEntities(stripHtml(rawDesc)));
    const author  = decodeEntities(grab(block, "dc:creator") || grab(block, "author")) || partnerName;
    const dateStr = grab(block, "pubDate") || grab(block, "dc:date");
    const pubDate = dateStr ? new Date(dateStr) : new Date();
    const catMatches = grabAll(block, "category");
    const categories = catMatches.map(decodeEntities).filter(Boolean);
    const image   = extractImage(block);

    return { title, url, excerpt, pubDate, author, categories, image, partnerName, partnerSite };
  });
}
