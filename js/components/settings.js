/**
 * settings.js — Drawer de configuración.
 *
 * Panel lateral que se desliza desde el borde derecho. Usa un <dialog> nativo
 * (como el menú): obtiene gratis el atrapado de foco, el cierre con Escape, la
 * restauración del foco y la semántica modal; además, mientras está abierto el
 * resto del documento queda inerte, así que no se puede desplazar el contenido
 * de fondo.
 *
 * Contiene tres apartados: Datos y privacidad (borrado con confirmación),
 * Visualización (feed o cuadrícula) y Apariencia (claro u oscuro). El
 * componente NO decide cómo se aplican las preferencias: notifica los cambios
 * y `main.js` los persiste y los aplica.
 *
 * Un único elemento en el DOM: abrir el drawer repetidamente no lo duplica ni
 * lo acumula.
 */

import { escapeHtml } from "../lib/dom.js";

const CLOSE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
  <path d="M6 6l12 12M18 6L6 18"/></svg>`;

const TRASH_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>`;

const VIEW_OPTIONS = [
  {
    value: "feed",
    title: "Feed vertical",
    description: "Una publicación por pantalla, con el desplazamiento actual.",
  },
  {
    value: "grid",
    title: "Cuadrícula",
    description: "Varias publicaciones a la vez, en una cuadrícula adaptable.",
  },
];

const THEME_OPTIONS = [
  { value: "light", title: "Modo claro", description: "La identidad actual: papel beige y tinta café." },
  { value: "dark", title: "Modo oscuro", description: "La misma paleta, con la luminosidad invertida." },
];

function optionsHtml(name, options) {
  return options
    .map(
      (option) => `
      <label class="settings__option">
        <input type="radio" name="${name}" value="${option.value}" />
        <span class="settings__radio" aria-hidden="true"></span>
        <span class="settings__option-body">
          <span class="settings__option-title">${escapeHtml(option.title)}</span>
          <span class="settings__option-desc">${escapeHtml(option.description)}</span>
        </span>
      </label>`
    )
    .join("");
}

export function createSettings(
  root,
  { getPreferences, onViewModeChange, onThemeChange, onClearData, onClose } = {}
) {
  const drawer = document.createElement("dialog");
  drawer.className = "settings";
  drawer.id = "settings-dialog";
  drawer.setAttribute("aria-labelledby", "settings-title");
  drawer.innerHTML = `
    <div class="settings__panel" role="document">
      <header class="settings__head">
        <h2 class="settings__title" id="settings-title">Configuración</h2>
        <button class="settings__close" type="button" data-settings-close
                aria-label="Cerrar configuración">
          ${CLOSE_ICON}
        </button>
      </header>

      <div class="settings__body">
        <section class="settings__group" aria-labelledby="settings-group-data">
          <h3 class="settings__group-title" id="settings-group-data">Datos y privacidad</h3>
          <p class="settings__note">
            Este sitio guarda datos solo en tu navegador (borradores y preferencias).
            No hay cuentas ni servidores.
          </p>
          <button class="settings__danger" type="button" data-settings-clear>
            ${TRASH_ICON}<span>Borrar todos los datos</span>
          </button>
        </section>

        <section class="settings__group" aria-labelledby="settings-group-view">
          <h3 class="settings__group-title" id="settings-group-view">Visualización</h3>
          <p class="settings__note">Cómo explorar las publicaciones en la página principal.</p>
          <fieldset class="settings__options">
            <legend class="visually-hidden">Vista de la página principal</legend>
            ${optionsHtml("view-mode", VIEW_OPTIONS)}
          </fieldset>
        </section>

        <section class="settings__group" aria-labelledby="settings-group-theme">
          <h3 class="settings__group-title" id="settings-group-theme">Apariencia</h3>
          <fieldset class="settings__options">
            <legend class="visually-hidden">Tema de la interfaz</legend>
            ${optionsHtml("theme", THEME_OPTIONS)}
          </fieldset>
        </section>
      </div>
    </div>
  `;
  root.append(drawer);

  const confirm = document.createElement("dialog");
  confirm.className = "confirm";
  confirm.id = "settings-confirm";
  confirm.setAttribute("aria-labelledby", "confirm-title");
  confirm.setAttribute("aria-describedby", "confirm-text");
  confirm.innerHTML = `
    <div class="confirm__panel" role="document">
      <h2 class="confirm__title" id="confirm-title">¿Borrar todos los datos locales?</h2>
      <p class="confirm__text" id="confirm-text">
        Se eliminarán los datos que este sitio guardó en tu navegador. Puede incluir:
      </p>
      <ul class="confirm__list">
        <li>Borradores de artículos guardados en este navegador.</li>
        <li>Preferencias de visualización y apariencia.</li>
        <li>Otros datos locales de la aplicación.</li>
      </ul>
      <p class="confirm__text">
        La operación es irreversible. Los artículos publicados que forman parte
        del sitio <strong>no</strong> se eliminan.
      </p>
      <div class="confirm__actions">
        <button class="confirm__button" type="button" data-confirm-cancel>Cancelar</button>
        <button class="confirm__button confirm__button--danger" type="button" data-confirm-accept>
          Borrar datos
        </button>
      </div>
    </div>
  `;
  root.append(confirm);

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.id = "app-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.hidden = true;
  root.append(toast);

  let isOpen = false;
  let toastTimer = 0;

  /** Refleja en los controles las preferencias actuales. */
  function syncControls() {
    const preferences = getPreferences?.() ?? {};
    drawer.querySelectorAll('input[name="view-mode"]').forEach((input) => {
      input.checked = input.value === preferences.viewMode;
    });
    drawer.querySelectorAll('input[name="theme"]').forEach((input) => {
      input.checked = input.value === preferences.theme;
    });
  }

  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add("is-visible"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("is-visible");
      setTimeout(() => {
        toast.hidden = true;
      }, 300);
    }, 3400);
  }

  // --- Confirmación de borrado ------------------------------------------
  function openConfirm() {
    confirm.showModal();
    // El foco arranca en «Cancelar» para que la acción destructiva no se
    // dispare por accidente (ni con Enter inmediato).
    confirm.querySelector("[data-confirm-cancel]")?.focus();
  }

  function closeConfirm() {
    if (confirm.open) confirm.close();
  }

  async function runClear() {
    closeConfirm();
    const report = await onClearData?.();
    close();
    showToast("Datos locales eliminados. Preferencias restablecidas.");
    if (report) console.info("[Configuración] Limpieza de datos locales:", report);
  }

  // --- Abrir / cerrar ----------------------------------------------------
  function open() {
    if (isOpen) return;
    isOpen = true;
    syncControls();
    drawer.showModal();
    requestAnimationFrame(() => drawer.classList.add("is-open"));
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    drawer.classList.remove("is-open");
    onClose?.();
    setTimeout(() => {
      if (!isOpen && drawer.open) drawer.close();
    }, 280);
  }

  // --- Eventos -----------------------------------------------------------
  drawer.addEventListener("change", (event) => {
    const input = event.target.closest('input[type="radio"]');
    if (!input) return;
    if (input.name === "view-mode") onViewModeChange?.(input.value);
    else if (input.name === "theme") onThemeChange?.(input.value);
  });

  drawer.addEventListener("click", (event) => {
    if (event.target.closest("[data-settings-close]")) {
      event.preventDefault();
      close();
      return;
    }
    if (event.target.closest("[data-settings-clear]")) {
      event.preventDefault();
      openConfirm();
      return;
    }
    // Clic en el fondo superpuesto (fuera del panel).
    if (event.target === drawer) close();
  });

  drawer.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });

  confirm.addEventListener("click", (event) => {
    if (event.target.closest("[data-confirm-cancel]")) {
      event.preventDefault();
      closeConfirm();
      return;
    }
    if (event.target.closest("[data-confirm-accept]")) {
      event.preventDefault();
      runClear();
      return;
    }
    if (event.target === confirm) closeConfirm();
  });

  confirm.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeConfirm();
  });

  return {
    open,
    close,
    showToast,
    get isOpen() {
      return isOpen;
    },
  };
}
