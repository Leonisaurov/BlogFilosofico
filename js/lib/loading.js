/**
 * loading.js — Aviso reutilizable para las cargas diferidas.
 *
 * Un único indicador (role="status" + aria-live="polite") para el arranque de
 * módulos y vistas que se montan bajo demanda. Se muestra mientras haya trabajo
 * pendiente y se oculta en `finally`, también si la carga falla. Es texto
 * estático: sin giradores, compatible con prefers-reduced-motion.
 */

let indicator = null;
let pending = 0;

function ensureIndicator() {
  if (indicator) return indicator;
  indicator = document.createElement("div");
  indicator.className = "loading-indicator";
  indicator.setAttribute("role", "status");
  indicator.setAttribute("aria-live", "polite");
  indicator.hidden = true;
  document.body.append(indicator);
  return indicator;
}

/**
 * Ejecuta `work` con el aviso visible.
 * @param {() => Promise<*>} work
 * @param {string} message texto breve en español
 */
export async function withLoading(work, message = "Cargando…") {
  const element = ensureIndicator();
  pending += 1;
  element.textContent = message;
  element.hidden = false;
  try {
    return await work();
  } finally {
    pending -= 1;
    if (pending === 0) element.hidden = true;
  }
}
