/**
 * editor.js — Editor de publicaciones del Blog de Filosofía.
 *
 * No crea un documento suelto: crea una PUBLICACIÓN con los mismos campos que
 * las publicaciones del sitio (título, descripción, categoría, tipos de texto,
 * autor, portada y contenido Markdown) y la previsualiza con los componentes
 * reales:
 *   - «Tarjeta del feed»  → createCard (mismo componente que el feed).
 *   - «Artículo completo» → createArticleView (misma plantilla que la página).
 *
 * Incluye barra de herramientas Markdown, modos Edición/Dividido/Vista previa,
 * borrador local, exportación y envío por correo. Sigue siendo una página
 * estática: no publica ni envía nada por sí sola.
 */

import { SITE } from "../data/config.js";
import { TEXT_TYPES } from "../data/sections.js";
import { escapeHtml } from "../lib/dom.js";
import { extractHeadings } from "../lib/markdown.js";
import { CATEGORY_OPTIONS, createPublication, isPublicationEmpty, normalizeTypes } from "../lib/publication.js";
import {
  buildProposalMailto,
  buildPublicationJsonFile,
  buildPublicationMarkdownFile,
  copyText,
  downloadBlob,
  downloadText,
} from "../lib/share.js";
import { slugify } from "../lib/slug.js";
import { clearDraft, loadDraft, saveDraft, storageAvailable } from "../lib/storage.js";
import { createArticleView, updateArticleView } from "./article-view.js";
import { createCard, updateCard } from "./card.js";

const FENCE = "```";

const BACK_ARROW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M20 12H5M11 6l-6 6 6 6"/></svg>`;

const TOOL_GROUPS = [
  [
    { action: "h1", label: "H1", title: "Encabezado de nivel 1" },
    { action: "h2", label: "H2", title: "Encabezado de nivel 2" },
    { action: "h3", label: "H3", title: "Encabezado de nivel 3" },
  ],
  [
    { action: "bold", label: "B", title: "Negrita (Ctrl+B)", bold: true },
    { action: "italic", label: "I", title: "Cursiva (Ctrl+I)", italic: true },
    { action: "strike", label: "S", title: "Tachado", strike: true },
  ],
  [
    { action: "quote", label: "&#10077;", title: "Cita en bloque" },
    { action: "ul", label: "&#8226;", title: "Lista desordenada" },
    { action: "ol", label: "1.", title: "Lista ordenada" },
    { action: "task", label: "&#9745;", title: "Lista de tareas" },
  ],
  [
    { action: "link", label: "Enlace", title: "Insertar enlace (Ctrl+K)" },
    { action: "image", label: "Imagen", title: "Insertar imagen" },
  ],
  [
    { action: "code", label: "&lt;/&gt;", title: "Código en línea" },
    { action: "codeblock", label: "{ }", title: "Bloque de código" },
    { action: "table", label: "&#9638;", title: "Insertar tabla" },
    { action: "hr", label: "&#8212;", title: "Línea horizontal" },
  ],
  [
    { action: "undo", label: "&#8630;", title: "Deshacer (Ctrl+Z)" },
    { action: "redo", label: "&#8631;", title: "Rehacer (Ctrl+Shift+Z)" },
  ],
];

const MODES = [
  { mode: "edit", label: "Edición" },
  { mode: "split", label: "Dividido" },
  { mode: "preview", label: "Vista previa" },
];

const PREVIEW_TABS = [
  { tab: "card", label: "Tarjeta del feed" },
  { tab: "article", label: "Artículo completo" },
];

/** Huella estable de la publicación (para saber si cambió). */
function fingerprint(publication) {
  const text = [
    publication.title,
    publication.description,
    publication.category,
    publication.author,
    publication.coverImage,
    publication.content,
  ].join("\u0000");
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return `${text.length}:${(hash >>> 0).toString(16)}`;
}

function timeLabel(timestamp = Date.now()) {
  return new Date(timestamp).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dataUrlExtension(dataUrl) {
  const match = /^data:image\/([a-z0-9.+-]+)/i.exec(dataUrl);
  const type = (match?.[1] || "png").toLowerCase();
  if (type === "jpeg") return "jpg";
  if (type === "svg+xml") return "svg";
  return type.replace(/[^a-z0-9]/g, "") || "png";
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function toolbarHtml() {
  return TOOL_GROUPS.map(
    (group) => `
      <div class="editor__tools" role="group">
        ${group
          .map(
            (tool) => `
          <button type="button" class="editor__tool${
            tool.bold ? " editor__tool--bold" : ""
          }${tool.italic ? " editor__tool--italic" : ""}${
              tool.strike ? " editor__tool--strike" : ""
            }" data-action="${tool.action}" title="${tool.title}" aria-label="${tool.title}">
            ${tool.label}
          </button>`
          )
          .join("")}
      </div>`
  ).join('<span class="editor__tools-sep" aria-hidden="true"></span>');
}

export function createEditor(root, { onClose } = {}) {
  root.innerHTML = `
    <header class="editor__bar">
      <div class="editor__bar-left">
        <button class="editor__back" type="button" data-editor-back>
          ${BACK_ARROW}<span>Volver al Blog</span>
        </button>
        <div class="editor__states">
          <span class="editor__state" data-editor-saved>Publicación nueva</span>
          <span class="editor__state editor__state--share" data-editor-share-state></span>
        </div>
      </div>

      <div class="editor__bar-right">
        <div class="editor__modes" role="group" aria-label="Modo de visualización">
          ${MODES.map(
            (item) => `
            <button type="button" class="editor__mode" data-mode-btn="${item.mode}"
                    aria-pressed="${item.mode === "edit"}">${item.label}</button>`
          ).join("")}
        </div>
        <button class="editor__ghost" type="button" data-editor-new>Nueva</button>
        <button class="editor__ghost editor__download" type="button" data-editor-download>
          Descargar artículo (.md)
        </button>
        <button class="editor__share" type="button" data-editor-proposal data-editor-share>
          Enviar propuesta por correo
        </button>
      </div>
    </header>

    <p class="editor__notice" data-editor-notice role="status" aria-live="polite"></p>

    <div class="editor__toolbar" role="toolbar" aria-label="Herramientas de formato">
      ${toolbarHtml()}
    </div>

    <div class="editor__workspace" data-editor-workspace data-mode="edit">
      <div class="editor__pane editor__pane--write">
        <div class="editor__write-head">
          <input class="editor__title" type="text" data-field="title"
                 placeholder="Título de la publicación" aria-label="Título de la publicación"
                 autocomplete="off" spellcheck="false" />
          <p class="editor__slug">URL de la publicación:
            <code data-editor-slug>#/articulos/…</code>
          </p>

          <div class="editor__meta">
            <label class="editor__field editor__field--wide">
              <span>Descripción breve (se superpone en la tarjeta del feed)</span>
              <textarea data-field="description" rows="2"
                        placeholder="Dos o tres frases que planteen el problema y inviten a leer."></textarea>
            </label>

            <label class="editor__field">
              <span>Categoría</span>
              <input data-field="category" list="editor-categories" placeholder="Metafísica" />
            </label>

            <label class="editor__field">
              <span>Tipos de texto (separados por coma)</span>
              <input data-field="types" list="editor-types" placeholder="Ensayo, Artículo" />
            </label>

            <label class="editor__field">
              <span>Autor</span>
              <input data-field="author" placeholder="Nombre y apellido" />
            </label>

            <label class="editor__field editor__field--wide">
              <span>Portada · URL de imagen</span>
              <input data-field="coverImage" type="url"
                     placeholder="https://… o ./assets/mi-imagen.jpg" />
            </label>

            <div class="editor__field editor__field--wide editor__cover-row">
              <div class="editor__cover-thumb" data-cover-thumb hidden aria-hidden="true"></div>
              <div class="editor__cover-controls">
                <label class="editor__file">
                  <input type="file" accept="image/*" data-cover-file hidden />
                  <span>Elegir imagen local…</span>
                </label>
                <button class="editor__ghost" type="button" data-cover-clear>Quitar imagen</button>
              </div>
              <p class="editor__cover-hint" data-cover-hint>
                Si no hay imagen, la tarjeta usa una portada predeterminada.
              </p>
            </div>
          </div>

          <datalist id="editor-categories">
            ${CATEGORY_OPTIONS.map((c) => `<option value="${escapeHtml(c)}"></option>`).join("")}
          </datalist>

          <datalist id="editor-types">
            ${TEXT_TYPES.map((t) => `<option value="${escapeHtml(t)}"></option>`).join("")}
          </datalist>

          <details class="editor__outline">
            <summary>Estructura del artículo</summary>
            <div class="editor__outline-list" data-editor-outline></div>
          </details>
        </div>

        <textarea class="editor__input" data-field="content"
                  aria-label="Contenido completo en Markdown"
                  placeholder="# Escribí el artículo completo en Markdown&#10;&#10;Empezá con un encabezado y seguí con el texto…"
                  spellcheck="true"></textarea>
      </div>

      <div class="editor__pane editor__pane--preview">
        <div class="editor__preview-tabs" role="tablist" aria-label="Previsualización">
          ${PREVIEW_TABS.map(
            (item) => `
            <button type="button" role="tab" class="editor__preview-tab"
                    data-preview-tab="${item.tab}"
                    aria-selected="${item.tab === "card"}">${item.label}</button>`
          ).join("")}
        </div>
        <div class="editor__preview-body">
          <div class="editor__preview-panel" data-preview-panel="card">
            <div class="editor__card-stage" data-card-stage></div>
          </div>
          <div class="editor__preview-panel" data-preview-panel="article" hidden>
            <div class="editor__article-stage" data-article-stage></div>
          </div>
        </div>
      </div>
    </div>

    <dialog class="share" data-share-dialog aria-labelledby="proposal-heading">
      <div class="share__panel">
        <header class="share__head">
          <h2 class="share__title" id="proposal-heading">Enviar propuesta de artículo</h2>
          <button class="share__close" type="button" data-share-close aria-label="Cerrar">
            &#215;
          </button>
        </header>

        <p class="share__note">
          Enviar una propuesta no publica el artículo automáticamente. El equipo
          del Blog de Filosofía deberá revisar los archivos y decidir si
          incorpora el contenido al sitio. Recibirás una confirmación únicamente
          si el proyecto dispone de un mecanismo real para ello.
        </p>

        <p class="share__note share__note--lead">
          El artículo <strong>no se envía solo</strong>: tenés que adjuntar los
          archivos en tu cliente de correo y pulsar <strong>Enviar</strong>.
          Esta página es estática y no puede adjuntarlos por vos.
        </p>

        <ol class="proposal__steps">
          <li class="proposal__step" data-proposal-step="md">
            <div class="proposal__step-head">
              <span class="proposal__step-num" aria-hidden="true">1</span>
              <h3 class="proposal__step-title">Descargá el artículo en Markdown (.md)</h3>
              <span class="proposal__status" data-proposal-md-status>Pendiente</span>
            </div>
            <p class="proposal__step-text">
              Descarga el artículo en formato Markdown (.md). Tendrás que adjuntar
              este archivo al correo para que podamos revisar el contenido de tu
              propuesta.
            </p>
            <div class="share__actions">
              <button class="share__action" type="button" data-proposal-download-md>
                Descargar .md
              </button>
            </div>
          </li>

          <li class="proposal__step" data-proposal-step="remote-cover" hidden>
            <div class="proposal__step-head">
              <span class="proposal__step-num" aria-hidden="true">2</span>
              <h3 class="proposal__step-title">Descargá la imagen de portada (remota)</h3>
              <span class="proposal__status" data-proposal-cover-status>Pendiente</span>
            </div>
            <p class="proposal__step-text">
              La imagen de portada es remota. Descárgala también y adjúntala al
              correo junto con el archivo Markdown. Esto permite que el equipo
              reciba la imagen y pueda incorporarla al proyecto si la propuesta
              es aceptada.
            </p>
            <div class="share__actions">
              <button class="share__action" type="button" data-proposal-download-cover>
                Descargar imagen
              </button>
              <a class="share__action" data-proposal-open-cover hidden
                 target="_blank" rel="noopener">
                Abrir imagen original para guardarla
              </a>
            </div>
          </li>

          <li class="proposal__step proposal__step--info" data-proposal-local-cover hidden>
            <div class="proposal__step-head">
              <span class="proposal__step-num" aria-hidden="true">i</span>
              <h3 class="proposal__step-title">Imagen de portada local</h3>
            </div>
            <p class="proposal__step-text" data-proposal-local-text></p>
          </li>
        </ol>

        <fieldset class="proposal__confirm">
          <legend class="proposal__confirm-legend">Confirmá antes de continuar</legend>

          <p class="proposal__confirm-hint" data-proposal-confirm-hint>
            Primero descargá el archivo Markdown (y la imagen, si corresponde);
            recién entonces se habilitan las casillas.
          </p>

          <label class="proposal__check">
            <input type="checkbox" data-proposal-check-md />
            <span>He descargado el archivo Markdown y entiendo que debo
              adjuntarlo manualmente al correo.</span>
          </label>

          <label class="proposal__check" data-proposal-check-cover-row hidden>
            <input type="checkbox" data-proposal-check-cover />
            <span>He descargado la imagen de portada y entiendo que también debo
              adjuntarla al correo.</span>
          </label>
        </fieldset>

        <div class="share__actions proposal__actions">
          <button class="share__action share__action--primary" type="button"
                  data-proposal-continue disabled>
            Continuar al correo
          </button>
          <button class="share__action" type="button" data-share-close>Cancelar</button>
        </div>

        <p class="share__feedback" data-share-feedback role="status" aria-live="polite"></p>

        <details class="proposal__advanced">
          <summary>Otras exportaciones</summary>
          <div class="share__actions">
            <button class="share__action" type="button" data-share-json>
              Descargar .json (datos)
            </button>
            <button class="share__action" type="button" data-share-copy>
              Copiar Markdown
            </button>
          </div>
        </details>
      </div>
    </dialog>
  `;

  const fieldEls = {};
  root.querySelectorAll("[data-field]").forEach((el) => {
    fieldEls[el.dataset.field] = el;
  });

  const contentEl = fieldEls.content;
  const outlineList = root.querySelector("[data-editor-outline]");
  const workspace = root.querySelector("[data-editor-workspace]");
  const savedState = root.querySelector("[data-editor-saved]");
  const shareState = root.querySelector("[data-editor-share-state]");
  const notice = root.querySelector("[data-editor-notice]");
  const slugLabel = root.querySelector("[data-editor-slug]");
  const coverThumb = root.querySelector("[data-cover-thumb]");
  const coverHint = root.querySelector("[data-cover-hint]");
  const coverFile = root.querySelector("[data-cover-file]");
  const cardStage = root.querySelector("[data-card-stage]");
  const articleStage = root.querySelector("[data-article-stage]");
  const shareDialog = root.querySelector("[data-share-dialog]");
  const shareFeedback = root.querySelector("[data-share-feedback]");
  const proposalMdStatus = root.querySelector("[data-proposal-md-status]");
  const proposalCoverStep = root.querySelector('[data-proposal-step="remote-cover"]');
  const proposalCoverStatus = root.querySelector("[data-proposal-cover-status]");
  const proposalLocalStep = root.querySelector("[data-proposal-local-cover]");
  const proposalLocalText = root.querySelector("[data-proposal-local-text]");
  const proposalDownloadMd = root.querySelector("[data-proposal-download-md]");
  const proposalOpenCover = root.querySelector("[data-proposal-open-cover]");
  const proposalCheckMd = root.querySelector("[data-proposal-check-md]");
  const proposalCheckCover = root.querySelector("[data-proposal-check-cover]");
  const proposalCheckCoverRow = root.querySelector("[data-proposal-check-cover-row]");
  const proposalConfirmHint = root.querySelector("[data-proposal-confirm-hint]");
  const proposalContinue = root.querySelector("[data-proposal-continue]");
  const modeButtons = [...root.querySelectorAll("[data-mode-btn]")];
  const previewTabs = [...root.querySelectorAll("[data-preview-tab]")];
  const undoButton = root.querySelector('[data-action="undo"]');
  const redoButton = root.querySelector('[data-action="redo"]');

  const state = {
    id: "",
    title: "",
    description: "",
    category: "",
    types: [],
    author: SITE.defaultAuthor,
    coverImage: "",
    coverLocalName: "",
    content: "",
    createdAt: "",
    localCoverUrl: "",
    mode: "edit",
    previewTab: "card",
    sharedFingerprint: null,
  };

  /**
   * Estado del diálogo de propuesta. Se reinicia cada vez que se abre: las
   * casillas nunca se heredan de una apertura anterior y la descarga del
   * Markdown/portada debe hacerse «dentro del flujo».
   */
  const proposal = {
    mdRequested: false,
    coverRequested: false,
    coverRemote: false,
  };

  let isOpen = false;
  let initialized = false;
  let lastSavedFingerprint = null;
  let saveTimer = 0;
  let previewTimer = 0;
  let historyTimer = 0;
  let history = [];
  let historyIndex = 0;
  let cardPreview = null;
  let articlePreview = null;

  // --- Modelo ------------------------------------------------------------

  function publicationData({ forPreview = false } = {}) {
    return createPublication({
      id: state.id,
      title: state.title,
      description: state.description,
      category: state.category,
      types: state.types,
      author: state.author,
      coverImage: forPreview ? state.localCoverUrl || state.coverImage : state.coverImage,
      coverLocalName: state.coverLocalName,
      content: state.content,
      createdAt: state.createdAt,
    });
  }

  /** Publicación lista para compartir/exportar: resuelve la portada local. */
  function publicationForTransfer() {
    const publication = publicationData();
    if (publication.coverImage.startsWith("data:")) {
      publication.coverLocalName = `${publication.slug}.${dataUrlExtension(
        publication.coverImage
      )}`;
      publication.coverImage = `./assets/${publication.coverLocalName}`;
    } else if (!publication.coverImage && state.localCoverName) {
      publication.coverLocalName = state.localCoverName;
      publication.coverImage = `./assets/${state.localCoverName}`;
    }
    return publication;
  }

  /** Extensión de archivo a partir de un nombre o URL (sin query/hash). */
  function coverExtension(reference, fallback = "jpg") {
    const clean = String(reference).split(/[?#]/)[0];
    const match = /\.([a-z0-9]+)$/i.exec(clean);
    return match ? match[1].toLowerCase() : fallback;
  }

  /**
   * Portada a descargar para el correo. Devuelve null cuando no hay nada que
   * descargar: no hay imagen o ya es un archivo local del proyecto (assets/).
   */
  function coverDownloadInfo() {
    const publication = publicationForTransfer();
    const reference = state.localCoverUrl || state.coverImage;
    const alreadyLocal = /^\.\/assets\//.test(state.coverImage) && !state.localCoverUrl;
    if (!reference || alreadyLocal) return null;
    let filename = publication.coverLocalName;
    if (!filename && state.localCoverName) {
      filename = `${publication.slug}.${coverExtension(state.localCoverName)}`;
    }
    if (!filename) {
      const ext = reference.startsWith("data:")
        ? dataUrlExtension(reference)
        : coverExtension(reference);
      filename = `${publication.slug}.${ext}`;
    }
    return { reference, filename, remote: /^https?:/i.test(reference) };
  }

  // --- Formulario --------------------------------------------------------

  function readForm() {
    state.title = fieldEls.title.value;
    state.description = fieldEls.description.value;
    state.category = fieldEls.category.value;
    state.types = normalizeTypes(fieldEls.types.value);
    state.author = fieldEls.author.value;
    state.content = contentEl.value;
  }

  function writeForm() {
    fieldEls.title.value = state.title;
    fieldEls.description.value = state.description;
    fieldEls.category.value = state.category;
    fieldEls.types.value = state.types.join(", ");
    fieldEls.author.value = state.author;
    fieldEls.coverImage.value = state.coverImage.startsWith("data:")
      ? ""
      : state.coverImage;
    contentEl.value = state.content;
    renderCoverThumb();
  }

  function renderCoverThumb() {
    const src = state.localCoverUrl || state.coverImage;
    coverThumb.hidden = !src;
    coverThumb.style.backgroundImage = src ? `url("${src}")` : "";
  }

  function renderSlug() {
    slugLabel.textContent = `#/articulos/${slugify(state.title || "borrador")}`;
  }

  // --- Indicadores -------------------------------------------------------

  function setDocState(text) {
    savedState.textContent = text;
  }

  function updateShareState() {
    const publication = publicationData();
    if (isPublicationEmpty(publication)) {
      shareState.textContent = "";
      return;
    }
    const same = state.sharedFingerprint === fingerprint(publication);
    shareState.textContent = same
      ? "Sin cambios desde el último envío preparado"
      : "Cambios sin preparar para enviar";
    shareState.dataset.pending = String(!same);
  }

  function setNotice(text) {
    notice.textContent = text;
    notice.hidden = !text;
  }

  // --- Historial ---------------------------------------------------------

  function snapshot() {
    return {
      title: state.title,
      description: state.description,
      category: state.category,
      types: state.types,
      author: state.author,
      coverImage: state.coverImage,
      coverLocalName: state.coverLocalName,
      content: state.content,
    };
  }

  function updateHistoryButtons() {
    undoButton.disabled = historyIndex <= 0;
    redoButton.disabled = historyIndex >= history.length - 1;
  }

  function resetHistory() {
    history = [snapshot()];
    historyIndex = 0;
    updateHistoryButtons();
  }

  function pushHistory() {
    const current = history[historyIndex];
    const next = snapshot();
    if (current && JSON.stringify(current) === JSON.stringify(next)) return;
    history = history.slice(0, historyIndex + 1);
    history.push(next);
    if (history.length > 100) history.shift();
    historyIndex = history.length - 1;
    updateHistoryButtons();
  }

  function applySnapshot(entry) {
    state.title = entry.title;
    state.description = entry.description;
    state.category = entry.category;
    state.types = entry.types ?? [];
    state.author = entry.author;
    state.coverImage = entry.coverImage;
    state.coverLocalName = entry.coverLocalName;
    state.content = entry.content;
    writeForm();
    renderAllPreviews();
    updateShareState();
    schedulePersist();
    updateHistoryButtons();
  }

  function undo() {
    if (historyIndex <= 0) return;
    historyIndex -= 1;
    applySnapshot(history[historyIndex]);
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;
    historyIndex += 1;
    applySnapshot(history[historyIndex]);
  }

  // --- Previsualizaciones (componentes reales) ---------------------------

  function renderCardPreview() {
    const publication = publicationData({ forPreview: true });
    if (!cardPreview) {
      cardPreview = createCard(publication, { link: false });
      cardStage.append(cardPreview);
    } else {
      updateCard(cardPreview, publication);
    }
  }

  function renderArticlePreview() {
    const publication = publicationData({ forPreview: true });
    const scroll = articleStage.scrollTop;
    if (!articlePreview) {
      articlePreview = createArticleView(publication, { next: null });
      articleStage.append(articlePreview);
    } else {
      updateArticleView(articlePreview, publication);
    }
    articleStage.scrollTop = scroll;
  }

  function renderAllPreviews() {
    renderCardPreview();
    renderArticlePreview();
    renderOutline();
    renderSlug();
  }

  function renderOutline() {
    const headings = extractHeadings(state.content);
    if (!headings.length) {
      outlineList.innerHTML = `<p class="editor__outline-empty">Todavía no hay encabezados.</p>`;
      return;
    }
    outlineList.innerHTML = headings
      .map(
        (heading) => `
        <button type="button" class="editor__outline-item" data-level="${heading.level}"
                data-line="${heading.line}">${escapeHtml(heading.text || "(sin texto)")}</button>`
      )
      .join("");
  }

  // --- Guardado local ----------------------------------------------------

  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderAllPreviews, 140);
  }

  function schedulePersist() {
    clearTimeout(saveTimer);
    setDocState("Guardando…");
    saveTimer = setTimeout(persistNow, 450);
  }

  function persistNow() {
    clearTimeout(saveTimer);
    if (!storageAvailable()) {
      setDocState("No se puede guardar en este navegador");
      return;
    }
    const publication = publicationData();
    const ok = saveDraft(publication, state.sharedFingerprint);
    if (ok) {
      lastSavedFingerprint = fingerprint(publication);
      setDocState(`Borrador guardado en este navegador · ${timeLabel()}`);
    } else {
      setDocState("No se pudo guardar el borrador");
    }
  }

  function scheduleHistory() {
    clearTimeout(historyTimer);
    historyTimer = setTimeout(pushHistory, 450);
  }

  function onInput() {
    readForm();
    schedulePreview();
    schedulePersist();
    scheduleHistory();
    updateShareState();
    setNotice("");
  }

  function focusAndNotify() {
    contentEl.focus();
    onInput();
  }

  // --- Barra de herramientas --------------------------------------------

  function surround(before, after, placeholder = "") {
    const start = contentEl.selectionStart;
    const end = contentEl.selectionEnd;
    const inner = end > start ? contentEl.value.slice(start, end) : placeholder;
    contentEl.setRangeText(`${before}${inner}${after}`, start, end, "end");
    const innerStart = start + before.length;
    contentEl.setSelectionRange(innerStart, innerStart + inner.length);
    focusAndNotify();
  }

  function prefixLines(prefix, { ordered = false } = {}) {
    const value = contentEl.value;
    const start = contentEl.selectionStart;
    const end = contentEl.selectionEnd;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    let lineEnd = value.indexOf("\n", end);
    if (lineEnd === -1) lineEnd = value.length;

    const lines = value.slice(lineStart, lineEnd).split("\n");
    const stripped = lines.map((line) => line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, ""));
    const out = stripped
      .map((line, index) => (ordered ? `${index + 1}. ${line}` : `${prefix}${line}`))
      .join("\n");

    contentEl.setRangeText(out, lineStart, lineEnd, "end");
    contentEl.setSelectionRange(lineStart, lineStart + out.length);
    focusAndNotify();
  }

  function insertBlock(text, { selectFrom = 0, selectLength = 0 } = {}) {
    const value = contentEl.value;
    const start = contentEl.selectionStart;
    const end = contentEl.selectionEnd;
    const lead = start > 0 && value[start - 1] !== "\n" ? "\n\n" : "";
    const tail = end < value.length && value[end] !== "\n" ? "\n\n" : "";
    contentEl.setRangeText(`${lead}${text}${tail}`, start, end, "end");

    const base = start + lead.length + selectFrom;
    if (selectLength > 0) contentEl.setSelectionRange(base, base + selectLength);
    else {
      const caret = start + lead.length + text.length;
      contentEl.setSelectionRange(caret, caret);
    }
    focusAndNotify();
  }

  function insertLink() {
    const start = contentEl.selectionStart;
    const end = contentEl.selectionEnd;
    const label = end > start ? contentEl.value.slice(start, end) : "texto del enlace";
    const url = "https://";
    contentEl.setRangeText(`[${label}](${url})`, start, end, "end");
    const urlStart = start + label.length + 3;
    contentEl.setSelectionRange(urlStart, urlStart + url.length);
    focusAndNotify();
  }

  function insertImage() {
    const start = contentEl.selectionStart;
    const end = contentEl.selectionEnd;
    const alt = end > start ? contentEl.value.slice(start, end) : "descripción de la imagen";
    const url = "https://";
    contentEl.setRangeText(`![${alt}](${url})`, start, end, "end");
    const urlStart = start + alt.length + 4;
    contentEl.setSelectionRange(urlStart, urlStart + url.length);
    focusAndNotify();
  }

  function insertCodeBlock() {
    const start = contentEl.selectionStart;
    const end = contentEl.selectionEnd;
    const body = end > start ? contentEl.value.slice(start, end) : "código";
    const block = `${FENCE}texto\n${body}\n${FENCE}`;
    const bodyOffset = FENCE.length + "texto\n".length;
    insertBlock(block, { selectFrom: bodyOffset, selectLength: body.length });
  }

  function insertTable() {
    const table = ["| Columna | Columna |", "| --- | --- |", "| Celda | Celda |"].join("\n");
    insertBlock(table, { selectFrom: 2, selectLength: "Columna".length });
  }

  function runAction(name) {
    switch (name) {
      case "h1": prefixLines("# "); break;
      case "h2": prefixLines("## "); break;
      case "h3": prefixLines("### "); break;
      case "bold": surround("**", "**", "texto en negrita"); break;
      case "italic": surround("*", "*", "texto en cursiva"); break;
      case "strike": surround("~~", "~~", "texto tachado"); break;
      case "quote": prefixLines("> "); break;
      case "ul": prefixLines("- "); break;
      case "ol": prefixLines("", { ordered: true }); break;
      case "task": prefixLines("- [ ] "); break;
      case "link": insertLink(); break;
      case "image": insertImage(); break;
      case "code": surround("`", "`", "código"); break;
      case "codeblock": insertCodeBlock(); break;
      case "table": insertTable(); break;
      case "hr": insertBlock("---"); break;
      case "undo": undo(); break;
      case "redo": redo(); break;
      default: break;
    }
  }

  // --- Modos y pestañas --------------------------------------------------

  function setMode(mode) {
    state.mode = mode;
    workspace.dataset.mode = mode;
    modeButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.modeBtn === mode));
    });
    if (mode !== "edit") renderAllPreviews();
  }

  function setPreviewTab(tab) {
    state.previewTab = tab;
    previewTabs.forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.previewTab === tab));
    });
    root.querySelectorAll("[data-preview-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.previewPanel !== tab;
    });
    renderAllPreviews();
  }

  // --- Portada -----------------------------------------------------------

  async function handleCoverFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice("El archivo elegido no es una imagen.");
      return;
    }
    const kb = Math.round(file.size / 1024);
    if (file.size <= SITE.localImageMaxBytes) {
      const dataUrl = await readAsDataURL(file);
      state.coverImage = dataUrl;
      state.localCoverUrl = "";
      state.localCoverName = "";
      coverHint.textContent = `Imagen local «${file.name}» (${kb} KB) guardada en el borrador. Al exportar, el .md la referencia como ./assets/<slug>.<ext>: guardá el archivo en la carpeta assets/ del proyecto con ese nombre exacto.`;
    } else {
      state.localCoverUrl = URL.createObjectURL(file);
      state.localCoverName = file.name;
      coverHint.textContent = `«${file.name}» (${kb} KB) es demasiado grande para el borrador: se usa solo para la vista previa. Copiá el archivo a assets/ con el nombre <slug>.<ext> y escribí ./assets/<slug>.<ext> en el campo de portada.`;
    }
    renderCoverThumb();
    schedulePreview();
    schedulePersist();
    scheduleHistory();
    setNotice("");
  }

  function clearCover() {
    state.coverImage = "";
    state.localCoverUrl = "";
    state.localCoverName = "";
    fieldEls.coverImage.value = "";
    coverHint.textContent = "Si no hay imagen, la tarjeta usa una portada predeterminada.";
    renderCoverThumb();
    schedulePreview();
    schedulePersist();
    scheduleHistory();
  }

  // --- Descargar artículo / enviar propuesta ----------------------------

  function markShared() {
    state.sharedFingerprint = fingerprint(publicationData());
    persistNow();
    updateShareState();
  }

  /** Descarga el `.md` actual. No depende del correo ni toca el editor. */
  function downloadPublicationMarkdown() {
    const file = buildPublicationMarkdownFile(publicationForTransfer());
    try {
      downloadText(file.filename, file.content, "text/markdown;charset=utf-8");
    } catch (error) {
      setNotice(
        `No se pudo iniciar la descarga de ${file.filename}. Probá de nuevo.`
      );
      return null;
    }
    markShared();
    setNotice(
      `Se solicitó la descarga de ${file.filename}. Adjuntalo al correo si querés presentar la propuesta.`
    );
    return file;
  }

  function setProposalStatus(el, label, stateName) {
    el.textContent = label;
    el.dataset.state = stateName;
  }

  /** Habilita «Continuar al correo» solo si se cumplen todos los requisitos. */
  function updateProposalContinue() {
    const mdReady = proposal.mdRequested && proposalCheckMd.checked;
    const coverReady =
      !proposal.coverRemote || (proposal.coverRequested && proposalCheckCover.checked);
    proposalContinue.disabled = !(mdReady && coverReady);
    // El aviso deja de mostrarse cuando ya se iniciaron las descargas aplicables.
    const pendingDownloads =
      !proposal.mdRequested || (proposal.coverRemote && !proposal.coverRequested);
    proposalConfirmHint.hidden = !pendingDownloads;
  }

  /** Descarga la portada remota; si el navegador la bloquea, ofrece abrirla. */
  async function downloadProposalCover() {
    const info = coverDownloadInfo();
    if (!info) {
      setProposalStatus(proposalCoverStatus, "Sin imagen", "pending");
      return;
    }
    proposal.coverRequested = true;
    proposalCheckCover.disabled = false;
    updateProposalContinue();
    try {
      const response = await fetch(info.reference);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (!blob.size) throw new Error("archivo vacío");
      downloadBlob(info.filename, blob);
      setProposalStatus(proposalCoverStatus, "Descarga solicitada", "done");
      shareFeedback.textContent = `Se solicitó la descarga de la imagen como ${info.filename}. Adjuntala al correo junto con el .md.`;
    } catch (error) {
      // El navegador puede bloquear la descarga por CORS, cabeceras o red: no
      // se simula una descarga que no ocurrió. Se ofrece abrir la imagen.
      proposalOpenCover.hidden = false;
      proposalOpenCover.href = info.reference;
      setProposalStatus(proposalCoverStatus, "Requiere guardado manual", "manual");
      shareFeedback.textContent = `El navegador no pudo descargar la imagen automáticamente. Usá «Abrir imagen original para guardarla», guardala como ${info.filename} y adjuntala al correo junto con el .md.`;
    }
  }

  function openProposal() {
    const title = state.title.trim();
    const content = state.content.trim();
    if (!title || !content) {
      setNotice(
        !title
          ? "Agregá un título antes de preparar la propuesta."
          : "Escribí el contenido del artículo antes de preparar la propuesta."
      );
      (!title ? fieldEls.title : contentEl).focus();
      return;
    }

    const publication = publicationForTransfer();
    const info = coverDownloadInfo();
    const remote = !!(info && info.remote);

    // Cada apertura reinicia el flujo: nada se hereda de la vez anterior.
    proposal.mdRequested = false;
    proposal.coverRequested = false;
    proposal.coverRemote = remote;

    proposalCheckMd.checked = false;
    proposalCheckMd.disabled = true;
    proposalCheckCover.checked = false;
    proposalCheckCover.disabled = true;
    proposalCheckCoverRow.hidden = !remote;
    proposalCoverStep.hidden = !remote;
    proposalLocalStep.hidden = true;
    proposalOpenCover.hidden = true;
    proposalOpenCover.removeAttribute("href");
    setProposalStatus(proposalMdStatus, "Pendiente", "pending");
    setProposalStatus(proposalCoverStatus, "Pendiente", "pending");
    shareFeedback.textContent = "";

    // Imagen local del usuario (data-URL o archivo elegido): no es un
    // requisito descargable, solo un aviso; el equipo la incorpora a mano.
    if (info && !remote) {
      const name = publication.coverLocalName || state.localCoverName || "tu archivo";
      proposalLocalText.textContent = `La portada es una imagen local («${name}»). El .md conserva su ruta, pero no incluye el archivo: adjuntá también la imagen original al correo para que el equipo pueda incorporarla.`;
      proposalLocalStep.hidden = false;
    }

    updateProposalContinue();
    shareDialog.showModal();
    requestAnimationFrame(() => shareDialog.classList.add("is-open"));
    requestAnimationFrame(() => proposalDownloadMd.focus());
  }

  function closeProposal() {
    shareDialog.classList.remove("is-open");
    setTimeout(() => {
      if (shareDialog.open) shareDialog.close();
    }, 180);
  }

  function continueToEmail() {
    if (proposalContinue.disabled) return;
    const mail = buildProposalMailto();
    markShared();
    closeProposal();
    // Abre el cliente externo con el mensaje breve. Los adjuntos se agregan a
    // mano: `mailto:` no permite adjuntar archivos.
    window.location.href = mail.href;
    setNotice(
      "Se abrió tu cliente de correo. Adjuntá el .md (y la imagen, si corresponde), revisá el mensaje y pulsá Enviar."
    );
  }

  function handleProposalAction(event) {
    if (event.target.closest("[data-proposal-download-md]")) {
      const file = downloadPublicationMarkdown();
      if (file) {
        proposal.mdRequested = true;
        proposalCheckMd.disabled = false;
        setProposalStatus(proposalMdStatus, "Descarga solicitada", "done");
        shareFeedback.textContent = `Se solicitó la descarga de ${file.filename}. Adjuntalo manualmente al correo.`;
      }
      updateProposalContinue();
      return;
    }

    if (event.target.closest("[data-proposal-download-cover]")) {
      downloadProposalCover();
      return;
    }

    if (event.target.closest("[data-proposal-open-cover]")) {
      // La apertura en otra pestaña la maneja el navegador; marcamos el paso.
      proposal.coverRequested = true;
      proposalCheckCover.disabled = false;
      setProposalStatus(proposalCoverStatus, "Guardado manual pendiente", "manual");
      updateProposalContinue();
      return;
    }

    if (event.target.closest("[data-proposal-continue]")) {
      continueToEmail();
      return;
    }

    if (event.target.closest("[data-share-json]")) {
      const file = buildPublicationJsonFile(publicationForTransfer());
      downloadText(file.filename, file.content, "application/json;charset=utf-8");
      markShared();
      shareFeedback.textContent = `Archivo ${file.filename} descargado. Sus datos se pueden pegar en js/data/articles.js.`;
      return;
    }

    if (event.target.closest("[data-share-copy]")) {
      const file = buildPublicationMarkdownFile(publicationForTransfer());
      copyText(file.content).then((ok) => {
        shareFeedback.textContent = ok
          ? "Markdown copiado al portapapeles. No es un adjunto: guardalo como archivo o pegalo en tu cliente de correo."
          : "No se pudo copiar automáticamente. Seleccioná el texto del editor y copialo a mano.";
      });
      return;
    }

    if (event.target.closest("[data-share-close]")) {
      closeProposal();
    }
  }

  // --- Publicación nueva -------------------------------------------------

  function newPublication() {
    if (
      !isPublicationEmpty(publicationData()) &&
      !window.confirm(
        "¿Descartar el borrador actual y empezar una publicación nueva? El borrador guardado en este navegador se eliminará."
      )
    ) {
      return;
    }
    clearDraft();
    state.id = "";
    state.title = "";
    state.description = "";
    state.category = "";
    state.types = [];
    state.author = SITE.defaultAuthor;
    state.coverImage = "";
    state.coverLocalName = "";
    state.content = "";
    state.createdAt = "";
    state.localCoverUrl = "";
    state.sharedFingerprint = null;
    lastSavedFingerprint = null;
    writeForm();
    coverHint.textContent = "Si no hay imagen, la tarjeta usa una portada predeterminada.";
    resetHistory();
    renderAllPreviews();
    updateShareState();
    setDocState("Publicación nueva");
    setMode("edit");
    fieldEls.title.focus();
  }

  // --- Abrir / cerrar ----------------------------------------------------

  function restoreDraft() {
    const draft = loadDraft();
    if (draft) {
      const publication = draft.publication;
      state.id = publication.id;
      state.title = publication.title;
      state.description = publication.description;
      state.category = publication.category;
      state.types = publication.types ?? [];
      state.author = publication.author || SITE.defaultAuthor;
      state.coverImage = publication.coverImage;
      state.coverLocalName = publication.coverLocalName;
      state.content = publication.content;
      state.createdAt = publication.createdAt;
      state.sharedFingerprint = draft.sharedFingerprint;
      lastSavedFingerprint = fingerprint(publicationData());
      setDocState(`Borrador restaurado · ${timeLabel(draft.updatedAt || Date.now())}`);
      if (state.coverLocalName && !state.coverImage) {
        coverHint.textContent = `La imagen local «${state.coverLocalName}» no se conserva al recargar. Volvé a elegirla para la vista previa, copiá el archivo a assets/ con el nombre <slug>.<ext> y escribí ./assets/<slug>.<ext> en el campo de portada.`;
      }
    } else {
      setDocState(storageAvailable() ? "Publicación nueva" : "Sin guardado local disponible");
    }
    writeForm();
    resetHistory();
  }

  function hasUnsavedChanges() {
    if (isPublicationEmpty(publicationData())) return false;
    if (!storageAvailable()) return true;
    return fingerprint(publicationData()) !== lastSavedFingerprint;
  }

  function onBeforeUnload(event) {
    if (!hasUnsavedChanges()) return;
    event.preventDefault();
    event.returnValue = "";
  }

  function open() {
    if (!initialized) {
      restoreDraft();
      initialized = true;
    }
    isOpen = true;
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add("is-open"));
    renderAllPreviews();
    renderCoverThumb();
    updateShareState();
    updateHistoryButtons();
    window.addEventListener("beforeunload", onBeforeUnload);
    if (state.title || state.content) contentEl.focus();
    else fieldEls.title.focus();
  }

  function close() {
    if (!isOpen) return;
    persistNow();
    window.removeEventListener("beforeunload", onBeforeUnload);
    isOpen = false;
    root.classList.remove("is-open");
    setTimeout(() => {
      if (!isOpen) root.hidden = true;
    }, 320);
  }

  /**
   * Descarta el estado en memoria del editor (se usa tras «Borrar todos los
   * datos» para no dejar un borrador antiguo vivo). El próximo `open()`
   * vuelve a cargar desde el almacenamiento, que ya estará vacío.
   */
  function reset() {
    state.id = "";
    state.title = "";
    state.description = "";
    state.category = "";
    state.types = [];
    state.author = SITE.defaultAuthor;
    state.coverImage = "";
    state.coverLocalName = "";
    state.content = "";
    state.createdAt = "";
    state.localCoverUrl = "";
    state.localCoverName = "";
    state.sharedFingerprint = null;
    lastSavedFingerprint = null;
    initialized = false;
    if (isOpen) {
      writeForm();
      resetHistory();
      renderAllPreviews();
      updateShareState();
      setDocState("Publicación nueva");
    }
  }

  // --- Eventos -----------------------------------------------------------

  ["title", "description", "category", "types", "author", "content"].forEach((name) => {
    fieldEls[name].addEventListener("input", onInput);
  });

  // La URL de portada se gestiona aparte: escribir una URL descarta la local.
  fieldEls.coverImage.addEventListener("input", () => {
    state.coverImage = fieldEls.coverImage.value;
    state.localCoverUrl = "";
    state.localCoverName = "";
    coverHint.textContent = state.coverImage
      ? "Se usará esta URL como portada. Para un archivo local del proyecto, la ruta correcta es ./assets/<archivo>."
      : "Si no hay imagen, la tarjeta usa una portada predeterminada.";
    renderCoverThumb();
    schedulePreview();
    schedulePersist();
    scheduleHistory();
    updateShareState();
  });

  coverFile.addEventListener("change", () => {
    handleCoverFile(coverFile.files?.[0]);
    coverFile.value = "";
  });

  root.addEventListener("click", (event) => {
    const tool = event.target.closest("[data-action]");
    if (tool) {
      event.preventDefault();
      runAction(tool.dataset.action);
      return;
    }
    if (event.target.closest("[data-mode-btn]")) {
      setMode(event.target.closest("[data-mode-btn]").dataset.modeBtn);
      return;
    }
    if (event.target.closest("[data-preview-tab]")) {
      setPreviewTab(event.target.closest("[data-preview-tab]").dataset.previewTab);
      return;
    }
    if (event.target.closest("[data-cover-clear]")) {
      clearCover();
      return;
    }
    if (event.target.closest("[data-editor-download]")) {
      downloadPublicationMarkdown();
      return;
    }
    if (event.target.closest("[data-editor-proposal]")) {
      openProposal();
      return;
    }
    if (event.target.closest("[data-editor-new]")) {
      newPublication();
      return;
    }
    if (event.target.closest("[data-editor-back]")) {
      event.preventDefault();
      onClose?.();
      return;
    }
    if (event.target.closest(".editor__outline-item")) {
      const button = event.target.closest(".editor__outline-item");
      const line = Number(button.dataset.line);
      const lines = contentEl.value.split("\n");
      let position = 0;
      for (let i = 0; i < line; i++) position += (lines[i]?.length ?? 0) + 1;
      if (state.mode === "preview") setMode("split");
      contentEl.focus();
      contentEl.setSelectionRange(position, position + (lines[line]?.length ?? 0));
    }
  });

  root.addEventListener("keydown", (event) => {
    const mod = event.ctrlKey || event.metaKey;
    if (!mod) return;
    const key = event.key.toLowerCase();
    if (key === "b") {
      event.preventDefault();
      runAction("bold");
    } else if (key === "i") {
      event.preventDefault();
      runAction("italic");
    } else if (key === "k") {
      event.preventDefault();
      runAction("link");
    } else if (key === "z" && !event.shiftKey) {
      event.preventDefault();
      undo();
    } else if ((key === "z" && event.shiftKey) || key === "y") {
      event.preventDefault();
      redo();
    }
  });

  shareDialog.addEventListener("click", (event) => {
    if (event.target === shareDialog) closeProposal();
  });
  shareDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeProposal();
  });
  shareDialog.addEventListener("click", handleProposalAction);

  // Las casillas son la confirmación explícita del usuario: solo habilitan el
  // paso al correo cuando además se realizaron las descargas requeridas.
  proposalCheckMd.addEventListener("change", updateProposalContinue);
  proposalCheckCover.addEventListener("change", updateProposalContinue);

  return {
    open,
    close,
    reset,
    element: root,
    get isOpen() {
      return isOpen;
    },
  };
}
