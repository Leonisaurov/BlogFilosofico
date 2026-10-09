/**
 * pending.js — Vista provisional para opciones aún no implementadas.
 *
 * Se usa para «Secciones» y «Configuración». No agrega funciones: solo avisa
 * que la sección está pendiente y permite volver al Blog.
 */

import { escapeHtml } from "../lib/dom.js";

const BACK_ARROW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M20 12H5M11 6l-6 6 6 6"/></svg>`;

export function createPending(root, { onClose } = {}) {
  let isOpen = false;

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-pending-back]")) {
      event.preventDefault();
      onClose?.();
    }
  });

  function open({ title, message }) {
    root.innerHTML = `
      <div class="pending__bar">
        <button class="pending__back" type="button" data-pending-back>
          ${BACK_ARROW}<span>Volver</span>
        </button>
        <span class="pending__bar-label">Blog de Filosofía</span>
      </div>
      <div class="pending__body">
        <p class="eyebrow pending__eyebrow">Próximamente</p>
        <h1 class="pending__title">${escapeHtml(title)}</h1>
        <p class="pending__text">${escapeHtml(message)}</p>
        <a class="pending__link" href="#/">Volver al Blog de Filosofía</a>
      </div>
    `;
    isOpen = true;
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add("is-open"));
    root.querySelector("[data-pending-back]")?.focus({ preventScroll: true });
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
    }, 300);
  }

  return {
    open,
    close,
    get isOpen() {
      return isOpen;
    },
  };
}
