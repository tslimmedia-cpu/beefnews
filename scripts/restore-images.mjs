/**
 * restore-images.mjs
 * Downloads all missing wp-content images from the Wayback Machine
 * and saves them under public/ at the same path so existing URLs work.
 */

import fs from "fs";
import path from "path";
import https from "https";
import http from "http";

const CONTENT_DIR = "/Users/tsm/Desktop/Beef Maps/beefnews/src/content/news";
const PUBLIC_DIR  = "/Users/tsm/Desktop/Beef Maps/beefnews/public";
// ── 1. Collect all unique wp-content image URLs ───────────────────────────────
const urls = new Set();
for (const file of fs.readdirSync(CONTENT_DIR)) {
  if (!file.endsWith(".md")) continue;
  const content = fs.readFileSync(path.join(CONTENT_DIR, file), "utf8");
  const match = content.match(/^image:\s+"(https:\/\/beefnews\.org\/wp-content\/[^"]+)"/m);
  if (match) urls.add(match[1]);
}

console.log(`[restore] Found ${urls.size} unique wp-content images to fetch\n`);

// ── 2. Fetch helper (follows redirects, 20s timeout) ─────────────────────────
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timeout")), 20000);

    function get(u, redirects = 0) {
      if (redirects > 10) { clearTimeout(timeout); return reject(new Error("Too many redirects")); }
      const mod = u.startsWith("https") ? https : http;
      mod.get(u, { headers: { "User-Agent": "Mozilla/5.0 (compatible; BeefNews-ImageRestore/1.0)" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return get(res.headers.location, redirects + 1);
        }
        clearTimeout(timeout);
        resolve(res);
      }).on("error", (e) => { clearTimeout(timeout); reject(e); });
    }

    get(url);
  });
}

function download(url, dest) {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await fetchUrl(url);
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
      file.on("error", (e) => { fs.unlink(dest, () => {}); reject(e); });
    } catch(e) { reject(e); }
  });
}

// Use CDX API to find the best available snapshot timestamp
function findSnapshot(imageUrl) {
  return new Promise((resolve) => {
    const cdx = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(imageUrl)}&output=json&fl=timestamp&limit=1&filter=statuscode:200&from=20240101&to=20260501`;
    const timeout = setTimeout(() => resolve(null), 10000);
    https.get(cdx, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      let data = "";
      res.on("data", (d) => data += d);
      res.on("end", () => {
        clearTimeout(timeout);
        try {
          const rows = JSON.parse(data);
          if (rows.length > 1) resolve(rows[1][0]); // rows[0] is header
          else resolve(null);
        } catch { resolve(null); }
      });
    }).on("error", () => { clearTimeout(timeout); resolve(null); });
  });
}

// ── 3. Process each URL ───────────────────────────────────────────────────────
let ok = 0, skipped = 0, failed = 0;
const failedUrls = [];

for (const imageUrl of urls) {
  const urlPath = new URL(imageUrl).pathname;
  const dest    = path.join(PUBLIC_DIR, urlPath);

  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    skipped++;
    continue;
  }

  process.stdout.write(`  ↓ ${path.basename(urlPath)} ... `);

  // 1. Find best snapshot timestamp via CDX
  const ts = await findSnapshot(imageUrl);
  await new Promise(r => setTimeout(r, 1500)); // be polite after CDX query

  let success = false;

  if (ts) {
    const waybackUrl = `https://web.archive.org/web/${ts}if_/${imageUrl}`;
    try {
      await download(waybackUrl, dest);
      console.log(`✓ (${ts.slice(0,8)})`);
      ok++;
      success = true;
    } catch (err) {
      // fall through to generic attempts
    }
  }

  if (!success) {
    // Try a series of generic timestamps
    const stamps = ["20260301000000", "20251001000000", "20250601000000", "20250101000000", "20240901000000"];
    for (const stamp of stamps) {
      try {
        await download(`https://web.archive.org/web/${stamp}if_/${imageUrl}`, dest);
        console.log(`✓ (fallback ${stamp.slice(0,8)})`);
        ok++;
        success = true;
        break;
      } catch { /* try next */ }
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  if (!success) {
    console.log("✗ not in archive");
    failed++;
    failedUrls.push(imageUrl);
  }

  // Polite delay between images
  await new Promise(r => setTimeout(r, 2000));
}

console.log(`\n[restore] Done — ${ok} downloaded, ${skipped} already existed, ${failed} failed`);
if (failedUrls.length) {
  console.log("\nFailed URLs (images not in Wayback Machine):");
  failedUrls.forEach(u => console.log("  ", u));
}
