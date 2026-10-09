/**
 * main.js — Punto de entrada.
 *
 * Monta encabezado, menú, feed, cuadrícula de inicio, lector, secciones,
 * configuración, editor y vista provisional, y los conecta mediante el router
 * por hash. Este archivo solo orquesta; la lógica vive en cada componente.
 *
 * Las preferencias (vista de la página principal y tema) se leen al arrancar,
 * se aplican al documento y se persisten en el almacenamiento local. El script
 * de arranque del <head> ya las aplicó antes del primer pintado; aquí se
 * vuelven a aplicar de forma idempotente y se conectan los controles.
 */

import { renderHeader } from "./components/header.js";
import { createFeed } from "./components/feed.js";
import { createHomeGrid } from "./components/home-grid.js";
import { createReader } from "./components/reader.js";
import { createMenu } from "./components/menu.js";
import { createEditor } from "./components/editor.js";
import { createSections } from "./components/sections.js";
import { createSettings } from "./components/settings.js";
import { createPending } from "./components/pending.js";
import { createRouter, parseRoute } from "./lib/router.js";
import { clearAppData } from "./lib/storage.js";
import { applyMeta } from "./lib/meta.js";
import {
  applyTheme,
  applyViewMode,
  loadPreferences,
  savePreferences,
} from "./lib/preferences.js";
import { qs } from "./lib/dom.js";

const app = qs("#app");
const feedElement = qs("#feed");
const trackElement = qs("#feed-track");
const homeGridElement = qs("#home-grid");
const readerElement = qs("#reader");
const editorElement = qs("#editor");
const sectionsElement = qs("#sections");
const pendingElement = qs("#pending");

// Las dos presentaciones de la página principal (feed y cuadrícula) se preparan
// desde la misma fuente de datos y con las mismas tarjetas.
const feed = createFeed({ feed: feedElement, track: trackElement });
createHomeGrid(homeGridElement);
const reader = createReader(readerElement);
const editor = createEditor(editorElement, { onClose: () => router.navigate("#/") });
const sections = createSections(sectionsElement);
const pending = createPending(pendingElement, { onClose: () => router.navigate("#/") });

const menu = createMenu(document.body, {
  onOpenChange(open) {
    header.menuButton.setAttribute("aria-expanded", String(open));
  },
});

const header = renderHeader(qs("#site-header"), { onMenu: () => menu.open() });

// Última vista de lista visitada. Permite que «Volver» del lector regrese al
// lugar desde donde se abrió el artículo (el feed o una sección concreta), y
// que al cerrar el drawer de configuración se restaure la URL.
let listHash = "#/";

function readerBackLabel() {
  if (listHash === "#/secciones") return "Volver a secciones";
  if (listHash.startsWith("#/secciones/")) return "Volver a la sección";
  return "Volver al Blog";
}

// --- Preferencias locales (vista y tema) ---------------------------------
let preferences = loadPreferences();
applyTheme(preferences.theme);
applyViewMode(preferences.viewMode);

function setViewMode(mode) {
  preferences = { ...preferences, viewMode: mode };
  savePreferences(preferences);
  applyViewMode(mode);
  // Al volver al feed hay que recalcular su geometría (estaba oculto).
  if (mode === "feed") requestAnimationFrame(() => feed.refresh());
}

function setTheme(theme) {
  preferences = { ...preferences, theme };
  savePreferences(preferences);
  applyTheme(theme);
}

const settings = createSettings(document.body, {
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
    editor.reset();
    requestAnimationFrame(() => feed.refresh());
    return report;
  },

  onClose() {
    // Cerrar el drawer devuelve la URL a la vista que estaba detrás.
    if (parseRoute().name === "settings") router.navigate(listHash);
  },
});

// --- Navegación ----------------------------------------------------------
const router = createRouter({
  onFeed() {
    listHash = "#/";
    menu.close();
    reader.close();
    editor.close();
    sections.close();
    settings.close();
    pending.close();
    app.dataset.view = "feed";
    applyMeta({});
  },

  onArticle(route) {
    menu.close();
    editor.close();
    sections.close();
    settings.close();
    pending.close();
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

  onEditor() {
    menu.close();
    reader.close();
    sections.close();
    settings.close();
    pending.close();
    app.dataset.view = "editor";
    editor.open();
    applyMeta({ title: "Crear artículo", description: "Editor de publicaciones en Markdown." });
  },

  onSections() {
    listHash = "#/secciones";
    menu.close();
    reader.close();
    editor.close();
    settings.close();
    pending.close();
    app.dataset.view = "sections";
    sections.openGrid();
    applyMeta({
      title: "Secciones",
      description: "Explorá las áreas de la filosofía por época y por problema.",
      path: "./#/secciones",
    });
  },

  onSection(route) {
    listHash = `#/secciones/${route.section.slug}`;
    menu.close();
    reader.close();
    editor.close();
    settings.close();
    pending.close();
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
    menu.close();
    reader.close();
    editor.close();
    sections.close();
    pending.close();
    // El drawer se superpone a la vista actual: no se cambia `data-view`, así
    // el fondo sigue siendo la página desde la que se abrió.
    settings.open();
    applyMeta({
      title: "Configuración",
      description: "Preferencias de visualización, tema y datos locales.",
    });
  },
});

reader.setOnClose(() => {
  // Cerrar el lector = volver a la vista de lista desde la que se abrió el
  // artículo (el feed o una sección). Si la URL apuntaba a un artículo, se
  // navega a esa lista para que el estado quede coherente con lo que se ve.
  if (parseRoute().name === "article") router.navigate(listHash);
  else router.resolve();

  // Devolvemos el foco a la tarjeta activa (accesibilidad) solo al volver al feed.
  if (listHash === "#/") {
    requestAnimationFrame(() => {
      feed.cards[feed.activeIndex]?.focus({ preventScroll: true });
    });
  }
});

router.resolve();
