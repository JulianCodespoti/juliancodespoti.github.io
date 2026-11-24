#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = process.cwd();
const srcDir = path.join(root, "src");
const distAssetsDir = path.join(root, "dist", "_astro");

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

// Enforce reasonable per-figure JS gzip budget (warn/fail if a non-vendor chunk balloons)
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

console.log("lint:posts passed (0 Unicode slop, 0 CSS slop, bundle budgets OK).");
