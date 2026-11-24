#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const slug = process.argv[2]?.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
if (!slug) {
  console.error("Usage: npm run new-post -- <slug>");
  process.exit(1);
}

const root = process.cwd();
const figDir = path.join(root, "src", "figures", slug);
const postFile = path.join(root, "src", "content", "posts", `${slug}.mdx`);

if (fs.existsSync(figDir) || fs.existsSync(postFile)) {
  console.error(`Post "${slug}" already exists.`);
  process.exit(1);
}

const title = slug
  .split("-")
  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
  .join(" ");

const today = new Date().toISOString().slice(0, 10);

fs.mkdirSync(figDir, { recursive: true });

fs.writeFileSync(
  path.join(figDir, "model.ts"),
  `export interface DemoState {
  progress: number;
  speed: number;
}

export function createDemoState(): DemoState {
  return { progress: 0, speed: 0.45 };
}

export function stepDemo(state: DemoState, dt: number): void {
  state.progress = (state.progress + state.speed * dt) % 1;
}
`,
);

fs.writeFileSync(
  path.join(figDir, "model.test.ts"),
  `import { describe, expect, it } from "vitest";
import { createDemoState, stepDemo } from "./model";

describe("${slug} model", () => {
  it("advances progress deterministically", () => {
    const s = createDemoState();
    stepDemo(s, 0.5);
    expect(s.progress).toBeCloseTo(0.225, 5);
  });
});
`,
);

fs.writeFileSync(
  path.join(figDir, "Figures.tsx"),
  `import { useRef, useState } from "react";
import { CanvasStage, fillRoundRect } from "../../runtime";
import { Figure, Toggle } from "../../ui";
import { createDemoState, stepDemo } from "./model";

export function StarterFigure() {
  const [speed, setSpeed] = useState<"slow" | "fast">("slow");
  const simRef = useRef(createDemoState());
  simRef.current.speed = speed === "fast" ? 0.9 : 0.35;

  return (
    <Figure
      controls={
        <Toggle
          label="Simulation speed"
          value={speed}
          onChange={setSpeed}
          options={[
            { value: "slow", label: "Slow" },
            { value: "fast", label: "Fast" },
          ]}
        />
      }
    >
      <CanvasStage
        height={120}
        label="${title} interactive canvas"
        onFrame={({ ctx, width, height, dt, theme }) => {
          stepDemo(simRef.current, dt);
          ctx.clearRect(0, 0, width, height);
          const x = 24 + simRef.current.progress * (width - 72);
          fillRoundRect(ctx, x, height / 2 - 14, 28, 28, 7, theme.copper);
        }}
      />
    </Figure>
  );
}
`,
);

fs.writeFileSync(
  postFile,
  `---
title: "${title}"
subtitle: "A short, concrete one-sentence summary of the mechanism."
description: "Interactive breakdown of ${title}."
pubDate: ${today}
readingTime: "6 min read"
simsCount: 1
tags: ["Systems"]
draft: true
---

import { Cue } from "../../ui";
import { StarterFigure } from "../../figures/${slug}/Figures";

Opening paragraph explaining the core <Cue tone="copper">mechanism</Cue> in plain language.

<StarterFigure client:visible />
`,
);

console.log(`Scaffolded post "${slug}":`);
console.log(`  - src/content/posts/${slug}.mdx`);
console.log(`  - src/figures/${slug}/model.ts`);
console.log(`  - src/figures/${slug}/model.test.ts`);
console.log(`  - src/figures/${slug}/Figures.tsx`);
