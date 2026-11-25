/**
 * main.js — Punto de entrada.
 *
 * Monta la portada editorial, la lectura continua, el índice, la pregunta de
 * la semana, información, secciones, lector, configuración y editor; después
 * los conecta mediante el router por hash. Este archivo solo orquesta: la
 * lógica y el contenido viven en cada componente y en `js/data/`.
 *
 * Las preferencias (vista de lectura y tema) se leen al arrancar, se aplican
 * al documento y se persisten en el almacenamiento local. El script de
 * arranque del <head> ya las aplicó antes del primer pintado.
 */

import { renderHeader } from "./components/header.js";
import { createFeed } from "./components/feed.js";
import { createHomeGrid } from "./components/home-grid.js";
import { createHome } from "./components/home.js";
import { createIndexView } from "./components/index-view.js";
import { createInformation } from "./components/information.js";
import { createQuestion } from "./components/question.js";
import { createReader } from "./components/reader.js";
import { createMenu } from "./components/menu.js";
import { createSections } from "./components/sections.js";
import { createSettings } from "./components/settings.js";
import { createRouter, parseRoute } from "./lib/router.js";
import { clearAppData } from "./lib/storage.js";
import { applyMeta } from "./lib/meta.js";
import { withLoading } from "./lib/loading.js";
import {
  applyTheme,
  applyViewMode,
  loadPreferences,
  savePreferences,
} from "./lib/preferences.js";
import { qs } from "./lib/dom.js";

const bootLoader = qs("#boot-loader");

// Todo el montaje corre dentro de try/finally: el estado de arranque se retira
// en cuanto termina, incluso si algún componente falla al inicializarse.
try {
const app = qs("#app");
const feedElement = qs("#feed");
const trackElement = qs("#feed-track");
const homeGridElement = qs("#home-grid");
const homeElement = qs("#home");
const indexElement = qs("#index");
const questionElement = qs("#question");
const informationElement = qs("#information");
const readerElement = qs("#reader");
const editorElement = qs("#editor");
const sectionsElement = qs("#sections");

// Solo se monta desde el arranque lo que pinta la portada: las tarjetas de la
// cuadrícula, el editor, el drawer y el menú se crean en su primera ruta (ver
// ensure* más abajo). Así el primer pintado no evalúa 15 tarjetas de más.
const feed = createFeed({ feed: feedElement, track: trackElement });
createHome(homeElement);
createIndexView(indexElement);
createQuestion(questionElement);
createInformation(informationElement);
const reader = createReader(readerElement);

// Últimas rutas recordadas: desde dónde vuelve el lector, el editor o el
// drawer de configuración. Evita que «Volver» aterrice siempre en el feed.
let listHash = "#/leer";
let currentViewHash = "#/";
let settingsReturnHash = "#/";
let editorReturnHash = "#/";
let homeGrid = null;
let editor = null;
let settings = null;
let menu = null;
let router = null;

const sections = createSections(sectionsElement);
const header = renderHeader(qs("#site-header"), { onMenu: () => ensureMenu().open() });

function ensureHomeGrid() {
  if (!homeGrid) homeGrid = createHomeGrid(homeGridElement);
  return homeGrid;
}

async function ensureEditor() {
  if (!editor) {
    // El editor es la vista diferida más pesada: se importa en su primera
    // ruta y el aviso de carga se oculta en `finally` (éxito o error).
    editor = await withLoading(async () => {
      const { createEditor } = await import("./components/editor.js");
      return createEditor(editorElement, {
        onClose: () => router.navigate(editorReturnHash || "#/"),
      });
    }, "Preparando el editor…");
  }
  return editor;
}

function ensureMenu() {
  if (!menu) {
    menu = createMenu(document.body, {
      onOpenChange(open) {
        header.menuButton.setAttribute("aria-expanded", String(open));
      },
    });
  }
  return menu;
}

function readerBackLabel() {
  if (listHash === "#/leer") return "Volver a la lectura";
  if (listHash === "#/indice") return "Volver al índice";
  if (listHash === "#/secciones") return "Volver a secciones";
  if (listHash.startsWith("#/secciones/")) return "Volver a la sección";
  return "Volver a la portada";
}

// --- Preferencias locales (vista y tema) ---------------------------------
let preferences = loadPreferences();
applyTheme(preferences.theme);
applyViewMode(preferences.viewMode);

function refreshReadGeometry() {
  if (app.dataset.view === "read" && preferences.viewMode === "feed") {
    requestAnimationFrame(() => feed.refresh());
  }
}

function setViewMode(mode) {
  preferences = { ...preferences, viewMode: mode };
  savePreferences(preferences);
  applyViewMode(mode);
  refreshReadGeometry();
}

function setTheme(theme) {
  preferences = { ...preferences, theme };
  savePreferences(preferences);
  applyTheme(theme);
}

function ensureSettings() {
  if (settings) return settings;
  settings = createSettings(document.body, {
    getPreferences: () => preferences,
    onViewModeChange: setViewMode,
    onThemeChange: setTheme,

    async onClearData() {
      const report = await clearAppData();
      // Vuelven los valores por defecto (feed vertical y modo claro) y se
      // descarta cualquier estado en memoria.
      preferences = loadPreferences();
      applyTheme(preferences.theme);
      applyViewMode(preferences.viewMode);
      editor?.reset();
      refreshReadGeometry();
      return report;
    },

    onClose() {
      // El drawer se superpone a la vista actual: al cerrar se vuelve a ella.
      if (parseRoute().name === "settings") {
        router.navigate(settingsReturnHash || "#/");
      }
    },
  });
  return settings;
}

// --- Navegación ----------------------------------------------------------
function closeOverlays() {
  menu?.close();
  reader.close();
  editor?.close();
  sections.close();
  settings?.close();
}

function syncNav(routeName) {
  const active = {
    read: "#/leer",
    index: "#/indice",
    sections: "#/secciones",
    section: "#/secciones",
    question: "#/pregunta",
    information: "#/informacion",
    editor: "#/aportar",
  }[routeName];

  document.querySelectorAll("[data-nav]").forEach((link) => {
    const isCurrent = link.dataset.nav === active;
    link.classList.toggle("is-current", isCurrent);
    if (isCurrent) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

function remember(routeName, hash = window.location.hash) {
  ensureMenu(); // el menú existe desde la primera ruta (aria-controls del header)
  currentViewHash = hash || "#/";
  syncNav(routeName);
}

router = createRouter({
  onHome() {
    listHash = "#/";
    remember("home", "#/");
    closeOverlays();
    app.dataset.view = "home";
    homeElement.scrollTop = 0;
    applyMeta({});
  },

  onRead() {
    ensureHomeGrid();
    listHash = "#/leer";
    remember("read", "#/leer");
    closeOverlays();
    app.dataset.view = "read";
    applyViewMode(preferences.viewMode);
    refreshReadGeometry();
    applyMeta({
      title: "Leer",
      description:
        "Lectura continua de aportaciones de filosofía. Elegí entre el feed vertical y la cuadrícula editorial desde Configuración.",
      path: "./#/leer",
    });
  },

  onIndex() {
    listHash = "#/indice";
    remember("index", "#/indice");
    closeOverlays();
    app.dataset.view = "index";
    indexElement.scrollTop = 0;
    applyMeta({
      title: "Índice",
      description:
        "Índice general de aportaciones del Blog de Filosofía, ordenado por fecha y con acceso a todas las secciones.",
      path: "./#/indice",
    });
  },

  onQuestion() {
    listHash = "#/pregunta";
    remember("question", "#/pregunta");
    closeOverlays();
    app.dataset.view = "question";
    questionElement.scrollTop = 0;
    applyMeta({
      title: "Pregunta de la semana",
      description:
        "Una pregunta filosófica cada lunes, un archivo de preguntas anteriores y una forma honesta de responder.",
      path: "./#/pregunta",
    });
  },

  onInformation() {
    listHash = "#/informacion";
    remember("information", "#/informacion");
    closeOverlays();
    app.dataset.view = "information";
    informationElement.scrollTop = 0;
    applyMeta({
      title: "Información",
      description:
        "Carta de bienvenida, política editorial, periodicidades, licencia y contacto del Blog de Filosofía.",
      path: "./#/informacion",
    });
  },

  onArticle(route) {
    remember("article", window.location.hash);
    menu?.close();
    editor?.close();
    sections.close();
    settings?.close();
    app.dataset.view = "reader";
    reader.open(route.article, { backLabel: readerBackLabel() });
    // La portada del artículo, si existe, es la imagen de la previsualización.
    applyMeta({
      title: route.article.title,
      description: route.article.description,
      image: route.article.coverImage,
      imageAlt: route.article.cover?.alt,
      path: `./#/articulos/${route.article.slug}`,
    });
  },

  async onEditor() {
    if (window.location.hash === "#/crear") {
      router.navigate("#/aportar");
      return;
    }
    // Si ya estamos en el editor (por ejemplo, al cerrar Configuración), se
    // conserva el destino anterior; si venimos de otra vista, ese es el destino.
    if (currentViewHash !== "#/aportar" && currentViewHash !== "#/crear") {
      editorReturnHash = currentViewHash || "#/";
    }
    remember("editor", "#/aportar");
    menu?.close();
    reader.close();
    sections.close();
    settings?.close();
    app.dataset.view = "editor";
    const instance = await ensureEditor();
    // Si se navegó a otra vista mientras se importaba el editor, no lo abrimos.
    if (parseRoute().name !== "editor") return;
    instance.open();
    applyMeta({
      title: "Enviar una aportación",
      description:
        "Editor de aportaciones en Markdown. El texto se revisa y se edita antes de publicarse.",
      path: "./#/aportar",
    });
  },

  onSections() {
    listHash = "#/secciones";
    remember("sections", "#/secciones");
    menu?.close();
    reader.close();
    editor?.close();
    settings?.close();
    app.dataset.view = "sections";
    sections.openGrid();
    applyMeta({
      title: "Secciones",
      description: "Explorá las áreas de la filosofía por época, problema y tipo de texto.",
      path: "./#/secciones",
    });
  },

  onSection(route) {
    listHash = `#/secciones/${route.section.slug}`;
    remember("section", `#/secciones/${route.section.slug}`);
    menu?.close();
    reader.close();
    editor?.close();
    settings?.close();
    app.dataset.view = "sections";
    sections.openSection(route.section);
    applyMeta({
      title: route.section.name,
      description: route.section.description,
      image: route.section.image,
      path: `./#/secciones/${route.section.slug}`,
    });
  },

  onSettings() {
    settingsReturnHash = currentViewHash === "#/configuracion" ? "#/" : currentViewHash;
    ensureMenu().close();
    // El drawer se superpone a la vista actual: no se cierra el lector ni el
    // editor de fondo. Al cerrar, la URL vuelve exactamente a esa vista.
    ensureSettings().open();
    applyMeta({
      title: "Configuración",
      description: "Preferencias de lectura, tema y datos locales.",
      path: "./#/configuracion",
    });
  },
});

reader.setOnClose(() => {
  // Cerrar el lector = volver a la vista de lista desde la que se abrió el
  // artículo (lectura, índice, sección o portada).
  if (parseRoute().name === "article") router.navigate(listHash);
  else router.resolve();

  // Devolvemos el foco a la tarjeta activa solo cuando se vuelve a la lectura.
  if (listHash === "#/leer") {
    requestAnimationFrame(() => {
      feed.cards[feed.activeIndex]?.focus({ preventScroll: true });
    });
  }
});

// El enlace de salto no debe cambiar el hash (el router lo interpretaría como
// una ruta desconocida): solo mueve el foco al <main> persistente.
qs(".skip-link")?.addEventListener("click", (event) => {
  event.preventDefault();
  qs("#contenido")?.focus({ preventScroll: true });
});

router.resolve();
} finally {
  // Sin retardo artificial: desaparece en el mismo turno en que termina el
  // montaje; un error durante el arranque tampoco lo deja colgado.
  bootLoader?.setAttribute("hidden", "");
}
