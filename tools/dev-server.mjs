#!/usr/bin/env node
/**
 * dev-server.mjs — panel local de desarrollo del Blog de Filosofía.
 *
 * Node `http`, sin dependencias ni framework. Escucha SOLO en 127.0.0.1
 * (puerto 8177 por defecto, configurable con BLOG_PANEL_PORT). No tiene auth:
 * NO exponer en red. Guardar un borrador nunca publica; publicar sigue siendo
 * un acto manual del administrador tras revisión editorial y `surge publish`.
 *
 * El panel escribe en las carpetas canónicas (`envios/`, `preguntas/`) con el
 * front matter exacto de los importadores, y solo simula → confirma → aplica.
 */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  ROOT,
  TMP_BASE,
  PREVIEW_PREFIX,
  Mutex,
  ejecutarNode,
  escribirAtomico,
  rutaDentro,
  rutaDentroPreview,
  huella,
  crearTemporal,
  copiarSitio,
  IMAGE_EXTS,
} from "./lib/workspace.mjs";
import {
  createPublication,
  toFrontMatter,
} from "../js/lib/publication.js";
import { SITE } from "../js/data/config.js";
import { TEXT_TYPES, SECTIONS } from "../js/data/sections.js";
import { ARTICLES } from "../js/data/articles.js";
import { validateSubmission } from "../scripts/import-submissions.mjs";
import {
  validateQuestion,
  validateResponse,
  sha256 as sha256Texto,
} from "../scripts/import-questions.mjs";
import {
  validarPublicacion,
  validarPregunta,
  validarRespuesta,
  serializarPregunta,
  serializarRespuesta,
  parseSubmission,
  parseQuestion,
  parseResponse,
  esSi,
  autorSlug,
  unitSlug,
} from "./lib/front-matter.mjs";

const PANEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "panel");
const PUERTO = 8177;
const TTL_TOKEN = 10 * 60 * 1000;
const TTL_PREVIEW = 30 * 60 * 1000;
const MAX_PREVIEWS = 3;
const IMPORTADORES = ["scripts/import-submissions.mjs", "scripts/import-questions.mjs"];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

class HttpError extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

function json(res, status, datos) {
  const cuerpo = `${JSON.stringify(datos, null, 2)}\n`;
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(cuerpo),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(cuerpo);
}

async function leerJson(req) {
  const tipo = String(req.headers["content-type"] ?? "");
  if (!/^application\/json(?:\s*;|\s*$)/i.test(tipo)) {
    throw new HttpError(415, "se exige content-type: application/json");
  }
  const partes = [];
  let total = 0;
  for await (const parte of req) {
    total += parte.length;
    if (total > 8 * 1024 * 1024) throw new HttpError(413, "el cuerpo supera 8 MiB");
    partes.push(parte);
  }
  if (!total) return {};
  try {
    const datos = JSON.parse(Buffer.concat(partes).toString("utf8"));
    if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
      throw new Error("debe ser un objeto");
    }
    return datos;
  } catch (error) {
    throw new HttpError(400, `JSON no válido: ${error.message}`);
  }
}

/** Sirve un archivo con MIME explícito. Nunca emite la CSP de producción. */
function servirArchivo(res, archivo) {
  let real;
  try {
    real = fs.realpathSync(archivo);
  } catch {
    throw new HttpError(404, "archivo no encontrado");
  }
  if (!fs.statSync(real).isFile()) throw new HttpError(403, "no es un archivo");
  const mime = MIME[path.extname(real).toLowerCase()];
  if (!mime) throw new HttpError(403, `tipo no servible: ${path.extname(real)}`);
  res.writeHead(200, {
    "content-type": mime,
    "content-length": fs.statSync(real).size,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  fs.createReadStream(real).pipe(res);
}

/** Lista los borradores tal como los leería el importador. */
function listarBorradores(root) {
  const borradores = [];
  const md = (dir) =>
    fs.existsSync(dir) && fs.statSync(dir).isDirectory()
      ? fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith(".md") && n.toLowerCase() !== "readme.md").sort()
      : [];

  for (const nombre of md(path.join(root, "envios"))) {
    const archivo = `envios/${nombre}`;
    try {
      const datos = parseSubmission(fs.readFileSync(path.join(root, archivo), "utf8"), nombre);
      borradores.push({ tipo: "publicacion", archivo, slug: datos.slug, titulo: datos.title, datos });
    } catch (error) {
      borradores.push({ tipo: "publicacion", archivo, error: error.message });
    }
  }
  for (const [subdir, estado] of [["abiertas", "abierta"], ["cerradas", "cerrada"]]) {
    for (const nombre of md(path.join(root, "preguntas", subdir))) {
      const archivo = `preguntas/${subdir}/${nombre}`;
      try {
        const datos = parseQuestion(fs.readFileSync(path.join(root, archivo), "utf8"), nombre);
        borradores.push({ tipo: "pregunta", archivo, key: `${datos.week}-${datos.slug}`, estado, datos });
      } catch (error) {
        borradores.push({ tipo: "pregunta", archivo, error: error.message });
      }
    }
  }
  const respuestas = path.join(root, "preguntas", "respuestas");
  if (fs.existsSync(respuestas) && fs.statSync(respuestas).isDirectory()) {
    for (const key of fs.readdirSync(respuestas).sort()) {
      const dir = path.join(respuestas, key);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const nombre of md(dir)) {
        const archivo = `preguntas/respuestas/${key}/${nombre}`;
        try {
          const datos = parseResponse(fs.readFileSync(path.join(root, archivo), "utf8"), nombre, key);
          borradores.push({ tipo: "respuesta", archivo, key, autorSlug: datos.authorSlug, datos });
        } catch (error) {
          borradores.push({ tipo: "respuesta", archivo, error: error.message });
        }
      }
    }
  }
  return borradores;
}

/** Decodifica una portada local `data:image/...;base64,` y devuelve bytes + ext. */
function portadaDesdeDataUrl(valor) {
  const texto = String(valor ?? "");
  const coincidencia = texto.match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!coincidencia) throw new HttpError(400, "la portada debe ser una data-URL JPEG, PNG o WebP");
  const mime = coincidencia[1].toLowerCase();
  const ext = mime === "jpeg" ? "jpg" : mime;
  const buffer = Buffer.from(coincidencia[2].replace(/\s+/g, ""), "base64");
  const magica = {
    png: buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    webp: buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP",
    jpg: buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  };
  if (!IMAGE_EXTS.has(ext) || !magica[ext]) {
    throw new HttpError(400, `la portada no coincide con el formato .${ext}`);
  }
  return { buffer, ext };
}

const MD_MAX_BYTES = 512 * 1024;
const IMAGEN_MAX_BYTES = 2 * 1024 * 1024;
const NOMBRE_SEGURO_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const AUTOR_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Nombre de archivo entrante: sin rutas, sin `..`, sin caracteres de control. */
function validarNombreEntrante(valor) {
  const nombre = String(valor ?? "");
  if (!NOMBRE_SEGURO_RE.test(nombre) || nombre.includes("..") || path.isAbsolute(nombre)) {
    throw new HttpError(400, `nombre de archivo no seguro: "${nombre}"`);
  }
  return nombre;
}

/** Manifiestos de los importadores, para no sobrescribir lo ya importado. */
function leerManifiesto(root, rel) {
  const destino = path.join(root, rel);
  if (!fs.existsSync(destino)) return {};
  try {
    const datos = JSON.parse(fs.readFileSync(destino, "utf8"));
    if (!datos || typeof datos !== "object" || Array.isArray(datos)) throw new Error("no es un objeto");
    return datos;
  } catch (error) {
    throw new HttpError(400, `${rel} no es válido: ${error.message}`);
  }
}

/** La portada se nombra por el front matter, nunca por `<slug>-cover.<ext>`. */
function nombrePortadaDelFrontMatter(parsed) {
  const local = String(parsed.coverLocalName ?? "").trim();
  if (local) return path.basename(local);
  const imagen = String(parsed.coverImage ?? "").trim();
  if (imagen.startsWith("./assets/")) return path.basename(imagen);
  return "";
}

/**
 * Fábrica del servidor. `puerto: 0` lo deja en un puerto efímero para tests.
 */
export function crearPanel({ root = ROOT, puerto = PUERTO } = {}) {
  // Espacio local para el estado del formulario; nunca es fuente del sitio.
  fs.mkdirSync(path.join(root, "tools", "borradores"), { recursive: true });
  const mutex = new Mutex();
  let token = null;
  // Token que una subida dejó sin efecto: permite distinguir 409 de "sin token".
  let tokenInvalido = "";
  const previews = new Map();

  function limpiarPreviews({ todo = false } = {}) {
    const ahora = Date.now();
    for (const [id, entrada] of previews) {
      const dentro = path.resolve(entrada.raiz).startsWith(path.resolve(TMP_BASE) + path.sep);
      const conPrefijo = path.basename(entrada.raiz).startsWith(PREVIEW_PREFIX);
      if (todo || ahora - entrada.creado > TTL_PREVIEW || !dentro || !conPrefijo) {
        if (dentro && conPrefijo && fs.existsSync(entrada.raiz)) {
          fs.rmSync(entrada.raiz, { recursive: true, force: true });
        }
        previews.delete(id);
      }
    }
    while (previews.size > MAX_PREVIEWS) {
      const masViejo = [...previews.entries()].sort((a, b) => a[1].creado - b[1].creado)[0];
      const entrada = masViejo[1];
      if (path.resolve(entrada.raiz).startsWith(path.resolve(TMP_BASE) + path.sep) &&
          path.basename(entrada.raiz).startsWith(PREVIEW_PREFIX) &&
          fs.existsSync(entrada.raiz)) {
        fs.rmSync(entrada.raiz, { recursive: true, force: true });
      }
      previews.delete(masViejo[0]);
    }
  }

  function estado() {
    return {
      ok: true,
      puerto,
      token: token
        ? { vigente: Date.now() - token.creado <= TTL_TOKEN, expiraEnMs: Math.max(0, TTL_TOKEN - (Date.now() - token.creado)), huella: token.huella }
        : null,
      vistasPrevias: [...previews.entries()].map(([id, p]) => ({ id, creado: p.creado, expiraEnMs: Math.max(0, TTL_PREVIEW - (Date.now() - p.creado)) })),
    };
  }

  async function simular() {
    return mutex.run(async () => {
      token = null;
      const antes = huella(root);
      const salidas = [];
      for (const script of IMPORTADORES) {
        const resultado = await ejecutarNode([script], { cwd: root });
        salidas.push({ script, ...resultado });
        if (resultado.code !== 0) {
          return {
            ok: false,
            sinCambios: antes === huella(root),
            token: null,
            salidas: salidas.map(recortarSalida),
            error: `${script} terminó con código ${resultado.code}`,
          };
        }
      }
      const despues = huella(root);
      const sinCambios = antes === despues;
      if (sinCambios) {
        token = { valor: crypto.randomUUID(), huella: antes, creado: Date.now() };
        tokenInvalido = "";
      }
      return {
        ok: true,
        sinCambios,
        token: sinCambios ? token.valor : null,
        salidas: salidas.map(recortarSalida),
        aviso: sinCambios
          ? "Simulación sin cambios: podés confirmar con APLICAR."
          : "La simulación modificó artefactos; no se emite token.",
      };
    });
  }

  async function aplicar(body) {
    if (body.confirmacion !== "APLICAR") {
      throw new HttpError(400, 'la confirmación debe ser exactamente "APLICAR"');
    }
    if (tokenInvalido && body.token === tokenInvalido) {
      throw new HttpError(409, "subieron archivos nuevos desde la simulación; volvé a simular");
    }
    if (!token || body.token !== token.valor) {
      throw new HttpError(400, "falta un token de simulación vigente");
    }
    if (Date.now() - token.creado > TTL_TOKEN) {
      token = null;
      throw new HttpError(400, "el token caducó (10 minutos); volvé a simular");
    }
    return mutex.run(async () => {
      if (!token || huella(root) !== token.huella) {
        token = null;
        throw new HttpError(409, "cambiaron las entradas o los artefactos; volvé a simular");
      }
      const activo = token;
      const salidas = [];
      for (const script of IMPORTADORES) {
        const resultado = await ejecutarNode([script, "--apply"], { cwd: root });
        salidas.push({ script, ...resultado });
        if (resultado.code !== 0) {
          token = null;
          return {
            ok: false,
            token: null,
            salidas: salidas.map(recortarSalida),
            error: `${script} terminó con código ${resultado.code}; revisá preguntas/ERRORES.txt o envios/ERRORES.txt`,
          };
        }
      }
      const chequeo = await ejecutarNode(["scripts/check-feeds.mjs"], { cwd: root });
      const feedsAlDia = chequeo.code === 0 && /Feeds al día\./.test(chequeo.stdout);
      token = null;
      return {
        ok: feedsAlDia,
        token: null,
        feedsAlDia,
        salidas: salidas.map(recortarSalida),
        chequeoFeeds: recortarSalida({ script: "scripts/check-feeds.mjs", ...chequeo }),
        aviso: feedsAlDia
          ? "Aplicado. Revisá editorialmente y desplegá manualmente con surge publish."
          : "Los importadores terminaron, pero check-feeds no dio «Feeds al día.».",
      };
    });
  }

  async function crearPreview() {
    return mutex.run(async () => {
      limpiarPreviews();
      if (previews.size >= MAX_PREVIEWS) {
        throw new HttpError(429, `hay ${MAX_PREVIEWS} vistas previas; esperá a que caduquen`);
      }
      const raiz = crearTemporal(PREVIEW_PREFIX);
      const sitio = path.join(raiz, "sitio");
      const entrada = path.join(raiz, "entrada");
      try {
        copiarSitio(root, sitio);
        fs.mkdirSync(path.join(entrada, "envios"), { recursive: true });
        fs.mkdirSync(path.join(entrada, "preguntas"), { recursive: true });
        fs.cpSync(path.join(root, "envios"), path.join(entrada, "envios"), { recursive: true });
        fs.cpSync(path.join(root, "preguntas"), path.join(entrada, "preguntas"), { recursive: true });

        // Cerrar SOLO la copia: las semanas abiertas con respuestas recibidas
        // se mueven a cerradas/ y se reescribe su estado. Nunca se toca la
        // semana real ni se archiva/borra ningún borrador.
        const abiertas = path.join(entrada, "preguntas", "abiertas");
        const cerradas = path.join(entrada, "preguntas", "cerradas");
        const cerradasAqui = [];
        fs.mkdirSync(cerradas, { recursive: true });
        for (const nombre of fs.readdirSync(abiertas).sort()) {
          if (!nombre.toLowerCase().endsWith(".md") || nombre.toLowerCase() === "readme.md") continue;
          const clave = nombre.slice(0, -3);
          if (!fs.existsSync(path.join(entrada, "preguntas", "respuestas", clave))) continue;
          const archivo = path.join(abiertas, nombre);
          const original = fs.readFileSync(archivo, "utf8");
          const modificado = original.replace(/^estado:\s*(?:"abierta"|'abierta'|abierta)\s*$/m, 'estado: "cerrada"');
          if (modificado === original) continue;
          escribirAtomico(path.join(cerradas, nombre), modificado);
          fs.rmSync(archivo);
          cerradasAqui.push(clave);

          // El manifiesto de la COPIA guardaba la huella del archivo abierta;
          // al cambiar el estado esa huella ya no coincide y el importador
          // rechazaría el lote. Se retira solo esa entrada en la copia.
          const manifiesto = path.join(sitio, "scripts", ".preguntas-importadas.json");
          if (fs.existsSync(manifiesto)) {
            const datos = JSON.parse(fs.readFileSync(manifiesto, "utf8"));
            delete datos[`pregunta:${clave}`];
            escribirAtomico(manifiesto, `${JSON.stringify(datos, null, 2)}\n`);
          }
        }

        const salidas = [];
        for (const [script, input] of [
          [IMPORTADORES[0], path.join(entrada, "envios")],
          [IMPORTADORES[1], path.join(entrada, "preguntas")],
        ]) {
          const resultado = await ejecutarNode([script, "--apply", "--input", input], { cwd: sitio });
          salidas.push({ script, ...resultado });
          if (resultado.code !== 0) {
            throw new HttpError(500, `${script} falló en la copia: ${recortarSalida(resultado).stderr || "sin detalle"}`);
          }
        }

        const id = path.basename(raiz);
        previews.set(id, { raiz, dir: sitio, creado: Date.now() });
        return {
          ok: true,
          id,
          vistas: vistasPreview(id, entrada).map((vista) => ({
            ...vista,
            url: `/__preview/${id}/index.html${vista.hash}`,
          })),
          cerradasEnCopia: cerradasAqui,
          salidas: salidas.map(recortarSalida),
          aviso: "Vista previa sobre una copia temporal: no se movió ni se cerró ninguna semana real.",
        };
      } catch (error) {
        if (fs.existsSync(raiz) && raiz.startsWith(path.resolve(TMP_BASE) + path.sep)) {
          fs.rmSync(raiz, { recursive: true, force: true });
        }
        throw error;
      }
    });
  }

  function servirPreview(req, res, pathname) {
    const partes = pathname.split("/").filter(Boolean);
    const id = partes[1] ?? "";
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new HttpError(403, "id de vista previa no válido");
    const vista = previews.get(id);
    if (!vista) throw new HttpError(403, "esa vista previa no existe");
    let base;
    try {
      base = fs.realpathSync(vista.dir);
    } catch {
      throw new HttpError(403, "la vista previa ya no está disponible");
    }
    const rel = partes.slice(2).join("/") || "index.html";
    let destino;
    try {
      destino = rutaDentroPreview(base, rel);
    } catch (error) {
      throw new HttpError(403, error.message);
    }
    if (!fs.existsSync(destino)) throw new HttpError(404, "archivo de vista previa no encontrado");
    let real;
    try {
      real = fs.realpathSync(destino);
    } catch {
      throw new HttpError(403, "ruta de vista previa no válida");
    }
    if (real !== base && !real.startsWith(base + path.sep)) {
      throw new HttpError(403, "la ruta sale de la vista previa");
    }
    return servirArchivo(res, real);
  }

  const estaticos = {
    "/": path.join(PANEL, "index.html"),
    "/index.html": path.join(PANEL, "index.html"),
    "/panel/app.js": path.join(PANEL, "app.js"),
    "/panel/panel.css": path.join(PANEL, "panel.css"),
    "/site/css/tokens.css": path.join(root, "css", "tokens.css"),
    // Único módulo JS del sitio expuesto al panel: el helper de Drive, que
    // se importa igual que en el editor para no duplicar la conversión.
    "/site/lib/document-embed.js": path.join(root, "js", "lib", "document-embed.js"),
  };

  const api = {
    "/api/salud": { GET: () => ({ ok: true, servicio: "panel-local", puerto: puerto || null }) },
    "/api/estado": {
      GET: () => ({
        ...estado(),
        catalogo: { categorias: SITE.categories, tipos: TEXT_TYPES },
        borradores: listarBorradores(root),
      }),
    },
    "/api/borradores": {
      GET: () => ({ ok: true, borradores: listarBorradores(root) }),
      POST: guardarBorrador,
      DELETE: borrarBorrador,
    },
    "/api/archivos": { POST: subirArchivos },
    "/api/simular": { POST: simular },
    "/api/aplicar": { POST: aplicar },
    "/api/preview": { POST: crearPreview },
  };

  async function guardarBorrador(body) {
    if (!body || typeof body !== "object") throw new HttpError(400, "se espera un objeto JSON");
    const tipo = String(body.tipo ?? "");
    if (tipo === "publicacion") {
      const pub = createPublication({
        ...body,
        kind: String(body.kind ?? "") === "oficial" ? "oficial" : "",
        documentUrl: String(body.documentUrl ?? ""),
        documentoPendiente: esSi(body.documentoPendiente) ? "si" : "",
        cover: body.cover && typeof body.cover === "object" ? { ...body.cover } : {},
      });
      const validacion = validarPublicacion(pub);
      if (validacion.errores.length) throw new HttpError(400, validacion.errores.join("; "));
      pub.documentoPendiente = validacion.documentoPendiente;
      const destino = rutaDentro(root, `envios/${pub.slug}.md`, ["envios"]);
      let portada = "";
      if (body.portada) {
        const { buffer, ext } = portadaDesdeDataUrl(body.portada);
        const nombre = `${pub.slug}-cover.${ext}`;
        escribirAtomico(rutaDentro(root, `envios/${nombre}`, ["envios"]), buffer);
        pub.coverLocalName = nombre;
        pub.coverImage = `./assets/${nombre}`;
        portada = `envios/${nombre}`;
      }
      escribirAtomico(destino, toFrontMatter(pub));
      return { ok: true, archivo: `envios/${pub.slug}.md`, portada, aviso: "Borrador guardado; todavía no está publicado." };
    }
    if (tipo === "pregunta") {
      const pregunta = {
        week: String(body.week ?? "").trim(),
        slug: String(body.slug ?? "").trim(),
        estado: String(body.estado ?? "").trim(),
        question: String(body.question ?? ""),
        context: String(body.context ?? ""),
        note: String(body.note ?? ""),
        closing: String(body.closing ?? ""),
        cover: String(body.cover ?? ""),
        unidad: String(body.unidad ?? ""),
        content: String(body.content ?? ""),
      };
      const errores = validarPregunta(pregunta);
      if (errores.length) throw new HttpError(400, errores.join("; "));
      const subdir = pregunta.estado === "abierta" ? "abiertas" : "cerradas";
      const archivo = `preguntas/${subdir}/${pregunta.week}-${pregunta.slug}.md`;
      escribirAtomico(rutaDentro(root, archivo, ["preguntas"]), serializarPregunta(pregunta));
      return { ok: true, archivo, aviso: "Borrador guardado; todavía no está publicado." };
    }
    if (tipo === "respuesta") {
      const respuesta = {
        week: String(body.week ?? "").trim(),
        slug: String(body.slug ?? "").trim(),
        author: String(body.author ?? "").trim(),
        authorization: String(body.authorization ?? "").trim(),
        city: String(body.city ?? "").trim(),
        email: String(body.email ?? "").trim(),
        publicarEmail: String(body.publicarEmail ?? "").trim(),
        content: String(body.content ?? ""),
      };
      const errores = validarRespuesta({ ...respuesta, publicar: body.publicar === true });
      if (errores.length) throw new HttpError(400, errores.join("; "));
      const autorSlugValor = autorSlug(String(body.autorSlug || respuesta.author));
      if (!autorSlugValor) throw new HttpError(400, "no se pudo derivar un autor-slug válido");
      const archivo = `preguntas/respuestas/${respuesta.week}-${respuesta.slug}/${autorSlugValor}.md`;
      escribirAtomico(rutaDentro(root, archivo, ["preguntas"]), serializarRespuesta(respuesta));
      return { ok: true, archivo, aviso: "Borrador guardado; todavía no está publicado." };
    }
    throw new HttpError(400, `tipo desconocido: "${tipo}" (usa publicacion, pregunta o respuesta)`);
  }

  /**
   * Subida de archivos del participante. Misma exclusión mutua que simular,
   * aplicar y preview; ninguna escritura ocurre antes de validar el lote.
   */
  async function subirArchivos(body) {
    return mutex.run(async () => {
      // Toda subida (incluso una rechazada) deja sin efecto un token previo.
      tokenInvalido = token?.valor ?? "";
      token = null;
      const tipo = String(body?.tipo ?? "");
      if (!["publicacion", "pregunta", "respuesta"].includes(tipo)) {
        throw new HttpError(400, `tipo desconocido: "${tipo}"`);
      }
      const entradas = Array.isArray(body?.archivos) ? body.archivos : [];
      if (!entradas.length) throw new HttpError(400, "no se enviaron archivos");

      const textos = [];
      const imagenes = [];
      for (const entrada of entradas) {
        const nombre = validarNombreEntrante(entrada?.nombre);
        if (/\.md$/i.test(nombre)) {
          const contenido = String(entrada.contenido ?? "");
          const bytes = Buffer.byteLength(contenido, "utf8");
          if (bytes > MD_MAX_BYTES) throw new HttpError(413, `${nombre}: el Markdown supera 512 KiB`);
          textos.push({ nombre, contenido, bytes });
        } else if (/\.(jpe?g|png|webp)$/i.test(nombre)) {
          const { buffer, ext } = portadaDesdeDataUrl(entrada.dataUrl);
          if (buffer.length > IMAGEN_MAX_BYTES) {
            throw new HttpError(413, `${nombre}: la imagen supera 2 MiB`);
          }
          const extension = path.extname(nombre).slice(1).toLowerCase();
          if (ext !== (extension === "jpeg" ? "jpg" : extension)) {
            throw new HttpError(400, `${nombre}: la extensión no coincide con los bytes de la imagen`);
          }
          imagenes.push({ nombre, buffer });
        } else {
          throw new HttpError(400, `${nombre}: tipo no admitido (use .md, JPG, PNG o WebP)`);
        }
      }
      if (!textos.length) throw new HttpError(400, "no se envió ningún archivo .md");
      if (tipo !== "publicacion" && imagenes.length) {
        throw new HttpError(400, "las portadas solo acompañan a una publicación");
      }

      // `validateSubmission` busca la portada junto al .md: se valida en un
      // temporal y solo después se escribe en la carpeta canónica.
      const staging = crearTemporal("blogfilosofico-archivos-");
      try {
        for (const imagen of imagenes) {
          escribirAtomico(path.join(staging, imagen.nombre), imagen.buffer);
        }
        const escrituras = [];
        const vistos = new Set();
        for (const item of textos) {
          const hash = sha256Texto(Buffer.from(item.contenido, "utf8"));
          if (tipo === "publicacion") {
            const parsed = parseSubmission(item.contenido, item.nombre);
            const pub = {
              title: parsed.title,
              slug: parsed.slug,
              description: parsed.description,
              category: parsed.category,
              types: parsed.types,
              author: parsed.author,
              coverImage: parsed.coverImage,
              createdAt: parsed.createdAt,
              kind: parsed.kind,
              documentUrl: parsed.documentUrl,
              documentoPendiente: /^(si|sí)$/i.test(parsed.documentoPendiente) ? "si" : "",
              cover: parsed.cover ?? {},
            };
            const previos = validarPublicacion(pub).errores;
            if (previos.length) throw new HttpError(400, `${item.nombre}: ${previos.join("; ")}`);
            const manifest = leerManifiesto(root, "scripts/.importados.json");
            if (manifest[parsed.slug]?.sha256 === hash) {
              throw new HttpError(400, `${item.nombre}: ya importada; se omite`);
            }
            const errores = validateSubmission(parsed, {
              root,
              inputDir: staging,
              articles: ARTICLES,
              manifest,
              site: SITE,
              sections: SECTIONS,
              batchSlugs: vistos,
              batchHashes: new Map(),
              sha256: hash,
              mdBytes: item.bytes,
            });
            if (errores.length) throw new HttpError(400, errores.join("; "));

            const nombreCover = nombrePortadaDelFrontMatter(parsed);
            let portada = null;
            if (nombreCover) {
              validarNombreEntrante(nombreCover);
              const imagen = imagenes.find((entrada) => entrada.nombre === nombreCover);
              if (!imagen) {
                throw new HttpError(400, `${item.nombre}: falta la imagen "${nombreCover}" declarada en el front matter`);
              }
              const destinoCover = rutaDentro(root, `envios/${nombreCover}`, ["envios"]);
              if (fs.existsSync(destinoCover)) {
                throw new HttpError(400, `ya existe la portada "envios/${nombreCover}"`);
              }
              portada = { destino: destinoCover, buffer: imagen.buffer, rel: `envios/${nombreCover}` };
            }
            const rel = `envios/${parsed.slug}.md`;
            const destino = rutaDentro(root, rel, ["envios"]);
            if (fs.existsSync(destino)) throw new HttpError(400, `ya existe el borrador "${rel}"`);
            vistos.add(parsed.slug);
            escrituras.push({ rel, destino, contenido: item.contenido, portada });
          } else if (tipo === "pregunta") {
            const parsed = parseQuestion(item.contenido, item.nombre);
            const previos = validarPregunta(parsed);
            if (previos.length) throw new HttpError(400, `${item.nombre}: ${previos.join("; ")}`);
            const clave = `${parsed.week}-${parsed.slug}`;
            const manifest = leerManifiesto(root, "scripts/.preguntas-importadas.json");
            if (manifest[`pregunta:${clave}`]?.sha256 === hash) {
              throw new HttpError(400, `${item.nombre}: ya importada; se omite`);
            }
            const errores = validateQuestion(parsed, { mdBytes: item.bytes });
            if (errores.length) throw new HttpError(400, errores.join("; "));
            const subdir = parsed.estado === "abierta" ? "abiertas" : "cerradas";
            const rel = `preguntas/${subdir}/${clave}.md`;
            const destino = rutaDentro(root, rel, ["preguntas"]);
            if (fs.existsSync(destino)) throw new HttpError(400, `ya existe el borrador "${rel}"`);
            escrituras.push({ rel, destino, contenido: item.contenido });
          } else {
            // El autor-slug se deriva del NOMBRE DEL ARCHIVO, no del front matter.
            const autorSlugArchivo = path.basename(item.nombre, path.extname(item.nombre));
            if (!AUTOR_SLUG_RE.test(autorSlugArchivo)) {
              throw new HttpError(400, `nombre de respuesta no seguro: "${item.nombre}" (use autor-slug en minúsculas)`);
            }
            let parsed = parseResponse(item.contenido, item.nombre, "");
            const clave = `${parsed.week}-${parsed.slug}`;
            parsed = parseResponse(item.contenido, item.nombre, clave);
            const previos = validarRespuesta(parsed);
            if (previos.length) throw new HttpError(400, `${item.nombre}: ${previos.join("; ")}`);
            const manifest = leerManifiesto(root, "scripts/.preguntas-importadas.json");
            if (manifest[`respuesta:${clave}/${autorSlugArchivo}`]?.sha256 === hash) {
              throw new HttpError(400, `${item.nombre}: ya importada; se omite`);
            }
            const closedKeys = new Set();
            const cerradas = path.join(root, "preguntas", "cerradas");
            if (fs.existsSync(cerradas) && fs.statSync(cerradas).isDirectory()) {
              for (const nombre of fs.readdirSync(cerradas).filter((n) => n.toLowerCase().endsWith(".md"))) {
                const pregunta = parseQuestion(fs.readFileSync(path.join(cerradas, nombre), "utf8"), nombre);
                closedKeys.add(`${pregunta.week}-${pregunta.slug}`);
              }
            }
            const errores = validateResponse(parsed, { mdBytes: item.bytes, closedKeys });
            if (errores.length) throw new HttpError(400, errores.join("; "));
            const rel = `preguntas/respuestas/${clave}/${autorSlugArchivo}.md`;
            const destino = rutaDentro(root, rel, ["preguntas"]);
            if (fs.existsSync(destino)) throw new HttpError(400, `ya existe el borrador "${rel}"`);
            escrituras.push({ rel, destino, contenido: item.contenido });
          }
        }
        for (const escritura of escrituras) {
          if (escritura.portada) {
            escribirAtomico(escritura.portada.destino, escritura.portada.buffer);
          }
          escribirAtomico(escritura.destino, escritura.contenido);
        }
        return {
          ok: true,
          guardados: escrituras.map((e) => e.rel),
          aviso: "Archivos del participante guardados. Simulá y confirmá antes de aplicar; guardar no publica.",
        };
      } finally {
        if (fs.existsSync(staging) && staging.startsWith(path.resolve(TMP_BASE) + path.sep)) {
          fs.rmSync(staging, { recursive: true, force: true });
        }
      }
    });
  }

  async function borrarBorrador(body) {
    const archivo = String(body.archivo ?? "");
    const destino = rutaDentro(root, archivo);
    if (!fs.existsSync(destino) || !fs.statSync(destino).isFile()) {
      throw new HttpError(404, "el borrador no existe");
    }
    fs.rmSync(destino);
    return { ok: true, eliminado: archivo };
  }

  async function manejar(req, res) {
    let url;
    try {
      url = new URL(req.url ?? "/", "http://127.0.0.1");
    } catch {
      throw new HttpError(400, "URL no válida");
    }
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      throw new HttpError(400, "ruta no válida");
    }
    const metodo = req.method ?? "GET";

    if (pathname.startsWith("/__preview/")) {
      if (metodo !== "GET") throw new HttpError(405, "solo GET en /__preview/*");
      return servirPreview(req, res, pathname);
    }
    if (Object.hasOwn(api, pathname)) {
      const permitidos = api[pathname];
      if (!Object.hasOwn(permitidos, metodo)) throw new HttpError(405, `método ${metodo} no permitido en ${pathname}`);
      const body = metodo === "GET" ? null : await leerJson(req);
      const datos = await permitidos[metodo](body);
      return json(res, 200, datos);
    }
    if (metodo === "GET" && Object.hasOwn(estaticos, pathname)) {
      return servirArchivo(res, estaticos[pathname]);
    }
    // Lista de denegación explícita + fallback: nada más se sirve desde aquí.
    throw new HttpError(403, `ruta no disponible en el panel local: ${pathname}`);
  }

  const servidor = http.createServer((req, res) => {
    manejar(req, res).catch((error) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      json(res, error instanceof HttpError ? error.status : 500, {
        ok: false,
        error: error instanceof HttpError ? error.message : `error interno: ${error.message}`,
      });
    });
  });

  function iniciar() {
    return new Promise((resolve, reject) => {
      const fallo = (error) => {
        if (error?.code === "EADDRINUSE") {
          reject(new Error(`el puerto ${puerto} ya está en uso; cambiá BLOG_PANEL_PORT (el servidor 8080 no se toca)`));
        } else {
          reject(error);
        }
      };
      servidor.once("error", fallo);
      servidor.listen(puerto, "127.0.0.1", () => {
        servidor.off("error", fallo);
        resolve(servidor.address());
      });
    });
  }

  async function cerrar() {
    limpiarPreviews({ todo: true });
    return new Promise((resolve) => servidor.close(() => resolve()));
  }

  return { servidor, iniciar, cerrar, estado, simular, aplicar, crearPreview, limpiarPreviews };
}

function recortarSalida(resultado) {
  return {
    script: resultado.script,
    code: resultado.code,
    stdout: String(resultado.stdout ?? "").slice(-4000),
    stderr: String(resultado.stderr ?? "").slice(-4000),
  };
}

/** Vistas iniciales de una preview, derivadas de la copia (nunca de lo real). */
function vistasPreview(id, entrada) {
  const vistas = [{ etiqueta: "Pregunta de la semana", hash: "#/pregunta" }];
  const preguntas = path.join(entrada, "preguntas");
  for (const subdir of ["abiertas", "cerradas"]) {
    const dir = path.join(preguntas, subdir);
    if (!fs.existsSync(dir)) continue;
    for (const nombre of fs.readdirSync(dir).sort()) {
      if (!nombre.toLowerCase().endsWith(".md")) continue;
      try {
        const q = parseQuestion(fs.readFileSync(path.join(dir, nombre), "utf8"), nombre);
        vistas.push({ etiqueta: `Unidad ${q.week}`, hash: `#/articulos/${unitSlug(q)}` });
      } catch {
        // Una pregunta inválida en la copia no debe romper la vista previa.
      }
    }
  }
  const envios = path.join(entrada, "envios");
  if (fs.existsSync(envios)) {
    for (const nombre of fs.readdirSync(envios).sort()) {
      if (!nombre.toLowerCase().endsWith(".md") || nombre.toLowerCase() === "readme.md") continue;
      try {
        const pub = parseSubmission(fs.readFileSync(path.join(envios, nombre), "utf8"), nombre);
        vistas.push({ etiqueta: `Publicación "${pub.title}"`, hash: `#/articulos/${pub.slug}` });
      } catch {
        // Ídem: se omiten entradas que el importador ya reportaría.
      }
    }
  }
  return vistas.slice(0, 8);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const puertoEnv = Number(process.env.BLOG_PANEL_PORT ?? PUERTO);
  const puerto = Number.isInteger(puertoEnv) && puertoEnv >= 0 && puertoEnv <= 65535 ? puertoEnv : PUERTO;
  const panel = crearPanel({ root: ROOT, puerto });
  panel.iniciar().then(
    (direccion) => {
      console.log(`Panel local de desarrollo: http://127.0.0.1:${direccion.port}/`);
      console.log("Solo en este equipo. Guardar no publica; aplicar no despliega.");
    },
    (error) => {
      console.error(`No se pudo iniciar el panel: ${error.message}`);
      process.exitCode = 1;
    }
  );
  let cerrando = false;
  const salir = async () => {
    if (cerrando) return;
    cerrando = true;
    await panel.cerrar();
  };
  process.on("SIGINT", salir);
  process.on("SIGTERM", salir);
}
