/**
 * og-proxy.js — Netlify Function
 *
 * Fetches Open Graph metadata for a given URL and returns it as JSON.
 * Used by the Decap CMS live-preview pane to render link-card previews
 * while a writer is composing an article.
 *
 * Usage: GET /.netlify/functions/og-proxy?url=https://example.com
 */

const https = require("https");
const http  = require("http");

// ── OG fetcher ────────────────────────────────────────────────────────────────
function fetchOG(url) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 8000);

    function get(u, hops) {
      hops = hops || 0;
      if (hops > 5) { clearTimeout(timer); return resolve(null); }

      const mod = u.startsWith("https") ? https : http;
      const req = mod.get(u, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; BeefNews-Preview/1.0)",
          "Accept":     "text/html,application/xhtml+xml",
        },
      }, (res) => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          var next;
          try { next = new URL(res.headers.location, u).href; } catch(e) { next = res.headers.location; }
          return get(next, hops + 1);
        }

        if (res.statusCode !== 200) {
          res.resume();
          clearTimeout(timer);
          return resolve(null);
        }

        let html = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          html += chunk;
          if (html.length > 60000) res.destroy(); // stop after 60 KB
        });
        res.on("end", () => {
          clearTimeout(timer);
          resolve(parseOG(html, u));
        });
        res.on("error", () => { clearTimeout(timer); resolve(null); });
      });

      req.on("error", () => { clearTimeout(timer); resolve(null); });
    }

    get(url, 0);
  });
}

// ── OG parser ─────────────────────────────────────────────────────────────────
function parseOG(html, url) {
  function prop(name) {
    const m = html.match(
      new RegExp('<meta[^>]+(?:property|name)=["\']' + name + '["\'][^>]+content=["\']([^"\'<>]{1,500})["\']', 'i')
    ) || html.match(
      new RegExp('<meta[^>]+content=["\']([^"\'<>]{1,500})["\'][^>]+(?:property|name)=["\']' + name + '["\']', 'i')
    );
    return m ? m[1].trim() : "";
  }

  const titleTag = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
  let domain = url;
  try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch(e) {}

  return {
    title:       prop("og:title")       || prop("twitter:title")       || (titleTag ? titleTag[1].trim() : domain),
    description: prop("og:description") || prop("twitter:description") || prop("description"),
    image:       prop("og:image")       || prop("twitter:image"),
    siteName:    prop("og:site_name")   || domain,
    url,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const url    = params.url;

  if (!url || !/^https?:\/\//i.test(url)) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing or invalid url parameter" }),
    };
  }

  const og = await fetchOG(url);

  return {
    statusCode: 200,
    headers: {
      "Content-Type":                "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control":               "public, max-age=3600, s-maxage=3600",
    },
    body: JSON.stringify(og),
  };
};
