/**
 * router.js — Enrutado por hash, sin dependencias.
 *
 * Rutas:
 *   #/                        → portada editorial
 *   #/leer                    → lectura continua (feed o cuadrícula)
 *   #/indice                  → índice general
 *   #/pregunta                → pregunta de la semana
 *   #/informacion             → información, carta y política editorial
 *   #/articulos/<slug|id>     → página individual del artículo
 *   #/aportar (alias #/crear) → editor de aportaciones
 *   #/secciones               → cuadrícula de secciones filosóficas
 *   #/secciones/<slug>        → página de una sección con sus artículos
 *   #/configuracion           → drawer de configuración
 *
 * Se eligió hash routing para que el sitio siga siendo estático y funcione
 * servido desde cualquier ruta, sin configuración de servidor.
 */

import { getArticle } from "../data/articles.js";
import { getSection } from "../data/sections.js";

const ARTICLE_ROUTE = /^#\/articulos?\/([^/?#]+)\/?$/;
const SECTION_ROUTE = /^#\/secciones\/([^/?#]+)\/?$/;

const STATIC_ROUTES = {
  "#/": "home",
  "#/leer": "read",
  "#/indice": "index",
  "#/pregunta": "question",
  "#/informacion": "information",
  "#/aportar": "editor",
  "#/crear": "editor", // alias histórico: no rompe enlaces ya compartidos
  "#/secciones": "sections",
  "#/configuracion": "settings",
};

/** Interpreta un hash y devuelve la ruta resuelta. */
export function parseRoute(hash = window.location.hash) {
  // Quita barras finales, pero conserva la raíz "#/": convertirla en "#"
  // dejaría muerta la entrada STATIC_ROUTES["#/"].
  let clean = (hash ?? "").trim();
  if (clean.startsWith("#/") && clean.length > 2) clean = clean.replace(/\/+$/, "");
  clean = clean === "#" || clean === "" ? "#/" : clean;

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

  // Cualquier ruta desconocida vuelve a la portada, no a una vista interna.
  return { name: STATIC_ROUTES[clean] ?? "home" };
}

/**
 * @param {{onHome:Function, onRead:Function, onIndex:Function,
 *          onQuestion:Function, onInformation:Function, onArticle:Function,
 *          onEditor:Function, onSections:Function, onSection:Function,
 *          onSettings:Function}} handlers
 */
export function createRouter(handlers) {
  function resolve() {
    const route = parseRoute();
    const handler = {
      home: handlers.onHome,
      read: handlers.onRead,
      index: handlers.onIndex,
      question: handlers.onQuestion,
      information: handlers.onInformation,
      article: handlers.onArticle,
      editor: handlers.onEditor,
      sections: handlers.onSections,
      section: handlers.onSection,
      settings: handlers.onSettings,
    }[route.name];

    if (handler) handler(route);
    else handlers.onHome?.(route);
  }

  function navigate(hash) {
    if (window.location.hash === hash) resolve();
    else window.location.hash = hash;
  }

  window.addEventListener("hashchange", resolve);

  return { resolve, navigate };
}
