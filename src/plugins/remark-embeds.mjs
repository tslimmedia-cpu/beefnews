/**
 * remark-embeds.mjs
 *
 * Remark plugin that detects standalone URLs in markdown and converts them:
 *   - Twitter/X URLs  → embedded tweet (dark theme, no tracking)
 *   - Any other URL   → OG link-preview card
 *
 * Runs at build time — OG metadata is fetched once and cached in
 * .astro/og-cache.json so subsequent builds are instant.
 */

import { visit } from "unist-util-visit";
import https from "node:https";
import http  from "node:http";
import fs    from "node:fs";

// ── Patterns ──────────────────────────────────────────────────────────────────
const TWEET_RE = /^https?:\/\/(www\.)?(twitter\.com|x\.com)\/.+\/status\/\d+/i;
const URL_RE   = /^https?:\/\//;

// ── OG cache (persisted between builds) ──────────────────────────────────────
const CACHE_PATH = ".astro/og-cache.json";
let ogCache = {};
try { ogCache = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")); } catch {}

function saveCache() {
  try {
    fs.mkdirSync(".astro", { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(ogCache, null, 2));
  } catch {}
}

// ── OG fetcher ────────────────────────────────────────────────────────────────
function fetchOG(url) {
  if (ogCache[url]) return Promise.resolve(ogCache[url]);

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 8000);

    function get(u, hops = 0) {
      if (hops > 5) { clearTimeout(timer); return resolve(null); }
      const mod = u.startsWith("https") ? https : http;
      const req = mod.get(u, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; BeefNews-LinkPreview/1.0)",
          "Accept": "text/html,application/xhtml+xml",
        },
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return get(new URL(res.headers.location, u).href, hops + 1);
        }
        if (res.statusCode !== 200) {
          res.resume(); clearTimeout(timer); return resolve(null);
        }
        let html = "";
        res.setEncoding("utf8");
        res.on("data", (c) => { html += c; if (html.length > 60000) res.destroy(); });
        res.on("end", () => {
          clearTimeout(timer);
          const og = parseOG(html, u);
          ogCache[url] = og;
          saveCache();
          resolve(og);
        });
        res.on("error", () => { clearTimeout(timer); resolve(null); });
      });
      req.on("error", () => { clearTimeout(timer); resolve(null); });
    }

    get(url);
  });
}

function parseOG(html, url) {
  const prop = (name) => {
    const m = html.match(
      new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"'<>]{1,500})["']`, "i")
    ) || html.match(
      new RegExp(`<meta[^>]+content=["']([^"'<>]{1,500})["'][^>]+(?:property|name)=["']${name}["']`, "i")
    );
    return m ? m[1].trim() : "";
  };
  const titleTag = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
  let domain = url;
  try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch {}

  return {
    title:       prop("og:title")       || prop("twitter:title")       || (titleTag ? titleTag[1].trim() : domain),
    description: prop("og:description") || prop("twitter:description") || prop("description"),
    image:       prop("og:image")       || prop("twitter:image"),
    siteName:    prop("og:site_name")   || domain,
    url,
  };
}

// ── HTML renderers ────────────────────────────────────────────────────────────
function tweetHTML(url) {
  return `<div class="not-prose my-8 flex justify-center">
  <blockquote class="twitter-tweet" data-theme="dark" data-dnt="true">
    <a href="${url}">Loading tweet…</a>
  </blockquote>
  <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"><\/script>
</div>`;
}

function linkCardHTML({ title, description, image, siteName, url }) {
  const esc = (s) => (s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer"
  class="not-prose group flex flex-col sm:flex-row my-6 rounded-xl border border-zinc-800 hover:border-secondary/40 overflow-hidden bg-black transition-colors no-underline">
  ${image ? `<div class="sm:w-48 sm:shrink-0 overflow-hidden bg-zinc-900">
    <img src="${esc(image)}" alt="" class="w-full h-36 sm:h-full object-cover opacity-75 group-hover:opacity-100 transition-opacity" loading="lazy" />
  </div>` : ""}
  <div class="p-4 flex-1 min-w-0 flex flex-col justify-center">
    <p class="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">${esc(siteName)}</p>
    <h3 class="font-headline font-bold text-white text-sm leading-snug mb-1.5 line-clamp-2 group-hover:text-secondary transition-colors">${esc(title)}</h3>
    ${description ? `<p class="text-zinc-400 text-xs leading-relaxed line-clamp-2">${esc(description)}</p>` : ""}
  </div>
</a>`;
}

function fallbackLinkHTML(url) {
  let domain = url;
  try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch {}
  return `<a href="${url}" target="_blank" rel="noopener noreferrer"
  class="not-prose flex items-center gap-2 my-4 px-4 py-3 rounded-xl border border-zinc-800 hover:border-secondary/40 bg-black text-zinc-300 hover:text-secondary transition-colors text-sm no-underline">
  <span style="font-family:Material Symbols Outlined;font-size:16px;flex-shrink:0">open_in_new</span>
  <span class="truncate">${domain}</span>
</a>`;
}

// ── Plugin ────────────────────────────────────────────────────────────────────
export function remarkEmbeds() {
  return async (tree) => {
    const queue = [];

    visit(tree, "paragraph", (node, index, parent) => {
      if (!parent || node.children.length !== 1) return;
      const child = node.children[0];

      let url = null;
      if (child.type === "text")  url = child.value.trim();
      if (child.type === "link" && child.children.length === 1 && child.children[0].value === child.url)
        url = child.url;

      if (!url || !URL_RE.test(url)) return;
      queue.push({ node, index, parent, url });
    });

    for (const { node, index, parent, url } of queue) {
      if (TWEET_RE.test(url)) {
        parent.children[index] = { type: "html", value: tweetHTML(url) };
      } else {
        const og = await fetchOG(url);
        parent.children[index] = {
          type: "html",
          value: og ? linkCardHTML(og) : fallbackLinkHTML(url),
        };
      }
    }
  };
}
