#!/usr/bin/env node
/**
 * import-questions.mjs — Incorpora la pregunta de la semana y sus respuestas.
 *
 * Node >= 22, sin dependencias y sin acceso a la red. Lee `preguntas/abiertas/`,
 * `preguntas/cerradas/` y `preguntas/respuestas/<week>-<slug>/<autor>.md`,
 * valida el lote completo y genera `js/data/questions.js`. Cada semana cerrada
 * con respuestas autorizadas se convierte en UNA unidad dentro de
 * `js/data/contributions.js` (`types: ["Unidad"]`) y se publica el domingo,
 * cuando el administrador aplica el lote y despliega. No hay cron ni backend.
 *
 * Por defecto solo SIMULA: no escribe ningún artefacto. Con `--apply` valida
 * todo, escribe en `scripts/.staging-preguntas-<pid>/` con copias de seguridad
 * y solo al final renombra a destino; si falla algo, restaura los originales.
 *
 *   node scripts/import-questions.mjs
 *   node scripts/import-questions.mjs --apply
 *   node scripts/import-questions.mjs --input tests/fixtures/questions
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
import { escapeTemplateLiteral } from "./import-submissions.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MD_MAX_BYTES = 512 * 1024;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CATEGORY = "Pregunta de la semana";
const UNIT_TYPE = "Unidad";
const UNIT_AUTHOR = "Comunidad del Blog de Filosofía";
const QUESTION_KEYS = new Set([
  "week", "slug", "estado", "question", "context", "note", "closing", "cover", "unidad",
]);
const RESPONSE_KEYS = new Set([
  "week", "slug", "author", "authorization", "city", "email", "publicarEmail",
]);
const QUESTION_REQUIRED = new Set(["week", "slug", "estado", "question", "context"]);
const RESPONSE_REQUIRED = new Set(["week", "slug", "author"]);

/** Filtro mínimo: solo daño evidente o datos de terceros, nunca estilo u opinión. */
const BODY_BLOCKERS = [
  {
    pattern: /(?:te\s+voy\s+a\s+matar|voy\s+a\s+matarte|amenazo\s+a|muerte\s+a\s+\w+|voy\s+a\s+quemar|linchar)/i,
    reason: "amenaza explícita",
  },
  {
    pattern: /(?:odio\s+a\s+los|exterminar\s+a|no\s+merecen\s+vivir|inferior(?:es)?\s+por\s+(?:su\s+)?(?:raza|religión|orientación))/i,
    reason: "discurso de odio",
  },
];

/** Huella de un archivo (o de una unidad ya construida). */
export function sha256(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/** ISO estricta en UTC y además lunes: new Date() normalizaría 2026-02-30. */
export function isMondayISO(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    date.getUTCDay() === 1
  );
}

/** Parser de front matter compartido por preguntas y respuestas. */
function parseFrontMatter(md, file, allowedKeys) {
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
    if (raw.startsWith("#")) {
      throw new Error(`comentario de front matter no reconocido en la línea ${i + 1}: "${raw}"`);
    }
    const pair = raw.match(/^([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!pair) throw new Error(`línea de front matter no reconocida (${i + 1}): "${raw}"`);
    const [, key, value] = pair;
    if (!allowedKeys.has(key)) throw new Error(`clave de front matter no permitida: "${key}"`);
    if (Object.hasOwn(data, key)) throw new Error(`clave repetida en el front matter: "${key}"`);
    data[key] = value.trim();
  }
  return { data, content: lines.slice(end + 1).join("\n") };
}

function scalar(data, key) {
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
}

/** Parseo de una pregunta: febrero 30 NO se normaliza, se rechaza al validar. */
export function parseQuestion(md, file = "pregunta.md") {
  const { data, content } = parseFrontMatter(md, file, QUESTION_KEYS);
  for (const key of QUESTION_REQUIRED) {
    if (!Object.hasOwn(data, key)) throw new Error(`falta la clave obligatoria "${key}" en el front matter`);
  }
  const parsed = {
    file,
    week: scalar(data, "week"),
    slug: scalar(data, "slug"),
    estado: scalar(data, "estado"),
    question: scalar(data, "question"),
    context: scalar(data, "context"),
    note: Object.hasOwn(data, "note") ? scalar(data, "note") : "",
    closing: Object.hasOwn(data, "closing") ? scalar(data, "closing") : "",
    cover: Object.hasOwn(data, "cover") ? scalar(data, "cover") : "",
    unidad: Object.hasOwn(data, "unidad") ? scalar(data, "unidad") : "",
    content,
    meta: null,
  };
  if (!["abierta", "cerrada"].includes(parsed.estado)) {
    throw new Error(`estado "${parsed.estado}" no válido (usa abierta o cerrada)`);
  }
  if (parsed.unidad && parsed.unidad !== "no") {
    throw new Error('la clave opcional "unidad" solo admite el valor "no"');
  }
  return parsed;
}

/** Parseo de una respuesta recibida por correo. */
export function parseResponse(md, file = "respuesta.md", dirName = "") {
  const { data, content } = parseFrontMatter(md, file, RESPONSE_KEYS);
  for (const key of RESPONSE_REQUIRED) {
    if (!Object.hasOwn(data, key)) throw new Error(`falta la clave obligatoria "${key}" en el front matter`);
  }
  const authorSlug = path.basename(file, path.extname(file));
  if (!SLUG_RE.test(authorSlug)) {
    throw new Error(`nombre de archivo no seguro: "${file}" (minúsculas, números y guiones)`);
  }
  const parsed = {
    file,
    week: scalar(data, "week"),
    slug: scalar(data, "slug"),
    author: scalar(data, "author"),
    authorization: Object.hasOwn(data, "authorization") ? scalar(data, "authorization") : "",
    city: Object.hasOwn(data, "city") ? scalar(data, "city") : "",
    email: Object.hasOwn(data, "email") ? scalar(data, "email") : "",
    publicarEmail: Object.hasOwn(data, "publicarEmail") ? scalar(data, "publicarEmail") : "no",
    content,
    authorSlug,
    dirName,
  };
  if (dirName && dirName !== `${parsed.week}-${parsed.slug}`) {
    throw new Error(`la carpeta "${dirName}" no coincide con week-slug "${parsed.week}-${parsed.slug}"`);
  }
  if (parsed.authorization && !["si", "no"].includes(parsed.authorization)) {
    throw new Error(`authorization "${parsed.authorization}" no válido (usa si o no)`);
  }
  if (!["si", "no"].includes(parsed.publicarEmail)) {
    throw new Error(`publicarEmail "${parsed.publicarEmail}" no válido (usa si o no)`);
  }
  return parsed;
}

/** Rechaza patrones evidentes de odio/amenaza y datos de terceros en el cuerpo. */
export function screenBody(body, file, authorEmail = "") {
  const reasons = [];
  for (const { pattern, reason } of BODY_BLOCKERS) {
    if (pattern.test(body)) reasons.push(`${file}: ${reason} detectado en el cuerpo`);
  }
  const allowed = String(authorEmail ?? "").trim().toLowerCase();
  const found = String(body ?? "").match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [];
  for (const email of new Set(found.map((value) => value.toLowerCase()))) {
    if (email !== allowed) reasons.push(`${file}: correo de un tercero detectado en el cuerpo (${email})`);
  }
  if (/\bDNI\s*[:\-]?\s*\d{7,8}\b/i.test(body)) {
    reasons.push(`${file}: documento de identidad de un tercero detectado en el cuerpo`);
  }
  if (/\b(?:tel(?:éfono)?|phone)\s*[:\-]?\s*\+?\d[\d\s()-]{6,}\b/i.test(body)) {
    reasons.push(`${file}: teléfono de un tercero detectado en el cuerpo`);
  }
  return reasons;
}

export function validateQuestion(parsed, ctx = {}) {
  const errors = [];
  const push = (message) => errors.push(`${parsed.file}: ${message}`);
  if (ctx.mdBytes > MD_MAX_BYTES) push(`el Markdown pesa ${ctx.mdBytes} bytes (máximo ${MD_MAX_BYTES})`);
  if (!isMondayISO(parsed.week)) push(`week "${parsed.week}" no es un lunes ISO válido`);
  if (!SLUG_RE.test(parsed.slug) || parsed.slug.length > 60) {
    push(`el slug "${parsed.slug}" no es válido (minúsculas, números y guiones; máximo 60 caracteres)`);
  }
  if (!parsed.question.trim()) push("la pregunta está vacía");
  if (!parsed.context.trim()) push("el contexto está vacío");
  if (parsed.unidad && parsed.unidad !== "no") push('la clave opcional "unidad" solo admite el valor "no"');
  if (unitSlug(parsed).length > 60) push("el slug de la unidad supera los 60 caracteres");
  return errors;
}

export function validateResponse(parsed, ctx = {}) {
  const errors = [];
  const push = (message) => errors.push(`${parsed.file}: ${message}`);
  if (ctx.mdBytes > MD_MAX_BYTES) push(`el Markdown pesa ${ctx.mdBytes} bytes (máximo ${MD_MAX_BYTES})`);
  if (!isMondayISO(parsed.week)) push(`week "${parsed.week}" no es un lunes ISO válido`);
  if (!SLUG_RE.test(parsed.slug) || parsed.slug.length > 60) {
    push(`el slug "${parsed.slug}" no es válido (minúsculas, números y guiones; máximo 60 caracteres)`);
  }
  if (!parsed.author.trim()) push("el autor está vacío");
  if (parsed.authorization && !["si", "no"].includes(parsed.authorization)) {
    push(`authorization "${parsed.authorization}" no válido (usa si o no)`);
  }
  if (!["si", "no"].includes(parsed.publicarEmail)) {
    push(`publicarEmail "${parsed.publicarEmail}" no válido (usa si o no)`);
  }
  if (ctx.closedKeys && !ctx.closedKeys.has(`${parsed.week}-${parsed.slug}`)) {
    push(`no existe una pregunta cerrada para "${parsed.week}-${parsed.slug}"`);
  }
  errors.push(...screenBody(parsed.content, parsed.file, parsed.email));
  return errors;
}

/** Slug de la unidad publicada para una semana cerrada con respuestas. */
export function unitSlug(question) {
  return `unidad-${question.week}-${question.slug}`;
}

/** Correo público: solo con autorización, autorización explícita y email válido. */
export function publicEmail(response) {
  if (response.authorization !== "si" || response.publicarEmail !== "si") return "";
  const email = String(response.email ?? "").trim();
  return EMAIL_RE.test(email) ? email : "";
}

/** Construye la única unidad de una semana: pregunta + respuestas publicadas. */
export function buildUnit(question, responses = []) {
  const sunday = new Date(`${question.week}T00:00:00Z`);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const createdAt = sunday.toISOString().slice(0, 10);
  const parts = [
    "## La pregunta",
    "",
    question.question.trim(),
    "",
    question.context.trim(),
    "",
  ];
  if (question.note) parts.push(`*${question.note.trim()}*`, "");
  parts.push("## Respuestas publicadas", "");
  const published = responses
    .filter((response) => response.authorization === "si")
    .sort((a, b) => a.file.localeCompare(b.file));
  for (const response of published) {
    const meta = [];
    if (response.city?.trim()) meta.push(response.city.trim());
    const email = publicEmail(response);
    if (email) meta.push(email);
    parts.push(`### ${response.author.trim()}`, "");
    if (meta.length) parts.push(meta.join(" · "), "");
    parts.push(response.content.trim(), "");
  }
  const slug = unitSlug(question);
  const content = parts.join("\n").trim();
  return {
    id: slug,
    slug,
    title: question.question.trim(),
    description: (question.note || question.context).trim(),
    category: CATEGORY,
    types: [UNIT_TYPE],
    author: UNIT_AUTHOR,
    coverImage: "",
    content,
    createdAt,
    readingTime: estimateReadingTime(content),
    tags: [],
  };
}

/** Genera `js/data/questions.js` con la pregunta abierta y el archivo. */
export function generateQuestionsModule(open, weeks = []) {
  const header = [
    "/**",
    " * questions.js — PREGUNTA ABIERTA Y ARCHIVO (GENERADO).",
    " *",
    " * Archivo GENERADO por `node scripts/import-questions.mjs --apply`.",
    " * No editar a mano: las preguntas y respuestas llegan a `preguntas/` y se",
    " * validan con el importador. `href` apunta a la unidad publicada cuando la",
    " * semana cerrada tiene respuestas autorizadas; si no, queda vacío.",
    " */",
    "",
  ].join("\n");
  const openLines = open
    ? [
        "  open: {",
        `    week: ${JSON.stringify(open.week)},`,
        `    slug: ${JSON.stringify(open.slug)},`,
        `    question: ${JSON.stringify(open.question)},`,
        `    context: ${JSON.stringify(open.context)},`,
        `    closing: ${JSON.stringify(open.closing || "")},`,
        `    note: ${JSON.stringify(open.note || "")},`,
        `    content: \`${escapeTemplateLiteral(open.content)}\`,`,
        "  },",
      ]
    : ["  open: null,"];
  const weekEntries = weeks.map(
    (week) =>
      "  {" +
      [
        `week: ${JSON.stringify(week.week)},`,
        `slug: ${JSON.stringify(week.slug)},`,
        `question: ${JSON.stringify(week.question)},`,
        `note: ${JSON.stringify(week.note || "")},`,
        `href: ${JSON.stringify(week.href || "")},`,
      ].join(" ") +
      "},"
  );
  if (!weekEntries.length) return `${header}export const QUESTIONS = {\n${openLines.join("\n")}\n  weeks: [],\n};\n`;
  return `${header}export const QUESTIONS = {\n${openLines.join("\n")}\n  weeks: [\n${weekEntries.join("\n")}\n  ],\n};\n`;
}

/** Genera el módulo de publicaciones con las unidades ya escapadas. */
export function generateContributionsModule(list = []) {
  const header = [
    "/**",
    " * contributions.js — PUBLICACIONES INCORPORADAS POR LOS IMPORTADORES LOCALES.",
    " *",
    " * Archivo GENERADO por `node scripts/import-submissions.mjs --apply` y",
    " * `node scripts/import-questions.mjs --apply`. No editar a mano: las",
    " * aportaciones y las unidades de «Pregunta de la semana» pasan por revisión",
    " * editorial. `js/data/articles.js` concatena este arreglo a `ARTICLES`.",
    " */",
    "",
  ].join("\n");
  if (!list.length) return `${header}export const CONTRIBUTIONS = [];\n`;
  const entries = list.map((article) => {
    const fields = Object.entries(article).map(([key, value]) => {
      if (key === "content") return `    content: \`${escapeTemplateLiteral(value)}\`,`;
      const name = /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
      return `    ${name}: ${JSON.stringify(value)},`;
    });
    return ["  {", ...fields, "  },"].join("\n");
  });
  return `${header}export const CONTRIBUTIONS = [\n${entries.join("\n")}\n];\n`;
}

/** ¿Cambiaría el archivo? Comparación byte a byte, sin escribir. */
function changedSince(root, filename, content) {
  const target = path.join(root, filename);
  if (!fs.existsSync(target)) return true;
  return !fs.readFileSync(target).equals(Buffer.from(content));
}

/**
 * Lee un módulo generado directamente desde `root`, con el hash en la URL para
 * que Node no sirva una versión cacheada de otra ejecución. Así el importador
 * también es idempotente cuando se aplica sobre un root temporal (tests).
 */
async function loadGenerated(root, rel, name) {
  const target = path.join(root, rel);
  if (!fs.existsSync(target)) return null;
  const url = `${pathToFileURL(target).href}?v=${sha256(fs.readFileSync(target))}`;
  const module = await import(url);
  return module[name] ?? null;
}

function readManifest(root) {
  const target = path.join(root, "scripts", ".preguntas-importadas.json");
  if (!fs.existsSync(target)) return {};
  const manifest = JSON.parse(fs.readFileSync(target, "utf8"));
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("no es un objeto");
  }
  return manifest;
}

/** Solo `--apply` escribe el informe: la simulación no toca ningún archivo. */
function writeErrorReport(root, errors, apply) {
  if (!apply) return;
  const target = path.join(root, "preguntas", "ERRORES.txt");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    ["Errores al importar preguntas:", "", ...errors.map((error) => `- ${error}`), ""].join("\n"),
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
    planned.push({ rel: file.rel, staged, target });
  }

  const written = [];
  try {
    for (const item of planned) {
      fs.mkdirSync(path.dirname(item.target), { recursive: true });
      fs.renameSync(item.staged, item.target);
      written.push(item);
    }
  } catch (error) {
    for (const item of written.reverse()) {
      const backup = path.join(backupDir, item.rel);
      if (fs.existsSync(backup)) fs.copyFileSync(backup, item.target);
      else if (fs.existsSync(item.target)) fs.rmSync(item.target);
    }
    throw error;
  }
  return planned.map((item) => item.rel);
}

function listMarkdown(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(".md") && name.toLowerCase() !== "readme.md")
    .sort();
}

/** Canal de entrada → artefactos del sitio. Sin red, sin publicación automática. */
export async function importQuestions({
  root = ROOT,
  inputDir = path.join(root, "preguntas"),
  apply = false,
  now = new Date().toISOString(),
} = {}) {
  const logError = (message) => (apply ? console.error : console.log)(message);
  if (!fs.existsSync(inputDir) || !fs.statSync(inputDir).isDirectory()) {
    const message = `la carpeta de entrada no existe: ${inputDir}`;
    logError(message);
    writeErrorReport(root, [message], apply);
    return { ok: false, errors: [message], imported: [], skipped: [] };
  }

  let manifest;
  try {
    manifest = readManifest(root);
  } catch (error) {
    const message = `scripts/.preguntas-importadas.json no es válido: ${error.message}`;
    logError(message);
    writeErrorReport(root, [message], apply);
    return { ok: false, errors: [message], imported: [], skipped: [] };
  }

  let existingContributions;
  let existingQuestions;
  try {
    existingContributions =
      (await loadGenerated(root, "js/data/contributions.js", "CONTRIBUTIONS")) ?? CONTRIBUTIONS;
    existingQuestions = await loadGenerated(root, "js/data/questions.js", "QUESTIONS");
  } catch (error) {
    const message = `no se pudieron leer los módulos generados del sitio: ${error.message}`;
    logError(message);
    writeErrorReport(root, [message], apply);
    return { ok: false, errors: [message], imported: [], skipped: [] };
  }

  const errors = [];
  if (!SITE.categories.includes(CATEGORY)) {
    errors.push(`la categoría "${CATEGORY}" no está en SITE.categories`);
  }
  if (!SECTIONS.some((section) => section.group === "tipo" && section.name === UNIT_TYPE)) {
    errors.push(`el tipo "${UNIT_TYPE}" no está en SECTIONS (grupo "tipo")`);
  }
  const skipped = [];
  const allQuestions = [];
  const questionsToImport = [];
  const allResponses = [];
  const responsesToImport = [];
  const knownKeys = new Set();
  if (existingQuestions?.open) knownKeys.add(`${existingQuestions.open.week}-${existingQuestions.open.slug}`);
  for (const week of existingQuestions?.weeks ?? []) knownKeys.add(`${week.week}-${week.slug}`);
  const batchQuestionKeys = new Set();
  const batchHashes = new Map();

  for (const [subdir, estado] of [["abiertas", "abierta"], ["cerradas", "cerrada"]]) {
    const dir = path.join(inputDir, subdir);
    for (const file of listMarkdown(dir)) {
      const buffer = fs.readFileSync(path.join(dir, file));
      const hash = sha256(buffer);
      let parsed;
      try {
        parsed = parseQuestion(buffer.toString("utf8"), file);
      } catch (error) {
        errors.push(`${file}: ${error.message}`);
        continue;
      }
      if (parsed.estado !== estado) {
        errors.push(`${file}: estado "${parsed.estado}" no coincide con la carpeta ${subdir}/`);
        continue;
      }
      parsed.key = `${parsed.week}-${parsed.slug}`;
      parsed.hash = hash;
      parsed.mdBytes = buffer.length;
      parsed.mdBuffer = buffer;
      allQuestions.push(parsed);

      const manifestKey = `pregunta:${parsed.key}`;
      if (manifest[manifestKey]?.sha256 === hash) {
        skipped.push(`${file}: ya importada; se omite`);
        console.log(`${file}: ya importada; se omite`);
        continue;
      }
      if (manifest[manifestKey]) {
        errors.push(`${file}: la pregunta "${parsed.key}" ya está en el manifiesto con otra huella; no se puede sobrescribir`);
        continue;
      }
      const found = validateQuestion(parsed, { mdBytes: buffer.length });
      if (found.length) {
        errors.push(...found);
        continue;
      }
      if (knownKeys.has(parsed.key)) {
        skipped.push(`${file}: ya importada; se omite (questions.js)`);
        console.log(`${file}: ya importada; se omite (questions.js)`);
        continue;
      }
      if (batchQuestionKeys.has(parsed.key)) {
        errors.push(`${file}: la semana "${parsed.key}" se repite en el lote`);
        continue;
      }
      if (batchHashes.has(hash)) {
        errors.push(`${file}: el contenido se repite en el lote (${batchHashes.get(hash)})`);
        continue;
      }
      batchQuestionKeys.add(parsed.key);
      batchHashes.set(hash, file);
      questionsToImport.push(parsed);
      console.log(`${file}: válida → ${parsed.key}`);
    }
  }

  if (!allQuestions.length) {
    const message = "no se encontraron preguntas en abiertas/ ni en cerradas/";
    errors.push(message);
  }

  const closedByKey = new Map(allQuestions.filter((q) => q.estado === "cerrada").map((q) => [q.key, q]));
  const closedKeys = new Set(closedByKey.keys());
  const respuestasDir = path.join(inputDir, "respuestas");
  const batchResponseKeys = new Set();
  if (fs.existsSync(respuestasDir) && fs.statSync(respuestasDir).isDirectory()) {
    for (const dirName of fs.readdirSync(respuestasDir).sort()) {
      const dir = path.join(respuestasDir, dirName);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const file of listMarkdown(dir)) {
        const buffer = fs.readFileSync(path.join(dir, file));
        const hash = sha256(buffer);
        let parsed;
        try {
          parsed = parseResponse(buffer.toString("utf8"), file, dirName);
        } catch (error) {
          errors.push(`${file}: ${error.message}`);
          continue;
        }
        parsed.key = `${parsed.week}-${parsed.slug}`;
        parsed.responseKey = `${parsed.key}/${parsed.authorSlug}`;
        parsed.hash = hash;
        parsed.mdBytes = buffer.length;
        allResponses.push(parsed);

        const manifestKey = `respuesta:${parsed.responseKey}`;
        if (manifest[manifestKey]?.sha256 === hash) {
          skipped.push(`${file}: ya importada; se omite`);
          console.log(`${file}: ya importada; se omite`);
          continue;
        }
        if (manifest[manifestKey]) {
          errors.push(`${file}: la respuesta ya está en el manifiesto con otra huella; no se puede sobrescribir`);
          continue;
        }
        const found = validateResponse(parsed, { mdBytes: buffer.length, closedKeys });
        if (found.length) {
          errors.push(...found);
          continue;
        }
        if (batchResponseKeys.has(parsed.responseKey)) {
          errors.push(`${file}: la respuesta de "${parsed.authorSlug}" se repite en el lote`);
          continue;
        }
        if (batchHashes.has(hash)) {
          errors.push(`${file}: el contenido se repite en el lote (${batchHashes.get(hash)})`);
          continue;
        }
        batchResponseKeys.add(parsed.responseKey);
        batchHashes.set(hash, file);
        responsesToImport.push(parsed);
        console.log(`${file}: válida → ${parsed.responseKey}`);
      }
    }
  }

  // Una sola unidad por semana cerrada con respuestas autorizadas.
  const newUnits = [];
  const batchUnitSlugs = new Set();
  for (const [key, question] of closedByKey) {
    if (question.unidad === "no") continue;
    const authorized = allResponses.filter(
      (response) => response.key === key && response.authorization === "si"
    );
    if (!authorized.length) continue;
    const found = validateQuestion(question, { mdBytes: question.mdBytes ?? 0 });
    if (found.length) {
      errors.push(...found);
      continue;
    }
    const unit = buildUnit(question, authorized);
    const manifestKey = `unidad:${key}`;
    const unitHash = sha256(unit);
    if (manifest[manifestKey]) {
      if (manifest[manifestKey].sha256 === unitHash) {
        skipped.push(`${key}: unidad ya importada; se omite`);
      } else {
        errors.push(`${key}: la unidad ya está en el manifiesto con otra huella; no se puede sobrescribir`);
      }
      continue;
    }
    if ([...existingContributions, ...ARTICLES].some((article) => article.slug === unit.slug)) {
      skipped.push(`${key}: unidad ya publicada en ARTICLES; se omite`);
      console.log(`${key}: unidad ya publicada en ARTICLES; se omite`);
      continue;
    }
    if (batchUnitSlugs.has(unit.slug)) {
      errors.push(`${key}: el slug de la unidad "${unit.slug}" se repite en el lote`);
      continue;
    }
    batchUnitSlugs.add(unit.slug);
    newUnits.push({ key: manifestKey, hash: unitHash, unit });
    console.log(`${key}: unidad válida → ${unit.slug}`);
  }

  if (errors.length) {
    for (const error of errors) logError(`ERROR ${error}`);
    writeErrorReport(root, errors, apply);
    return { ok: false, errors, imported: [], skipped };
  }

  const nextManifest = { ...manifest };
  for (const question of questionsToImport) {
    nextManifest[`pregunta:${question.key}`] = { sha256: question.hash, importedAt: now };
  }
  for (const response of responsesToImport) {
    nextManifest[`respuesta:${response.responseKey}`] = { sha256: response.hash, importedAt: now };
  }
  for (const unit of newUnits) {
    nextManifest[unit.key] = { sha256: unit.hash, importedAt: now };
  }

  const sorted = [...allQuestions].sort((a, b) => b.week.localeCompare(a.week));
  const open = sorted.find((question) => question.estado === "abierta") ?? null;
  const weeks = sorted
    .filter((question) => question !== open)
    .map((question) => {
      const published =
        newUnits.find((unit) => unit.key === `unidad:${question.key}`)?.unit ??
        [...existingContributions, ...ARTICLES].find((article) => article.slug === unitSlug(question)) ??
        null;
      return {
        week: question.week,
        slug: question.slug,
        question: question.question,
        note: question.note,
        href: published ? `#/articulos/${published.slug}` : "",
      };
    });

  const addedUnits = newUnits.map((unit) => unit.unit);
  const files = [
    { rel: "js/data/questions.js", content: generateQuestionsModule(open, weeks) },
    {
      rel: "js/data/contributions.js",
      content: generateContributionsModule([...existingContributions, ...addedUnits]),
    },
    { rel: "scripts/.preguntas-importadas.json", content: `${JSON.stringify(nextManifest, null, 2)}\n` },
  ];
  // `all` incluye las unidades nuevas: generate() importaría el array viejo.
  const all = [...existingContributions, ...addedUnits];
  const feedXml = buildFeedXml(all);
  const sitemapXml = buildSitemapXml(all);
  if (changedSince(root, "feed.xml", feedXml)) files.push({ rel: "feed.xml", content: feedXml });
  if (changedSince(root, "sitemap.xml", sitemapXml)) {
    files.push({ rel: "sitemap.xml", content: sitemapXml });
  }
  const changed = files.filter((file) => changedSince(root, file.rel, file.content)).map((file) => file.rel);

  if (!questionsToImport.length && !responsesToImport.length && !newUnits.length && !changed.length) {
    console.log("No hay preguntas nuevas para importar.");
    return { ok: true, errors: [], imported: [], skipped };
  }
  if (!apply) {
    console.log("[simulación] Ningún archivo fue modificado. Cambios previstos:");
    for (const rel of changed) console.log(`  ${rel}`);
    return { ok: true, errors: [], imported: addedUnits, skipped, changed };
  }

  const staging = path.join(root, "scripts", `.staging-preguntas-${process.pid}`);
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
    return { ok: true, errors: [], imported: addedUnits, skipped, changed: written };
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
        "Uso: node scripts/import-questions.mjs [--input <dir>] [--apply]",
        "",
        "Sin --apply solo simula. Con --apply escribe los artefactos de forma transaccional.",
      ].join("\n")
    );
  } else {
    const result = await importQuestions({
      root: ROOT,
      inputDir: options.input ? path.resolve(process.cwd(), options.input) : path.join(ROOT, "preguntas"),
      apply: options.apply,
    });
    if (!result.ok) process.exitCode = 1;
  }
}
