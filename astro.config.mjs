import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";

export default defineConfig({
  site: "https://juliancodespoti.github.io",
  integrations: [mdx(), react()],
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
