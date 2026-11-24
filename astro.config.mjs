import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import { SITE } from "./src/site.config";

export default defineConfig({
  site: SITE.siteUrl,
  integrations: [mdx(), react(), sitemap()],
  image: {
    service: { entrypoint: "astro/assets/services/noop" },
  },
  markdown: {
    shikiConfig: {
      themes: {
        dark: "github-dark-default",
        light: "github-light-default",
      },
      defaultColor: false,
      wrap: false,
    },
  },
});
