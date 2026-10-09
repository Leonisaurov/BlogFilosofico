/**
 * router.js — Enrutado por hash, sin dependencias.
 *
 * Rutas:
 *   #/                        → feed de publicaciones
 *   #/articulos/<slug|id>     → página individual del artículo
 *   #/crear                   → editor de artículos
 *   #/secciones               → cuadrícula de secciones filosóficas
 *   #/secciones/<slug>        → página de una sección con sus artículos
 *   #/configuracion           → vista provisional
 *
 * Se eligió hash routing para que el sitio siga siendo estático y funcione
 * servido desde cualquier ruta, sin configuración de servidor.
 */

import { getArticle } from "../data/articles.js";
import { getSection } from "../data/sections.js";

const ARTICLE_ROUTE = /^#\/articulos?\/([^/?#]+)\/?$/;
const SECTION_ROUTE = /^#\/secciones\/([^/?#]+)\/?$/;

const STATIC_ROUTES = {
  "#/crear": "editor",
  "#/secciones": "sections",
  "#/configuracion": "settings",
};

/** Interpreta un hash y devuelve la ruta resuelta. */
export function parseRoute(hash = window.location.hash) {
  const clean = (hash ?? "").trim().replace(/\/+$/, "") || "#/";

  const match = ARTICLE_ROUTE.exec(clean);
  if (match) {
    const article = getArticle(decodeURIComponent(match[1]));
    if (article) return { name: "article", article };
  }

  const sectionMatch = SECTION_ROUTE.exec(clean);
  if (sectionMatch) {
    const section = getSection(decodeURIComponent(sectionMatch[1]));
    if (section) return { name: "section", section };
    // Slug desconocido: se vuelve a la cuadrícula, sin romper la navegación.
    return { name: "sections" };
  }

  return { name: STATIC_ROUTES[clean] ?? "feed" };
}

/**
 * @param {{onFeed:Function, onArticle:Function, onEditor:Function,
 *          onSections:Function, onSection:Function, onSettings:Function}} handlers
 */
export function createRouter(handlers) {
  function resolve() {
    const route = parseRoute();
    const handler = {
      feed: handlers.onFeed,
      article: handlers.onArticle,
      editor: handlers.onEditor,
      sections: handlers.onSections,
      section: handlers.onSection,
      settings: handlers.onSettings,
    }[route.name];

    if (handler) handler(route);
    else handlers.onFeed?.(route);
  }

  function navigate(hash) {
    if (window.location.hash === hash) resolve();
    else window.location.hash = hash;
  }

  window.addEventListener("hashchange", resolve);

  return { resolve, navigate };
}
