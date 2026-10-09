/**
 * e2e.mjs — Verificación end-to-end con Chrome DevTools Protocol.
 * Sin dependencias: usa fetch y WebSocket globales de Node.
 *
 * Uso: node tests/e2e.mjs <cdpPort> <label> [online|offline] [ancho] [alto]
 *   online  (por defecto): estructura, scroll contenido, navegación al
 *           artículo correcto y página individual.
 *   offline: bloquea las imágenes remotas y comprueba que la portada SVG
 *            local y el respaldo del lector siguen funcionando.
 */

const PORT = process.argv[2] ?? "9222";
const LABEL = process.argv[3] ?? "run";
const MODE = process.argv[4] ?? "online";
const WIDTH = Number(process.argv[5] ?? 0);
const HEIGHT = Number(process.argv[6] ?? 0);

const ONLINE_ASSERTIONS = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const feed = document.querySelector('#feed');
  const header = document.querySelector('.site-header');
  const dock = document.querySelector('#dock');
  const cards = [...document.querySelectorAll('#feed .post')];
  if (!feed || !header || !dock || cards.length === 0) return { fatal: 'estructura incompleta' };

  const feedH = feed.clientHeight;
  const slideH = cards[0].getBoundingClientRect().height;
  const before = {
    header: Math.round(header.getBoundingClientRect().top),
    dock: Math.round(dock.getBoundingClientRect().top),
    win: window.scrollY,
    doc: document.scrollingElement.scrollTop,
  };

  feed.scrollTop = Math.round(feedH * 0.9);
  await sleep(450);

  const after = {
    header: Math.round(header.getBoundingClientRect().top),
    dock: Math.round(dock.getBoundingClientRect().top),
    win: window.scrollY,
    doc: document.scrollingElement.scrollTop,
    feedScroll: feed.scrollTop,
  };

  const activeIndex = cards.findIndex((c) => c.dataset.active === 'true');
  const coverIsLocalSvg = cards.every((c) =>
    (c.querySelector('.post__cover')?.style.backgroundImage ?? '').includes('data:image/svg'));

  // 1) La tarjeta activa debe abrir EXACTAMENTE su artículo.
  const idx = activeIndex < 0 ? 0 : activeIndex;
  const expectedTitle = cards[idx].querySelector('.post__title').textContent.trim();
  const expectedHref = cards[idx].getAttribute('href');
  cards[idx].click();
  await sleep(600);

  const reader = document.querySelector('#reader');
  const readerOpen = !!reader && !reader.hidden && reader.classList.contains('is-open');
  const readerTitle = reader?.querySelector('.reader__title')?.textContent.trim() ?? null;
  const hash = location.hash;
  const readerParas = reader?.querySelectorAll('.reader__body p').length ?? 0;
  const readerH2 = reader?.querySelectorAll('.reader__body h2').length ?? 0;
  const readerQuote = reader?.querySelectorAll('.reader__body blockquote').length ?? 0;
  const readerMeta = reader?.querySelector('.reader__meta')?.textContent ?? '';
  const opensCorrectArticle = readerTitle === expectedTitle && hash === expectedHref;

  reader?.querySelector('[data-reader-back]')?.click();
  await sleep(550);
  const readerClosed = !!reader && reader.hidden === true;
  const hashAfter = location.hash;

  // 2) Dos tarjetas distintas abren artículos distintos.
  cards[0].click();
  await sleep(500);
  const title0 = document.querySelector('.reader__title')?.textContent.trim();
  const hash0 = location.hash;
  document.querySelector('[data-reader-back]')?.click();
  await sleep(450);

  cards[2].click();
  await sleep(500);
  const title2 = document.querySelector('.reader__title')?.textContent.trim();
  const hash2 = location.hash;
  document.querySelector('[data-reader-back]')?.click();
  await sleep(450);

  // 3) Carga directa por URL.
  const directSlug = hash2;
  location.hash = directSlug;
  await sleep(600);
  const directTitle = document.querySelector('.reader__title')?.textContent.trim();
  const directHash = location.hash;
  location.hash = '#/';
  await sleep(450);

  return {
    cardCount: cards.length,
    ratio: +(slideH / feedH).toFixed(3),
    feedH, slideH,
    headerFixed: before.header === after.header,
    dockFixed: before.dock === after.dock,
    pageDidNotScroll: after.win === 0 && after.doc === 0,
    feedDidScroll: after.feedScroll > 0,
    activeIndex,
    overflowX: document.scrollingElement.scrollWidth - window.innerWidth,
    coverIsLocalSvg,
    readerOpen, readerTitle, readerParas, readerH2, readerQuote, readerMeta,
    hash, opensCorrectArticle, expectedHref,
    readerClosed, hashAfter,
    distinctArticles: title0 !== title2,
    hash0, hash2,
    directWorks: directTitle === title2 && directHash === directSlug,
    remoteImgLoaded: !!document.querySelector('#feed .post__img.is-loaded'),
    viewport: { w: innerWidth, h: innerHeight },
  };
})()`;

const OFFLINE_ASSERTIONS = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const cards = [...document.querySelectorAll('#feed .post')];
  const allSvg = cards.length > 0 && cards.every((c) =>
    (c.querySelector('.post__cover')?.style.backgroundImage ?? '').includes('data:image/svg'));
  const noRemoteImgs = document.querySelectorAll('#feed .post__img').length === 0;

  cards[0]?.click();
  await sleep(700);
  const layer = document.querySelector('.reader__cover-fallback');
  const readerFallback = !!layer && (layer.style.backgroundImage || '').includes('data:image/svg');
  const readerTitle = document.querySelector('.reader__title')?.textContent.trim() ?? null;
  const bodyRendered = document.querySelectorAll('.reader__body p').length > 0;
  document.querySelector('[data-reader-back]')?.click();
  await sleep(400);

  return { cardCount: cards.length, allSvg, noRemoteImgs, readerFallback, readerTitle, bodyRendered };
})()`;

async function getPageTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      /* el puerto aún no responde */
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

async function waitForFeed(send) {
  for (let i = 0; i < 40; i++) {
    const { result } = await send("Runtime.evaluate", {
      expression:
        "document.readyState === 'complete' && document.querySelectorAll('.post').length > 0",
      returnByValue: true,
    });
    if (result.value === true) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

const target = await getPageTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

const send = cdp(ws);
await send("Runtime.enable");
await send("Page.enable");

if (WIDTH && HEIGHT) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: WIDTH < 600,
  });
}

if (MODE === "offline") {
  await send("Network.enable");
  await send("Network.setBlockedURLs", {
    urls: ["*commons.wikimedia.org*", "*wikimedia.org*", "*wikipedia.org*"],
  });
}

await send("Page.reload", { ignoreCache: true });
await new Promise((r) => setTimeout(r, 1200));

const out = { label: LABEL, mode: MODE, ready: false };
out.ready = await waitForFeed(send);

if (out.ready) {
  const { result } = await send("Runtime.evaluate", {
    expression: MODE === "offline" ? OFFLINE_ASSERTIONS : ONLINE_ASSERTIONS,
    awaitPromise: true,
    returnByValue: true,
  });
  out.assertions = result.value;
}

console.log(JSON.stringify(out, null, 2));
ws.close();
process.exit(0);
