#!/usr/bin/env node
/**
 * import-submissions.mjs — Incorpora aportaciones recibidas por correo.
 *
 * Node >= 22, sin dependencias y sin acceso a la red. Las aportaciones llegan
 * como `.md` (con el front matter que emite `js/lib/publication.js`) y, si
 * corresponde, con una imagen local a su lado. Este script valida el lote
 * completo, genera `js/data/contributions.js`, copia la portada a `assets/`,
 * actualiza `scripts/.importados.json` y regenera `feed.xml` / `sitemap.xml`.
 *
 * Por defecto solo SIMULA: no escribe ningún artefacto. Con `--apply` valida
 * todo, escribe en `scripts/.staging-<pid>/` con copias de seguridad y solo al
 * final renombra a destino; si falla algo, restaura los originales.
 *
 *   node scripts/import-submissions.mjs
 *   node scripts/import-submissions.mjs --apply
 *   node scripts/import-submissions.mjs --input tests/fixtures/submissions
 *
 * La decisión de publicar y el despliegue siguen siendo manuales.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ARTICLES } from "../js/data/articles.js";
import { CONTRIBUTIONS } from "../js/data/contributions.js";
import { SITE } from "../js/data/config.js";
import { SECTIONS } from "../js/data/sections.js";
import { estimateReadingTime } from "../js/lib/publication.js";
import { buildFeedXml, buildSitemapXml } from "./generate-feeds.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MD_MAX_BYTES = 512 * 1024;
const COVER_MAX_BYTES = 2 * 1024 * 1024;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REQUIRED_KEYS = new Set([
  "title", "slug", "description", "category", "types", "author", "coverImage", "createdAt",
]);
// Extensiones OPCIONALES para migraciones/importaciones avanzadas: el editor no
// las emite. `cover` conserva alt/crédito/numeral/paleta; `id`, `tags` y
// `readingTime` permiten migrar publicaciones existentes sin perder metadatos.
const OPTIONAL_KEYS = new Set(["cover", "id", "tags", "readingTime"]);
const ALLOWED_KEYS = new Set([...REQUIRED_KEYS, ...OPTIONAL_KEYS]);
const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp"]);
const REMOTE_COVER_RE = /^https?:\/\//i;
const LOCAL_COMMENT_RE = /^#\s*Imagen local pendiente:\s*copiar\s+"([^"]+)"\s+a la carpeta assets\//;

/** Huella de un archivo: identifica una aportación ya importada. */
function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/** Parsea SOLO el front matter que escribe `publication.js:92-109`. */
export function parseSubmission(md, file = "aportacion.md") {
  const text = String(md ?? "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  if (lines[0] !== "---") {
    throw new Error("falta el front matter: la primera línea debe ser `---`");
  }
  const end = lines.indexOf("---", 1);
  if (end === -1) {
    throw new Error("falta el cierre del front matter (segunda línea `---`)");
  }

  const data = {};
  for (let i = 1; i < end; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const comment = raw.match(LOCAL_COMMENT_RE);
    if (comment) {
      if (data.coverLocalName) throw new Error("hay más de una línea de imagen local pendiente");
      data.coverLocalName = comment[1];
      continue;
    }
    if (raw.startsWith("#")) {
      throw new Error(`comentario de front matter no reconocido en la línea ${i + 1}: "${raw}"`);
    }
    const pair = raw.match(/^([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!pair) throw new Error(`línea de front matter no reconocida (${i + 1}): "${raw}"`);
    const [, key, value] = pair;
    if (!ALLOWED_KEYS.has(key)) throw new Error(`clave de front matter no permitida: "${key}"`);
    if (Object.hasOwn(data, key)) throw new Error(`clave repetida en el front matter: "${key}"`);
    data[key] = value.trim();
  }

  for (const key of REQUIRED_KEYS) {
    if (!Object.hasOwn(data, key)) throw new Error(`falta la clave obligatoria "${key}" en el front matter`);
  }

  const scalar = (key) => {
    const raw = data[key];
    if (!raw) return "";
    if (raw.startsWith('"')) {
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed !== "string") throw new Error("no es texto");
        return parsed;
      } catch {
        throw new Error(`valor no válido para "${key}": se esperaba texto entre comillas`);
      }
    }
    return raw;
  };

  let types;
  try {
    types = JSON.parse(data.types);
  } catch {
    throw new Error('el campo "types" debe ser una lista JSON, p. ej. ["Ensayo"]');
  }
  if (!Array.isArray(types) || types.some((type) => typeof type !== "string")) {
    throw new Error('el campo "types" debe ser una lista de textos');
  }

  let cover = null;
  if (Object.hasOwn(data, "cover")) {
    try {
      cover = JSON.parse(data.cover);
    } catch {
      throw new Error('el campo "cover" debe ser un objeto JSON de una sola línea');
    }
    if (!cover || typeof cover !== "object" || Array.isArray(cover)) {
      throw new Error('el campo "cover" debe ser un objeto JSON de una sola línea');
    }
  }

  // Claves opcionales de migración: no las escribe el editor.
  const id = Object.hasOwn(data, "id") ? scalar("id") : "";
  let tags = null;
  if (Object.hasOwn(data, "tags")) {
    try {
      tags = JSON.parse(data.tags);
    } catch {
      throw new Error('el campo "tags" debe ser una lista JSON de textos');
    }
    if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== "string")) {
      throw new Error('el campo "tags" debe ser una lista JSON de textos');
    }
  }
  let readingTime = null;
  if (Object.hasOwn(data, "readingTime")) {
    const rawTime = data.readingTime;
    const value = Number(rawTime);
    if (!/^\d+$/.test(rawTime) || !Number.isInteger(value) || value < 1) {
      throw new Error('el campo "readingTime" debe ser un entero positivo');
    }
    readingTime = value;
  }

  return {
    file,
    title: scalar("title"),
    slug: scalar("slug"),
    description: scalar("description"),
    category: scalar("category"),
    types,
    author: scalar("author"),
    coverImage: scalar("coverImage"),
    createdAt: scalar("createdAt"),
    coverLocalName: data.coverLocalName || "",
    cover,
    id,
    tags,
    readingTime,
    content: lines.slice(end + 1).join("\n"),
    meta: null,
  };
}

/** Valida el nombre recibido y devuelve el destino seguro dentro de `assets/`. */
export function safeCoverName(name, slug) {
  const raw = String(name ?? "").trim();
  if (!raw) throw new Error("falta el nombre de la imagen local");
  if (
    raw.includes("/") ||
    raw.includes("\\") ||
    raw.includes("..") ||
    path.isAbsolute(raw) ||
    /^[A-Za-z]:/.test(raw) ||
    /[\u0000-\u001f]/.test(raw)
  ) {
    throw new Error(`nombre de imagen no seguro: "${raw}" (sin rutas ni "..")`);
  }
  const ext = path.extname(raw).slice(1).toLowerCase();
  if (!IMAGE_EXTS.has(ext)) {
    throw new Error(`formato de imagen no admitido: ".${ext || "?"}" (usa JPG, JPEG, PNG o WebP; no SVG)`);
  }
  return `${slug}-cover.${ext}`;
}

/** Comprueba extensión y bytes mágicos; devuelve la familia detectada. */
function coverFamily(buffer, ext) {
  if (ext === "jpg" || ext === "jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
      ? "jpeg"
      : null;
  }
  if (ext === "png") {
    const magic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return buffer.length >= magic.length && buffer.subarray(0, magic.length).equals(magic) ? "png" : null;
  }
  if (ext === "webp") {
    return buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP"
      ? "webp"
      : null;
  }
  return null;
}

/**
 * Valida una aportación contra el catálogo, el manifiesto y el lote.
 * Devuelve una lista de-motivos en español y deja en `parsed.meta` los datos
 * necesarios para construir la publicación.
 */
export function validateSubmission(parsed, ctx) {
  const errors = [];
  const { root, inputDir, articles, manifest, batchSlugs, batchHashes, sha256: hash, mdBytes } = ctx;
  const push = (message) => errors.push(`${parsed.file}: ${message}`);

  if (mdBytes > MD_MAX_BYTES) push(`el Markdown pesa ${mdBytes} bytes (máximo ${MD_MAX_BYTES})`);
  if (!parsed.title.trim()) push("el título está vacío");
  if (!SLUG_RE.test(parsed.slug) || parsed.slug.length > 60) {
    push(`el slug "${parsed.slug}" no es válido (minúsculas, números y guiones; máximo 60 caracteres)`);
  }
  if (parsed.id && (typeof parsed.id !== "string" || !parsed.id.trim())) {
    push('el campo opcional "id" debe ser un texto no vacío');
  }
  if (parsed.tags != null && (!Array.isArray(parsed.tags) || parsed.tags.some((tag) => typeof tag !== "string"))) {
    push('el campo opcional "tags" debe ser una lista de textos');
  }
  if (parsed.readingTime != null && (!Number.isInteger(parsed.readingTime) || parsed.readingTime < 1)) {
    push('el campo opcional "readingTime" debe ser un entero positivo');
  }

  // ISO estricta: new Date() normaliza 2026-02-30 a marzo, así que se compara
  // la fecha UTC reconstruida con el valor literal.
  const date = new Date(`${parsed.createdAt}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(parsed.createdAt) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== parsed.createdAt
  ) {
    push(`createdAt "${parsed.createdAt}" no es una fecha ISO válida`);
  }

  const categoryAllowed = new Set([
    ...ctx.site.categories,
    ...ctx.sections.flatMap((section) => [section.name, ...(section.aliases ?? [])]),
  ].map((value) => value.toLowerCase()));
  const category = categoryAllowed.has(parsed.category.trim().toLowerCase());
  if (!category) push(`la categoría "${parsed.category}" no está en el catálogo de secciones`);

  const typeAllowed = new Map();
  for (const section of ctx.sections.filter((item) => item.group === "tipo")) {
    for (const name of [section.name, ...(section.aliases ?? [])]) {
      typeAllowed.set(name.toLowerCase(), section.name);
    }
  }
  const types = [];
  for (const type of parsed.types) {
    const canonical = typeAllowed.get(String(type).trim().toLowerCase());
    if (!canonical) push(`el tipo de texto "${type}" no está en TEXT_TYPES`);
    else if (!types.includes(canonical)) types.push(canonical);
  }

  // Duplicados: huella conocida → se omite; slug conocido con otra huella → error.
  const hashOwner = new Map(Object.entries(manifest).map(([slug, entry]) => [entry?.sha256, slug]));
  const known = hashOwner.get(hash);
  if (known && known !== parsed.slug) {
    push(`el contenido ya fue importado como "${known}"; se omite la copia duplicada`);
  }
  if (manifest[parsed.slug] && manifest[parsed.slug].sha256 !== hash) {
    push(`el slug "${parsed.slug}" ya está en el manifiesto con otra huella; no se puede sobrescribir`);
  }
  if (articles.some((article) => article.slug === parsed.slug)) {
    push(`el slug "${parsed.slug}" ya está publicado en ARTICLES`);
  }
  if (batchSlugs.has(parsed.slug)) push(`el slug "${parsed.slug}" se repite en el lote`);
  if (batchHashes.has(hash)) push(`el contenido se repite en el lote (${batchHashes.get(hash)})`);

  const meta = { types, coverImage: "", coverFile: null, coverDest: "", sha256: hash };
  const localName = parsed.coverLocalName ||
    (parsed.coverImage.startsWith("./assets/") ? path.basename(parsed.coverImage) : "");

  if (localName) {
    let dest;
    try {
      dest = safeCoverName(localName, parsed.slug);
    } catch (error) {
      push(error.message);
    }
    if (dest) {
      const source = path.join(inputDir, path.basename(localName));
      if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
        push(`no se encontró la imagen adjunta "${localName}" junto al Markdown`);
      } else {
        const buffer = fs.readFileSync(source);
        if (buffer.length > COVER_MAX_BYTES) {
          push(`la portada pesa ${buffer.length} bytes (máximo ${COVER_MAX_BYTES})`);
        } else {
          const ext = dest.slice(dest.lastIndexOf(".") + 1);
          if (!coverFamily(buffer, ext)) {
            push(`la portada "${localName}" no coincide con su extensión .${ext} o no es JPG/PNG/WebP válida`);
          } else {
            meta.coverFile = source;
            meta.coverBuffer = buffer;
            meta.coverDest = dest;
            meta.coverImage = `./assets/${dest}`;
          }
        }
      }
    }
  } else if (REMOTE_COVER_RE.test(parsed.coverImage)) {
    meta.coverImage = parsed.coverImage;
  } else if (parsed.coverImage) {
    push(`coverImage "${parsed.coverImage}" no es reconocida (URL http(s), ./assets/… o vacía)`);
  }

  parsed.meta = meta;
  return errors;
}

/** Escapa un cuerpo Markdown para usarlo dentro de un template literal. */
export function escapeTemplateLiteral(body) {
  return String(body ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

/** Construye el objeto que se concatena a ARTICLES. */
export function buildContribution(parsed, meta) {
  return {
    id: parsed.id || parsed.slug,
    slug: parsed.slug,
    title: parsed.title.trim(),
    description: parsed.description.trim(),
    category: parsed.category.trim(),
    types: meta.types,
    author: parsed.author.trim(),
    coverImage: meta.coverImage,
    ...(parsed.cover ? { cover: parsed.cover } : {}),
    content: parsed.content,
    createdAt: parsed.createdAt,
    readingTime: parsed.readingTime ?? estimateReadingTime(parsed.content),
    tags: parsed.tags ?? [],
  };
}

/** Genera el módulo `CONTRIBUTIONS` con el contenido debidamente escapado. */
export function generateModule(list = []) {
  const header = [
    "/**",
    " * contributions.js — PUBLICACIONES INCORPORADAS POR EL IMPORTADOR LOCAL.",
    " *",
    " * Archivo GENERADO por `node scripts/import-submissions.mjs --apply`.",
    " * No editar a mano: las aportaciones llegan por correo, se guardan en `envios/`,",
    " * se validan con el importador y se revisan editorialmente antes de publicar.",
    " * `js/data/articles.js` concatena este arreglo al final de `ARTICLES`.",
    " */",
    "",
  ].join("\n");

  if (!list.length) {
    return `${header}export const CONTRIBUTIONS = [];\n`;
  }

  const entries = list.map((article) => {
    const fields = Object.entries(article).map(([key, value]) => {
      if (key === "content") {
        return `    content: \`${escapeTemplateLiteral(value)}\`,`;
      }
      const name = /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
      return `    ${name}: ${JSON.stringify(value)},`;
    });
    return ["  {", ...fields, "  },"].join("\n");
  });
  return `${header}export const CONTRIBUTIONS = [\n${entries.join("\n")}\n];\n`;
}

/**
 * ¿Cambiaría el archivo? Misma comparación byte a byte que `writeIfChanged`
 * (`scripts/generate-feeds.mjs:93-99`), pero sin escribir: en el importador la
 * escritura la hace `commitStaged`, al final y de forma reversible.
 */
function changedSince(root, filename, content) {
  const target = path.join(root, filename);
  if (!fs.existsSync(target)) return true;
  return !fs.readFileSync(target).equals(Buffer.from(content));
}

/** Solo `--apply` escribe el informe: la simulación no toca ningún archivo. */
function writeErrorReport(root, errors, apply) {
  if (!apply) return;
  const target = path.join(root, "envios", "ERRORES.txt");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    ["Errores al importar aportaciones:", "", ...errors.map((error) => `- ${error}`), ""].join("\n"),
    "utf8"
  );
  console.error(`Se escribió ${path.relative(root, target)} con ${errors.length} error(es).`);
}

/** Mueve el lote validado a su destino; revierte desde las copias si falla. */
function commitStaged(root, files, staging) {
  const backupDir = path.join(staging, "backup");
  const newDir = path.join(staging, "new");
  fs.mkdirSync(backupDir, { recursive: true });
  fs.mkdirSync(newDir, { recursive: true });

  const planned = [];
  for (const file of files) {
    const target = path.join(root, file.rel);
    const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, "utf8");
    const previous = fs.existsSync(target) ? fs.readFileSync(target) : null;
    if (previous && previous.equals(content)) continue;
    const staged = path.join(newDir, file.rel);
    fs.mkdirSync(path.dirname(staged), { recursive: true });
    fs.writeFileSync(staged, content);
    if (previous) {
      const backup = path.join(backupDir, file.rel);
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.writeFileSync(backup, previous);
    }
    planned.push({ rel: file.rel, staged, target, content, source: file.source ?? null });
  }

  const written = [];
  try {
    for (const item of planned) {
      fs.mkdirSync(path.dirname(item.target), { recursive: true });
      fs.renameSync(item.staged, item.target);
      written.push(item);
    }
    // Los originales se archivan en envios/importadas/<slug>/: el archivo
    // destino ya existe, así que aquí solo se retira la copia de entrada.
    for (const item of written) {
      if (item.source && fs.existsSync(item.source)) fs.rmSync(item.source);
    }
  } catch (error) {
    for (const item of written.reverse()) {
      const backup = path.join(backupDir, item.rel);
      if (fs.existsSync(backup)) fs.copyFileSync(backup, item.target);
      else if (fs.existsSync(item.target)) fs.rmSync(item.target);
      if (item.source && !fs.existsSync(item.source)) fs.writeFileSync(item.source, item.content);
    }
    throw error;
  }
  return planned.map((item) => item.rel);
}

/** Canal de entrada → artefactos del sitio. Sin red, sin publicación automática. */
export async function importSubmissions({
  root = ROOT,
  inputDir = path.join(root, "envios"),
  apply = false,
  now = new Date().toISOString(),
} = {}) {
  // En simulación los errores se informan, pero no se genera ERRORES.txt.
  const logError = (message) => (apply ? console.error : console.log)(message);
  if (!fs.existsSync(inputDir) || !fs.statSync(inputDir).isDirectory()) {
    const message = `la carpeta de entrada no existe: ${inputDir}`;
    logError(message);
    writeErrorReport(root, [message], apply);
    return { ok: false, errors: [message], imported: [], skipped: [] };
  }

  const manifestFile = path.join(root, "scripts", ".importados.json");
  let manifest = {};
  if (fs.existsSync(manifestFile)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
      if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
        throw new Error("no es un objeto");
      }
    } catch (error) {
      const message = `scripts/.importados.json no es válido: ${error.message}`;
      logError(message);
      writeErrorReport(root, [message], apply);
      return { ok: false, errors: [message], imported: [], skipped: [] };
    }
  }

  const mdFiles = fs
    .readdirSync(inputDir)
    .filter((name) => name.toLowerCase().endsWith(".md") && name.toLowerCase() !== "readme.md")
    .sort();
  const errors = [];
  const skipped = [];
  const imported = [];
  const batchSlugs = new Set();
  const batchHashes = new Map();
  const ctx = {
    root,
    inputDir,
    articles: ARTICLES,
    manifest,
    site: SITE,
    sections: SECTIONS,
    batchSlugs,
    batchHashes,
  };

  for (const file of mdFiles) {
    const buffer = fs.readFileSync(path.join(inputDir, file));
    const hash = sha256(buffer);
    const importedSlug = Object.keys(manifest).find((slug) => manifest[slug]?.sha256 === hash);
    if (importedSlug) {
      skipped.push(`${file}: ya importada; se omite`);
      console.log(`${file}: ya importada; se omite (${importedSlug})`);
      continue;
    }
    if (batchHashes.has(hash)) {
      skipped.push(`${file}: ya importada; se omite (en este lote: ${batchHashes.get(hash)})`);
      console.log(`${file}: ya importada; se omite (en este lote: ${batchHashes.get(hash)})`);
      continue;
    }

    let parsed;
    try {
      parsed = parseSubmission(buffer.toString("utf8"), file);
    } catch (error) {
      errors.push(`${file}: ${error.message}`);
      continue;
    }

    const found = validateSubmission(parsed, { ...ctx, sha256: hash, mdBytes: buffer.length });
    if (found.some((message) => message.includes("ya importado como"))) {
      skipped.push(`${file}: ya importada; se omite`);
      console.log(`${file}: ya importada; se omite`);
      continue;
    }
    if (found.length) {
      errors.push(...found);
      continue;
    }

    batchSlugs.add(parsed.slug);
    batchHashes.set(hash, file);
    imported.push({ parsed, meta: parsed.meta, mdBuffer: buffer, mdFile: file });
    console.log(`${file}: válida → ${parsed.slug}`);
  }

  if (errors.length) {
    for (const error of errors) logError(`ERROR ${error}`);
    writeErrorReport(root, errors, apply);
    return { ok: false, errors, imported: [], skipped };
  }

  if (!imported.length) {
    console.log("No hay aportaciones nuevas para importar.");
    return { ok: true, errors: [], imported: [], skipped };
  }

  const newArticles = imported.map(({ parsed, meta }) => buildContribution(parsed, meta));
  const nextManifest = { ...manifest };
  for (const { parsed, meta } of imported) {
    nextManifest[parsed.slug] = {
      sha256: meta.sha256,
      cover: meta.coverDest,
      importedAt: now,
    };
  }

  const files = [
    { rel: "js/data/contributions.js", content: generateModule([...CONTRIBUTIONS, ...newArticles]) },
    { rel: "scripts/.importados.json", content: `${JSON.stringify(nextManifest, null, 2)}\n` },
  ];
  // `all` incluye las nuevas: generate() importaría el array viejo y dejaría
  // los feeds desincronizados. writeIfChanged evita reescrituras innecesarias.
  const all = [...ARTICLES, ...newArticles];
  const feedXml = buildFeedXml(all);
  const sitemapXml = buildSitemapXml(all);
  if (changedSince(root, "feed.xml", feedXml)) files.push({ rel: "feed.xml", content: feedXml });
  if (changedSince(root, "sitemap.xml", sitemapXml)) {
    files.push({ rel: "sitemap.xml", content: sitemapXml });
  }
  for (const { meta } of imported) {
    if (meta.coverFile) {
      files.push({ rel: `assets/${meta.coverDest}`, content: meta.coverBuffer });
    }
  }
  // Archivo de entrada: el .md y su portada se conservan bajo
  // envios/importadas/<slug>/ y se retiran de la carpeta de entrada. Si la
  // carpeta de entrada está fuera del repo (copia temporal), no se archiva ni
  // se borra nada fuera del proyecto.
  const relativeInput = path.relative(root, inputDir);
  const insideRoot = relativeInput !== "" && !relativeInput.startsWith("..") && !path.isAbsolute(relativeInput);
  if (insideRoot) {
    const inputRel = relativeInput.split(path.sep).join("/");
    for (const item of imported) {
      const archiveDir = `${inputRel}/importadas/${item.parsed.slug}`;
      files.push({
        rel: `${archiveDir}/${item.mdFile}`,
        content: item.mdBuffer,
        source: path.join(inputDir, item.mdFile),
      });
      if (item.meta.coverFile) {
        files.push({
          rel: `${archiveDir}/${path.basename(item.meta.coverFile)}`,
          content: item.meta.coverBuffer,
          source: item.meta.coverFile,
        });
      }
    }
  }

  if (!apply) {
    console.log("[simulación] Ningún archivo fue modificado. Cambios previstos:");
    for (const file of files) console.log(`  ${file.rel}`);
    return { ok: true, errors: [], imported: newArticles, skipped, changed: files.map((f) => f.rel) };
  }

  const staging = path.join(root, "scripts", `.staging-${process.pid}`);
  if (fs.existsSync(staging)) {
    const message = `ya existe ${path.relative(root, staging)}; no se sobrescribe`;
    logError(message);
    writeErrorReport(root, [message], apply);
    return { ok: false, errors: [message], imported: [], skipped };
  }
  fs.mkdirSync(staging, { recursive: true });
  try {
    const written = commitStaged(root, files, staging);
    console.log(`Aplicado: ${written.length} archivo(s) actualizado(s).`);
    for (const rel of written) console.log(`  ${rel}`);
    return { ok: true, errors: [], imported: newArticles, skipped, changed: written };
  } catch (error) {
    const message = `falló la aplicación transaccional: ${error.message}`;
    logError(message);
    writeErrorReport(root, [message], apply);
    return { ok: false, errors: [message], imported: [], skipped };
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

/** Argumentos aceptados: --input <dir> y --apply. */
export function parseArgs(argv = []) {
  const options = { input: null, apply: false, help: false, error: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--input") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) {
        options.error = "--input necesita una carpeta";
        break;
      }
      options.input = value;
    } else {
      options.error = `opción no reconocida: ${arg}`;
      break;
    }
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const options = parseArgs(process.argv.slice(2));
  if (options.error) {
    console.error(options.error);
    process.exitCode = 2;
  } else if (options.help) {
    console.log(
      [
        "Uso: node scripts/import-submissions.mjs [--input <dir>] [--apply]",
        "",
        "Sin --apply solo simula. Con --apply escribe los artefactos de forma transaccional.",
      ].join("\n")
    );
  } else {
    const result = await importSubmissions({
      root: ROOT,
      inputDir: options.input ? path.resolve(process.cwd(), options.input) : path.join(ROOT, "envios"),
      apply: options.apply,
    });
    if (!result.ok) process.exitCode = 1;
  }
}
