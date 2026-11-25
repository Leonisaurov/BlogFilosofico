/**
 * articles.js — Fuente única de las publicaciones publicadas.
 *
 * Las siete publicaciones originales ya no viven como objetos inline acá: se
 * migraron a `envios/<slug>.md` (con su portada local) y se incorporaron con
 * `node scripts/import-submissions.mjs --apply`. Este archivo solo publica el
 * arreglo generado, que el importador mantiene en `js/data/contributions.js`.
 *
 * Modelo común (ver js/lib/publication.js):
 *   id, slug, title, description, category, author,
 *   coverImage, content (Markdown completo), createdAt, readingTime, tags
 *   cover { alt, credit, numeral, palette } → metadatos de la portada de
 *   respaldo (SVG local) que se usa si `coverImage` falta o no carga.
 *
 * El feed y la página de lectura se generan a partir de estos datos: no hay
 * HTML escrito a mano por publicación.
 */

import { CONTRIBUTIONS } from "./contributions.js";

export const ARTICLES = [...CONTRIBUTIONS];

/** Devuelve una publicación por id o slug. */
export function getArticle(key) {
  if (!key) return null;
  return ARTICLES.find((a) => a.id === key || a.slug === key) ?? null;
}

/**
 * Publicación siguiente (circular), útil para el enlace al final del artículo.
 * Con una sola publicación devuelve null: enlazarse a sí mismo sería un pie
 * sin sentido (y el lector omite el bloque cuando no hay «siguiente»).
 */
export function getNextArticle(key) {
  if (ARTICLES.length < 2) return null;
  const index = ARTICLES.findIndex((a) => a.id === key || a.slug === key);
  if (index === -1) return null;
  return ARTICLES[(index + 1) % ARTICLES.length];
}

/** Ruta canónica de lectura de una publicación. */
export function articleHref(article) {
  return `#/articulos/${article.slug}`;
}
