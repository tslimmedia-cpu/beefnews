# BeefNews.org — Claude Instructions

## What This Site Is
Astro static site at **beefnews.org** — news publication for the Rancher Direct beef industry. Content lives in `src/content/news/` as markdown files. Site auto-deploys via Netlify when code is pushed to GitHub.

## Publishing an Article

### Step 1 — Get the content
Accept a `.docx` as:
- **Local file path** — use `pandoc /path/to/file.docx -t markdown` to extract text, then `unzip -o /path/to/file.docx "word/media/*" -d /tmp/docx-extract/` to get embedded images
- **Google Drive link** — extract the file ID from the URL, use the Google Drive MCP tool (`mcp__be783b60...`) to fetch metadata then download as base64, decode with python3, save to `/tmp/article.docx`, then run pandoc + unzip as above

### Step 2 — Extract the hero image
```bash
unzip -o /tmp/article.docx "word/media/*" -d /tmp/docx-extract/
# image will be in /tmp/docx-extract/word/media/
cp /tmp/docx-extract/word/media/IMAGE.jpg "/Users/tsm/Desktop/Beef Maps/beefnews/public/images/uploads/DESCRIPTIVE-NAME.jpg"
```

### Step 3 — Create the markdown file
Save to: `/Users/tsm/Desktop/Beef Maps/beefnews/src/content/news/SLUG.md`

Slug = lowercase title, hyphens, max ~60 chars.

**Frontmatter template:**
```yaml
---
title: "Full Article Title"
pubDate: 2026-05-14T00:00:00-05:00
author: "Beef News"
excerpt: "1-2 sentence summary. Used in cards and SEO."
image: "/images/uploads/DESCRIPTIVE-NAME.jpg"
imageAlt: "Alt text for hero image."
category: "Category Name"
tags: ["tag1", "tag2", "tag3"]
featured: true
---
```

**Available categories:**
Antitrust, Beef Maps, Business, Climate, Cowboy Talk, Culture, Events, Farm Policy, Health, Hurricane Helene, Industry, Investigative, JBS, News, Policy, Video

**Partner/syndicated articles** add these fields:
```yaml
partner: true
partnerName: "Mike Callicrate"
partnerSite: "https://nobull.mikecallicrate.com"
canonicalUrl: "https://original-url.com/article"
```

### Step 4 — Build and verify
```bash
cd "/Users/tsm/Desktop/Beef Maps/beefnews"
npm run build
```
Build must complete with no errors. Check that the article slug appears in the output list.

### Step 5 — Commit, push, deploy
```bash
cd "/Users/tsm/Desktop/Beef Maps/beefnews"
git add src/content/news/SLUG.md public/images/uploads/IMAGE.jpg
git commit -m "Add [article title]

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push origin main
```

**Netlify auto-deploys on push** — article goes live in ~4 minutes. No manual deploy needed.

---

## Image Situation

- **New article images** → `public/images/uploads/` — tracked in git, included in auto-deploy ✅
- **Old WordPress images** → hosted on Cloudflare R2 at `https://pub-13be57bb7a6645c6b332813889aed01e.r2.dev/wp-content/...` — never reference `/wp-content/` locally, always use the R2 URL
- **DO NOT** run `netlify deploy --prod` manually unless specifically needed — Netlify auto-builds from GitHub handle everything

---

## Repo Structure

```
src/
  content/
    news/        ← all articles (markdown)
    radar/       ← Beef News Radar digest posts
    authors/     ← author YAML files
  layouts/
    BaseLayout.astro   ← site-wide HTML, nav, footer
  pages/
    index.astro        ← homepage
  components/
    PartnerReads.astro ← "Beef News Reads" section (live RSS at build time)
    SidebarLeft.astro  ← partner articles sidebar
  data/
    partners.ts        ← RSS feed registry (Mike Callicrate, Trent Loos)
  lib/
    rss.ts             ← RSS fetcher utility
public/
  images/uploads/      ← new article hero images (in git)
  yeehaw/              ← Decap CMS admin panel
scripts/
  sync-partners.mjs   ← Node.js RSS sync (runs as part of build)
netlify/functions/
  og-proxy.js         ← OG metadata proxy for link card previews
```

---

## CMS (Alternative Publishing)
Decap CMS lives at **beefnews.org/yeehaw/**. Login with Netlify Identity (tslimmedia@gmail.com). CMS commits to GitHub → Netlify auto-builds → live.

---

## Key Credentials / Config
- **Netlify site ID:** `556570e0-0bfa-4d68-ba91-4b13671f8a0b`
- **GitHub repo:** `tslimmedia-cpu/beefnews`
- **Cloudflare R2 bucket:** `beefnews-media` (rclone remote: `beefnews-r2`)
- **R2 public URL:** `https://pub-13be57bb7a6645c6b332813889aed01e.r2.dev`
- **Site URL:** `https://beefnews.org`

---

## Partner RSS Feeds (Beef News Reads section)
Configured in `src/data/partners.ts`. Fetched live at build time.
- Mike Callicrate: `https://nobull.mikecallicrate.com/feed/`
- Trent Loos: `https://trentloos.substack.com/feed`

To add a new partner, add an entry to `PARTNERS` array in `src/data/partners.ts`.

---

## DO NOTs
- **Don't** use `netlify deploy --prod` for routine article publishing — GitHub push + auto-build handles it
- **Don't** reference `/wp-content/` image paths — use R2 URLs instead
- **Don't** add `*.xml` files to git (gitignored)
- **Don't** add `public/wp-content/` to git (5.8 GB, gitignored, lives on R2)
- **Don't** re-enable the GitHub Actions sync workflow (`sync-partners.yml`) — it's intentionally disabled (scheduled trigger removed)
