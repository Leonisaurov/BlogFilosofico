// import-submissions.mjs — comprobación Node del importador local (fuera de specs/).
//
// Ejecutar con: node tests/import-submissions.mjs
// No arranca navegador, no usa red y nunca aplica cambios a los artefactos.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import {
  parseSubmission,
  validateSubmission,
  safeCoverName,
  escapeTemplateLiteral,
  buildContribution,
  generateModule,
  importSubmissions,
} from "../scripts/import-submissions.mjs";
import { SITE } from "../js/data/config.js";
import { SECTIONS } from "../js/data/sections.js";
import {
  canEmbed,
  parseDocumentUrl,
  documentUrlFromDriveLink,
} from "../js/lib/document-embed.js";
import { createPublication, toFrontMatter } from "../js/lib/publication.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = path.join(ROOT, "tests", "fixtures", "submissions");
const OFICIAL = path.join(FIXTURES, "oficial");
const OFICIAL_INVALIDO = path.join(FIXTURES, "oficial-invalido");
const ARTIFACTS = [
  "js/data/contributions.js",
  "scripts/.importados.json",
  "feed.xml",
  "sitemap.xml",
];

const snapshot = () =>
  Object.fromEntries(ARTIFACTS.map((rel) => [rel, fs.readFileSync(path.join(ROOT, rel), "utf8")]));
const assertUntouched = (before) => assert.deepEqual(snapshot(), before, "los artefactos no cambian en simulación");

test("parsea el front matter exacto del editor y respeta el cuerpo", () => {
  const md = fs.readFileSync(path.join(FIXTURES, "aporte-valido.md"), "utf8");
  const parsed = parseSubmission(md, "aporte-valido.md");
  assert.equal(parsed.slug, "aporte-de-prueba-sobre-la-memoria");
  assert.equal(parsed.coverLocalName, "portada-prueba.png");
  assert.deepEqual(parsed.types, ["Ensayo"]);
  assert.match(parsed.content, /\$\{ variable \}/);
  assert.match(parsed.content, /`backticks`/);
  assert.match(parsed.content, /\\\\/);
});

test("rechaza claves que el editor no emite", () => {
  const md = fs.readFileSync(path.join(FIXTURES, "invalido", "aporte-invalido.md"), "utf8");
  assert.throws(() => parseSubmission(md, "aporte-invalido.md"), /clave de front matter no permitida: "claveExtra"/);
});

test("nombre de portada seguro y formatos admitidos", () => {
  assert.equal(safeCoverName("mi-portada.png", "mi-articulo"), "mi-articulo-cover.png");
  assert.throws(() => safeCoverName("../secreto.png", "mi-articulo"), /nombre de imagen no seguro/);
  assert.throws(() => safeCoverName("/etc/secreto.png", "mi-articulo"), /nombre de imagen no seguro/);
  assert.throws(() => safeCoverName("portada.svg", "mi-articulo"), /no admitido/);
});

test("escape de template literal idempotente al regenerar el módulo", () => {
  assert.equal(escapeTemplateLiteral("a\\b`c${d}"), "a\\\\b\\`c\\${d}");
  const content = "Texto con \\ barras, `backticks` y ${expresion}.";
  const article = buildContribution(
    { slug: "prueba", title: "Prueba", description: "", category: "Ética", author: "", createdAt: "2026-01-01", content },
    { types: ["Ensayo"], coverImage: "" }
  );
  const source = generateModule([article]);
  const script = new vm.Script(source.replace("export const CONTRIBUTIONS", "const CONTRIBUTIONS") + "\nCONTRIBUTIONS;");
  const [roundTrip] = script.runInNewContext();
  assert.equal(roundTrip.content, content);
  assert.equal(roundTrip.readingTime, 1);
  assert.match(source, /export const CONTRIBUTIONS = \[/);
});

test("validación en español: categoría, tipo, slug y fecha", () => {
  const md = fs.readFileSync(path.join(FIXTURES, "invalido", "aporte-invalido.md"), "utf8")
    .replace('claveExtra: "esta clave no está permitida"\n', "");
  const parsed = parseSubmission(md, "aporte-invalido.md");
  const errors = validateSubmission(parsed, {
    root: ROOT,
    inputDir: path.join(FIXTURES, "invalido"),
    articles: [],
    manifest: {},
    site: { categories: [] },
    sections: [],
    batchSlugs: new Set(),
    batchHashes: new Map(),
    sha256: "abc",
    mdBytes: Buffer.byteLength(md),
  });
  assert.ok(errors.length >= 4);
  assert.ok(errors.some((error) => error.includes("categoría")));
  assert.ok(errors.some((error) => error.includes("TEXT_TYPES")));
  assert.ok(errors.some((error) => error.includes("slug")));
  assert.ok(errors.some((error) => error.includes("fecha ISO")));
});

test("fecha ISO estricta: rechaza 2026-02-30 (new Date la normalizaría)", () => {
  const md = fs
    .readFileSync(path.join(FIXTURES, "aporte-valido.md"), "utf8")
    .replace("createdAt: 2026-11-20", "createdAt: 2026-02-30");
  const parsed = parseSubmission(md, "aporte-valido.md");
  const errors = validateSubmission(parsed, {
    root: ROOT,
    inputDir: FIXTURES,
    articles: [],
    manifest: {},
    site: { categories: [] },
    sections: [],
    batchSlugs: new Set(),
    batchHashes: new Map(),
    sha256: "abc",
    mdBytes: Buffer.byteLength(md),
  });
  assert.ok(
    errors.some((error) => error.includes('createdAt "2026-02-30" no es una fecha ISO válida')),
    JSON.stringify(errors)
  );
});

test("simulación con errores: imprime pero no crea ERRORES.txt", async () => {
  const report = path.join(ROOT, "envios", "ERRORES.txt");
  const previous = fs.existsSync(report) ? fs.readFileSync(report) : null;
  try {
    if (previous === null && fs.existsSync(report)) fs.rmSync(report, { force: true });
    const result = await importSubmissions({
      root: ROOT,
      inputDir: path.join(FIXTURES, "invalido"),
      apply: false,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.length > 0);
    assert.equal(
      fs.existsSync(report),
      previous !== null,
      "sin --apply no se escribe el informe de errores"
    );
  } finally {
    if (previous === null) fs.rmSync(report, { force: true });
    else fs.writeFileSync(report, previous);
  }
});

test("simulación: valida, omite duplicados y no escribe artefactos", async () => {
  const before = snapshot();
  const cover = path.join(ROOT, "assets", "aporte-de-prueba-sobre-la-memoria-cover.png");
  const hadCover = fs.existsSync(cover);
  const result = await importSubmissions({ root: ROOT, inputDir: FIXTURES, apply: false });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.imported.length, 1);
  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0], /ya importada; se omite/);
  assertUntouched(before);
  assert.equal(fs.existsSync(cover), hadCover, "la simulación no copia portadas");
  assert.equal(fs.readdirSync(path.join(ROOT, "scripts")).some((name) => name.startsWith(".staging-")), false);
});

test("lote inválido aislado: falla con mensajes en español y sin cambios", async () => {
  const before = snapshot();
  const result = await importSubmissions({
    root: ROOT,
    inputDir: path.join(FIXTURES, "invalido"),
    apply: false,
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors.every((error) => /aporte-invalido\.md:/.test(error)));
  assert.match(result.errors.join("\n"), /clave de front matter no permitida/);
  assertUntouched(before);
});

// --- «Texto oficial / formato académico» ----------------------------------

test("parseSubmission acepta documentoPendiente para revisión editorial", () => {
  const md = [
    "---",
    'title: "Prueba"',
    "slug: prueba-oficial",
    'description: "x"',
    'category: "Texto oficial"',
    'types: ["Texto oficial"]',
    'author: "Prueba"',
    'coverImage: ""',
    "createdAt: 2026-11-25",
    "kind: oficial",
    "documentoPendiente: si",
    "---",
    "",
    "Cuerpo.",
  ].join("\n");
  const parsed = parseSubmission(md, "pendiente.md");
  assert.equal(parsed.kind, "oficial");
  assert.equal(parsed.documentoPendiente, "si");
  assert.equal(parsed.documentUrl, "");
});

test("fixtures oficiales: válido con URL y pendiente sin URL se aceptan en simulación", async () => {
  const before = snapshot();
  const result = await importSubmissions({ root: ROOT, inputDir: OFICIAL, apply: false });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.imported.length, 2);
  assert.deepEqual(result.errors, []);
  const withUrl = result.imported.find((article) => article.slug === "informe-anual-del-seminario");
  const pending = result.imported.find((article) => article.slug === "acta-pendiente-de-visor");
  assert.equal(withUrl.kind, "oficial");
  assert.equal(withUrl.documentUrl, "https://visor.ejemplo.com/documentos/informe-anual");
  assert.equal(withUrl.documentoPendiente, undefined);
  assert.equal(withUrl.cover.credit, "Archivo del seminario · dominio público");
  assert.equal(withUrl.types.includes("Texto oficial"), true);
  assert.equal("coverCredit" in withUrl, false, "no se emite coverCredit top-level");
  assert.equal(pending.documentoPendiente, "si");
  assert.equal(pending.documentUrl, undefined);
  assertUntouched(before);
});

test("fixtures oficiales inválidos: XOR, HTTPS, crédito y tipo sin kind", async () => {
  const before = snapshot();
  const result = await importSubmissions({ root: ROOT, inputDir: OFICIAL_INVALIDO, apply: false });
  assert.equal(result.ok, false);
  const all = result.errors.join("\n");
  assert.ok(result.errors.length >= 7, all);
  assert.match(all, /documentUrl: la URL del documento debe usar HTTPS/);
  assert.match(all, /javascript:/);
  assert.match(all, /cover\.credit/);
  assert.match(all, /exactamente una de "documentUrl" o "documentoPendiente"/);
  assert.match(all, /tipo "Texto oficial" exige kind: oficial/);
  assert.match(all, /documentoPendiente solo se admite en un Texto oficial/);
  assertUntouched(before);
});

test("toFrontMatter: cover.credit es fuente única y documentoPendiente se emite", () => {
  const publication = createPublication({
    title: "Acta",
    category: "Texto oficial",
    types: ["Texto oficial"],
    kind: "oficial",
    documentUrl: "",
    documentoPendiente: true,
    cover: { credit: "Archivo · dominio público" },
    content: "Cuerpo.",
  });
  const md = toFrontMatter(publication);
  assert.match(md, /^kind: oficial$/m);
  assert.match(md, /^documentoPendiente: si$/m);
  assert.match(md, /^cover: \{"credit":"Archivo · dominio público"\}$/m);
  assert.doesNotMatch(md, /^coverCredit:/m);
  assert.doesNotMatch(md, /^documentUrl:/m);
});

test("parseDocumentUrl: solo HTTPS, sin credenciales ni caracteres de control", () => {
  assert.equal(
    parseDocumentUrl("https://visor.ejemplo.com/doc").href,
    "https://visor.ejemplo.com/doc"
  );
  for (const bad of [
    "http://visor.ejemplo.com/doc",
    "javascript:alert(1)",
    "https://user:pass@visor.ejemplo.com/doc",
    "https://visor.ejemplo.com/doc\nX",
    `https://visor.ejemplo.com/${"a".repeat(2001)}`,
  ]) {
    assert.throws(() => parseDocumentUrl(bad), /URL del documento/, bad);
  }
});

test("canEmbed exige lista de hosts: solo Drive está permitido", () => {
  assert.deepEqual(SITE.documentEmbedHosts, ["drive.google.com"]);
  assert.equal(canEmbed("drive.google.com", SITE.documentEmbedHosts), true);
  assert.equal(canEmbed("visor.ejemplo.com", SITE.documentEmbedHosts), false);
  assert.equal(canEmbed("visor.ejemplo.com", []), false);
  assert.equal(canEmbed("", ["drive.google.com"]), false);
  assert.equal(canEmbed("drive.google.com", ["DRIVE.GOOGLE.COM"]), true);
});

test("documentUrlFromDriveLink: solo Drive HTTPS se convierte al visor", () => {
  const esperado = "https://drive.google.com/file/d/ABC123xyz-_/preview";
  for (const enlace of [
    "https://drive.google.com/file/d/ABC123xyz-_/view?usp=sharing",
    "https://drive.google.com/file/d/ABC123xyz-_/preview",
    "https://drive.google.com/open?id=ABC123xyz-_",
    "  https://drive.google.com/file/d/ABC123xyz-_/view  ",
  ]) {
    assert.equal(documentUrlFromDriveLink(enlace), esperado, enlace);
    assert.equal(parseDocumentUrl(documentUrlFromDriveLink(enlace)).hostname, "drive.google.com");
  }
  for (const [enlace, motivo] of [
    ["https://docs.google.com/document/d/ABC123xyz-_/edit", /drive\.google\.com/],
    ["https://evil.example/file/d/ABC123xyz-_/view", /drive\.google\.com/],
    ["http://drive.google.com/file/d/ABC123xyz-_/view", /HTTPS/],
    ["https://drive.google.com/file/d/id%20invalido/view", /identificador/],
    ["https://drive.google.com/file/d/ABC123xyz-_/edit", /identificador/],
    ["https://drive.google.com/uc?id=ABC123xyz-_&export=download", /descarga el archivo/],
    ["https://drive.google.com/uc?export=download&id=ABC123xyz-_", /descarga el archivo/],
    ["", /pegá el enlace/],
  ]) {
    assert.throws(() => documentUrlFromDriveLink(enlace), motivo, enlace);
  }
});
