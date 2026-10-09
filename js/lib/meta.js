/**
 * meta.js — Metadatos de la página y previsualización social.
 *
 * Mantiene al día el <title>, la descripción y las etiquetas Open Graph /
 * Twitter Card según la vista activa, para que al compartir un enlace la
 * previsualización muestre el título, la descripción y la portada correctos.
 *
 * El HTML inicial (index.html) ya trae los metadatos por defecto de la home;
 * este módulo los actualiza al navegar.
 *
 * Nota honesta: el sitio usa rutas por hash (`#/articulos/<slug>`). Los
 * rastreadores sociales no envían el fragmento al servidor, así que la mayoría
 * solo lee el HTML inicial (la portada del sitio). Estas actualizaciones
 * benefician a los clientes que ejecutan JavaScript y a los rastreadores que
 * lo hacen; para una previsualización por artículo garantizada haría falta
 * renderizado en servidor o rutas por ruta.
 */

import { SITE } from "../data/config.js";

export const DEFAULT_TITLE = SITE.name;
export const DEFAULT_DESCRIPTION =
  "Un recorrido por las grandes preguntas del pensamiento: artículos de filosofía antigua, metafísica, ética, epistemología y más.";
export const DEFAULT_IMAGE = "./assets/social-preview.png";
export const DEFAULT_IMAGE_ALT =
  "Blog de Filosofía: el Hombre de Vitruvio dibujado en tinta café sobre papel beige.";

/**
 * Convierte una referencia en URL absoluta usando el dominio público del
 * sitio (`SITE.url`). Las redes sociales necesitan URLs absolutas: con una
 * ruta relativa, la previsualización no encuentra la portada. Si no hay
 * dominio configurado, cae en la URL actual del documento.
 */
function absolute(reference) {
  if (!reference) return "";
  try {
    return new URL(reference, SITE.url || document.baseURI).href;
  } catch {
    return reference;
  }
}

/** Crea o actualiza una etiqueta <meta> por atributo/clave. */
function upsertMeta(attribute, key, content) {
  let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.append(element);
  }
  element.setAttribute("content", content);
}

/** ¿La imagen es un formato que las redes aceptan como portada? */
function isShareableImage(reference) {
  return /\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(String(reference ?? ""));
}

/**
 * Aplica los metadatos de una vista.
 * @param {{title?:string, description?:string, image?:string, imageAlt?:string,
 *          path?:string}} view
 *   title  Título de la vista (sin el nombre del sitio; se agrega solo).
 *   path   Ruta relativa de la vista para `og:url` y el enlace canónico.
 */
export function applyMeta(view = {}) {
  const pageTitle = view.title ? `${view.title} · ${SITE.name}` : SITE.name;
  const description = view.description?.trim() || DEFAULT_DESCRIPTION;
  // Las portadas SVG no sirven como `og:image`: se usa la del sitio.
  const image =
    view.image && isShareableImage(view.image) ? view.image : DEFAULT_IMAGE;
  const imageUrl = absolute(image);
  const url = absolute(view.path || "./");
  const imageAlt = view.imageAlt?.trim() || DEFAULT_IMAGE_ALT;

  document.title = pageTitle;
  upsertMeta("name", "description", description);

  upsertMeta("property", "og:title", pageTitle);
  upsertMeta("property", "og:description", description);
  upsertMeta("property", "og:image", imageUrl);
  upsertMeta("property", "og:image:alt", imageAlt);
  upsertMeta("property", "og:url", url);

  upsertMeta("name", "twitter:title", pageTitle);
  upsertMeta("name", "twitter:description", description);
  upsertMeta("name", "twitter:image", imageUrl);
  upsertMeta("name", "twitter:image:alt", imageAlt);

  const canonical = document.head.querySelector('link[rel="canonical"]');
  if (canonical) canonical.setAttribute("href", url);
}
