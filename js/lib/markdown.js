/**
 * markdown.js — Renderizado de Markdown seguro.
 *
 * marked convierte Markdown (GFM) en HTML y DOMPurify lo sanitiza antes de
 * insertarlo en la página. El texto del usuario se trata siempre como no
 * confiable: no se inyecta HTML sin pasar por el sanitizador.
 *
 * Extensión documentada: se usa GFM (GitHub Flavored Markdown) para admitir
 * tablas, listas de tareas y tachado, que no forman parte del Markdown
 * original. Se activa con `gfm: true`.
 *
 * marked + DOMPurify se importan de forma dinámica por article-view.js: este
 * módulo NO entra en el grafo estático de main.js, así que el primer pintado
 * de la portada no espera a que se evalúen ~130 KB de vendor. El esquema de
 * encabezados del editor vive en `headings.js` (sin dependencias).
 */

import { marked } from "../../vendor/marked.esm.js";
import DOMPurify from "../../vendor/dompurify.es.mjs";

marked.use({ gfm: true, breaks: false });

const PURIFY_CONFIG = {
  FORBID_TAGS: [
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "form",
    "base",
    "link",
    "meta",
  ],
  FORBID_ATTR: ["style"],
  ALLOW_DATA_ATTR: false,
};

// Endurecimiento de enlaces e imágenes generados por el documento.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("rel", "noopener noreferrer");
    node.setAttribute("target", "_blank");
  } else if (node.tagName === "IMG") {
    node.setAttribute("loading", "lazy");
    node.setAttribute("referrerpolicy", "no-referrer");
  }
});

/**
 * Convierte Markdown a HTML seguro.
 * @param {string} markdown
 * @returns {string} HTML sanitizado listo para insertar.
 */
export function renderMarkdown(markdown) {
  const html = marked.parse(String(markdown ?? ""));
  return DOMPurify.sanitize(html, PURIFY_CONFIG);
}

