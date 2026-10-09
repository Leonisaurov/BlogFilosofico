/**
 * reader.js — Página individual de una publicación.
 *
 * Capa completa sobre el feed con scroll propio y URL propia
 * (#/articulos/<slug>). El cuerpo se renderiza con la MISMA plantilla que la
 * previsualización del editor: `article-view.js`.
 */

import { getNextArticle } from "../data/articles.js";
import { escapeHtml } from "../lib/dom.js";
import { createArticleView } from "./article-view.js";

const BACK_ARROW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M20 12H5M11 6l-6 6 6 6"/></svg>`;

export function createReader(root) {
  let onClose = () => {};
  let isOpen = false;

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-reader-back]")) {
      event.preventDefault();
      onClose();
    }
  });

  function open(article, { backLabel = "Volver al Blog" } = {}) {
    const next = getNextArticle(article.id);

    root.innerHTML = `
      <div class="reader__bar">
        <button class="reader__back" type="button" data-reader-back>
          ${BACK_ARROW}<span>${escapeHtml(backLabel)}</span>
        </button>
        <span class="reader__bar-label">${article.category ? article.category : "Artículo"}</span>
      </div>
    `;
    root.append(createArticleView(article, { next }));

    isOpen = true;
    root.hidden = false;
    root.scrollTop = 0;
    requestAnimationFrame(() => root.classList.add("is-open"));
    root.querySelector(".reader__back")?.focus({ preventScroll: true });
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    root.classList.remove("is-open");
    setTimeout(() => {
      if (!isOpen) {
        root.hidden = true;
        root.innerHTML = "";
      }
    }, 320);
  }

  function onKeydown(event) {
    if (isOpen && event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }
  document.addEventListener("keydown", onKeydown);

  return {
    open,
    close,
    setOnClose(handler) {
      onClose = handler;
    },
    get isOpen() {
      return isOpen;
    },
  };
}
