# Agent Guide: Interactive Posts Platform

This repository is Julian Codespoti's interactive technical blog (`juliancodespoti.github.io`), built on Astro + MDX + a multi-engine visual runtime. Every post pairs clear prose with real, frameless, interactive simulations.

## Architecture (4 Layers)

```text
src/
├── runtime/           # Rendering adapters (CanvasStage, SvgStage, ToyStage, math, live theme)
├── ui/                # Quiet inline controls (Figure, Toggle, Slider, HoldButton, IconButton, Cue)
├── layouts/           # BaseLayout.astro, PostLayout.astro
├── content/posts/     # MDX posts (static HTML prose + client:visible figure imports)
└── figures/<slug>/    # One self-contained folder per post
    ├── model.ts       # Pure TypeScript simulation / algorithm (zero DOM imports)
    ├── model.test.ts  # Vitest unit tests proving the algorithm works
    └── Figures.tsx    # 1..N progressive frameless visuals driven by model.ts
```

## How to Add a New Interactive Post

1. Scaffold all files in one command:
   ```bash
   npm run new-post -- my-topic-slug
   ```
2. Build the real algorithm or simulation first in `src/figures/<slug>/model.ts` (pure TypeScript, zero DOM/React imports) and prove its behavior in `model.test.ts` (`npm test`).
3. Choose the right rendering adapter from `src/runtime/`:
   - **`CanvasStage`** *(default)*: 60fps Retina HTML5 Canvas 2D with fixed-timestep `dt`, springs, particle physics, proportional scale grids, and pointer hit-testing.
   - **`SvgStage`**: Declarative `viewBox` SVG + `motion/react` springs for trees, graphs, state machines, and pointer diagrams.
   - **`ToyStage`**: Interactive live DOM widgets (e.g., live typing into a real encoder, side-by-side mini devices, hex inspectors).
   - **WebGL / Three.js / PixiJS** *(opt-in)*: Use dynamic `import()` inside a figure if a post genuinely needs 3D meshes or thousands of sprites so other posts pay 0 KB.
4. Embed figures in `src/content/posts/<slug>.mdx` with `client:visible`, linking prose terms to canvas ink via `<Cue tone="copper|teal|sage|crimson">`.
5. Run the full verification pipeline before finishing:
   ```bash
   npm run verify
   ```
   Then visually inspect the rendered post in both Dark and Light themes (desktop and mobile).

## Design & Craft Rules (Enforced)

- **Frameless visuals:** Never wrap figures in SaaS card headers, toolbar bars, or telemetry footer strips. Let the canvas breathe directly in the prose column with quiet controls centered underneath (`<Figure controls={...}>`).
- **Progressive disclosure:** Build one coherent visual world per post. Early figures should need 0 or 1 control; never dump a dashboard of 5 controls onto a single visual.
- **Real algorithms, real scale, real time:**
  - Run actual algorithms in `model.ts` rather than scripted `setTimeout` slideshows.
  - Draw sizes proportionally (if one object is 20x larger than another, draw it 20x larger).
  - Use a shared scaled clock when comparing latencies so the speed ratio is felt directly.
- **Direct manipulation first:** Prefer clicking canvas objects, dragging sliders, typing live text, or press-and-hold controls (`<HoldButton>`) over form buttons.
- **Typography & palette:** Use `IBM Plex Sans` (`var(--font-sans)`) for all UI chrome, canvas labels, and controls. Reserve `IBM Plex Mono` strictly for code snippets and literal bytes/hex. Use only the four semantic inks (`copper`, `teal`, `sage`, `crimson`) via `theme.*` tokens so Dark and Light modes stay crisp automatically.
- **Zero AI slop:** No purple/cyan gradients, glows, dot grids, glassmorphism, em dashes, curly quotes, or hidden Unicode characters. `npm run lint:posts` enforces these rules automatically.
