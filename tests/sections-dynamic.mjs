/**
 * sections-dynamic.mjs — Verifica que las secciones se DERIVAN de los datos.
 *
 * Inserta temporalmente una publicación en `js/data/articles.js`, recarga el
 * sitio y comprueba que:
 *   - un artículo nuevo con una categoría existente aparece en su sección y
 *     el contador sube;
 *   - al cambiarle la categoría, cambia de sección;
 *   - al quitarlo del conjunto de datos, desaparece;
 *   - un borrador local del editor NO aparece en el catálogo público.
 *
 * El archivo original se restaura SIEMPRE (try/finally), incluso si falla.
 *
 * Uso: node tests/sections-dynamic.mjs <cdpPort>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PORT = process.argv[2] ?? "9222";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ARTICLES_PATH = join(ROOT, "js", "data", "articles.js");
const ANCHOR = "export const ARTICLES = [\n";

const TEST_ARTICLE = `  {
    id: "prueba-dinamica",
    slug: "prueba-dinamica-temporal",
    title: "ARTICULO DE PRUEBA DINAMICA",
    description: "Publicacion temporal para verificar que las secciones se derivan de los datos.",
    category: "__CAT__",
    author: "Prueba",
    coverImage: "",
    cover: { alt: "", credit: "", numeral: "0", palette: { from: "#6b5842", to: "#3f3225", accent: "#c8ab84" } },
    content: "## Prueba\\n\\nContenido temporal.",
    createdAt: "2026-03-01",
    readingTime: 1,
    tags: ["prueba"],
  },
`;

function withArticle(source, category) {
  if (!source.includes(ANCHOR)) throw new Error("no se encontró el ancla de ARTICLES");
  return source.replace(ANCHOR, ANCHOR + TEST_ARTICLE.replace("__CAT__", category));
}

async function getPageTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      /* aún no responde */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("no se encontró target de página en el CDP");
}

function cdp(ws) {
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  });
  return (method, params = {}) =>
    new Promise((resolve, reject) => {
      const msgId = ++id;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const target = await getPageTarget();
const APP_URL = new URL(target.url).origin + "/";
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});
const send = cdp(ws);
await send("Runtime.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });

const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.value;

const READ = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  location.hash = '#/secciones';
  await sleep(650);
  const card = (slug) => [...document.querySelectorAll('.section-card')]
    .find((c) => c.getAttribute('href') === '#/secciones/' + slug);
  const count = (slug) => card(slug)?.querySelector('.section-card__count')?.textContent.trim() ?? null;
  const antigua = count('filosofia-antigua');
  const etica = count('etica');
  location.hash = '#/secciones/filosofia-antigua';
  await sleep(650);
  const titles = [...document.querySelectorAll('.section-articles .post--grid .post__title')]
    .map((t) => t.textContent.trim());
  location.hash = '#/secciones/etica';
  await sleep(650);
  const eticaTitles = [...document.querySelectorAll('.section-articles .post--grid .post__title')]
    .map((t) => t.textContent.trim());
  const draftVisible = document.body.textContent.includes('BORRADOR LOCAL DE PRUEBA');
  location.hash = '#/';
  await sleep(300);
  return { antigua, etica, titles, eticaTitles, draftVisible };
})()`;

async function reloadAndRead() {
  // Nos aseguramos de estar en la app (no en un SVG suelto) y forzamos una
  // recarga que ignora la caché: así el módulo articles.js se relee del disco.
  await send("Page.navigate", { url: APP_URL });
  await sleep(300);
  await send("Page.reload", { ignoreCache: true });
  await sleep(1700);
  for (let i = 0; i < 25; i++) {
    if (await evaluate("document.querySelectorAll('#feed .post').length > 0")) break;
    await sleep(400);
  }
  return evaluate(READ);
}

const original = readFileSync(ARTICLES_PATH, "utf8");
const out = { label: "sections-dynamic" };
try {
  out.before = await reloadAndRead();

  writeFileSync(ARTICLES_PATH, withArticle(original, "Filosofía antigua"));
  out.addedToExisting = await reloadAndRead();

  writeFileSync(ARTICLES_PATH, withArticle(original, "Ética"));
  out.recategorized = await reloadAndRead();

  writeFileSync(ARTICLES_PATH, original);
  out.removed = await reloadAndRead();

  // Borrador local: no debe aparecer en el catálogo público.
  await evaluate(`localStorage.setItem('blogfilosofia.borrador.v2', JSON.stringify({
    publication: { title: 'BORRADOR LOCAL DE PRUEBA', category: 'Filosofía antigua', content: 'x' },
    sharedFingerprint: null, updatedAt: Date.now()
  }))`);
  out.withDraft = await reloadAndRead();
  await evaluate("localStorage.removeItem('blogfilosofia.borrador.v2')");
} finally {
  writeFileSync(ARTICLES_PATH, original);
}

out.restored = readFileSync(ARTICLES_PATH, "utf8") === original;
console.log(JSON.stringify(out, null, 2));
ws.close();
process.exit(0);
