#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = process.cwd();
const srcDir = path.join(root, "src");
const postsDir = path.join(root, "src", "content", "posts");
const distDir = path.join(root, "dist");
const distAssetsDir = path.join(distDir, "_astro");

const UNICODE_SLOP = /[\u2014\u2013\u2018\u2019\u201C\u201D\u2026\u2192\u2190\u200B\uFEFF\u00A0]/;
const CSS_SLOP = /\b(backdrop-filter|radial-gradient|linear-gradient)\b/i;

const errors = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (/\.(mdx|md|astro|ts|tsx|css)$/.test(entry.name)) {
      const content = fs.readFileSync(full, "utf8");
      const rel = path.relative(root, full);
      const lines = content.split("\n");
      lines.forEach((line, idx) => {
        if (UNICODE_SLOP.test(line)) {
          errors.push(`${rel}:${idx + 1} contains disallowed Unicode punctuation/slop`);
        }
        if (entry.name.endsWith(".css") && CSS_SLOP.test(line)) {
          errors.push(`${rel}:${idx + 1} contains disallowed decorative CSS (${line.trim()})`);
        }
      });
    }
  }
}

walk(srcDir);

// Verify generated OG PNGs exist in dist/og/ for home + every published post
if (fs.existsSync(distDir)) {
  if (!fs.existsSync(path.join(distDir, "og", "home.png"))) {
    errors.push("Missing dist/og/home.png (run npm run gen:og)");
  }
  for (const file of fs.readdirSync(postsDir)) {
    if (!file.endsWith(".mdx") && !file.endsWith(".md")) continue;
    const raw = fs.readFileSync(path.join(postsDir, file), "utf8");
    if (/^draft:\s*true$/m.test(raw)) continue;
    const slug = file.replace(/\.(mdx|md)$/, "");
    const ogPath = path.join(distDir, "og", `${slug}.png`);
    if (!fs.existsSync(ogPath)) {
      errors.push(`Missing dist/og/${slug}.png for published post ${file}`);
    }
  }
}

// Enforce per-figure JS gzip budget (non-vendor chunks <= 45 KB gzipped)
if (fs.existsSync(distAssetsDir)) {
  for (const file of fs.readdirSync(distAssetsDir)) {
    if (!file.endsWith(".js")) continue;
    if (/^(client|Controls|index|Primitives)\./.test(file)) continue;
    const raw = fs.readFileSync(path.join(distAssetsDir, file));
    const gzKb = zlib.gzipSync(raw).length / 1024;
    if (gzKb > 45) {
      errors.push(`dist/_astro/${file} is ${gzKb.toFixed(1)} KB gzipped (budget: 45 KB)`);
    }
  }
}

if (errors.length > 0) {
  console.error("lint:posts failed:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}

console.log("lint:posts passed (0 Unicode slop, 0 CSS slop, OG cards present, bundle budgets OK).");
