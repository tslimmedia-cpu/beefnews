#!/usr/bin/env python3
"""
sync-partners.py
Fetches RSS feeds from partner writers, converts new posts to Markdown,
and writes them into src/content/news/ so Astro picks them up on rebuild.

Run manually:   python3 scripts/sync-partners.py
Run in CI:      same command — GitHub Actions commits any new .md files,
                which triggers a Netlify deploy automatically.
"""

import re
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

try:
    from markdownify import markdownify as md
except ImportError:
    sys.exit("pip3 install markdownify")

# ── Partner config ────────────────────────────────────────────────────────────
# Mirrors src/data/partners.ts — keep in sync when adding partners.

PARTNERS = [
    {
        "name": "Mike Callicrate",
        "site": "https://nobull.mikecallicrate.com",
        "feed": "https://nobull.mikecallicrate.com/feed/",
        "category": "Business",
        "content_selector": ".entry-content",   # CSS selector for full body
        "feed_has_content": False,               # must scrape full page
    },
    {
        "name": "Trent Loos",
        "site": "https://trentloos.substack.com",
        "feed": "https://trentloos.substack.com/feed",
        "category": "Cowboy Talk",
        "content_selector": None,               # content:encoded in feed
        "feed_has_content": True,
    },
]

NS = {
    "content": "http://purl.org/rss/1.0/modules/content/",
    "dc":      "http://purl.org/dc/elements/1.1/",
    "media":   "http://search.yahoo.com/mrss/",
}

OUT_DIR   = Path(__file__).parent.parent / "src/content/news"
HEADERS   = {"User-Agent": "BeefNews/1.0 content-sync"}
LIMIT     = 10   # max posts per partner per run
DELAY     = 1.5  # seconds between scrape requests

# ── Helpers ───────────────────────────────────────────────────────────────────

def slugify(s: str) -> str:
    s = s.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_]+", "-", s)
    s = re.sub(r"-+", "-", s)
    return s[:80].strip("-")

def yaml_str(s: str) -> str:
    s = str(s).replace('"', '\\"').replace("\n", " ").strip()
    return f'"{s}"'

def format_date(raw: str) -> str:
    for fmt in ("%a, %d %b %Y %H:%M:%S %z", "%a, %d %b %Y %H:%M:%S GMT"):
        try:
            return datetime.strptime(raw.strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return raw[:10]

def first_para(html: str) -> str:
    """Plain-text first paragraph, max ~200 chars."""
    m = re.search(r"<p[^>]*>(.*?)</p>", html, re.DOTALL | re.IGNORECASE)
    if not m:
        text = re.sub(r"<[^>]+>", " ", html)
        text = re.sub(r"\s+", " ", text).strip()
        return (text[:200].rsplit(" ", 1)[0] + "…") if len(text) > 200 else text
    raw = re.sub(r"<[^>]+>", " ", m.group(1))
    raw = re.sub(r"\s+", " ", raw).strip()
    return (raw[:200].rsplit(" ", 1)[0] + "…") if len(raw) > 200 else raw

def extract_image_from_html(html: str) -> str:
    """Return the first <img src> from HTML."""
    m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', html, re.IGNORECASE)
    return m.group(1) if m else ""

def html_to_md(html: str) -> str:
    """Strip gutenberg/Divi cruft then convert HTML → Markdown."""
    html = re.sub(r"<!--\s*/?wp:[^>]*-->", "", html)      # gutenberg comments
    html = re.sub(r"\[/?et_pb_[^\]]*\]", "", html)         # divi shortcodes
    result = md(
        html,
        heading_style="ATX",
        bullets="-",
        strip=["script", "style", "iframe"],
        newline_style="backslash",
    )
    result = re.sub(r"\n{3,}", "\n\n", result)
    return result.strip()

def existing_slugs() -> set[str]:
    return {f.stem for f in OUT_DIR.glob("*.md")}

# ── Feed parsing ──────────────────────────────────────────────────────────────

def fetch_feed(url: str) -> ET.Element | None:
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        r.raise_for_status()
        return ET.fromstring(r.content)
    except Exception as e:
        print(f"  [warn] feed fetch failed: {e}")
        return None

def parse_items(root: ET.Element, limit: int) -> list[dict]:
    channel = root.find("channel")
    if channel is None:
        return []
    items = []
    for item in channel.findall("item")[:limit]:
        def t(tag, d="", ns=None):
            v = item.findtext(tag, default=d, namespaces=ns) if ns else item.findtext(tag, default=d)
            return (v or d).strip()
        items.append({
            "title":    t("title"),
            "url":      t("link") or t("guid"),
            "date":     t("pubDate"),
            "author":   t("dc:creator", ns=NS) or t("author"),
            "excerpt":  t("description"),
            "content":  t("content:encoded", ns=NS),
            "cats":     [c.text or "" for c in item.findall("category")],
        })
    return items

# ── Full-page scrape (for feeds without content:encoded) ──────────────────────

def scrape_article(url: str, selector: str) -> tuple[str, str]:
    """Returns (html_body, og_image_url)."""
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        r.raise_for_status()
    except Exception as e:
        print(f"  [warn] scrape failed for {url}: {e}")
        return "", ""

    soup = BeautifulSoup(r.text, "html.parser")
    body = soup.select_one(selector)
    body_html = str(body) if body else ""

    og = soup.find("meta", property="og:image")
    image = og["content"] if og and og.get("content") else ""

    # filter out youtube placeholder images (empty video ID)
    if "youtube.com/vi//0" in image:
        image = extract_image_from_html(body_html)

    return body_html, image

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    known = existing_slugs()
    new_count = 0

    for partner in PARTNERS:
        name      = partner["name"]
        site      = partner["site"]
        category  = partner["category"]
        selector  = partner.get("content_selector")
        has_body  = partner["feed_has_content"]

        print(f"\n── {name} ──────────────────────────────────────")
        root = fetch_feed(partner["feed"])
        if root is None:
            continue

        items = parse_items(root, LIMIT)
        print(f"  Feed items: {len(items)}")

        for item in items:
            title = item["title"]
            url   = item["url"]
            if not title or not url:
                continue

            # Build slug — prefix with partner slug to avoid collisions
            partner_prefix = slugify(name)
            slug = f"{partner_prefix}-{slugify(title)}"[:90]

            if slug in known:
                print(f"  [skip] {slug[:60]}")
                continue

            print(f"  [new]  {slug[:65]}")

            # ── Get full content ────────────────────────────────────────
            if has_body and item["content"]:
                body_html = item["content"]
                image     = extract_image_from_html(body_html)
            else:
                if not selector:
                    print(f"  [warn] no selector and no content:encoded — skipping")
                    continue
                body_html, image = scrape_article(url, selector)
                time.sleep(DELAY)

            if not body_html.strip():
                print(f"  [warn] empty body — skipping")
                continue

            body_md = html_to_md(body_html)
            excerpt = first_para(item["excerpt"] or body_html)
            pub_date = format_date(item["date"]) if item["date"] else "2024-01-01"
            author = item["author"] or name
            tags = [c for c in item["cats"] if c]

            # ── Build frontmatter ───────────────────────────────────────
            lines = ["---"]
            lines.append(f"title: {yaml_str(title)}")
            lines.append(f"pubDate: {pub_date}")
            lines.append(f"author: {yaml_str(author)}")
            lines.append(f"excerpt: {yaml_str(excerpt)}")
            if image:
                lines.append(f"image: {yaml_str(image)}")
            lines.append(f"category: {yaml_str(category)}")
            if tags:
                lines.append(f"tags: [{', '.join(yaml_str(t) for t in tags)}]")
            else:
                lines.append("tags: []")
            lines.append("featured: false")
            lines.append("partner: true")
            lines.append(f"partnerName: {yaml_str(name)}")
            lines.append(f"partnerSite: {yaml_str(site)}")
            lines.append(f"canonicalUrl: {yaml_str(url)}")
            lines.append("---")
            lines.append("")
            lines.append(body_md)

            out_path = OUT_DIR / f"{slug}.md"
            out_path.write_text("\n".join(lines), encoding="utf-8")
            known.add(slug)
            new_count += 1

    print(f"\n✓ Sync complete — {new_count} new post(s) written to {OUT_DIR}")
    return new_count

if __name__ == "__main__":
    n = main()
    sys.exit(0)
