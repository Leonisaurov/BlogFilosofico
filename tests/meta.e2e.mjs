/**
 * meta.e2e.mjs — Verificación de los metadatos de previsualización.
 *
 * Comprueba que el <head> trae los metadatos de la portada (Open Graph y
 * Twitter Card) y que js/lib/meta.js los actualiza al navegar: título,
 * descripción, portada de la vista activa y URL absoluta.
 *
 * Uso: node tests/meta.e2e.mjs <cdpPort> [ancho] [alto]
 */

const PORT = process.argv[2] ?? "9222";
const WIDTH = Number(process.argv[3] ?? 1440);
const HEIGHT = Number(process.argv[4] ?? 900);

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
    const text = msg.params.entry.text ?? "";
    if (!text.includes("favicon.ico")) problems.push(text);
  }
});

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Network.enable");
// Sin caché: el navegador reutilizaría index.html y los módulos ya cargados.
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", {
  width: WIDTH,
  height: HEIGHT,
  deviceScaleFactor: 1,
  mobile: WIDTH < 600,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.value;

const READ = `({
  title: document.title,
  description: document.head.querySelector('meta[name="description"]')?.content ?? null,
  canonical: document.head.querySelector('link[rel="canonical"]')?.href ?? null,
  og: Object.fromEntries([...document.head.querySelectorAll('meta[property^="og:"]')].map((m) => [m.getAttribute('property'), m.content])),
  twitter: Object.fromEntries([...document.head.querySelectorAll('meta[name^="twitter:"]')].map((m) => [m.getAttribute('name'), m.content])),
})`;

// URL única: evita que el navegador reutilice el index.html cacheado.
await send("Page.navigate", { url: `http://127.0.0.1:8137/?v=${Date.now()}` });
await sleep(2000);

const out = {};
out.home = await evaluate(READ);

// La portada del sitio debe existir y medir 1200×630.
out.cover = await evaluate(`new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve({ ok: true, w: img.naturalWidth, h: img.naturalHeight });
  img.onerror = () => resolve({ ok: false });
  img.src = './assets/social-preview.png';
})`);

// El dominio público configurado (SITE.url) debe ser el del archivo CNAME:
// así el dominio se obtiene de una única fuente y no de un valor inventado.
out.cname = await evaluate(`(async () => {
  const cname = (await (await fetch('./CNAME')).text()).trim();
  const { SITE } = await import('./js/data/config.js');
  const host = new URL(SITE.url).host;
  return { cname, host, url: SITE.url, match: cname === host };
})()`);

// Artículo: la portada del artículo pasa a ser og:image.
await evaluate("location.hash = '#/articulos/la-caverna-y-los-ecos'");
await sleep(800);
out.article = await evaluate(READ);

// Sección con imagen raster (Sócrates): og:image = esa imagen.
await evaluate("location.hash = '#/secciones/filosofia-antigua'");
await sleep(800);
out.sectionRaster = await evaluate(READ);

// Sección con ilustración SVG: no sirve como og:image, se usa la del sitio.
await evaluate("location.hash = '#/secciones/metafisica'");
await sleep(800);
out.sectionSvg = await evaluate(READ);

// Cuadrícula de secciones y vuelta a la home.
await evaluate("location.hash = '#/secciones'");
await sleep(700);
out.sections = await evaluate(READ);
await evaluate("location.hash = '#/'");
await sleep(600);
out.backHome = await evaluate(READ);

out.problems = problems;
console.log(JSON.stringify(out, null, 2));
ws.close();
process.exit(0);
