/**
 * sync-midwesterner.mjs
 * Scrapes Breeauna Sagdal's articles from The Midwesterner using Playwright
 * (Cloudflare-protected site, requires real browser)
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const AUTHOR_URL  = "https://www.themidwesterner.news/author/breeaunasagdal/";
const CONTENT_DIR = "/Users/tsm/Desktop/Beef Maps/beefnews/src/content/news";
const PARTNER_NAME = "The Midwesterner";
const PARTNER_SITE = "https://www.themidwesterner.news";
const MAX_ARTICLES = 20;

// ── Helpers ───────────────────────────────────────────────────────────────────
function slugify(str) {
  return str.toLowerCase()
    .replace(/[''""]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 75);
}

function htmlToMarkdown(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "# $1\n\n")
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "## $1\n\n")
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "### $1\n\n")
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "#### $1\n\n")
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**")
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**")
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "*$1*")
    .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, "*$1*")
    .replace(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    .replace(/<img[^>]+src="([^"]+)"[^>]*(?:alt="([^"]*)")?[^>]*\/?>/gi, (_, src, alt) => `![${alt||""}](${src})\n\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n")
    .replace(/<\/?ul[^>]*>/gi, "\n")
    .replace(/<\/?ol[^>]*>/gi, "\n")
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, "> $1\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<\/?(div|section|article|figure|figcaption|span|header|footer)[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function loadExistingUrls() {
  const urls = new Set();
  for (const file of fs.readdirSync(CONTENT_DIR)) {
    if (!file.endsWith(".md")) continue;
    const content = fs.readFileSync(path.join(CONTENT_DIR, file), "utf8");
    const match = content.match(/^canonicalUrl:\s+"([^"]+)"/m);
    if (match) urls.add(match[1]);
  }
  return urls;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
});
const page = await context.newPage();

const existingUrls = loadExistingUrls();

// Remove old Substack Breeauna articles
let removed = 0;
for (const file of fs.readdirSync(CONTENT_DIR)) {
  if (!file.startsWith("breeauna-sagdal-")) continue;
  fs.unlinkSync(path.join(CONTENT_DIR, file));
  removed++;
}
console.log(`[sync] Removed ${removed} old Substack Breeauna articles\n`);

// Collect article URLs from author pages
console.log("[sync] Collecting article links...");
const articleLinks = [];
let pageUrl = AUTHOR_URL;

while (articleLinks.length < MAX_ARTICLES) {
  await page.goto(pageUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("article a, .post a, h2 a, h3 a, .entry-title a"))
      .map(a => a.href)
      .filter(href => href && href.includes("themidwesterner.news") && !href.includes("/category/") && !href.includes("/author/") && !href.includes("/page/"))
      .filter((v, i, a) => a.indexOf(v) === i); // unique
  });

  // Fallback: grab all internal article-style links
  if (links.length === 0) {
    const allLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a[href]"))
        .map(a => a.href)
        .filter(href => /themidwesterner\.news\/\d{4}\/\d{2}\//.test(href))
        .filter((v, i, a) => a.indexOf(v) === i);
    });
    links.push(...allLinks);
  }

  console.log(`  Page: ${pageUrl} → ${links.length} articles`);
  articleLinks.push(...links);

  // Look for next page
  const nextUrl = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll("a"));
    const next = candidates.find(a =>
      a.rel === "next" ||
      a.className.includes("nav-next") ||
      a.className.includes("next") ||
      a.textContent.trim() === "Next" ||
      a.textContent.trim() === "→"
    );
    return next ? next.href : null;
  });
  if (!nextUrl || nextUrl === pageUrl) break;
  pageUrl = nextUrl;
}

const uniqueLinks = [...new Set(articleLinks)].slice(0, MAX_ARTICLES);
console.log(`\n[sync] Found ${uniqueLinks.length} total articles to import\n`);

// Scrape each article
let created = 0;
for (const url of uniqueLinks) {
  if (existingUrls.has(url)) {
    console.log(`  skip (exists): ${url}`);
    continue;
  }

  process.stdout.write(`  ↓ ${url.split("/").filter(Boolean).pop()} ... `);

  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    const data = await page.evaluate(() => {
      // Title
      const title = document.querySelector("h1.entry-title, h1.post-title, h1, .entry-header h1")?.textContent?.trim() || document.title;

      // Date
      const dateEl = document.querySelector("time[datetime], .entry-date, .post-date, time");
      const pubDate = dateEl?.getAttribute("datetime") || dateEl?.textContent?.trim() || "";

      // Category
      const catEl = document.querySelector(".entry-category a, .cat-links a, .category a, [rel='category tag']");
      const category = catEl?.textContent?.trim() || "News";

      // Author
      const authorEl = document.querySelector(".entry-author, .author-name, [rel='author'], .byline");
      const author = authorEl?.textContent?.replace("by", "").trim() || "Breeauna Sagdal";

      // Hero image
      const imgEl = document.querySelector(".entry-content img:first-of-type, .post-thumbnail img, .featured-image img, article img:first-of-type, .wp-post-image");
      const image = imgEl?.src || imgEl?.getAttribute("data-src") || "";

      // Content
      const contentEl = document.querySelector(".entry-content, .post-content, .article-content, article .content, main article");
      const contentHtml = contentEl?.innerHTML || "";

      // Excerpt — first real paragraph
      const firstP = contentEl?.querySelector("p")?.textContent?.trim() || "";

      return { title, pubDate, category, author, image, contentHtml, firstP };
    });

    if (!data.title) { console.log("✗ (no title)"); continue; }

    const markdown = htmlToMarkdown(data.contentHtml);
    const excerpt = data.firstP.slice(0, 200).replace(/"/g, "'") + (data.firstP.length > 200 ? "..." : "");

    // Parse date
    let dateIso = new Date().toISOString().split("T")[0];
    if (data.pubDate) {
      const d = new Date(data.pubDate);
      if (!isNaN(d)) dateIso = d.toISOString().split("T")[0];
    }

    const filename = `breeauna-sagdal-${slugify(data.title)}.md`;
    const filePath  = path.join(CONTENT_DIR, filename);

    const frontmatter = `---
title: "${data.title.replace(/"/g, "'")}"
pubDate: ${dateIso}
author: "Breeauna Sagdal"
excerpt: "${excerpt}"
${data.image ? `image: "${data.image}"` : ""}
category: "${data.category}"
tags: ["The Midwesterner", "Breeauna Sagdal"]
partner: true
partnerName: "${PARTNER_NAME}"
partnerSite: "${PARTNER_SITE}"
canonicalUrl: "${url}"
---

`;

    fs.writeFileSync(filePath, frontmatter + markdown, "utf8");
    console.log(`✓ (${dateIso})`);
    created++;

    await page.waitForTimeout(800);
  } catch (err) {
    console.log(`✗ (${err.message.slice(0, 60)})`);
  }
}

await browser.close();
console.log(`\n[sync] Done — ${created} new Midwesterner articles imported`);
