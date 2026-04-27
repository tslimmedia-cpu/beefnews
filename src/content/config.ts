import { defineCollection, z } from "astro:content";

const newsCollection = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().default("BeefNews Staff"),
    excerpt: z.string(),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    featured: z.boolean().default(false),
    sponsored: z.boolean().default(false),
    sponsorName: z.string().optional(),
    // Partner syndication fields
    partner: z.boolean().default(false),
    partnerName: z.string().optional(),
    partnerSite: z.string().optional(),
    canonicalUrl: z.string().optional(), // original article URL for SEO
  }),
});

const radarCollection = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    pubDate: z.coerce.date(),
    author: z.string().default("Beef News Radar"),
    excerpt: z.string(),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    category: z.string().default("Radar"),
    tags: z.array(z.string()).default([]),
    externalUrl: z.string().optional(),
  }),
});

export const collections = {
  news: newsCollection,
  radar: radarCollection,
};
