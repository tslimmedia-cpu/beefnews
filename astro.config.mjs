import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { remarkEmbeds } from "./src/plugins/remark-embeds.mjs";

export default defineConfig({
  site: "https://beefnews.org",
  integrations: [
    tailwind({ applyBaseStyles: false }),
    mdx(),
    sitemap(),
  ],
  markdown: {
    remarkPlugins: [remarkEmbeds],
    shikiConfig: {
      theme: "github-dark",
    },
  },
});
