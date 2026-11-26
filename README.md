# spoti.sh

Interactive technical essays and local-first systems notes by Julian Codespoti, hosted at [juliancodespoti.github.io](https://juliancodespoti.github.io).

Every essay runs live HTML5 Canvas simulations locally in the browser backed by deterministic, unit-tested TypeScript models, with zero analytics trackers and zero third-party embeds.

## Stack

- **Astro + MDX** for static HTML prose, build-time code/table transforms, RSS, and sitemap.
- **Hand-drawn HTML5 Canvas 2D runtime** (`src/runtime/`) with spring physics, Retina DPR scaling, live Dark/Light paper theming, and automatic off-screen pausing.
- **Vitest** unit tests proving each post's simulation math (`src/figures/<slug>/model.test.ts`).
- **Satori + Resvg** build-time Open Graph card generation (`public/og/*.png`).

## Local Development

```bash
npm ci
npm run dev
```

Run the full verification suite (unit tests, `astro check`, OG card generation, production build, and bundle/lint checks):

```bash
npm run verify
```

Scaffold a new interactive post:

```bash
npm run new-post -- my-topic-slug
```
