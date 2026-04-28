/**
 * sync-partners.mjs
 *
 * Fetches the RSS feed for every partner and creates a markdown file in
 * src/content/news/ for each article that hasn't been imported yet
 * (detected by matching canonicalUrl in existing frontmatter).
 *
 * Usage:
 *   node scripts/sync-partners.mjs
 *   npm run sync
 *
 * Run before every build to stay current:
 *   npm run sync && npm run build
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.join(__dirname, "../src/content/news");

// ── Partner registry ──────────────────────────────────────────────────────────
// Keep in sync with src/data/partners.ts.  category is used for the
// content-collection field; you can override per-partner.

const PARTNERS = [
  {
    name:     "Mike Callicrate",
    site:     "https://nobull.mikecallicrate.com",
    feed:     "https://nobull.mikecallicrate.com/feed/",
    category: "Industry",
    limit:    20,
  },
  {
    name:     "Trent Loos",
    site:     "https://trentloos.substack.com",
    feed:     "https://trentloos.substack.com/feed",
    category: "Cowboy Talk",
    limit:    20,
  },
  // Breeauna Sagdal is imported via scripts/sync-midwesterner.mjs
  // (themidwesterner.news is Cloudflare-protected, requires real browser)
];

// ── HTML → Markdown converter (zero dependencies) ────────────────────────────

function decodeEntities(str) {
  return str
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#8216;|&#8217;|&lsquo;|&rsquo;/g, "'")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&#038;|&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, "")
    .replace(/&[a-z]+;/g, "");
}

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(s, maxLen = 220) {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
}

function grab(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, "").trim() : "";
}

function grabAll(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null)
    out.push(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, "").trim());
  return out;
}

function extractImage(block) {
  let m = block.match(/media:thumbnail[^/]*url="([^"]+)"/i);
  if (m) return m[1];
  m = block.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image/i);
  if (m) return m[1];
  m = block.match(/<img[^>]+src="([^"]+)"/i);
  if (m) return m[1];
  return undefined;
}

/**
 * Lightweight HTML → Markdown.
 * Handles the most common elements found in RSS content:encoded fields.
 */
function htmlToMarkdown(html) {
  if (!html) return "";
  let md = html;

  // ── Strip junk ──────────────────────────────────────────────────────────────
  md = md.replace(/<script[\s\S]*?<\/script>/gi, "");
  md = md.replace(/<style[\s\S]*?<\/style>/gi, "");
  // Substack share / subscribe CTAs
  md = md.replace(/<div[^>]*class="[^"]*(?:share|subscribe|button-wrapper)[^"]*"[\s\S]*?<\/div>/gi, "");
  // WordPress share divs
  md = md.replace(/<div[^>]*class="sharedaddy[\s\S]*?<\/div>\s*<\/div>/gi, "");

  // ── Block elements ──────────────────────────────────────────────────────────
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n\n# $1\n\n");
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n\n## $1\n\n");
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n\n### $1\n\n");
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n\n#### $1\n\n");
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, "\n\n##### $1\n\n");

  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, inner) =>
    "\n\n" + stripHtml(inner).trim().split(/\n+/).map(l => `> ${l}`).join("\n") + "\n\n"
  );

  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, inner) =>
    "\n- " + stripHtml(inner).trim()
  );
  md = md.replace(/<\/?[uo]l[^>]*>/gi, "\n");

  // ── Inline elements ─────────────────────────────────────────────────────────
  md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**");
  md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "_$1_");
  md = md.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, "_$1_");

  // Links — keep images inside links as images only
  md = md.replace(
    /<a[^>]+href="([^"]+)"[^>]*>\s*(<img[^>]+src="([^"]+)"[^>]*\/?>\s*)<\/a>/gi,
    "![]($3)"
  );
  md = md.replace(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");

  // Images
  md = md.replace(/<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, "![$2]($1)");
  md = md.replace(/<img[^>]+src="([^"]+)"[^>]*\/?>/gi, "![]($1)");

  // ── Whitespace elements ─────────────────────────────────────────────────────
  md = md.replace(/<br\s*\/?>/gi, "\n");
  md = md.replace(/<\/p>/gi,  "\n\n");
  md = md.replace(/<p[^>]*>/gi, "");
  md = md.replace(/<\/div>/gi, "\n");
  md = md.replace(/<hr[^>]*\/?>/gi, "\n\n---\n\n");

  // ── Strip remaining tags ────────────────────────────────────────────────────
  md = md.replace(/<[^>]+>/g, "");

  // ── Decode entities & tidy whitespace ──────────────────────────────────────
  md = decodeEntities(md);
  md = md.replace(/\n{3,}/g, "\n\n").trim();

  return md;
}

// ── Slug / YAML helpers ───────────────────────────────────────────────────────

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 75);
}

/** Escape a string for use inside YAML double-quotes. */
function yamlStr(s) {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, " ")
    .trim();
}

// ── Core logic ────────────────────────────────────────────────────────────────

/** Collect every canonicalUrl already present in the news collection. */
function loadExistingUrls() {
  const urls = new Set();
  for (const file of fs.readdirSync(CONTENT_DIR)) {
    if (!file.endsWith(".md")) continue;
    const text = fs.readFileSync(path.join(CONTENT_DIR, file), "utf8");
    const m = text.match(/canonicalUrl:\s*"([^"]+)"/);
    if (m) urls.add(m[1].trim());
  }
  return urls;
}

async function fetchXml(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "BeefNews/1.0 (RSS sync)" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    console.warn(`  ✗ Could not fetch ${url}: ${err.message}`);
    return null;
  }
}

function parseItems(xml, limit) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  return blocks.slice(0, limit).map(block => {
    const title      = decodeEntities(grab(block, "title"));
    const url        = grab(block, "link") || grab(block, "guid");
    const rawContent = grab(block, "content:encoded") || grab(block, "description");
    const rawDesc    = grab(block, "description") || rawContent;
    const excerpt    = truncate(decodeEntities(stripHtml(rawDesc)));
    const author     = decodeEntities(grab(block, "dc:creator") || grab(block, "author"));
    const dateStr    = grab(block, "pubDate") || grab(block, "dc:date");
    const pubDate    = dateStr ? new Date(dateStr) : new Date();
    const image      = extractImage(block);
    return { title, url, excerpt, author, pubDate, image, content: rawContent };
  });
}

function writeArticle(partner, item, existingUrls) {
  const prefix    = slugify(partner.name);
  const titleSlug = slugify(item.title);
  let   filename  = `${prefix}-${titleSlug}.md`;
  let   filePath  = path.join(CONTENT_DIR, filename);

  // Avoid filename collision (different article, same slug)
  for (let n = 2; fs.existsSync(filePath); n++) {
    filename = `${prefix}-${titleSlug}-${n}.md`;
    filePath = path.join(CONTENT_DIR, filename);
  }

  const pubDateStr = item.pubDate.toISOString().split("T")[0];
  const author     = item.author || partner.name;
  const imageYaml  = item.image ? `\nimage: "${yamlStr(item.image)}"` : "";
  const body       = htmlToMarkdown(item.content || "");

  const fileContent = `---
title: "${yamlStr(item.title)}"
pubDate: ${pubDateStr}
author: "${yamlStr(author)}"
excerpt: "${yamlStr(item.excerpt)}"${imageYaml}
category: "${partner.category}"
tags: []
featured: false
partner: true
partnerName: "${partner.name}"
partnerSite: "${partner.site}"
canonicalUrl: "${item.url}"
---

${body}
`;

  fs.writeFileSync(filePath, fileContent, "utf8");
  existingUrls.add(item.url);
  return filename;
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  const existingUrls = loadExistingUrls();
  console.log(`[sync] ${existingUrls.size} articles already in collection\n`);

  let totalCreated = 0;

  for (const partner of PARTNERS) {
    console.log(`[sync] ── ${partner.name}`);
    console.log(`         ${partner.feed}`);

    const xml = await fetchXml(partner.feed);
    if (!xml) { console.log(""); continue; }

    const items = parseItems(xml, partner.limit);
    console.log(`         ${items.length} items in feed`);

    let created = 0;
    for (const item of items) {
      if (!item.url || !item.title) continue;
      if (existingUrls.has(item.url))  continue;   // already imported

      const filename = writeArticle(partner, item, existingUrls);
      console.log(`       + ${filename}`);
      created++;
    }

    console.log(`         ${created} new article(s) created\n`);
    totalCreated += created;
  }

  console.log(`[sync] Done — ${totalCreated} new article(s) total`);
}

main().catch(err => { console.error(err); process.exit(1); });
