import { getCollection } from "astro:content";
import type { APIContext } from "astro";

export async function GET(context: APIContext) {
  const allNews = await getCollection("news");

  const items = allNews
    .filter((post) => !post.data.partner)
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())
    .slice(0, 1000);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${items
  .map(
    (post) => `  <url>
    <loc>${new URL(`/${post.slug}/`, context.site).href}</loc>
    <lastmod>${post.data.pubDate.toISOString().split("T")[0]}</lastmod>
    <news:news>
      <news:publication>
        <news:name>Beef News</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${post.data.pubDate.toISOString()}</news:publication_date>
      <news:title>${escapeXml(post.data.title)}</news:title>
      ${
        post.data.category
          ? `<news:keywords>${escapeXml([post.data.category, ...(post.data.tags ?? [])].join(", "))}</news:keywords>`
          : ""
      }
    </news:news>
  </url>`,
  )
  .join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
