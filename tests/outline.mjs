// outline.mjs — page observation, snapshot/diff and spec scaffolding.
//
// `captureOutline` runs one self-contained function inside the page and returns a
// structured description of what is actually there. This is what gives the agent
// "noción" of the page and of what moved between changes.

import fs from "node:fs";
import path from "node:path";

// This function is serialized into the page; it must not reference module scope.
function outlinePageFunction() {
  const norm = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  const textOf = (el) => norm(el.textContent).slice(0, 200);
  const idOf = (el) => el.id || null;
  const labelFor = (el) => {
    if (!el.id) return null;
    const l = document.querySelector(`label[for="${el.id}"]`);
    return l ? textOf(l) : null;
  };

  const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"))
    .slice(0, 200)
    .map((el) => ({ level: Number(el.tagName[1]), text: textOf(el), id: idOf(el) }));

  const landmarks = Array.from(
    document.querySelectorAll("header,nav,main,aside,footer,[role]")
  )
    .slice(0, 200)
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role") || null,
      id: idOf(el),
      label: el.getAttribute("aria-label") || null,
    }));

  const links = Array.from(document.querySelectorAll("a[href]"))
    .slice(0, 300)
    .map((el) => ({ text: textOf(el), href: el.getAttribute("href") }));

  const buttons = Array.from(
    document.querySelectorAll("button,input[type=submit],input[type=button],[role=button]")
  )
    .slice(0, 200)
    .map((el) => ({ text: textOf(el), id: idOf(el), type: el.getAttribute("type") || null }));

  const images = Array.from(document.querySelectorAll("img"))
    .slice(0, 200)
    .map((el) => ({ src: el.getAttribute("src"), alt: el.getAttribute("alt") }));

  const forms = Array.from(document.querySelectorAll("form")).map((f) => ({
    id: idOf(f),
    action: f.getAttribute("action"),
    method: f.getAttribute("method") || "get",
    fields: Array.from(f.querySelectorAll("input,select,textarea")).map((el) => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute("type") || null,
      name: el.getAttribute("name") || null,
      id: idOf(el),
      required: !!el.required,
      placeholder: el.getAttribute("placeholder") || null,
      label: labelFor(el),
    })),
    submit: Array.from(f.querySelectorAll("button,input[type=submit]")).map(
      (el) => textOf(el) || el.getAttribute("value") || null
    ),
  }));

  const de = document.documentElement;
  const overflow = {
    horizontal: de.scrollWidth > de.clientWidth + 1,
    scrollWidth: de.scrollWidth,
    clientWidth: de.clientWidth,
  };

  return {
    url: location.href,
    title: document.title,
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    headings,
    landmarks,
    links,
    buttons,
    images,
    forms,
    overflow,
    text: norm(document.body ? document.body.innerText : "").slice(0, 3000),
  };
}

export async function captureOutline(page) {
  return page.evaluate(outlinePageFunction);
}

function keyOf(section, item) {
  switch (section) {
    case "headings":
      return `${item.level}:${item.text}`;
    case "links":
      return `${item.text}=>${item.href}`;
    case "buttons":
      return `${item.text}[${item.id || ""}]`;
    case "images":
      return `${item.src}|${item.alt || ""}`;
    case "landmarks":
      return `${item.tag}[${item.role || ""}]`;
    default:
      return JSON.stringify(item);
  }
}

export function diffOutline(previous, current) {
  const sections = ["headings", "landmarks", "links", "buttons", "images"];
  const result = { added: {}, removed: {}, changed: {} };
  for (const section of sections) {
    const prev = new Map((previous?.[section] || []).map((i) => [keyOf(section, i), i]));
    const curr = new Map((current?.[section] || []).map((i) => [keyOf(section, i), i]));
    const added = [...curr.keys()].filter((k) => !prev.has(k)).map((k) => curr.get(k));
    const removed = [...prev.keys()].filter((k) => !curr.has(k)).map((k) => prev.get(k));
    result.added[section] = added;
    result.removed[section] = removed;
  }
  if ((previous?.title || "") !== (current?.title || "")) {
    result.changed.title = { from: previous?.title, to: current?.title };
  }
  if (!!previous?.overflow?.horizontal !== !!current?.overflow?.horizontal) {
    result.changed.horizontalOverflow = {
      from: previous?.overflow?.horizontal,
      to: current?.overflow?.horizontal,
    };
  }
  if ((previous?.forms?.length || 0) !== (current?.forms?.length || 0)) {
    result.changed.forms = { from: previous?.forms?.length || 0, to: current?.forms?.length || 0 };
  }
  return result;
}

export function snapshotPath(dir, viewport) {
  return path.join(dir, `outline.${viewport}.json`);
}

export function loadSnapshot(dir, viewport) {
  const file = snapshotPath(dir, viewport);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function saveSnapshot(dir, viewport, outline) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(snapshotPath(dir, viewport), JSON.stringify(outline, null, 2));
  return snapshotPath(dir, viewport);
}

export function formatOutline(outline) {
  const lines = [];
  lines.push(`url: ${outline.url}`);
  lines.push(`title: ${outline.title}`);
  lines.push(`viewport: ${outline.viewport.width}x${outline.viewport.height} @${outline.viewport.dpr}x`);
  lines.push(`horizontal overflow: ${outline.overflow.horizontal ? "YES" : "no"} (${outline.overflow.scrollWidth}/${outline.overflow.clientWidth})`);
  lines.push(`headings: ${outline.headings.map((h) => `h${h.level} ${JSON.stringify(h.text)}`).join(", ") || "-"}`);
  lines.push(`landmarks: ${[...new Set(outline.landmarks.map((l) => l.tag))].join(", ") || "-"}`);
  lines.push(`links (${outline.links.length}): ${outline.links.slice(0, 12).map((l) => JSON.stringify(l.text)).join(", ")}`);
  lines.push(`buttons (${outline.buttons.length}): ${outline.buttons.slice(0, 12).map((b) => JSON.stringify(b.text)).join(", ")}`);
  lines.push(`images (${outline.images.length}): ${outline.images.slice(0, 8).map((i) => `${JSON.stringify(i.alt)}${i.alt ? "" : " (NO ALT!)"}`).join(", ")}`);
  for (const f of outline.forms) {
    lines.push(`form ${f.id || "(anonymous)"} ${f.method} ${f.action || ""}: ${f.fields.map((x) => `${x.tag}${x.type ? ":" + x.type : ""}${x.name ? "[" + x.name + "]" : ""}${x.required ? "*" : ""}`).join(", ")}`);
  }
  return lines.join("\n");
}

export function formatDiff(diff) {
  const lines = [];
  for (const section of ["headings", "landmarks", "links", "buttons", "images"]) {
    const added = diff.added[section] || [];
    const removed = diff.removed[section] || [];
    if (!added.length && !removed.length) continue;
    lines.push(`${section}:`);
    for (const a of added) lines.push(`  + ${keyOf(section, a)}`);
    for (const r of removed) lines.push(`  - ${keyOf(section, r)}`);
  }
  for (const [key, value] of Object.entries(diff.changed || {})) {
    lines.push(`changed ${key}: ${JSON.stringify(value)}`);
  }
  if (!lines.length) lines.push("no structural changes");
  return lines.join("\n");
}

function slugify(value) {
  return String(value || "page")
    .replace(/^https?:\/\//, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "page";
}

export function scaffolds({ outline, diff, gitDiff, planSources = [], path: pagePath = "/" }) {
  const name = slugify(outline.title || pagePath);
  const expect = [];
  const todo = (comment) => `    // TODO(verify): ${comment}`;

  expect.push(`    { title: ${JSON.stringify(outline.title)} },`);
  expect.push(todo("confirm the title matches the plan"));
  const firstByLevel = new Map();
  for (const h of outline.headings) {
    if (!firstByLevel.has(h.level)) firstByLevel.set(h.level, h.text);
  }
  for (const [level, text] of firstByLevel) {
    expect.push(`    { selector: "h${level}", text: ${JSON.stringify(text)} },`);
    expect.push(todo(`confirm the h${level} text matches the plan`));
  }
  for (const tag of [...new Set(outline.landmarks.map((l) => l.tag))]) {
    expect.push(`    { selector: ${JSON.stringify(tag)}, exists: true },`);
  }
  if (outline.links.length) {
    expect.push(`    { selector: "a[href]", count: { min: ${outline.links.length} } },`);
    expect.push(todo("confirm the expected number of links"));
  }
  if (outline.buttons.length) {
    expect.push(`    { selector: "button", count: { min: ${outline.buttons.length} } },`);
  }
  for (const f of outline.forms) {
    expect.push(`    { selector: ${JSON.stringify(f.id ? `#${f.id}` : "form")}, exists: true },`);
    for (const field of f.fields) {
      if (field.id) expect.push(todo(`confirm field #${field.id} (${field.type || field.tag}) is planned`));
      else if (field.name) expect.push(todo(`confirm field [name=${field.name}] (${field.type || field.tag}) is planned`));
    }
  }
  for (const img of outline.images) {
    if (img.alt) {
      expect.push(`    { selector: "img", attribute: { alt: { nonEmpty: true } } },`);
      break;
    }
  }
  if (outline.overflow.horizontal) {
    expect.push(todo("HORIZONTAL OVERFLOW detected at this viewport; likely a bug"));
  }

  const gitSummary = gitDiff && gitDiff.files && gitDiff.files.length
    ? `// git diff touched ${gitDiff.files.length} file(s): ${gitDiff.files.slice(0, 20).join(", ")}`
    : "// no git diff available (not a repo, or clean tree)";
  const planSummary = planSources.length
    ? `// plan sources found: ${planSources.join(", ")}`
    : "// no SPEC.md/PLAN.md/README.md found; infer the plan from the session request";

  const body = `// AUTO-SCAFFOLDED by web-page-verification --scaffold.
// REVIEW BEFORE COMMIT. Every TODO(verify) marks a statement inferred from the current
// DOM or the git diff, not yet confirmed against what the page was supposed to be.
${gitSummary}
${planSummary}
export default {
  name: ${JSON.stringify(name)},
  path: ${JSON.stringify(pagePath)},
  expect: [
${expect.join("\n")}
  ],
  async run(page, t) {
    // TODO(verify): add checks for behaviour the declarative block cannot express
    // (form flows, navigation, dynamic data) and delete this comment when done.
  },
};
`;
  return { name, filename: `${name}.scaffold.spec.mjs`, source: body };
}

export { keyOf };
