/** slug.js — Genera identificadores legibles para las URLs de publicación. */

/** Convierte un título en un slug seguro (a-z, 0-9 y guiones). */
export function slugify(text) {
  const base = String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "articulo";
}
