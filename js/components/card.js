/**
 * card.js — Tarjeta del feed (cápsula de publicación).
 *
 * Es el MISMO componente que usa la portada, la lectura y la previsualización
 * «Tarjeta del feed» del editor. Recibe una publicación del modelo común y
 * compone portada (imagen + respaldo SVG), degradado, categoría, título y
 * descripción.
 *
 * Con `link: true` (por defecto) es un enlace a la página individual; con
 * `link: false` es una tarjeta estática para previsualizar.
 */

import { articleHref } from "../data/articles.js";
import { coverCreditHtml, coverDataUri } from "../lib/cover.js";
import { escapeHtml } from "../lib/dom.js";

const ARROW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M4 12h15M13 6l6 6-6 6"/></svg>`;

const twoDigits = (n) => String(n).padStart(2, "0");

/** Firma de portada: imagen + cita, para refrescar la preview al cambiar cualquiera. */
const coverSignature = (article) =>
  [article?.coverImage ?? "", article?.cover?.credit ?? ""].join("\u0000");

function imageHtml(coverImage, eager) {
  if (!coverImage) return "";
  // La proporción 16/10 es la que declara .post--grid .post__media en
  // card.css; CSS impone el tamaño final, pero estos atributos reservan el hueco.
  return `<img class="post__img" src="${escapeHtml(coverImage)}" alt=""
    width="1600" height="1000"
    loading="${eager ? "eager" : "lazy"}"
    fetchpriority="${eager ? "high" : "low"}"
    decoding="async" referrerpolicy="no-referrer" />`;
}

/** La imagen remota entra con fundido; si falla, queda la portada SVG. */
function attachCoverHandlers(card) {
  const img = card.querySelector(".post__img");
  if (!img) return;
  if (img.complete && img.naturalWidth > 0) {
    img.classList.add("is-loaded");
  } else {
    img.addEventListener("load", () => img.classList.add("is-loaded"), { once: true });
  }
  img.addEventListener("error", () => img.remove(), { once: true });
}

function setFallback(card, article) {
  const fallback = coverDataUri(article, { width: 900, height: 1200 });
  const layer = card.querySelector(".post__cover");
  if (layer) layer.style.backgroundImage = `url("${fallback}")`;
}

/**
 * @param {object} article Publicación del modelo común.
 * @param {{index?:number|null, total?:number|null, eager?:boolean, link?:boolean,
 *          variant?: "grid"|"feature"|null}} options
 *   variant: "grid" → tarjeta compacta para cuadrículas editoriales (página
 *   de sección). Mismo marcado y misma portada; solo cambia la disposición.
 *   variant: "feature" → pieza de apertura de la portada. También reutiliza
 *   el mismo marcado, el degradado y la portada de respaldo.
 */
export function createCard(
  article,
  { index = null, total = null, eager = false, link = true, variant = null } = {}
) {
  const card = document.createElement(link ? "a" : "div");
  card.className = "post";
  if (variant === "grid") card.classList.add("post--grid");
  if (variant === "feature") card.classList.add("post--feature");
  card.dataset.id = article.id ?? "";
  card.dataset.active = link ? "false" : "true";
  card.dataset.coverImage = coverSignature(article);

  if (link) {
    card.href = articleHref(article);
    card.setAttribute(
      "aria-label",
      `${article.title} — ${article.category || "Filosofía"}. Abrir publicación.`
    );
  } else {
    card.dataset.static = "true";
  }

  card.innerHTML = `
    <div class="post__media" aria-hidden="true">
      <div class="post__cover"></div>
      ${imageHtml(article.coverImage, eager)}
      ${coverCreditHtml(article, "post__credit")}
    </div>
    <div class="post__scrim" aria-hidden="true"></div>
    <div class="post__body">
      <div class="post__head">
        <span class="post__category">${escapeHtml(article.category || "Artículo")}</span>
        ${
          index != null && total != null
            ? `<span class="post__index">${twoDigits(index + 1)}<i>/</i>${twoDigits(total)}</span>`
            : ""
        }
      </div>
      <div class="post__foot">
        <h2 class="post__title">${escapeHtml(article.title || "Título de la publicación")}</h2>
        <p class="post__excerpt">${escapeHtml(article.description || "")}</p>
        <span class="post__cta">Leer ${ARROW}</span>
      </div>
    </div>
  `;

  setFallback(card, article);
  attachCoverHandlers(card);
  return card;
}

/**
 * Actualiza una tarjeta existente en el lugar (para la previsualización en
 * vivo): cambia textos y portada sin recrear el nodo ni recargar la imagen
 * cuando la referencia de portada no cambió.
 */
export function updateCard(card, article) {
  const category = card.querySelector(".post__category");
  if (category) category.textContent = article.category || "Artículo";

  const title = card.querySelector(".post__title");
  if (title) title.textContent = article.title || "Título de la publicación";

  const excerpt = card.querySelector(".post__excerpt");
  if (excerpt) excerpt.textContent = article.description || "";

  setFallback(card, article);

  const next = coverSignature(article);
  if (card.dataset.coverImage !== next) {
    card.dataset.coverImage = next;
    const media = card.querySelector(".post__media");
    if (media) {
      media.innerHTML = `<div class="post__cover"></div>${imageHtml(
        article.coverImage ?? "",
        false
      )}${coverCreditHtml(article, "post__credit")}`;
      setFallback(card, article);
      attachCoverHandlers(card);
    }
  }
}
