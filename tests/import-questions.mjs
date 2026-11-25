// import-questions.mjs — comprobación Node del importador de preguntas.
//
// Ejecutar con: node tests/import-questions.mjs
// No arranca navegador, no usa red y nunca modifica los artefactos del repo:
// la simulación solo valida y las aplicaciones usan un root temporal.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import {
  parseQuestion,
  parseResponse,
  validateQuestion,
  validateResponse,
  screenBody,
  buildUnit,
  publicEmail,
  isMondayISO,
  generateQuestionsModule,
  generateContributionsModule,
  importQuestions,
  parseArgs,
} from "../scripts/import-questions.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = path.join(ROOT, "tests", "fixtures", "questions");
const INVALID = path.join(FIXTURES, "invalido");
const ARTIFACTS = [
  "js/data/questions.js",
  "js/data/contributions.js",
  "scripts/.preguntas-importadas.json",
  "feed.xml",
  "sitemap.xml",
];
const NOW = "2026-11-25T12:00:00.000Z";

const snapshot = () =>
  Object.fromEntries(ARTIFACTS.map((rel) => [rel, fs.readFileSync(path.join(ROOT, rel), "utf8")]));
const assertUntouched = (before) =>
  assert.deepEqual(snapshot(), before, "los artefactos del repo no cambian");

/** Copia los artefactos reales a un root temporal bajo ~/Develop/.tmp. */
function tempRoot(label) {
  const base = path.join(os.homedir(), "Develop", ".tmp");
  fs.mkdirSync(base, { recursive: true });
  const dir = fs.mkdtempSync(path.join(base, `questions-test-${label}-`));
  for (const rel of ARTIFACTS) {
    const dest = path.join(dir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), dest);
  }
  return dir;
}

const read = (...parts) => fs.readFileSync(path.join(FIXTURES, ...parts), "utf8");

test("parsea preguntas y respuestas; week es lunes ISO estricto", () => {
  const open = parseQuestion(read("abiertas", "2027-01-04-que-es-perdonar.md"), "abierta.md");
  assert.equal(open.week, "2027-01-04");
  assert.equal(open.slug, "que-es-perdonar");
  assert.equal(open.estado, "abierta");
  assert.match(open.content, /¿Perdonar es olvidar/);
  assert.equal(isMondayISO("2026-11-23"), true);
  assert.equal(isMondayISO("2026-11-24"), false, "martes no es lunes");
  assert.equal(isMondayISO("2026-02-30"), false, "fecha inexistente no se normaliza");

  const response = parseResponse(
    read("respuestas", "2026-12-21-tolerancia-y-discrepancia", "marta-lopez.md"),
    "marta-lopez.md",
    "2026-12-21-tolerancia-y-discrepancia"
  );
  assert.equal(response.authorization, "si");
  assert.equal(response.publicarEmail, "no", "por defecto el correo no se publica");
  assert.equal(response.authorSlug, "marta-lopez");

  const errors = validateQuestion({ ...open, week: "2026-02-30" });
  assert.ok(errors.some((error) => error.includes("no es un lunes ISO válido")));
  assert.deepEqual(validateQuestion(open), []);
});

test("rechaza claves no permitidas, enum inválido y unidad distinta de 'no'", () => {
  const md = read("abiertas", "2027-01-04-que-es-perdonar.md");
  assert.throws(
    () => parseQuestion(`${md.replace("---\n", "---\nclaveExtra: 1\n")}`, "extra.md"),
    /clave de front matter no permitida: "claveExtra"/
  );
  assert.throws(
    () => parseQuestion(md.replace("estado: abierta", "estado: abierta\nunidad: quizá"), "unidad.md"),
    /solo admite el valor "no"/
  );
  assert.throws(
    () => parseResponse(read("respuestas", "2026-12-21-tolerancia-y-discrepancia", "marta-lopez.md")
      .replace("authorization: si", "authorization: quizá"), "marta-lopez.md", "2026-12-21-tolerancia-y-discrepancia"),
    /authorization "quizá" no válido/
  );
});

test("filtro mínimo: daño evidente y datos de terceros, sin juzgar estilo", () => {
  const harmful = read("invalido", "respuestas", "2026-12-14-pregunta-invalida", "respuesta-danina.md");
  const body = harmful.split("---")[2];
  const reasons = screenBody(body, "respuesta-danina.md");
  assert.ok(reasons.some((reason) => reason.includes("respuesta-danina.md") && reason.includes("odio")));
  assert.ok(screenBody("Mi correo es otra.persona@example.org", "x.md").some((r) => r.includes("tercero")));
  assert.deepEqual(screenBody("Mi correo es marta.lopez@example.org", "x.md", "marta.lopez@example.org"), []);
  assert.deepEqual(screenBody("Una opinión impopular, larga y sin editar.", "x.md"), []);

  const response = parseResponse(
    read("respuestas", "2026-12-21-tolerancia-y-discrepancia", "marta-lopez.md"),
    "marta-lopez.md",
    "2026-12-21-tolerancia-y-discrepancia"
  );
  const errors = validateResponse(response, { closedKeys: new Set(["2026-12-21-tolerancia-y-discrepancia"]) });
  assert.deepEqual(errors, []);
  assert.ok(
    validateResponse(response, { closedKeys: new Set() }).some((error) => error.includes("no existe una pregunta cerrada"))
  );
});

test("el correo solo se publica con autorización, permiso y email válido", () => {
  const base = { authorization: "si", publicarEmail: "si", email: "valida@example.org" };
  assert.equal(publicEmail(base), "valida@example.org");
  assert.equal(publicEmail({ ...base, authorization: "no" }), "");
  assert.equal(publicEmail({ ...base, publicarEmail: "no" }), "");
  assert.equal(publicEmail({ ...base, email: "no-es-correo" }), "");

  const question = parseQuestion(read("cerradas", "2026-12-21-tolerancia-y-discrepancia.md"), "cerrada.md");
  const dir = "2026-12-21-tolerancia-y-discrepancia";
  const authorized = parseResponse(
    read("respuestas", dir, "marta-lopez.md").replace("publicarEmail: no", "publicarEmail: si"),
    "marta-lopez.md",
    dir
  );
  const unauthorized = parseResponse(read("respuestas", dir, "nuria-ruiz.md"), "nuria-ruiz.md", dir);
  const unit = buildUnit(question, [authorized, unauthorized]);
  assert.match(unit.content, /### Marta López/);
  assert.match(unit.content, /marta\.lopez@example\.org/);
  assert.doesNotMatch(unit.content, /Nuria Ruiz/);
  assert.equal(unit.types[0], "Unidad");
  assert.equal(unit.category, "Pregunta de la semana");
  assert.equal(unit.createdAt, "2026-12-27", "la unidad se fecha el domingo");
  assert.equal(buildUnit(question, [unauthorized]).content.includes("Nuria"), false);
});

test("los módulos generados escapan el Markdown y recuperan el contenido", () => {
  const content = "Texto con \\ barras, `backticks` y ${expresion}.";
  const question = { week: "2026-12-21", slug: "prueba", question: "¿Qué?", context: content, closing: "", note: "", content };
  const source = generateQuestionsModule(question, [
    { week: "2026-12-21", slug: "prueba", question: "¿Qué?", note: "", href: "" },
  ]);
  const roundTrip = new vm.Script(
    source.replace("export const QUESTIONS", "const QUESTIONS") + "\nQUESTIONS;"
  ).runInNewContext();
  assert.equal(roundTrip.open.content, content);
  assert.equal(roundTrip.weeks.length, 1);

  const unit = buildUnit(question, []);
  unit.content = content;
  const module = generateContributionsModule([unit]);
  const articles = new vm.Script(
    module.replace("export const CONTRIBUTIONS", "const CONTRIBUTIONS") + "\nCONTRIBUTIONS;"
  ).runInNewContext();
  assert.equal(articles[0].content, content);
});

test("simulación con fixtures: valida y no escribe artefactos ni staging", async () => {
  const before = snapshot();
  const result = await importQuestions({ root: ROOT, inputDir: FIXTURES, apply: false, now: NOW });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.imported.length, 1, "una sola unidad para la semana cerrada");
  assert.match(result.imported[0].slug, /^unidad-2026-12-21-/);
  assertUntouched(before);
  assert.equal(
    fs.readdirSync(path.join(ROOT, "scripts")).some((name) => name.startsWith(".staging-preguntas-")),
    false
  );
});

test("lote inválido: falla en español, sin artefactos ni ERRORES.txt en simulación", async () => {
  const before = snapshot();
  const report = path.join(ROOT, "preguntas", "ERRORES.txt");
  const hadReport = fs.existsSync(report);
  try {
    const result = await importQuestions({ root: ROOT, inputDir: INVALID, apply: false, now: NOW });
    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /respuesta-danina\.md/);
    assert.match(result.errors.join("\n"), /odio/);
    assert.equal(fs.existsSync(report), hadReport, "sin --apply no se escribe ERRORES.txt");
    assertUntouched(before);
  } finally {
    if (!hadReport && fs.existsSync(report)) fs.rmSync(report, { force: true });
  }
});

test("aplicación transaccional en root temporal: idempotente y con reversión", async () => {
  const dir = tempRoot("apply");
  try {
    const first = await importQuestions({ root: dir, inputDir: FIXTURES, apply: true, now: NOW });
    assert.equal(first.ok, true, JSON.stringify(first.errors));
    const questions = fs.readFileSync(path.join(dir, "js", "data", "questions.js"), "utf8");
    assert.match(questions, /2027-01-04/);
    assert.match(questions, /unidad-2026-12-21-tolerancia-y-discrepancia/);
    assert.match(fs.readFileSync(path.join(dir, "feed.xml"), "utf8"), /unidad-2026-12-21-tolerancia-y-discrepancia/);
    assert.equal(
      fs.readdirSync(path.join(dir, "scripts")).some((name) => name.startsWith(".staging-preguntas-")),
      false
    );

    const second = await importQuestions({ root: dir, inputDir: FIXTURES, apply: true, now: NOW });
    assert.equal(second.ok, true, JSON.stringify(second.errors));
    assert.equal(second.imported.length, 0, "segunda ejecución: ya importada");
    assert.ok(second.skipped.some((item) => /ya importada; se omite/.test(item)));

    const broken = tempRoot("rollback");
    try {
      const before = Object.fromEntries(
        ARTIFACTS.map((rel) => [rel, fs.readFileSync(path.join(broken, rel), "utf8")])
      );
      const result = await importQuestions({ root: broken, inputDir: INVALID, apply: true, now: NOW });
      assert.equal(result.ok, false);
      assert.equal(
        fs.existsSync(path.join(broken, "preguntas", "ERRORES.txt")),
        true,
        "con --apply se escribe ERRORES.txt"
      );
      for (const rel of ARTIFACTS) {
        assert.equal(fs.readFileSync(path.join(broken, rel), "utf8"), before[rel], `${rel} se revierte`);
      }
      assert.equal(
        fs.readdirSync(path.join(broken, "scripts")).some((name) => name.startsWith(".staging-preguntas-")),
        false
      );
    } finally {
      fs.rmSync(broken, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("parseArgs acepta --apply, --input y --help", () => {
  assert.deepEqual(parseArgs(["--apply", "--input", "tests/fixtures/questions"]), {
    input: "tests/fixtures/questions",
    apply: true,
    help: false,
    error: null,
  });
  assert.match(parseArgs(["--input"]).error, /necesita una carpeta/);
  assert.equal(parseArgs(["--help"]).help, true);
});
