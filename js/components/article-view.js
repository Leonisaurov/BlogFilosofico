/**
 * article-view.js — Plantilla de lectura de una publicación.
 *
 * Es la MISMA plantilla que usa la página individual del artículo y la
 * previsualización «Artículo completo» del editor. Recibe una publicación
 * (modelo común) y renderiza título, categoría, metadatos, portada y el
 * cuerpo Markdown ya sanitizado.
 */

import { articleHref } from "../data/articles.js";
import { SITE } from "../data/config.js";
import { coverCreditHtml, coverDataUri } from "../lib/cover.js";
import { canEmbed, parseDocumentUrl } from "../lib/document-embed.js";
import { escapeHtml } from "../lib/dom.js";
import { formatDate } from "../lib/format.js";
import { withLoading } from "../lib/loading.js";
import { estimateReadingTime } from "../lib/publication.js";

let markdownPromise = null;
const bodyTokens = new WeakMap();

/** marked + DOMPurify se cargan solo cuando se pinta un cuerpo Markdown. */
function loadRenderMarkdown() {
  if (!markdownPromise) {
    markdownPromise = withLoading(
      () => import("../lib/markdown.js").then((module) => module.renderMarkdown),
      "Preparando el texto…"
    );
    // Un fallo transitorio de red/caché no debe dejar la promesa rechazada
    // para toda la sesión: se limpia para que la próxima vista reintente.
    // withLoading oculta el indicador en su propio finally.
    markdownPromise.catch(() => {
      markdownPromise = null;
    });
  }
  return markdownPromise;
}

/**
 * Pinta el cuerpo en cuanto el módulo de Markdown esté listo. Si el mismo view
 * se actualiza antes (el usuario escribe), gana la versión más reciente.
 */
function scheduleBody(view, article) {
  const token = (bodyTokens.get(view) || 0) + 1;
  bodyTokens.set(view, token);
  loadRenderMarkdown()
    .then((renderMarkdown) => {
      if (bodyTokens.get(view) !== token) return;
      const body = view.querySelector("[data-body]");
      if (body) body.innerHTML = renderMarkdown(article.content || "");
    })
    .catch(() => {
      // Si falla la carga del módulo, al menos se ve el texto sin sanitizar
      // como texto (nunca como HTML).
      if (bodyTokens.get(view) !== token) return;
      const body = view.querySelector("[data-body]");
      if (body) body.textContent = article.content || "";
    });
}

export { formatDate };

function metaText(article) {
  const parts = [];
  if (article.createdAt) parts.push(formatDate(article.createdAt));
  if (article.author) parts.push(article.author);
  const minutes = article.readingTime || estimateReadingTime(article.content);
  if (minutes) parts.push(`${minutes} min de lectura`);
  return parts.join(" · ");
}

function coverHtml(article) {
  if (article.coverImage) {
    return `<img src="${escapeHtml(article.coverImage)}" alt="${escapeHtml(
      article.cover?.alt || article.title || ""
    )}" decoding="async" referrerpolicy="no-referrer" />`;
  }
  return `<div class="reader__cover-fallback"></div>`;
}

/**
 * Documento de un «Texto oficial». El iframe SOLO se crea si el host figura en
 * `SITE.documentEmbedHosts` (único gate; hoy solo drive.google.com). Si el
 * host no coincide se muestra el aviso y un enlace directo: nunca un iframe
 * fingido.
 */
function documentHtml(article) {
  if (article.kind !== "oficial") return "";
  let url = null;
  if (article.documentUrl) {
    try {
      url = parseDocumentUrl(article.documentUrl);
    } catch {
      url = null;
    }
  }
  if (url && canEmbed(url.hostname, SITE.documentEmbedHosts)) {
    return `<div class="reader__document">
      <iframe class="reader__document-frame" src="${escapeHtml(url.href)}"
        title="Documento oficial: ${escapeHtml(article.title || "lectura")}"
        loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin"></iframe>
    </div>`;
  }
  const link = url
    ? `<a class="reader__document-link" href="${escapeHtml(url.href)}"
        target="_blank" rel="noopener noreferrer">Abrir documento en el visor externo</a>`
    : "";
  return `<aside class="reader__document reader__document--pending" role="note">
      <p class="reader__document-note">Documento pendiente de elegir servicio</p>${link}
    </aside>`;
}

function footerHtml(next) {
  return `<footer class="reader__footer">
    <a class="reader__next" href="${articleHref(next)}">
      <span>Siguiente lectura</span>
      <span>${escapeHtml(next.title)}</span>
    </a>
  </footer>`;
}

/** Aplica la portada SVG de respaldo y el manejo de error de la imagen. */
function applyCoverFallback(view, article) {
  const fallback = coverDataUri(article, { width: 1600, height: 900 });
  const layer = view.querySelector(".reader__cover-fallback");
  if (layer) layer.style.backgroundImage = `url("${fallback}")`;

  const img = view.querySelector(".reader__cover img");
  if (img) {
    img.addEventListener(
      "error",
      () => {
        const replacement = document.createElement("div");
        replacement.className = "reader__cover-fallback";
        replacement.style.backgroundImage = `url("${fallback}")`;
        img.replaceWith(replacement);
      },
      { once: true }
    );
  }
}

/**
 * Crea el elemento de lectura de una publicación.
 * @param {object} article Publicación del modelo común.
 * @param {{next?:object|null}} options
 * @returns {HTMLElement}
 */
export function createArticleView(article, { next = null } = {}) {
  const view = document.createElement("article");
  view.className = "reader__article";
  view.dataset.slug = article.slug ?? "";
  view.innerHTML = `
    <p class="eyebrow reader__category" data-category></p>
    <h1 class="reader__title" data-title></h1>
    <p class="reader__meta" data-meta></p>
    <figure class="reader__cover" data-cover></figure>
    <p class="reader__lede" data-lede></p>
    <div class="reader__body markdown" data-body></div>
    <div class="reader__document-slot" data-document></div>
    ${next ? footerHtml(next) : ""}
  `;
  updateArticleView(view, article);
  return view;
}

/** Actualiza en el lugar los datos de una vista ya creada. */
export function updateArticleView(view, article) {
  const category = view.querySelector("[data-category]");
  category.textContent = article.category || "";
  category.hidden = !article.category;

  view.querySelector("[data-title]").textContent =
    article.title || "Título del artículo";
  view.querySelector("[data-meta]").textContent = metaText(article);

  const lede = view.querySelector("[data-lede]");
  lede.textContent = article.description || "";
  lede.hidden = !article.description;

  scheduleBody(view, article);

  const documentSlot = view.querySelector("[data-document]");
  if (documentSlot) documentSlot.innerHTML = documentHtml(article);

  const cover = view.querySelector("[data-cover]");
  // La cita y el documento también cambian la portada visible: entran en la
  // firma para que la previsualización se refresque sin recrear la vista.
  const signature = [
    article.coverImage || "",
    article.cover?.credit || "",
    article.documentUrl || "",
  ].join("\u0000");
  if (cover.dataset.coverImage !== signature) {
    cover.dataset.coverImage = signature;
    cover.innerHTML = `${coverHtml(article)}${coverCreditHtml(article)}`;
    applyCoverFallback(view, article);
  }
}
