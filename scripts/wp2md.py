#!/usr/bin/env python3
"""
wp2md.py — Convert beefnews.org WordPress XML export to Astro content collection markdown.

Outputs to: src/content/news/<slug>.md
"""

import re
import sys
import textwrap
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

try:
    from markdownify import markdownify as md
except ImportError:
    sys.exit("pip3 install markdownify  ← run this first")

# ── Config ───────────────────────────────────────────────────────────────────

XML_PATH   = Path(__file__).parent.parent / "beefnews.WordPress.2026-04-26.xml"
OUT_DIR    = Path(__file__).parent.parent / "src/content/news"
RADAR_DIR  = Path(__file__).parent.parent / "src/content/radar"

NS = {
    "content": "http://purl.org/rss/1.0/modules/content/",
    "dc":      "http://purl.org/dc/elements/1.1/",
    "wp":      "http://wordpress.org/export/1.2/",
    "excerpt": "http://wordpress.org/export/1.2/excerpt/",
}

# Map WP login → display name
AUTHOR_MAP = {
    "beefnews":           "Beef News",
    "Texas Slim":         "Texas Slim",
    "Breeauna":           "Breeauna Sagdal",
    "RS June":            "RS June",
    "Andrea":             "Andrea Shaffer",
    "Andrea Heide Gorda": "Andrea Gorda",
    "captainsidd":        "Captain Sidd",
    "Beef News Wire":     "Beef News Wire",
    "BVBEEF":             "Lane Sangl",
    "Legacy Ranch":       "Legacy Ranch",
}

# WP categories that map to our radar collection
RADAR_CATS = {"Beef News Radar"}

# ── Helpers ──────────────────────────────────────────────────────────────────

def strip_gutenberg_comments(html: str) -> str:
    """Remove <!-- wp:xxx --> and <!-- /wp:xxx --> block delimiters."""
    return re.sub(r"<!--\s*/?wp:[^>]*-->", "", html)

def strip_divi(html: str) -> str:
    """Remove Divi [et_pb_*] shortcodes and wp-block-divi wrappers."""
    # Shortcode tags
    html = re.sub(r"\[/?et_pb_[^\]]*\]", "", html)
    # Block wrapper divs
    html = re.sub(r'<div[^>]*wp-block-divi[^>]*>.*?</div>', "", html, flags=re.DOTALL)
    return html

def html_to_markdown(html: str) -> str:
    """Clean HTML → readable Markdown."""
    html = strip_gutenberg_comments(html)
    html = strip_divi(html)
    result = md(
        html,
        heading_style="ATX",
        bullets="-",
        strip=["script", "style", "iframe"],
        newline_style="backslash",
    )
    # Collapse 3+ blank lines → 2
    result = re.sub(r"\n{3,}", "\n\n", result)
    return result.strip()

def first_paragraph_text(html: str) -> str:
    """Extract first non-empty paragraph text for use as excerpt."""
    html = strip_gutenberg_comments(html)
    html = strip_divi(html)
    m = re.search(r"<p[^>]*>(.*?)</p>", html, re.DOTALL | re.IGNORECASE)
    if not m:
        return ""
    raw = re.sub(r"<[^>]+>", " ", m.group(1)).strip()
    raw = re.sub(r"\s+", " ", raw)
    # Truncate at ~200 chars on a word boundary
    if len(raw) > 220:
        raw = raw[:220].rsplit(" ", 1)[0] + "…"
    return raw

def slugify(s: str) -> str:
    """Ensure slug is filesystem-safe."""
    s = s.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_]+", "-", s)
    s = re.sub(r"-+", "-", s)
    return s[:80].strip("-")

def yaml_str(s: str) -> str:
    """Wrap a string value safely for YAML frontmatter."""
    s = s.replace('"', '\\"').replace("\n", " ").strip()
    return f'"{s}"'

def format_date(rfc_date: str) -> str:
    """'Mon, 01 Jan 2024 12:00:00 +0000' → '2024-01-01'"""
    try:
        dt = datetime.strptime(rfc_date.strip(), "%a, %d %b %Y %H:%M:%S %z")
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return rfc_date[:10]

def build_attachment_url_map(channel) -> dict[str, str]:
    """Build {attachment_id: url} from <item wp:post_type=attachment>."""
    mapping: dict[str, str] = {}
    for item in channel.findall("item"):
        if item.findtext("wp:post_type", namespaces=NS) != "attachment":
            continue
        post_id = item.findtext("wp:post_id", namespaces=NS, default="")
        url = item.findtext("wp:attachment_url", namespaces=NS, default="")
        if post_id and url:
            mapping[post_id] = url
    return mapping

# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    RADAR_DIR.mkdir(parents=True, exist_ok=True)

    tree = ET.parse(XML_PATH)
    root = tree.getroot()
    channel = root.find("channel")

    attachment_urls = build_attachment_url_map(channel)

    posts = [
        item for item in channel.findall("item")
        if item.findtext("wp:post_type", namespaces=NS) == "post"
        and item.findtext("wp:status",    namespaces=NS) == "publish"
    ]

    print(f"Converting {len(posts)} published posts…\n")

    news_count = 0
    radar_count = 0
    skipped = 0
    seen_slugs: set[str] = set()

    for item in posts:
        title   = item.findtext("title", default="Untitled").strip()
        pub_raw = item.findtext("pubDate", default="")
        author  = AUTHOR_MAP.get(
            item.findtext("dc:creator", namespaces=NS, default="beefnews"),
            "Beef News"
        )
        wp_slug = item.findtext("wp:post_name", namespaces=NS, default="")
        slug = slugify(wp_slug or title)

        # Deduplicate slugs
        if slug in seen_slugs:
            slug = slug + "-2"
        seen_slugs.add(slug)

        # Categories & tags
        cats = [c.text for c in item.findall('category[@domain="category"]') if c.text]
        tags = [t.text for t in item.findall('category[@domain="post_tag"]') if t.text]

        # Primary category (first one, or "News")
        primary_cat = cats[0] if cats else "News"

        # Excerpt
        excerpt_raw = item.findtext("excerpt:encoded", namespaces=NS, default="").strip()
        content_raw = item.findtext("content:encoded", namespaces=NS, default="")

        if not excerpt_raw:
            excerpt_raw = first_paragraph_text(content_raw)

        # Featured image
        metas = {
            m.findtext("wp:meta_key", namespaces=NS): m.findtext("wp:meta_value", namespaces=NS)
            for m in item.findall("wp:postmeta", namespaces=NS)
        }
        thumb_id = metas.get("_thumbnail_id", "")
        image_url = attachment_urls.get(thumb_id, "") if thumb_id else ""

        # Convert content HTML → Markdown
        body_md = html_to_markdown(content_raw)

        if not body_md.strip():
            print(f"  SKIP (empty body): {title[:60]}")
            skipped += 1
            continue

        pub_date = format_date(pub_raw) if pub_raw else "2024-01-01"
        is_sponsored = "Sponsored" in cats
        is_radar = bool(RADAR_CATS & set(cats))

        # Build frontmatter
        lines = ["---"]
        lines.append(f"title: {yaml_str(title)}")
        lines.append(f"pubDate: {pub_date}")
        lines.append(f"author: {yaml_str(author)}")
        lines.append(f"excerpt: {yaml_str(excerpt_raw or title)}")
        if image_url:
            lines.append(f"image: {yaml_str(image_url)}")
        lines.append(f"category: {yaml_str(primary_cat)}")
        if tags:
            tag_list = ", ".join(f'"{t}"' for t in tags)
            lines.append(f"tags: [{tag_list}]")
        else:
            lines.append("tags: []")
        lines.append("featured: false")
        if is_sponsored:
            lines.append("sponsored: true")
        lines.append("---")
        lines.append("")
        lines.append(body_md)

        output = "\n".join(lines)

        # Route to collection
        if is_radar:
            out_path = RADAR_DIR / f"{slug}.md"
            radar_count += 1
        else:
            out_path = OUT_DIR / f"{slug}.md"
            news_count += 1

        out_path.write_text(output, encoding="utf-8")
        print(f"  {'[radar]' if is_radar else '[news] '} {slug[:65]}")

    print(f"\n✓ Done: {news_count} news + {radar_count} radar posts written, {skipped} skipped.")
    print(f"  → {OUT_DIR}")
    print(f"  → {RADAR_DIR}")

if __name__ == "__main__":
    main()
