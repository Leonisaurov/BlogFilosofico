/**
 * editor.e2e.mjs — Verificación del menú y del editor de publicaciones.
 *
 * Usa Chrome DevTools Protocol sin dependencias. Comprueba que el editor crea
 * una PUBLICACIÓN (no solo un documento): datos de portada, doble
 * previsualización con los componentes reales, borrador, seguridad, compartir
 * y exportación.
 *
 * Uso: node tests/editor.e2e.mjs <cdpPort> <label> [ancho] [alto]
 */

const PORT = process.argv[2] ?? "9222";
const LABEL = process.argv[3] ?? "editor";
const WIDTH = Number(process.argv[4] ?? 1440);
const HEIGHT = Number(process.argv[5] ?? 900);

const COVER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12'%3E%3Crect width='12' height='12' fill='%23c8763f'/%3E%3C/svg%3E";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    await sleep(500);
  }
  throw new Error("no se encontró target de página en el CDP");
}

function cdp(ws, onEvent) {
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      return;
    }
    onEvent?.(msg);
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

const problems = [];
const send = cdp(ws, (msg) => {
  if (msg.method === "Runtime.exceptionThrown") {
    problems.push({
      type: "exception",
      text:
        msg.params.exceptionDetails?.exception?.description ??
        msg.params.exceptionDetails?.text,
    });
  }
  if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
    problems.push({ type: "log.error", text: msg.params.entry.text });
  }
  if (msg.method === "Page.javascriptDialogOpening") {
    send("Page.handleJavaScriptDialog", { accept: true });
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

const evaluate = async (expression) => {
  const { result } = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return result.value;
};

async function waitFor(expression, tries = 40) {
  for (let i = 0; i < tries; i++) {
    if (await evaluate(expression)) return true;
    await sleep(400);
  }
  return false;
}

const out = { label: LABEL, viewport: `${WIDTH}x${HEIGHT}`, steps: {} };

await send("Page.reload", { ignoreCache: true });
await waitFor("document.querySelectorAll('.post').length > 0");
await evaluate("localStorage.clear()");
await send("Page.reload", { ignoreCache: true });
await waitFor("document.querySelectorAll('.post').length > 0");

// 1) Menú: apertura, contenido y cierre con Escape.
out.steps.menu = await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const button = document.querySelector('[data-menu-open]');
  button.click();
  await sleep(250);
  const dialog = document.querySelector('#menu-dialog');
  return {
    open: dialog.open === true,
    ariaExpanded: button.getAttribute('aria-expanded') === 'true',
    ariaHaspopup: button.getAttribute('aria-haspopup'),
    items: [...dialog.querySelectorAll('[data-menu-target]')].map((a) => a.textContent.trim()),
    hasCloseButton: !!dialog.querySelector('[data-menu-close]'),
  };
})()`);

await send("Input.dispatchKeyEvent", {
  type: "keyDown", key: "Escape", code: "Escape",
  windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27,
});
await send("Input.dispatchKeyEvent", {
  type: "keyUp", key: "Escape", code: "Escape",
  windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27,
});
await sleep(350);
out.steps.menuEscape = await evaluate(`(() => {
  const dialog = document.querySelector('#menu-dialog');
  const button = document.querySelector('[data-menu-open]');
  return { closed: dialog.open === false, ariaExpanded: button.getAttribute('aria-expanded') };
})()`);

// 2) Crear artículo desde el menú.
out.steps.openEditor = await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelector('[data-menu-open]').click();
  await sleep(250);
  document.querySelector('[data-menu-target="#/crear"]').click();
  await sleep(500);
  const editor = document.querySelector('#editor');
  const field = (name) => !!editor.querySelector('[data-field="' + name + '"]');
  return {
    menuClosed: document.querySelector('#menu-dialog').open === false,
    hash: location.hash,
    editorOpen: !editor.hidden && editor.classList.contains('is-open'),
    fields: ['title', 'description', 'category', 'author', 'coverImage', 'content'].filter(field),
    previewTabs: [...editor.querySelectorAll('[data-preview-tab]')].map((b) => b.dataset.previewTab),
    hasCardStage: !!editor.querySelector('[data-card-stage]'),
    hasArticleStage: !!editor.querySelector('[data-article-stage]'),
    toolbarButtons: editor.querySelectorAll('[data-action]').length,
    modes: [...editor.querySelectorAll('[data-mode-btn]')].map((b) => b.dataset.modeBtn),
    hasFileInput: !!editor.querySelector('[data-cover-file]'),
    hasClearCover: !!editor.querySelector('[data-cover-clear]'),
  };
})()`);

// 3) Barra de herramientas sobre el campo de contenido.
out.steps.toolbar = await evaluate(`(() => {
  const editor = document.querySelector('#editor');
  const content = editor.querySelector('[data-field="content"]');
  const run = (action) => editor.querySelector('[data-action="' + action + '"]').click();
  const set = (value) => {
    content.focus();
    content.value = value;
    content.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const all = () => content.setSelectionRange(0, content.value.length);
  const result = {};
  set('hola'); all(); run('bold'); result.bold = content.value;
  set('hola'); all(); run('italic'); result.italic = content.value;
  set('hola'); all(); run('strike'); result.strike = content.value;
  set('hola'); all(); run('code'); result.code = content.value;
  set('titulo'); all(); run('h2'); result.h2 = content.value;
  set('uno\\ndos'); all(); run('ul'); result.ul = content.value;
  set('uno\\ndos'); all(); run('ol'); result.ol = content.value;
  set('uno'); all(); run('task'); result.task = content.value;
  set('cita'); all(); run('quote'); result.quote = content.value;
  set('texto'); all(); run('link'); result.link = content.value;
  set('texto'); all(); run('image'); result.image = content.value;
  set(''); all(); run('table'); result.table = content.value.split('\\n')[0];
  set(''); all(); run('codeblock'); result.codeblock = content.value.split('\\n')[0];
  set('a'); all(); run('hr'); result.hr = content.value;
  return result;
})()`);

// 4) Doble previsualización con los componentes reales + actualización en vivo.
out.steps.previews = await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const editor = document.querySelector('#editor');
  const field = (name) => editor.querySelector('[data-field="' + name + '"]');
  const set = (name, value) => {
    const el = field(name);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const COVER = ${JSON.stringify(COVER)};
  const md = [
    '# Título principal',
    '',
    'Párrafo con **negrita**, *cursiva*, ~~tachado~~ y \\\`código\\\`.',
    '',
    '> Una cita en bloque',
    '',
    '- item uno',
    '- item dos',
    '',
    '| A | B |',
    '| --- | --- |',
    '| 1 | 2 |',
    '',
    '\\\`\\\`\\\`js',
    'const x = 1;',
    '\\\`\\\`\\\`',
  ].join('\\n');

  set('title', 'La prueba del editor');
  set('description', 'Una descripción breve distinta del contenido completo.');
  set('category', 'Epistemología');
  set('author', 'Autora de Prueba');
  set('coverImage', COVER);
  set('content', md);
  await sleep(500);

  const card = editor.querySelector('[data-card-stage] .post');
  const article = editor.querySelector('[data-article-stage] .reader__article');
  const realCard = document.querySelector('#feed .post');
  const result = {
    cardIsStatic: card?.dataset.static === 'true',
    cardTitle: card?.querySelector('.post__title')?.textContent,
    cardDescription: card?.querySelector('.post__excerpt')?.textContent,
    cardCategory: card?.querySelector('.post__category')?.textContent,
    cardHasScrim: !!card?.querySelector('.post__scrim'),
    cardFallback: (card?.querySelector('.post__cover')?.style.backgroundImage ?? '').includes('data:image/svg'),
    cardCoverSrc: card?.querySelector('.post__img')?.getAttribute('src'),
    cardRadius: getComputedStyle(card).borderRadius,
    realRadius: realCard ? getComputedStyle(realCard).borderRadius : null,
    articleTitle: article?.querySelector('.reader__title')?.textContent,
    articleCategory: article?.querySelector('.reader__category')?.textContent,
    articleMeta: article?.querySelector('.reader__meta')?.textContent,
    articleBodyIsMarkdown: !!article?.querySelector('.reader__body.markdown'),
    articleH1: !!article?.querySelector('.reader__body h1'),
    articleStrong: !!article?.querySelector('.reader__body strong'),
    articleQuote: !!article?.querySelector('.reader__body blockquote'),
    articleTable: !!article?.querySelector('.reader__body table'),
    articleCode: !!article?.querySelector('.reader__body pre code'),
    slugLabel: editor.querySelector('[data-editor-slug]')?.textContent,
  };

  // Actualización en vivo: título y descripción → tarjeta; contenido → artículo.
  set('title', 'Título actualizado en vivo');
  set('description', 'Descripción actualizada en vivo.');
  await sleep(350);
  result.cardTitleAfter = editor.querySelector('[data-card-stage] .post__title')?.textContent;
  result.cardDescriptionAfter = editor.querySelector('[data-card-stage] .post__excerpt')?.textContent;
  result.articleTitleAfter = editor.querySelector('[data-article-stage] .reader__title')?.textContent;

  set('content', '# Otro encabezado\\n\\nTexto nuevo con una lista:\\n\\n- alfa\\n- beta');
  await sleep(350);
  result.articleH1After = editor.querySelector('[data-article-stage] .reader__body h1')?.textContent;
  result.articleListAfter = editor.querySelectorAll('[data-article-stage] .reader__body ul li').length;

  // Cambio de portada → se actualiza la imagen de la tarjeta.
  const otherCover = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='8' height='8' fill='%231d2a37'/%3E%3C/svg%3E";
  set('coverImage', otherCover);
  await sleep(350);
  result.cardCoverSrcAfter = editor.querySelector('[data-card-stage] .post__img')?.getAttribute('src');
  result.coverChanged = result.cardCoverSrcAfter === otherCover;

  // Pestañas: cambiar a «Artículo completo».
  editor.querySelector('[data-preview-tab="article"]').click();
  await sleep(120);
  result.articleTabSelected = editor.querySelector('[data-preview-tab="article"]').getAttribute('aria-selected') === 'true';
  result.cardPanelHidden = editor.querySelector('[data-preview-panel="card"]').hidden === true;
  result.articlePanelVisible = editor.querySelector('[data-preview-panel="article"]').hidden === false;
  editor.querySelector('[data-preview-tab="card"]').click();
  await sleep(120);
  result.cardTabSelected = editor.querySelector('[data-preview-tab="card"]').getAttribute('aria-selected') === 'true';

  // Modos.
  const setMode = (m) => editor.querySelector('[data-mode-btn="' + m + '"]').click();
  const display = (sel) => getComputedStyle(editor.querySelector(sel)).display;
  setMode('preview'); await sleep(80);
  result.previewMode = editor.querySelector('[data-editor-workspace]').dataset.mode;
  result.previewHidesEditor = display('.editor__pane--write') === 'none';
  result.contentKeptInPreview = field('content').value === otherCover ? false : field('content').value.length > 0;
  setMode('split'); await sleep(80);
  result.splitMode = editor.querySelector('[data-editor-workspace]').dataset.mode;
  result.splitShowsBoth = display('.editor__pane--write') !== 'none' && display('.editor__pane--preview') !== 'none';
  result.splitColumns = getComputedStyle(editor.querySelector('[data-editor-workspace]')).gridTemplateColumns.split(' ').length;
  setMode('edit'); await sleep(80);
  result.editMode = editor.querySelector('[data-editor-workspace]').dataset.mode;
  result.outlineItems = editor.querySelectorAll('.editor__outline-item').length;
  return result;
})()`);

// 5) Seguridad del Markdown en la previsualización del artículo.
out.steps.security = await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const editor = document.querySelector('#editor');
  const content = editor.querySelector('[data-field="content"]');
  const md = [
    '<script>window.__xss = 1<\\/script>',
    '',
    '<img src="x" onerror="window.__xss = 2">',
    '',
    '[malo](javascript:alert(1))',
    '',
    '<a href="javascript:window.__xss = 5">crudo</a>',
    '',
    '<div onclick="window.__xss = 4">hola</div>',
  ].join('\\n');
  content.value = md;
  content.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(450);
  const body = editor.querySelector('[data-article-stage] .reader__body');
  const anchors = [...body.querySelectorAll('a')];
  return {
    scriptTags: body.querySelectorAll('script').length,
    onerror: body.innerHTML.includes('onerror'),
    onclick: body.innerHTML.includes('onclick'),
    unsafeHrefs: anchors.map((a) => a.getAttribute('href') ?? '').filter((h) => /^\\s*(javascript|vbscript|data):/i.test(h)),
    executed: window.__xss ?? null,
    visibleText: body.textContent.includes('hola'),
  };
})()`);

// 6) Propuesta: descarga del .md, requisitos y mailto breve.
out.steps.proposal = await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const editor = document.querySelector('#editor');
  const field = (name) => editor.querySelector('[data-field="' + name + '"]');
  const set = (name, value) => { const el = field(name); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); };
  const dialog = editor.querySelector('[data-share-dialog]');
  const q = (sel) => dialog.querySelector(sel);
  const notice = () => editor.querySelector('[data-editor-notice]').textContent;
  const COVER = ${JSON.stringify(COVER)};
  const result = {};

  set('title', 'La ética según Spinoza');
  set('description', 'Descripción para la tarjeta.');
  set('category', 'Ética');
  set('types', 'Ensayo, Artículo');
  set('author', 'Autora de Prueba');
  set('content', '# Cuerpo\\n\\nContenido en **Markdown**.');
  await sleep(300);

  // --- 1) Artículo sin imagen: descarga directa desde la barra. ---
  set('coverImage', '');
  await sleep(250);
  const contentBefore = field('content').value;
  editor.querySelector('[data-editor-download]').click();
  await sleep(120);
  result.noImageDownloadNotice = /\\.md/.test(notice());

  // --- 2) Imagen local (data-URL): aviso, sin requisito ni casilla. ---
  set('coverImage', COVER);
  await sleep(250);
  editor.querySelector('[data-editor-proposal]').click();
  await sleep(250);
  result.dialogOpen = dialog.open === true;
  result.localRemoteStepHidden = q('[data-proposal-step="remote-cover"]').hidden === true;
  result.localCoverCheckHidden = q('[data-proposal-check-cover-row]').hidden === true;
  result.localNoteVisible = q('[data-proposal-local-cover]').hidden === false;
  result.localNoteMentionsImage = /imagen local/i.test(q('[data-proposal-local-text]').textContent);
  result.continueDisabledInitial = q('[data-proposal-continue]').disabled === true;
  result.mdCheckDisabledInitially = q('[data-proposal-check-md]').disabled === true;
  result.confirmHintVisibleInitially = q('[data-proposal-confirm-hint]').hidden === false;

  // --- 5) Sin descargar el .md no se habilita, ni con la casilla marcada. ---
  q('[data-proposal-check-md]').checked = true;
  q('[data-proposal-check-md]').dispatchEvent(new Event('change', { bubbles: true }));
  result.continueDisabledWithoutDownload = q('[data-proposal-continue]').disabled === true;

  q('[data-proposal-download-md]').click();
  await sleep(150);
  result.mdStatus = q('[data-proposal-md-status]').textContent;
  result.mdStatusDone = q('[data-proposal-md-status]').dataset.state === 'done';
  result.mdCheckEnabledAfterDownload = q('[data-proposal-check-md]').disabled === false;
  result.continueEnabledLocal = q('[data-proposal-continue]').disabled === false;

  // --- 11) El editor conserva el artículo tras las descargas. ---
  result.contentIntactAfterDownload = field('content').value === contentBefore;

  q('[data-share-close]').click();
  await sleep(250);
  result.localDialogClosed = dialog.open === false;

  // --- 3) y 6) Imagen remota: requisito y bloqueo hasta completarlo. ---
  set('coverImage', 'https://remote.example.invalid/portada-de-prueba.jpg');
  await sleep(250);
  editor.querySelector('[data-editor-proposal]').click();
  await sleep(250);
  result.remoteStepVisible = q('[data-proposal-step="remote-cover"]').hidden === false;
  result.remoteCheckVisible = q('[data-proposal-check-cover-row]').hidden === false;
  result.remoteLocalNoteHidden = q('[data-proposal-local-cover]').hidden === true;
  result.remoteContinueDisabled = q('[data-proposal-continue]').disabled === true;
  result.coverCheckDisabledInitially = q('[data-proposal-check-cover]').disabled === true;

  q('[data-proposal-download-md]').click();
  await sleep(120);
  q('[data-proposal-check-md]').checked = true;
  q('[data-proposal-check-md]').dispatchEvent(new Event('change', { bubbles: true }));
  result.remoteStillDisabledWithoutImage = q('[data-proposal-continue]').disabled === true;

  q('[data-proposal-continue]').click();
  await sleep(100);
  result.remoteBlockedBeforeImage = dialog.open === true;

  // La descarga remota falla (red/CORS): se ofrece abrir la imagen original.
  const realFetch = window.fetch;
  window.fetch = () => Promise.reject(new TypeError('Failed to fetch (simulado)'));
  q('[data-proposal-download-cover]').click();
  await sleep(500);
  window.fetch = realFetch;
  result.coverStatusAfterAttempt = q('[data-proposal-cover-status]').textContent;
  result.coverOpenFallbackVisible = q('[data-proposal-open-cover]').hidden === false;
  result.coverOpenFallbackHref = (q('[data-proposal-open-cover]').getAttribute('href') || '').startsWith('https://');
  result.remoteStillDisabledWithoutCheck = q('[data-proposal-continue]').disabled === true;
  result.coverCheckEnabledAfterAttempt = q('[data-proposal-check-cover]').disabled === false;

  q('[data-proposal-check-cover]').checked = true;
  q('[data-proposal-check-cover]').dispatchEvent(new Event('change', { bubbles: true }));
  result.remoteEnabledAfterAll = q('[data-proposal-continue]').disabled === false;

  // --- 7) Cancelar: no abre el correo ni navega. ---
  const hashBefore = location.hash;
  q('[data-share-close]').click();
  await sleep(250);
  result.cancelClosesDialog = dialog.open === false;
  result.cancelKeepsHash = location.hash === hashBefore;

  // --- 8), 9) y 10) mailto breve y correctamente codificado. ---
  const share = await import('/js/lib/share.js');
  const mail = share.buildProposalMailto();
  const rawBody = decodeURIComponent(mail.href.split('body=')[1] || '');
  result.mailTo = mail.to;
  result.mailSubject = mail.subject;
  result.mailHrefStartsMailto = mail.href.startsWith('mailto:admin@example.com?subject=');
  result.mailBodyHasGreeting = rawBody.includes('Hola:');
  result.mailBodyMentionsProposal = /propuesta de artículo/i.test(rawBody);
  result.mailBodyIsShort = rawBody.length < 140;
  result.mailBodyHasNoGuide = !/guard|incorpor|artículos\.js|adjuntá|debés|tenés/i.test(rawBody);
  result.mailBodyNoFullArticle = !rawBody.includes('Contenido en **Markdown**.');
  result.mailDoesNotClaimAttached = /su revisión/i.test(rawBody);
  result.mailEncodedNewlines = mail.href.includes('%0A');
  result.mailNoRawSpaces = !mail.href.includes(' ');

  // 10) Título con acentos y caracteres especiales → nombre normalizado.
  set('title', '  ¿Qué es la «justicia»? — Análisis / Crítica  ');
  await sleep(300);
  const speFile = share.buildPublicationMarkdownFile({
    slug: share.slugify(field('title').value), title: field('title').value,
    description: '', category: '', types: [], author: '', coverImage: '',
    coverLocalName: '', content: '# x', createdAt: '2026-03-01',
  });
  result.accentedFilename = speFile.filename;
  result.accentedFilenameSafe = /^[a-z0-9-]+\\.md$/.test(speFile.filename);

  // Exportación .json y acciones secundarias (se conservan).
  const jsonFile = share.buildPublicationJsonFile({
    id: 'socrates', slug: 'socrates', title: 'Propuesta completa',
    description: 'd', category: 'Ética', types: ['Ensayo'], author: 'a',
    coverImage: './assets/socrates.jpg', coverLocalName: '', content: '# x',
    createdAt: '2026-03-01',
  });
  const parsed = JSON.parse(jsonFile.content);
  result.exportJsonFields = ['id', 'slug', 'title', 'description', 'category', 'types', 'author', 'coverImage', 'content', 'createdAt', 'readingTime'].every((k) => k in parsed);
  result.exportMdHasFrontMatter = share.buildPublicationMarkdownFile({
    slug: 'socrates', title: 'Propuesta completa', description: 'd', category: 'Ética',
    types: ['Ensayo', 'Artículo'], author: 'a', coverImage: './assets/socrates.jpg',
    coverLocalName: '', content: '# Cuerpo', createdAt: '2026-03-01',
  }).content.includes('title: "Propuesta completa"');
  result.hasJsonButton = !!dialog.querySelector('[data-share-json]');
  result.hasCopyButton = !!dialog.querySelector('[data-share-copy]');
  return result;
})()`);

// 6b) Completar los requisitos y continuar: se cierra el diálogo y se abre el
// cliente de correo (mailto). El navegador headless no puede confirmar que el
// cliente externo se abrió; se comprueba el cierre y el aviso posterior.
out.steps.proposalContinue = await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const editor = document.querySelector('#editor');
  const field = (name) => editor.querySelector('[data-field="' + name + '"]');
  const set = (name, value) => { const el = field(name); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); };
  const dialog = editor.querySelector('[data-share-dialog]');
  const q = (sel) => dialog.querySelector(sel);
  set('title', 'Propuesta para enviar');
  set('coverImage', 'https://remote.example.invalid/portada.jpg');
  set('content', '# Cuerpo\\n\\nTexto.');
  await sleep(300);
  editor.querySelector('[data-editor-proposal]').click();
  await sleep(250);
  q('[data-proposal-download-md]').click();
  await sleep(120);
  q('[data-proposal-check-md]').checked = true;
  q('[data-proposal-check-md]').dispatchEvent(new Event('change', { bubbles: true }));
  const realFetch = window.fetch;
  window.fetch = () => Promise.reject(new TypeError('Failed to fetch (simulado)'));
  q('[data-proposal-download-cover]').click();
  await sleep(500);
  window.fetch = realFetch;
  q('[data-proposal-check-cover]').checked = true;
  q('[data-proposal-check-cover]').dispatchEvent(new Event('change', { bubbles: true }));
  const enabled = q('[data-proposal-continue]').disabled === false;
  q('[data-proposal-continue]').click();
  await sleep(300);
  return {
    enabled,
    dialogClosedAfterContinue: dialog.open === false,
    noticeAfterContinue: editor.querySelector('[data-editor-notice]').textContent,
  };
})()`);

// 7) Borrador local: se guarda y se recupera tras recargar.
out.steps.draftSave = await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const editor = document.querySelector('#editor');
  const field = (name) => editor.querySelector('[data-field="' + name + '"]');
  const set = (name, value) => { const el = field(name); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); };
  set('title', 'Mi publicación de prueba');
  set('description', 'Descripción del borrador.');
  set('category', 'Metafísica');
  set('types', 'Ensayo');
  set('author', 'Autora de Prueba');
  set('coverImage', ${JSON.stringify(COVER)});
  set('content', '# Hola\\n\\nContenido del borrador.');
  await sleep(800);
  const raw = localStorage.getItem('blogfilosofia.borrador.v2');
  const parsed = raw ? JSON.parse(raw) : null;
  return {
    stored: !!raw,
    storedTitle: parsed?.publication?.title ?? null,
    storedDescription: parsed?.publication?.description ?? null,
    storedCategory: parsed?.publication?.category ?? null,
    storedTypes: parsed?.publication?.types ?? null,
    storedHasCover: (parsed?.publication?.coverImage ?? '').startsWith('data:image'),
    savedIndicator: editor.querySelector('[data-editor-saved]').textContent,
  };
})()`);

await send("Page.reload", { ignoreCache: true });
await waitFor("document.querySelectorAll('.post').length > 0");
await waitFor("!document.querySelector('#editor').hidden");
out.steps.draftRestore = await evaluate(`(() => {
  const editor = document.querySelector('#editor');
  const field = (name) => editor.querySelector('[data-field="' + name + '"]');
  return {
    hash: location.hash,
    title: field('title').value,
    description: field('description').value,
    category: field('category').value,
    author: field('author').value,
    content: field('content').value,
    coverIsLocal: field('coverImage').value === '',
    thumbVisible: editor.querySelector('[data-cover-thumb]').hidden === false,
    savedIndicator: editor.querySelector('[data-editor-saved]').textContent,
    shareIndicator: editor.querySelector('[data-editor-share-state]').textContent,
  };
})()`);

// 8) Aviso al salir con cambios sin guardar.
out.steps.beforeUnload = await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const editor = document.querySelector('#editor');
  const content = editor.querySelector('[data-field="content"]');
  content.value += '\\n\\nCambio sin guardar';
  content.dispatchEvent(new Event('input', { bubbles: true }));
  const dirty = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(dirty);
  const preventedWhenDirty = dirty.defaultPrevented;
  await sleep(800);
  const saved = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(saved);
  return { preventedWhenDirty, preventedWhenSaved: saved.defaultPrevented };
})()`);

// 9) Publicación nueva (con cancelación), vistas provisionales y vuelta al feed.
out.steps.newAndPending = await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const editor = document.querySelector('#editor');
  const field = (name) => editor.querySelector('[data-field="' + name + '"]');
  const result = {};

  window.confirm = () => false;
  editor.querySelector('[data-editor-new]').click();
  await sleep(180);
  result.cancelKeepsContent = field('content').value.length > 0;

  window.confirm = () => true;
  editor.querySelector('[data-editor-new]').click();
  await sleep(250);
  result.titleCleared = field('title').value === '';
  result.descriptionCleared = field('description').value === '';
  result.contentCleared = field('content').value === '';
  result.draftRemoved = localStorage.getItem('blogfilosofia.borrador.v2') === null;

  location.hash = '#/secciones'; await sleep(450);
  const pending = document.querySelector('#pending');
  result.sectionsOpen = !pending.hidden;
  result.sectionsTitle = pending.querySelector('.pending__title')?.textContent;
  location.hash = '#/configuracion'; await sleep(450);
  result.settingsOpen = !pending.hidden;
  result.settingsTitle = pending.querySelector('.pending__title')?.textContent;
  location.hash = '#/'; await sleep(450);
  result.backToFeed = !document.querySelector('#feed').hidden && document.querySelectorAll('#feed .post').length === 7;
  result.editorClosed = document.querySelector('#editor').hidden;
  result.pendingClosed = document.querySelector('#pending').hidden;
  return result;
})()`);

out.problems = problems;
console.log(JSON.stringify(out, null, 2));
ws.close();
process.exit(0);
