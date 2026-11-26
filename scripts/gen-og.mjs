#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const root = process.cwd();
const postsDir = path.join(root, "src", "content", "posts");
const outDir = path.join(root, "public", "og");

const newsreader500 = fs.readFileSync(
  path.join(root, "node_modules/@fontsource/newsreader/files/newsreader-latin-500-normal.woff"),
);
const plex400 = fs.readFileSync(
  path.join(root, "node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff"),
);
const plex600 = fs.readFileSync(
  path.join(root, "node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff"),
);

const fonts = [
  { name: "Newsreader", data: newsreader500, weight: 500, style: "normal" },
  { name: "IBM Plex Sans", data: plex400, weight: 400, style: "normal" },
  { name: "IBM Plex Sans", data: plex600, weight: 600, style: "normal" },
];

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1];
    let val = kv[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    data[key] = val;
  }
  return data;
}

function cardTree({ title, subtitle, meta }) {
  return {
    type: "div",
    props: {
      style: {
        width: "1200px",
        height: "630px",
        backgroundColor: "#0e1013",
        color: "#eef0f4",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "IBM Plex Sans",
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              width: "1056px",
              height: "502px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            },
            children: [
              // Top brand bar
              {
                type: "div",
                props: {
                  style: { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" },
                  children: [
                    {
                      type: "div",
                      props: {
                        style: { display: "flex", alignItems: "center", gap: "16px" },
                        children: [
                          {
                            type: "div",
                            props: {
                              style: {
                                width: "44px",
                                height: "44px",
                                borderRadius: "10px",
                                backgroundColor: "#1c1f25",
                                border: "1.5px solid #3a404d",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "22px",
                                fontWeight: 600,
                                color: "#e07a47",
                              },
                              children: "[/]",
                            },
                          },
                          {
                            type: "div",
                            props: {
                              style: { fontSize: "26px", fontWeight: 600, letterSpacing: "-0.02em", color: "#eaecef" },
                              children: "spoti.sh",
                            },
                          },
                        ],
                      },
                    },
                    {
                      type: "div",
                      props: {
                        style: { display: "flex", gap: "8px", alignItems: "center" },
                        children: [
                          { type: "div", props: { style: { width: "14px", height: "14px", borderRadius: "3px", backgroundColor: "#52bd85" } } },
                          { type: "div", props: { style: { width: "28px", height: "14px", borderRadius: "3px", backgroundColor: "#3fb8b2" } } },
                          { type: "div", props: { style: { width: "52px", height: "14px", borderRadius: "3px", backgroundColor: "#e6824e" } } },
                        ],
                      },
                    },
                  ],
                },
              },
              // Center display headline
              {
                type: "div",
                props: {
                  style: { display: "flex", flexDirection: "column", gap: "20px", width: "100%" },
                  children: [
                    {
                      type: "div",
                      props: {
                        style: {
                          fontFamily: "Newsreader",
                          fontSize: title.length > 52 ? "54px" : "66px",
                          fontWeight: 500,
                          lineHeight: 1.12,
                          letterSpacing: "-0.02em",
                          color: "#eaecef",
                        },
                        children: title,
                      },
                    },
                    {
                      type: "div",
                      props: {
                        style: {
                          fontSize: "24px",
                          lineHeight: 1.48,
                          color: "#949ca8",
                          maxWidth: "920px",
                        },
                        children: subtitle,
                      },
                    },
                  ],
                },
              },
              // Bottom metadata bar
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    paddingTop: "22px",
                    borderTop: "1px solid #252932",
                    fontSize: "20px",
                    color: "#646c79",
                  },
                  children: [
                    { type: "div", props: { children: meta } },
                    { type: "div", props: { style: { color: "#949ca8" }, children: "Julian Codespoti" } },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  };
}

async function renderPng(filename, props) {
  const svg = await satori(cardTree(props), { width: 1200, height: 630, fonts });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
  fs.writeFileSync(path.join(outDir, filename), png);
}

fs.mkdirSync(outDir, { recursive: true });

await renderPng("home.png", {
  title: "Hey, I'm Julian.",
  subtitle: "Local-first tools in Rust and interactive notes on how software actually works.",
  meta: "spoti.sh",
});

let count = 1;
for (const file of fs.readdirSync(postsDir)) {
  if (!file.endsWith(".mdx") && !file.endsWith(".md")) continue;
  const raw = fs.readFileSync(path.join(postsDir, file), "utf8");
  const fm = parseFrontmatter(raw);
  if (fm.draft === "true") continue;
  const slug = file.replace(/\.(mdx|md)$/, "");
  const metaParts = [fm.pubDate, fm.readingTime].filter(Boolean);
  await renderPng(`${slug}.png`, {
    title: fm.title || slug,
    subtitle: fm.subtitle || fm.description || "",
    meta: metaParts.join("  ·  ") || "spoti.sh",
  });
  count++;
}

console.log(`gen:og generated ${count} Open Graph PNG card(s) in public/og/.`);
