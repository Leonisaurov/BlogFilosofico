/**
 * workspace.mjs — utilidades del panel local de desarrollo.
 *
 * Sin dependencias. Centraliza las cuatro primitives que el servidor necesita
 * para no pisar el repositorio: resolución estricta de rutas, exclusión
 * mutua, ejecución de los importadores como procesos Node separados y
 * huellas de entradas/artefactos para invalidar tokens de confirmación.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Raíz del proyecto: tools/lib/workspace.mjs → ../.. */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Prefijo de los temporales del panel (siempre bajo ~/Develop/.tmp). */
export const TMP_BASE = path.join(os.homedir(), "Develop", ".tmp");
export const PREVIEW_PREFIX = "blogfilosofico-preview-";

/** Artefactos generados cuya huella liga un token de simulación a un apply. */
export const ARTEFACTOS = [
  "js/data/contributions.js",
  "js/data/questions.js",
  "scripts/.importados.json",
  "scripts/.preguntas-importadas.json",
  "feed.xml",
  "sitemap.xml",
];

/** Carpetas canónicas de entrada: son las únicas donde el panel escribe. */
export const CARPETAS_ESCRITURA = ["envios", "preguntas"];

/** Extensiones de imagen que el importador acepta como portada local. */
export const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp"]);

/** Separador seguro para rutas relativas del repositorio. */
function rel(root, filename) {
  return path.relative(root, filename).split(path.sep).join("/");
}

/**
 * Resuelve una ruta relativa dentro de `root` y exige que quede estrictamente
 * contained (ni `..`, ni absoluta, ni un hermano con el mismo prefijo).
 * `permitidas` limita además las carpetas de primer nivel tocadas.
 */
export function rutaDentro(root, entrada, permitidas = CARPETAS_ESCRITURA) {
  const valor = String(entrada ?? "");
  if (!valor || valor.includes("\u0000")) throw new Error("falta la ruta");
  if (path.isAbsolute(valor) || /^[A-Za-z]:/.test(valor)) {
    throw new Error(`ruta absoluta no permitida: "${valor}"`);
  }
  const resuelta = path.resolve(root, valor);
  const base = path.resolve(root) + path.sep;
  if (resuelta !== path.resolve(root) && !resuelta.startsWith(base)) {
    throw new Error(`ruta fuera del proyecto: "${valor}"`);
  }
  const primera = rel(root, resuelta).split("/")[0];
  if (permitidas.length && !permitidas.includes(primera)) {
    throw new Error(`carpeta no permitida: "${primera || "."}"`);
  }
  return resuelta;
}

/** Igual que `rutaDentro`, pero para el árbol de una vista previa. */
export function rutaDentroPreview(base, entrada) {
  const valor = String(entrada ?? "");
  if (!valor || valor.includes("\u0000")) throw new Error("falta la ruta relativa");
  if (path.isAbsolute(valor) || /^[A-Za-z]:/.test(valor)) {
    throw new Error(`ruta absoluta no permitida: "${valor}"`);
  }
  const segmentos = valor.split(/[\\/]+/).filter(Boolean);
  if (!segmentos.length || segmentos.some((s) => s === ".." || s.startsWith("."))) {
    throw new Error(`ruta no permitida: "${valor}"`);
  }
  const destino = path.resolve(base, ...segmentos);
  if (destino !== path.resolve(base) && !destino.startsWith(path.resolve(base) + path.sep)) {
    throw new Error(`ruta fuera de la vista previa: "${valor}"`);
  }
  return destino;
}

/** Escritura atómica: archivo temporal junto al destino y `rename`. */
export function escribirAtomico(destino, contenido) {
  const buffer = Buffer.isBuffer(contenido) ? contenido : Buffer.from(String(contenido), "utf8");
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const temporal = `${destino}.tmp-${process.pid}-${crypto.randomBytes(5).toString("hex")}`;
  try {
    fs.writeFileSync(temporal, buffer);
    fs.renameSync(temporal, destino);
  } finally {
    if (fs.existsSync(temporal)) fs.rmSync(temporal);
  }
}

/** Exclusión mutua: cada función entra en cola, incluso si la anterior falla. */
export class Mutex {
  constructor() {
    this.cola = Promise.resolve();
  }

  run(fn) {
    const resultado = this.cola.then(fn, fn);
    this.cola = resultado.then(
      () => undefined,
      () => undefined
    );
    return resultado;
  }
}

/**
 * Lanza un proceso Node SIN shell y SIN `&&`: cada importador se ejecuta en su
 * propio proceso, en serie, desde el servidor. Resuelve siempre con un objeto.
 */
export function ejecutarNode(args, { cwd = ROOT, timeout = 120000 } = {}) {
  return new Promise((resolve) => {
    let hijo;
    try {
      hijo = spawn(process.execPath, args, {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (error) {
      resolve({ code: -1, stdout: "", stderr: String(error?.message ?? error) });
      return;
    }
    let stdout = "";
    let stderr = "";
    let terminado = false;
    const fin = (code, extra = "") => {
      if (terminado) return;
      terminado = true;
      clearTimeout(temporizador);
      resolve({ code, stdout, stderr: stderr + extra });
    };
    const temporizador = setTimeout(() => {
      hijo.kill("SIGTERM");
      fin(124, "\n[tiempo de espera agotado]");
    }, timeout);
    hijo.stdout.on("data", (parte) => {
      stdout += parte.toString("utf8");
    });
    hijo.stderr.on("data", (parte) => {
      stderr += parte.toString("utf8");
    });
    hijo.on("error", (error) => fin(-1, `\n${error.message}`));
    hijo.on("close", (code) => fin(code ?? -1));
  });
}

/** Lista de archivos de entrada (envios/ y preguntas/) en orden estable. */
export function listarEntradas(root) {
  const lista = [];
  for (const carpeta of CARPETAS_ESCRITURA) {
    const base = path.join(root, carpeta);
    if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) continue;
    const visitar = (dir) => {
      for (const nombre of fs.readdirSync(dir).sort()) {
        const destino = path.join(dir, nombre);
        const estado = fs.statSync(destino);
        if (estado.isDirectory()) visitar(destino);
        else if (estado.isFile()) lista.push(rel(root, destino));
      }
    };
    visitar(base);
  }
  return lista.sort();
}

/** Huella determinista de entradas + artefactos. Un cambio invalida el token. */
export function huella(root) {
  const hash = crypto.createHash("sha256");
  const archivos = [...ARTEFACTOS, ...listarEntradas(root)].sort();
  for (const nombre of archivos) {
    hash.update(nombre);
    hash.update("\u0000");
    const destino = path.join(root, nombre);
    if (fs.existsSync(destino) && fs.statSync(destino).isFile()) {
      hash.update(fs.readFileSync(destino));
    } else {
      hash.update("<ausente>");
    }
    hash.update("\u0000");
  }
  return hash.digest("hex");
}

/** Crea un directorio temporal bajo ~/Develop/.tmp (nunca en /tmp). */
export function crearTemporal(prefijo) {
  fs.mkdirSync(TMP_BASE, { recursive: true });
  return fs.mkdtempSync(path.join(TMP_BASE, prefijo));
}

/** Filtro de copia: nunca se copian .git, tests, tools ni staging activo. */
export function copiarSitio(root, destino) {
  fs.cpSync(root, destino, {
    recursive: true,
    filter: (origen) => {
      const nombre = path.basename(origen);
      if (nombre === ".git" || nombre === "tests" || nombre === "tools") return false;
      if (nombre.startsWith(".staging-")) return false;
      return true;
    },
  });
}
