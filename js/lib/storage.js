/**
 * storage.js — Borrador local del editor.
 *
 * Usa `localStorage`: el borrador vive únicamente en el navegador del usuario
 * y nunca se envía a un servidor. Todas las operaciones están protegidas por
 * `try/catch` porque el almacenamiento puede no estar disponible (modo
 * privado, cuota llena, políticas del navegador).
 *
 * El borrador es una publicación completa (todos los campos del modelo), no
 * un artículo publicado: no se presenta como contenido visible para otros.
 */

import { SITE } from "../data/config.js";
import { createPublication } from "./publication.js";

export const DRAFT_KEY = `${SITE.storagePrefix}.borrador.v${SITE.draftVersion}`;

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** ¿Se puede usar el almacenamiento local? */
export function storageAvailable() {
  const store = safeStorage();
  if (!store) return false;
  try {
    const probe = `${DRAFT_KEY}.probe`;
    store.setItem(probe, "1");
    store.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/**
 * Devuelve el borrador guardado o null.
 * @returns {{publication:object, updatedAt:number, sharedFingerprint:string|null}|null}
 */
export function loadDraft() {
  const store = safeStorage();
  if (!store) return null;
  try {
    const raw = store.getItem(DRAFT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.publication !== "object" || data.publication === null) {
      return null;
    }
    return {
      publication: createPublication(data.publication),
      updatedAt: Number(data.updatedAt) || 0,
      sharedFingerprint:
        typeof data.sharedFingerprint === "string" ? data.sharedFingerprint : null,
    };
  } catch {
    return null;
  }
}

/** Guarda el borrador completo. Devuelve false si no se pudo escribir. */
export function saveDraft(publication, sharedFingerprint = null) {
  const store = safeStorage();
  if (!store) return false;
  try {
    store.setItem(
      DRAFT_KEY,
      JSON.stringify({
        publication: createPublication(publication),
        sharedFingerprint,
        updatedAt: Date.now(),
      })
    );
    return true;
  } catch {
    return false;
  }
}

/** Elimina el borrador. */
export function clearDraft() {
  const store = safeStorage();
  if (!store) return;
  try {
    store.removeItem(DRAFT_KEY);
  } catch {
    /* nada que hacer */
  }
}

/**
 * Borra TODOS los datos locales atribuibles a esta aplicación.
 *
 * No borra "todas las cookies" ni los datos de otros sitios: solo lo que el
 * proyecto guarda bajo su propio prefijo (`SITE.storagePrefix`). El proyecto
 * usa únicamente `localStorage`; se limpian además `sessionStorage`, IndexedDB
 * y cookies con ese prefijo por si alguna versión futura los usara. Cada
 * mecanismo se informa en el resultado y, si no es accesible, se declara en
 * `unsupported` en lugar de fingir que se limpió.
 *
 * @returns {Promise<{localStorage:number, sessionStorage:number, indexedDB:number,
 *   cookies:number, unsupported:string[]}>}
 */
export async function clearAppData() {
  const prefix = SITE.storagePrefix;
  const report = { localStorage: 0, sessionStorage: 0, indexedDB: 0, cookies: 0, unsupported: [] };

  const clearWebStorage = (storage, field) => {
    if (!storage) {
      report.unsupported.push(field);
      return;
    }
    try {
      const keys = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && key.startsWith(prefix)) keys.push(key);
      }
      keys.forEach((key) => storage.removeItem(key));
      report[field] = keys.length;
    } catch {
      report.unsupported.push(field);
    }
  };

  clearWebStorage(safeStorage(), "localStorage");
  try {
    clearWebStorage(window.sessionStorage, "sessionStorage");
  } catch {
    report.unsupported.push("sessionStorage");
  }

  // IndexedDB: el proyecto no la usa, pero se limpia si existiera una base
  // con el prefijo de la aplicación.
  try {
    if (window.indexedDB && typeof window.indexedDB.databases === "function") {
      const databases = await window.indexedDB.databases();
      for (const database of databases) {
        if (database?.name && database.name.startsWith(prefix)) {
          await new Promise((resolve) => {
            const request = window.indexedDB.deleteDatabase(database.name);
            request.onsuccess = request.onerror = request.onblocked = () => resolve();
          });
          report.indexedDB += 1;
        }
      }
    } else {
      report.unsupported.push("indexedDB");
    }
  } catch {
    report.unsupported.push("indexedDB");
  }

  // Cookies propias del sitio (el proyecto no establece ninguna).
  try {
    const names = String(document.cookie || "")
      .split(";")
      .map((part) => part.split("=")[0].trim())
      .filter(Boolean);
    for (const name of names) {
      if (name.startsWith(prefix)) {
        document.cookie = `${name}=; Max-Age=0; path=/`;
        report.cookies += 1;
      }
    }
  } catch {
    report.unsupported.push("cookies");
  }

  return report;
}
