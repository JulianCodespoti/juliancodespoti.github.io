/**
 * Build-time rehype plugin for spoti.sh editorial precision:
 * 1. Wraps `<pre>` code blocks in `.code-block-wrap` with a language header bar
 *    and Copy button at build time (zero client-side layout shift / CLS).
 * 2. Wraps `<table>` in `.table-wrap` and stamps each `<td>` with `data-label`
 *    from its matching `<th>` so mobile viewports can render zero-scroll stacked
 *    benchmark rows instead of clipping columns off-screen.
 * 3. Appends clickable permalink anchors to `h2[id]` and `h3[id]` at build time.
 */

function extractText(node) {
  if (!node) return "";
  if (node.type === "text") return node.value || "";
  if (Array.isArray(node.children)) {
    return node.children.map(extractText).join("");
  }
  return "";
}

function getProp(node, name) {
  return node?.properties?.[name];
}

function hasClass(node, cls) {
  const raw = node?.properties?.className;
  if (Array.isArray(raw)) return raw.includes(cls);
  if (typeof raw === "string") return raw.split(/\s+/).includes(cls);
  return false;
}

function enhanceTable(tableNode) {
  const headers = [];
  const collectHeaders = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "element" && node.tagName === "thead") {
      const walkTh = (n) => {
        if (!n) return;
        if (n.type === "element" && n.tagName === "th") {
          headers.push(extractText(n).trim());
          return;
        }
        if (Array.isArray(n.children)) n.children.forEach(walkTh);
      };
      walkTh(node);
      return;
    }
    if (Array.isArray(node.children)) node.children.forEach(collectHeaders);
  };
  collectHeaders(tableNode);

  if (headers.length > 0) {
    const tagCells = (node) => {
      if (!node || typeof node !== "object") return;
      if (node.type === "element" && node.tagName === "tbody") {
        for (const row of node.children || []) {
          if (row.type !== "element" || row.tagName !== "tr") continue;
          let colIdx = 0;
          for (const cell of row.children || []) {
            if (cell.type !== "element" || cell.tagName !== "td") continue;
            cell.properties = cell.properties || {};
            if (headers[colIdx]) {
              cell.properties["data-label"] = headers[colIdx];
            }
            if (colIdx === 0) {
              const existing = cell.properties.className;
              const list = Array.isArray(existing)
                ? existing
                : typeof existing === "string"
                  ? existing.split(/\s+/)
                  : [];
              if (!list.includes("table-cell--lead")) list.push("table-cell--lead");
              cell.properties.className = list;
            }
            colIdx++;
          }
        }
        return;
      }
      if (Array.isArray(node.children)) node.children.forEach(tagCells);
    };
    tagCells(tableNode);
  }

  return {
    type: "element",
    tagName: "div",
    properties: { className: ["table-wrap"] },
    children: [tableNode],
  };
}

function enhancePre(preNode) {
  const rawLang = String(getProp(preNode, "dataLanguage") || getProp(preNode, "data-language") || "").trim();
  const langLabel = rawLang && rawLang !== "plaintext" ? rawLang : "code";

  return {
    type: "element",
    tagName: "div",
    properties: { className: ["code-block-wrap"] },
    children: [
      {
        type: "element",
        tagName: "div",
        properties: { className: ["code-block-bar"] },
        children: [
          {
            type: "element",
            tagName: "span",
            properties: { className: ["code-block-lang"] },
            children: [{ type: "text", value: langLabel }],
          },
          {
            type: "element",
            tagName: "button",
            properties: {
              type: "button",
              className: ["code-copy-btn"],
              "data-code-copy": "true",
              "aria-label": `Copy ${langLabel} snippet`,
            },
            children: [{ type: "text", value: "Copy" }],
          },
        ],
      },
      preNode,
    ],
  };
}

function enhanceHeading(node) {
  const id = getProp(node, "id");
  if (!id) return;
  const alreadyHasAnchor = (node.children || []).some(
    (c) => c.type === "element" && hasClass(c, "heading-anchor"),
  );
  if (alreadyHasAnchor) return;

  const headingText = extractText(node).trim();
  node.children = node.children || [];
  node.children.push({
    type: "element",
    tagName: "a",
    properties: {
      className: ["heading-anchor"],
      href: `#${id}`,
      "data-heading-anchor": id,
      "aria-label": `Copy link to section ${headingText}`,
    },
    children: [{ type: "text", value: "#" }],
  });
}

function transformNode(node) {
  if (!node || !Array.isArray(node.children)) return;

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (!child || child.type !== "element") continue;

    if (child.tagName === "pre" && !hasClass(node, "code-block-wrap")) {
      node.children[i] = enhancePre(child);
      continue;
    }

    if (child.tagName === "table" && !hasClass(node, "table-wrap")) {
      node.children[i] = enhanceTable(child);
      continue;
    }

    if (child.tagName === "h2" || child.tagName === "h3") {
      enhanceHeading(child);
      continue;
    }

    transformNode(child);
  }
}

export function rehypeEditorial() {
  return (tree) => {
    transformNode(tree);
  };
}
