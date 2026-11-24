# Agent Guide: spoti.sh Interactive Publishing Platform

`spoti.sh` is Julian Codespoti's interactive technical publishing site, built on Astro + MDX + a multi-engine visual runtime. Site identity, URLs, and projects live in `src/site.config.ts`.

## Architecture (4 Layers)

```text
src/
├── site.config.ts     # Brand ("spoti.sh"), author, siteUrl, projects
├── runtime/           # CanvasStage (60fps 2D), SvgStage, ToyStage, math, theme, usePlayback, useFigureParam
├── ui/                # Quiet inline controls (Figure, Toggle, Slider, HoldButton, IconButton, ChipButton, Cue)
├── components/        # Site-wide micro-canvases (HeroField, NotFoundToy)
├── layouts/           # BaseLayout.astro (OG, JSON-LD, theme), PostLayout.astro (TOC, progress, anchors, copy)
├── content/posts/     # MDX posts (static HTML prose + client:visible figure imports)
└── figures/
    ├── previews.tsx   # Registry mapping frontmatter `preview` -> miniature homepage canvas
    └── <slug>/        # One self-contained folder per post
        ├── model.ts       # Pure TypeScript simulation / algorithm (zero DOM imports)
        ├── model.test.ts  # Vitest unit tests proving the algorithm works
        ├── Preview.tsx    # Lightweight miniature canvas for the homepage post card
        └── Figures.tsx    # 1..N progressive frameless visuals driven by model.ts
```

## Adding a New Interactive Post

1. Scaffold all files in one command:
   ```bash
   npm run new-post -- my-topic-slug
   ```
2. Implement the real algorithm or physics model in `src/figures/<slug>/model.ts` (zero DOM imports) and prove it in `model.test.ts` (`npm test`).
3. Choose the right rendering adapter from `src/runtime/`:
   - **`CanvasStage`** *(default)*: 60fps Retina HTML5 Canvas 2D with fixed-timestep `dt`, springs, particles, proportional scale grids, and pointer hit-testing.
   - **`SvgStage`**: Declarative `viewBox` SVG + `motion/react` springs for trees, graphs, and state machines.
   - **`ToyStage`**: Interactive DOM widgets (live typing into a real encoder, side-by-side mini devices).
   - **WebGL / Three.js / PixiJS** *(opt-in)*: Use dynamic `import()` inside a figure only when a post needs 3D meshes or thousands of sprites so other posts pay 0 KB.
4. Implement a miniature `Preview.tsx` and register it in `src/figures/previews.tsx` (matching `preview: "<slug>"` in MDX frontmatter).
5. Run the full verification pipeline:
   ```bash
   npm run verify
   ```
   This runs Vitest unit tests, `astro check`, Satori build-time OG PNG generation (`public/og/*.png`), `astro build` (+ sitemap & RSS), and `lint:posts` (Unicode slop, CSS slop, OG card presence, per-figure gzip budgets).
6. Visually inspect desktop and mobile in both Dark and Light modes.

## Design & Craft Rules

- **Editorial Precision typography:** `Newsreader` serif for display titles and `h2` headings; `IBM Plex Sans` for body prose, UI controls, and canvas labels; `IBM Plex Mono` strictly for code snippets and literal bytes/hex.
- **Frameless visuals:** Never wrap figures in SaaS card header bars or telemetry footers. Place quiet controls (`<Figure controls={...}>`) centered underneath.
- **Progressive disclosure & direct manipulation:** Build one coherent visual world per post. Draw sizes to true proportion and use shared scaled clocks when comparing latencies. Prefer direct clicking, dragging, live typing, or press-and-hold (`<HoldButton>`) over form buttons.
- **Zero AI slop:** No decorative gradients, glows, dot grids, glassmorphism, em dashes, curly quotes, or hidden Unicode characters.
