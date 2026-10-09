/**
 * preferences.js — Preferencias locales del sitio (vista y tema).
 *
 * Viven en `localStorage`, junto al resto de datos de la aplicación, bajo una
 * única clave versionada. El script de arranque de `index.html` lee esa misma
 * clave antes del primer pintado para aplicar el tema y el modo de vista sin
 * destellos; este módulo es la versión "oficial" (validada) que usa el resto
 * del código.
 *
 * No hay backend: son preferencias del navegador del visitante.
 */

import { SITE } from "../data/config.js";

export const PREFERENCES_KEY = `${SITE.storagePrefix}.preferencias.v1`;

export const DEFAULT_PREFERENCES = Object.freeze({ viewMode: "feed", theme: "light" });

const VIEW_MODES = new Set(["feed", "grid"]);
const THEMES = new Set(["light", "dark"]);

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Lee y valida las preferencias. Devuelve los valores por defecto si faltan. */
export function loadPreferences() {
  const store = safeStorage();
  if (!store) return { ...DEFAULT_PREFERENCES };
  try {
    const raw = store.getItem(PREFERENCES_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const data = JSON.parse(raw);
    return {
      viewMode: VIEW_MODES.has(data?.viewMode) ? data.viewMode : DEFAULT_PREFERENCES.viewMode,
      theme: THEMES.has(data?.theme) ? data.theme : DEFAULT_PREFERENCES.theme,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

/** Guarda las preferencias. Devuelve false si el almacenamiento no está disponible. */
export function savePreferences(preferences) {
  const store = safeStorage();
  if (!store) return false;
  try {
    store.setItem(
      PREFERENCES_KEY,
      JSON.stringify({
        viewMode: VIEW_MODES.has(preferences?.viewMode)
          ? preferences.viewMode
          : DEFAULT_PREFERENCES.viewMode,
        theme: THEMES.has(preferences?.theme) ? preferences.theme : DEFAULT_PREFERENCES.theme,
      })
    );
    return true;
  } catch {
    return false;
  }
}

/** Aplica el tema al documento (atributo en <html>, usado por los tokens CSS). */
export function applyTheme(theme) {
  document.documentElement.dataset.theme = THEMES.has(theme) ? theme : DEFAULT_PREFERENCES.theme;
}

/** Aplica el modo de vista de la página principal (feed o cuadrícula). */
export function applyViewMode(mode) {
  document.documentElement.dataset.viewMode = VIEW_MODES.has(mode)
    ? mode
    : DEFAULT_PREFERENCES.viewMode;
}
