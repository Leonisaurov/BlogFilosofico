/**
 * menu.js — Menú principal desplegable.
 *
 * Usa un <dialog> nativo: obtiene gratis el atrapado de foco, el cierre con
 * Escape, la restauración del foco al cerrar y la semántica de diálogo modal.
 * El diálogo ocupa toda la pantalla (es el fondo oscurecido) y el panel se
 * coloca dentro; así el clic fuera del panel se detecta de forma fiable.
 *
 * Contiene exactamente tres opciones: Secciones, Configuración y Crear
 * artículo. Las dos primeras llevan a una vista provisional.
 */

const CHEVRON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M9 6l6 6-6 6"/></svg>`;

const CLOSE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
  <path d="M6 6l12 12M18 6L6 18"/></svg>`;

const ITEMS = [
  { hash: "#/secciones", label: "Secciones" },
  { hash: "#/configuracion", label: "Configuración" },
  { hash: "#/crear", label: "Crear artículo" },
];

export function createMenu(root, { onOpenChange } = {}) {
  const dialog = document.createElement("dialog");
  dialog.className = "menu";
  dialog.id = "menu-dialog";
  dialog.setAttribute("aria-labelledby", "menu-title");
  dialog.innerHTML = `
    <div class="menu__panel" role="document">
      <header class="menu__head">
        <p class="eyebrow menu__title" id="menu-title">Menú principal</p>
        <button class="menu__close" type="button" data-menu-close aria-label="Cerrar menú">
          ${CLOSE_ICON}
        </button>
      </header>
      <nav class="menu__nav" aria-label="Menú principal">
        ${ITEMS.map(
          (item) => `
          <a class="menu__item" href="${item.hash}" data-menu-target="${item.hash}">
            <span>${item.label}</span>
            ${CHEVRON}
          </a>`
        ).join("")}
      </nav>
      <p class="menu__foot">Blog de Filosofía</p>
    </div>
  `;
  root.append(dialog);

  const panel = dialog.querySelector(".menu__panel");
  let isOpen = false;

  function notify() {
    onOpenChange?.(isOpen);
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    dialog.showModal();
    requestAnimationFrame(() => dialog.classList.add("is-open"));
    notify();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    dialog.classList.remove("is-open");
    setTimeout(() => {
      if (!isOpen && dialog.open) dialog.close();
    }, 200);
    notify();
  }

  // Escape: interceptamos el cierre nativo para usar la transición propia.
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });

  // Clic en el fondo (fuera del panel).
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });

  dialog.addEventListener("click", (event) => {
    if (event.target.closest("[data-menu-close]")) {
      event.preventDefault();
      close();
    }
  });

  // Al elegir una opción, el menú se cierra; la navegación la hace el enlace.
  dialog.addEventListener("click", (event) => {
    if (event.target.closest("[data-menu-target]")) close();
  });

  // Si el diálogo se cierra por otra vía, mantenemos el estado sincronizado.
  dialog.addEventListener("close", () => {
    isOpen = false;
    dialog.classList.remove("is-open");
    notify();
  });

  return {
    element: dialog,
    panel,
    open,
    close,
    get isOpen() {
      return isOpen;
    },
  };
}
