/**
 * header.js — Encabezado superior fijo.
 *
 * Contiene el título del blog (izquierda), la navegación editorial visible en
 * escritorio y el botón de menú (derecha). El botón abre el menú principal; su
 * estado `aria-expanded` lo sincroniza `main.js` a partir del propio menú.
 */

const NAV_ITEMS = [
  { hash: "#/leer", label: "Leer" },
  { hash: "#/indice", label: "Índice" },
  { hash: "#/secciones", label: "Secciones" },
  { hash: "#/pregunta", label: "Pregunta" },
  { hash: "#/informacion", label: "Información" },
];

export function renderHeader(slot, { onMenu } = {}) {
  slot.innerHTML = `
    <header class="site-header">
      <a class="brand" href="#/" aria-label="Blog de Filosofía — volver a la portada">
        <span class="brand__mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
               stroke-linecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="6.8"/>
            <path d="M12 2.8v18.4"/>
          </svg>
        </span>
        <span class="brand__name">Blog de Filosofía</span>
      </a>

      <nav class="site-nav" aria-label="Navegación principal">
        ${NAV_ITEMS.map(
          (item) => `<a href="${item.hash}" data-nav="${item.hash}">${item.label}</a>`
        ).join("")}
        <a class="site-nav__cta" href="#/aportar" data-nav="#/aportar">Aportar</a>
      </nav>

      <button class="hamburger" type="button" data-menu-open
              aria-label="Abrir menú principal" aria-haspopup="dialog"
              aria-expanded="false" aria-controls="menu-dialog">
        <span aria-hidden="true"></span>
        <span aria-hidden="true"></span>
        <span aria-hidden="true"></span>
      </button>
    </header>
  `;

  const element = slot.querySelector(".site-header");
  const menuButton = slot.querySelector("[data-menu-open]");
  menuButton.addEventListener("click", () => onMenu?.());

  return { element, menuButton };
}
