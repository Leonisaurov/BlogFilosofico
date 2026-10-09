/**
 * article-view.js — Plantilla de lectura de una publicación.
 *
 * Es la MISMA plantilla que usa la página individual del artículo y la
 * previsualización «Artículo completo» del editor. Recibe una publicación
 * (modelo común) y renderiza título, categoría, metadatos, portada y el
 * cuerpo Markdown ya sanitizado.
 */

import { articleHref } from "../data/articles.js";
import { coverDataUri } from "../lib/cover.js";
import { escapeHtml } from "../lib/dom.js";
import { renderMarkdown } from "../lib/markdown.js";
import { estimateReadingTime } from "../lib/publication.js";

export function formatDate(iso) {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

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

function creditHtml(article) {
  return article.cover?.credit
    ? `<figcaption class="reader__credit">${escapeHtml(article.cover.credit)}</figcaption>`
    : "";
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

  view.querySelector("[data-body]").innerHTML = renderMarkdown(article.content || "");

  const cover = view.querySelector("[data-cover]");
  const signature = article.coverImage || "";
  if (cover.dataset.coverImage !== signature) {
    cover.dataset.coverImage = signature;
    cover.innerHTML = `${coverHtml(article)}${creditHtml(article)}`;
    applyCoverFallback(view, article);
  }
}
