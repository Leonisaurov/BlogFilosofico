/** dom.js — utilidades mínimas compartidas por los componentes. */

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escapa texto para insertarlo con seguridad en HTML/SVG. */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/** Atajo de consulta. */
export function qs(selector, root = document) {
  return root.querySelector(selector);
}
