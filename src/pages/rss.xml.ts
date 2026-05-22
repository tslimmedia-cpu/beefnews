import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import type { APIContext } from "astro";

export async function GET(context: APIContext) {
  const allNews = await getCollection("news");

  const items = allNews
    .filter((post) => !post.data.partner)
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())
    .slice(0, 50)
    .map((post) => {
      const imageUrl = post.data.image
        ? post.data.image.startsWith("http")
          ? post.data.image
          : new URL(post.data.image, context.site).href
        : null;

      return {
        title: post.data.title,
        pubDate: post.data.pubDate,
        description: post.data.excerpt,
        link: `/${post.slug}/`,
        categories: [post.data.category, ...(post.data.tags ?? [])],
        customData: imageUrl
          ? `<enclosure url="${imageUrl}" type="image/jpeg" length="0" />`
          : "",
      };
    });

  return rss({
    title: "Beef News — The Voice of the Rancher Direct Movement",
    description:
      "Breaking news, investigative reporting, and market intelligence for independent American ranchers and the rancher direct beef movement.",
    site: context.site!,
    items,
    customData: `<language>en-us</language><managingEditor>tslimmedia@gmail.com (Beef News)</managingEditor><webMaster>tslimmedia@gmail.com (Beef News)</webMaster><ttl>60</ttl>`,
  });
}
