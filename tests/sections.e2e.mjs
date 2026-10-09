/**
 * sections.e2e.mjs — Verificación end-to-end del explorador de secciones.
 * Sin dependencias: usa fetch y WebSocket globales de Node + Chrome DevTools.
 *
 * Uso: node tests/sections.e2e.mjs <cdpPort> <label> [ancho] [alto]
 *
 * Comprueba: cuadrícula, imágenes, contadores derivados, scroll vertical,
 * página de sección, apertura de artículos, navegación de regreso, estado
 * vacío, carga directa por URL y ausencia de desbordamiento horizontal.
 */

const PORT = process.argv[2] ?? "9222";
const LABEL = process.argv[3] ?? "sections";
const WIDTH = Number(process.argv[4] ?? 1440);
const HEIGHT = Number(process.argv[5] ?? 900);

const GRID = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const q = (s) => document.querySelector(s);
  const qa = (s) => [...document.querySelectorAll(s)];
  const out = {};

  // 1) Menú → Secciones
  q('[data-menu-open]').click();
  await sleep(320);
  out.menuOpen = q('#menu-dialog')?.open === true;
  q('[data-menu-target="#/secciones"]').click();
  await sleep(700);

  const sections = q('#sections');
  out.hash = location.hash;
  out.view = q('#app').dataset.view;
  out.sectionsVisible = !!sections && !sections.hidden && sections.classList.contains('is-open');
  out.headerVisible = getComputedStyle(q('.site-header')).visibility === 'visible';
  out.hamburgerVisible = getComputedStyle(q('[data-menu-open]')).display !== 'none';
  out.feedHidden = getComputedStyle(q('#feed')).display === 'none';
  out.title = q('.sections__title')?.textContent.trim();
  out.groupTitles = qa('.sections__group-title').map((h) => h.textContent.trim());

  // 2) Cuadrícula: tarjetas, imágenes y contadores
  const cards = qa('.section-card');
  out.cardCount = cards.length;
  out.cardsWithImage = cards.filter((c) => c.querySelector('img')?.getAttribute('src')).length;
  out.cardsWithName = cards.filter((c) => (c.querySelector('.section-card__name')?.textContent.trim() || '').length > 2).length;
  out.cardsWithDesc = cards.filter((c) => (c.querySelector('.section-card__desc')?.textContent.trim() || '').length > 10).length;
  out.cardsWithCount = cards.filter((c) => (c.querySelector('.section-card__count')?.textContent.trim() || '').length > 2).length;
  out.emptyCards = cards.filter((c) => c.classList.contains('section-card--empty')).length;
  out.domCounts = Object.fromEntries(cards.map((c) => [
    c.getAttribute('href').replace('#/secciones/', ''),
    c.querySelector('.section-card__count').textContent.trim()
  ]));

  const antigu = cards.find((c) => c.getAttribute('href') === '#/secciones/filosofia-antigua');
  out.antiguaCount = antigu?.querySelector('.section-card__count')?.textContent.trim();
  const metaf = cards.find((c) => c.getAttribute('href') === '#/secciones/metafisica');
  out.metafisicaCount = metaf?.querySelector('.section-card__count')?.textContent.trim();
  const etica = cards.find((c) => c.getAttribute('href') === '#/secciones/etica');
  out.eticaCount = etica?.querySelector('.section-card__count')?.textContent.trim();

  const scroll = q('.sections__scroll');
  out.scrollable = scroll.scrollHeight > scroll.clientHeight + 4;
  out.overflowX = document.scrollingElement.scrollWidth - innerWidth;

  // 3) Abrir una sección con artículos
  antigu.click();
  await sleep(700);
  out.sectionHash = location.hash;
  out.sectionTitle = q('.section-hero__title')?.textContent.trim();
  out.sectionCount = q('.section-hero__count')?.textContent.trim();
  const arts = qa('.section-articles .post--grid');
  out.articleCount = arts.length;
  out.articleTitles = arts.map((a) => a.querySelector('.post__title')?.textContent.trim());
  out.articleHrefs = arts.map((a) => a.getAttribute('href'));
  out.articleFallbackSvg = arts.length > 0 && arts.every((a) => (a.querySelector('.post__cover')?.style.backgroundImage || '').includes('data:image/svg'));
  out.sectionOverflowX = document.scrollingElement.scrollWidth - innerWidth;

  // 4) Abrir un artículo desde la sección
  arts[0].click();
  await sleep(800);
  out.readerOpen = !!q('#reader') && !q('#reader').hidden && q('#reader').classList.contains('is-open');
  out.readerHash = location.hash;
  out.readerTitle = q('.reader__title')?.textContent.trim();
  out.readerBackLabel = q('.reader__back span')?.textContent.trim();

  // 5) Regresar del lector: debe volver a la MISMA sección
  q('[data-reader-back]').click();
  await sleep(800);
  out.backHash = location.hash;
  out.backToSection = location.hash === '#/secciones/filosofia-antigua';
  out.readerClosed = q('#reader').hidden === true;

  // 6) Volver a la cuadrícula y luego al Blog
  q('.sections__back').click();
  await sleep(650);
  out.gridHash = location.hash;
  q('.sections__back').click();
  await sleep(650);
  out.feedHash = location.hash;
  out.feedVisible = q('#app').dataset.view === 'feed' && getComputedStyle(q('#feed')).display !== 'none';
  out.sectionsHiddenAfter = q('#sections').hidden === true;

  // 7) Sección vacía
  location.hash = '#/secciones/filosofia-medieval';
  await sleep(650);
  out.emptyHash = location.hash;
  out.emptyTitle = q('.section-hero__title')?.textContent.trim();
  out.emptyCount = q('.section-hero__count')?.textContent.trim();
  out.emptyState = !!q('.section-empty');
  out.emptyMessage = q('.section-empty__title')?.textContent.trim();
  out.emptyArticleCards = qa('.section-articles .post--grid').length;

  location.hash = '#/';
  await sleep(400);
  return out;
})()`;

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

const target = await getPageTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

const send = cdp(ws);
const problems = [];
ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.method === "Runtime.exceptionThrown") {
    problems.push(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text);
  }
  if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
    problems.push(msg.params.entry.text);
  }
});

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: WIDTH,
  height: HEIGHT,
  deviceScaleFactor: 1,
  mobile: WIDTH < 600,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.value;

await send("Page.reload", { ignoreCache: true });
await sleep(1600);

const out = { label: LABEL, viewport: { w: WIDTH, h: HEIGHT } };

// Esperar a que el feed esté montado
for (let i = 0; i < 30; i++) {
  if (await evaluate("document.querySelectorAll('#feed .post').length > 0")) break;
  await sleep(400);
}

out.grid = await evaluate(GRID);

// Carga directa por URL de una sección
await evaluate("location.hash = '#/secciones/epistemologia'");
await send("Page.reload", { ignoreCache: true });
await sleep(1800);
out.direct = await evaluate(`({
  hash: location.hash,
  title: document.querySelector('.section-hero__title')?.textContent.trim(),
  count: document.querySelector('.section-hero__count')?.textContent.trim(),
  articles: document.querySelectorAll('.section-articles .post--grid').length,
  headerVisible: getComputedStyle(document.querySelector('.site-header')).visibility === 'visible',
  overflowX: document.scrollingElement.scrollWidth - innerWidth
})`);

out.problems = problems;

// Comprobación cruzada contra el módulo: ninguna categoría sin mapear y los
// contadores de la cuadrícula deben coincidir con los derivados de ARTICLES.
out.module = await evaluate(`import('./js/data/sections.js').then((m) => ({
  total: m.SECTIONS.length,
  unmapped: m.unmappedCategories(),
  counts: Object.fromEntries(m.sectionsWithCounts().map((s) => [s.slug, s.count]))
}))`);

console.log(JSON.stringify(out, null, 2));
ws.close();
process.exit(0);
