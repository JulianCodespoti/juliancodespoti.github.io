import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import type { APIContext } from "astro";

export async function GET(context: APIContext) {
  const essays = (await getCollection("essays", ({ data }) => !data.draft)).sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
  );
  return rss({
    title: "Julian Codespoti - Interactive Systems Essays",
    description: "Interactive engineering deep-dives on Rust, Android internals, protocols, and local-first tools.",
    site: context.site ?? "https://juliancodespoti.github.io",
    items: essays.map((essay) => ({
      title: essay.data.title,
      pubDate: essay.data.pubDate,
      description: essay.data.description,
      link: `/essays/${essay.slug}/`,
    })),
  });
}
