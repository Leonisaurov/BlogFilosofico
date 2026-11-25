/**
 * format.js — Formatos compartidos por las vistas editoriales.
 *
 * Una sola implementación de la fecha evita que el índice, la portada y el
 * lector muestren el mismo dato de formas distintas.
 */

/** Fecha larga en español para metadatos de lectura. */
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

/** Fecha corta para índices y sumarios. */
export function formatShortDate(iso) {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
