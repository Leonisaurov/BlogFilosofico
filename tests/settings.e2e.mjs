/**
 * settings.e2e.mjs — Verificación end-to-end de «Configuración».
 *
 * Cubre: apertura/cierre del drawer (botón, fondo, Escape), preferencia de
 * vista (feed ↔ cuadrícula) con persistencia, tema claro/oscuro con
 * persistencia, diálogo de confirmación (cancelar no borra; confirmar borra),
 * y que los artículos públicos sigan funcionando tras la limpieza.
 *
 * Uso: node tests/settings.e2e.mjs <cdpPort> <label> [ancho] [alto]
 */

const PORT = process.argv[2] ?? "9222";
const LABEL = process.argv[3] ?? "settings";
const WIDTH = Number(process.argv[4] ?? 1440);
const HEIGHT = Number(process.argv[5] ?? 900);

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
const APP_URL = new URL(target.url).origin + "/";
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
await send("Emulation.setDeviceMetricsOverride", {
  width: WIDTH,
  height: HEIGHT,
  deviceScaleFactor: 1,
  mobile: WIDTH < 600,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.value;

async function reload() {
  await send("Page.reload", { ignoreCache: true });
  await sleep(1700);
  for (let i = 0; i < 25; i++) {
    if (await evaluate("document.querySelectorAll('#feed .post').length > 0")) break;
    await sleep(400);
  }
}

const out = { label: LABEL, viewport: { w: WIDTH, h: HEIGHT } };

// Estado inicial limpio.
await evaluate("localStorage.clear()");
await reload();

out.defaults = await evaluate(`({
  theme: document.documentElement.dataset.theme,
  viewMode: document.documentElement.dataset.viewMode,
  bodyBg: getComputedStyle(document.body).backgroundColor,
  feedDisplay: getComputedStyle(document.querySelector('#feed')).display,
  gridDisplay: getComputedStyle(document.querySelector('#home-grid')).display,
  feedCards: document.querySelectorAll('#feed .post').length,
  gridCards: document.querySelectorAll('#home-grid .post--grid').length,
  bootScriptBeforeCss: (() => {
    const html = document.documentElement.innerHTML;
    const boot = html.indexOf('blogfilosofia.preferencias.v1');
    const css = html.indexOf('css/tokens.css');
    return boot > -1 && css > -1 && boot < css;
  })(),
})`);

// 1) Abrir el drawer desde el menú.
out.open = await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelector('[data-menu-open]').click(); await sleep(320);
  document.querySelector('[data-menu-target="#/configuracion"]').click(); await sleep(700);
  const dialog = document.querySelector('#settings-dialog');
  const panel = dialog.querySelector('.settings__panel').getBoundingClientRect();
  return {
    hash: location.hash,
    open: dialog.open,
    isOpen: dialog.classList.contains('is-open'),
    view: document.querySelector('#app').dataset.view,
    backdrop: getComputedStyle(dialog, '::backdrop').backgroundColor,
    panelWidth: Math.round(panel.width),
    panelRight: Math.round(panel.right),
    panelLeft: Math.round(panel.left),
    viewport: innerWidth,
    feedChecked: document.querySelector('input[name="view-mode"][value="feed"]').checked,
    lightChecked: document.querySelector('input[name="theme"][value="light"]').checked,
    overflowX: document.scrollingElement.scrollWidth - innerWidth,
  };
})()`);

// 2) Cambiar a cuadrícula.
out.toGrid = await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelector('input[name="view-mode"][value="grid"]').click(); await sleep(350);
  const feed = document.querySelector('#feed');
  const grid = document.querySelector('#home-grid');
  const gridCards = [...grid.querySelectorAll('.post--grid')];
  const feedCards = [...document.querySelectorAll('#feed .post')];
  return {
    attr: document.documentElement.dataset.viewMode,
    feedDisplay: getComputedStyle(feed).display,
    gridDisplay: getComputedStyle(grid).display,
    gridCards: gridCards.length,
    feedCards: feedCards.length,
    sameHrefs: gridCards.map((c) => c.getAttribute('href')).join('|') === feedCards.map((c) => c.getAttribute('href')).join('|'),
    stored: JSON.parse(localStorage.getItem('blogfilosofia.preferencias.v1') || '{}').viewMode,
  };
})()`);

// 3) Cerrar con el botón: la URL vuelve a la vista anterior.
out.closeButton = await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelector('[data-settings-close]').click(); await sleep(500);
  const dialog = document.querySelector('#settings-dialog');
  return { open: dialog.open, hash: location.hash, view: document.querySelector('#app').dataset.view };
})()`);

// 4) La cuadrícula persiste tras recargar.
await reload();
out.gridPersisted = await evaluate(`({
  attr: document.documentElement.dataset.viewMode,
  gridDisplay: getComputedStyle(document.querySelector('#home-grid')).display,
  feedDisplay: getComputedStyle(document.querySelector('#feed')).display,
})`);

// 5) Una tarjeta de la cuadrícula abre el mismo artículo.
out.gridOpensArticle = await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const card = document.querySelector('#home-grid .post--grid');
  const href = card.getAttribute('href');
  const title = card.querySelector('.post__title').textContent.trim();
  card.click(); await sleep(750);
  const readerTitle = document.querySelector('.reader__title')?.textContent.trim();
  const hash = location.hash;
  document.querySelector('[data-reader-back]')?.click(); await sleep(600);
  return { href, title, readerTitle, hash, match: readerTitle === title && hash === href };
})()`);

// 6) Tema oscuro + persistencia.
out.toDark = await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  location.hash = '#/configuracion'; await sleep(700);
  document.querySelector('input[name="theme"][value="dark"]').click(); await sleep(300);
  return {
    attr: document.documentElement.dataset.theme,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    surface: getComputedStyle(document.querySelector('.settings__panel')).backgroundColor,
    stored: JSON.parse(localStorage.getItem('blogfilosofia.preferencias.v1') || '{}').theme,
  };
})()`);

// 7) Cerrar con Escape (tecla real).
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await sleep(600);
out.escapeClose = await evaluate(`({
  open: document.querySelector('#settings-dialog').open,
  hash: location.hash,
})`);

await reload();
out.darkPersisted = await evaluate(`({
  attr: document.documentElement.dataset.theme,
  bodyBg: getComputedStyle(document.body).backgroundColor,
  viewMode: document.documentElement.dataset.viewMode,
})`);

// 8) Cerrar pulsando el fondo superpuesto.
out.backdropClose = await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  location.hash = '#/configuracion'; await sleep(700);
  const dialog = document.querySelector('#settings-dialog');
  const before = dialog.open;
  dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await sleep(500);
  return { before, after: dialog.open, hash: location.hash };
})()`);

// 9) Cancelar la limpieza no borra nada.
out.clearCancel = await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  localStorage.setItem('blogfilosofia.borrador.v2', JSON.stringify({ publication: { title: 'Borrador de prueba' }, updatedAt: Date.now(), sharedFingerprint: null }));
  location.hash = '#/configuracion'; await sleep(700);
  document.querySelector('[data-settings-clear]').click(); await sleep(400);
  const confirm = document.querySelector('#settings-confirm');
  const confirmOpen = confirm.open;
  const drawerStillOpen = document.querySelector('#settings-dialog').open;
  const focused = document.activeElement?.getAttribute('data-confirm-cancel') !== null;
  document.querySelector('[data-confirm-cancel]').click(); await sleep(400);
  return {
    confirmOpen,
    drawerStillOpen,
    cancelFocused: focused,
    confirmClosed: !document.querySelector('#settings-confirm').open,
    draftKept: !!localStorage.getItem('blogfilosofia.borrador.v2'),
    theme: document.documentElement.dataset.theme,
    viewMode: document.documentElement.dataset.viewMode,
  };
})()`);

// 10) Confirmar la limpieza borra los datos y restablece las preferencias.
out.clearConfirm = await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelector('[data-settings-clear]').click(); await sleep(400);
  document.querySelector('[data-confirm-accept]').click(); await sleep(900);
  const keys = Object.keys(localStorage).filter((k) => k.startsWith('blogfilosofia'));
  const toast = document.querySelector('#app-toast');
  return {
    remainingKeys: keys,
    theme: document.documentElement.dataset.theme,
    viewMode: document.documentElement.dataset.viewMode,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    drawerOpen: document.querySelector('#settings-dialog').open,
    toastVisible: !toast.hidden && toast.classList.contains('is-visible'),
    toastText: toast.textContent.trim(),
    feedDisplay: getComputedStyle(document.querySelector('#feed')).display,
    gridDisplay: getComputedStyle(document.querySelector('#home-grid')).display,
  };
})()`);

// 11) Los artículos públicos siguen funcionando tras la limpieza.
out.articlesAfterClear = await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const card = document.querySelector('#feed .post');
  const title = card.querySelector('.post__title').textContent.trim();
  card.click(); await sleep(750);
  const readerTitle = document.querySelector('.reader__title')?.textContent.trim();
  const hash = location.hash;
  document.querySelector('[data-reader-back]')?.click(); await sleep(500);
  location.hash = '#/secciones'; await sleep(700);
  const sectionsOk = document.querySelectorAll('.section-card').length;
  location.hash = '#/'; await sleep(400);
  return { feedCards: document.querySelectorAll('#feed .post').length, title, readerTitle, hash, match: readerTitle === title, sectionsOk };
})()`);

out.problems = problems;
console.log(JSON.stringify(out, null, 2));
ws.close();
process.exit(0);
