// tools-dev-server.mjs — comprobación Node del panel local de desarrollo.
//
// Ejecutar con: node --test tests/tools-dev-server.mjs
// No arranca navegador. La HTTP usa un puerto efímero y SOLO simula; ninguna
// prueba aplica artefactos en el repositorio real.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ROOT, TMP_BASE, ARTEFACTOS, Mutex, huella, rutaDentro, rutaDentroPreview } from "../tools/lib/workspace.mjs";
import {
  esSi,
  validarPublicacion,
  validarPregunta,
  validarRespuesta,
  serializarPregunta,
  serializarRespuesta,
  parseQuestion,
  parseResponse,
  parseSubmission,
  autorSlug,
} from "../tools/lib/front-matter.mjs";
import { createPublication, toFrontMatter } from "../js/lib/publication.js";
import { crearPanel } from "../tools/dev-server.mjs";

const instantanea = () =>
  Object.fromEntries(
    [...ARTEFACTOS, "preguntas/abiertas/2026-11-23-que-sigue-siendo-tuyo.md"].map((rel) => [
      rel,
      fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), "utf8") : null,
    ])
  );

test("booleanos estrictos: 'no' nunca se vuelve true", () => {
  assert.equal(esSi("si"), true);
  assert.equal(esSi("sí"), true);
  assert.equal(esSi("no"), false);
  assert.equal(esSi(""), false);
  assert.equal(esSi(true), false, "un booleano JS no es el literal 'si'");
  assert.equal(Boolean("no"), true, "documentamos la trampa de publication.js:80");
});

test("texto oficial: XOR, HTTPS, cover.credit y tipo obligatorio", () => {
  const base = {
    title: "Informe",
    slug: "informe",
    category: "Texto oficial",
    types: ["Texto oficial"],
    cover: { credit: "Archivo · dominio público" },
    createdAt: "2026-11-25",
    kind: "oficial",
    documentUrl: "https://visor.ejemplo.com/documento",
    documentoPendiente: "no",
  };
  const valido = validarPublicacion(base);
  assert.deepEqual(valido.errores, []);
  assert.equal(valido.documentoPendiente, "");

  const ambos = validarPublicacion({ ...base, documentoPendiente: "si" });
  assert.ok(ambos.errores.some((e) => e.includes("exactamente una")));

  const ninguno = validarPublicacion({ ...base, documentUrl: "", documentoPendiente: "no" });
  assert.ok(ninguno.errores.some((e) => e.includes("exactamente una")));

  const http = validarPublicacion({ ...base, documentUrl: "http://visor.ejemplo.com/d" });
  assert.ok(http.errores.some((e) => e.includes("HTTPS")));

  const sinCredito = validarPublicacion({ ...base, cover: {} });
  assert.ok(sinCredito.errores.some((e) => e.includes("cover.credit")));

  const sinTipo = validarPublicacion({ ...base, types: ["Ensayo"] });
  assert.ok(sinTipo.errores.some((e) => e.includes("Texto oficial")));

  const pendiente = validarPublicacion({ ...base, documentUrl: "", documentoPendiente: "sí" });
  assert.deepEqual(pendiente.errores, []);
  assert.equal(pendiente.documentoPendiente, "si");
});

test("publicación normal: ni documento ni tipo oficial", () => {
  const errores = validarPublicacion({
    title: "Ensayo", slug: "ensayo", category: "Ensayo", types: ["Ensayo"],
    createdAt: "2026-11-25", kind: "", documentUrl: "",
    documentoPendiente: "no", cover: {},
  }).errores;
  assert.deepEqual(errores, []);
  const prohibido = validarPublicacion({
    title: "Ensayo", slug: "ensayo", category: "Ensayo", types: ["Ensayo"],
    createdAt: "2026-11-25", kind: "", documentUrl: "https://ejemplo.org/d",
    documentoPendiente: "no", cover: {},
  }).errores;
  assert.ok(prohibido.some((e) => e.includes("solo se admite en un Texto oficial")));
});

test("front matter de publicación generado y releído sin coverCredit top-level", () => {
  const pub = createPublication({
    title: "Acta", slug: "acta", category: "Texto oficial", types: ["Texto oficial"],
    cover: { credit: "Archivo" }, kind: "oficial",
    documentUrl: "https://visor.ejemplo.com/documento",
    documentoPendiente: "no", content: "## Cuerpo\n\nTexto.", createdAt: "2026-11-25",
  });
  const validacion = validarPublicacion(pub);
  assert.deepEqual(validacion.errores, []);
  pub.documentoPendiente = validacion.documentoPendiente;
  const md = toFrontMatter(pub);
  const leido = parseSubmission(md, "acta.md");
  assert.equal(leido.kind, "oficial");
  assert.equal(leido.documentUrl, "https://visor.ejemplo.com/documento");
  assert.equal(leido.documentoPendiente, "");
  assert.equal(leido.cover.credit, "Archivo");
  assert.equal(Object.hasOwn(leido, "coverCredit"), false);
  assert.match(leido.content, /## Cuerpo/);
});

test("serializadores de pregunta/respuesta hacen round-trip con los importadores", () => {
  const pregunta = {
    week: "2026-11-23", slug: "que-sigue-siendo-tuyo", estado: "cerrada",
    question: "¿Qué sigue siendo tuyo?", context: "Contexto con \"comillas\" y ${plantilla}.",
    note: "Nota", closing: "Cerrada", cover: "", unidad: "",
    content: "Cuerpo de la pregunta.",
  };
  const releida = parseQuestion(serializarPregunta(pregunta), "pregunta.md");
  assert.equal(releida.week, pregunta.week);
  assert.equal(releida.estado, "cerrada");
  assert.equal(releida.question, pregunta.question);
  assert.equal(releida.context, pregunta.context);
  assert.equal(releida.content.trim(), pregunta.content);

  const respuesta = {
    week: "2026-11-23", slug: "que-sigue-siendo-tuyo", author: "Ana Souza",
    authorization: "si", city: "Lima", email: "ana@example.org",
    publicarEmail: "si", content: "Mi respuesta.",
  };
  const releidaR = parseResponse(serializarRespuesta(respuesta), "ana-souza.md", "2026-11-23-que-sigue-siendo-tuyo");
  assert.equal(releidaR.authorization, "si");
  assert.equal(releidaR.publicarEmail, "si");
  assert.equal(releidaR.email, "ana@example.org");
  assert.equal(releidaR.content.trim(), "Mi respuesta.");
  assert.equal(autorSlug("Marta López"), "marta-lopez");
});

test("validación de preguntas y respuestas en el panel", () => {
  assert.deepEqual(validarPregunta({
    week: "2026-11-23", slug: "semana", estado: "abierta",
    question: "¿?", context: "Contexto",
  }), []);
  assert.ok(validarPregunta({
    week: "2026-11-24", slug: "semana", estado: "abierta", question: "¿?", context: "Contexto",
  }).some((e) => e.includes("lunes")));
  assert.ok(validarPregunta({
    week: "2026-11-23", slug: "semana", estado: "cerrada", question: "¿?", context: "Contexto",
  }, { estado: "abierta" }).some((e) => e.includes("no coincide")));

  const respuesta = {
    week: "2026-11-23", slug: "semana", author: "Ana", authorization: "si",
    email: "ana@example.org", publicarEmail: "si", content: "Texto",
  };
  assert.deepEqual(validarRespuesta(respuesta), []);
  assert.ok(validarRespuesta({ ...respuesta, email: "no-es-correo", publicarEmail: "si" })
    .some((e) => e.includes("correo electrónico válido")));
  assert.ok(validarRespuesta({ ...respuesta, authorization: "quizá" })
    .some((e) => e.includes("authorization")));
  assert.ok(validarRespuesta({ ...respuesta, publicarEmail: true })
    .some((e) => e.includes("publicarEmail")));
});

test("workspace: rutas contained, mutex en serie y huella determinista", async () => {
  assert.throws(() => rutaDentro(ROOT, "../secreto"), /fuera del proyecto|no permitida/);
  assert.throws(() => rutaDentro(ROOT, "js/data/config.js"), /carpeta no permitida/);
  assert.ok(rutaDentro(ROOT, "envios/prueba.md").endsWith(path.join("envios", "prueba.md")));
  assert.throws(() => rutaDentroPreview(ROOT, "../index.html"), /no permitida/);
  assert.throws(() => rutaDentroPreview(ROOT, ".git/config"), /no permitida/);

  const mutex = new Mutex();
  const orden = [];
  const primera = mutex.run(async () => {
    orden.push("primera-inicio");
    await new Promise((resolve) => setTimeout(resolve, 10));
    orden.push("primera-fin");
  });
  const fallida = mutex.run(() => {
    throw new Error("fallo a propósito");
  });
  const segunda = mutex.run(() => orden.push("segunda"));
  await assert.rejects(fallida, /fallo a propósito/);
  await Promise.all([primera, segunda]);
  assert.deepEqual(orden, ["primera-inicio", "primera-fin", "segunda"]);

  const huella1 = huella(ROOT);
  assert.match(huella1, /^[0-9a-f]{64}$/);
  assert.equal(huella(ROOT), huella1, "sin cambios la huella es estable");
});

test("HTTP: salud, denegaciones, simulación sin cambios y token", async (t) => {
  const antes = instantanea();
  const panel = crearPanel({ root: ROOT, puerto: 0 });
  const direccion = await panel.iniciar();
  t.after(async () => {
    await panel.cerrar();
    assert.deepEqual(instantanea(), antes, "la HTTP de prueba no modifica artefactos reales");
  });
  const base = `http://127.0.0.1:${direccion.port}`;

  const salud = await fetch(`${base}/api/salud`);
  assert.equal(salud.status, 200);
  assert.deepEqual(await salud.json(), { ok: true, servicio: "panel-local", puerto: null });

  for (const ruta of ["/.git/config", "/scripts/import-submissions.mjs", "/envios/README.md",
    "/preguntas/abiertas/2026-11-23-que-sigue-siendo-tuyo.md", "/js/data/config.js", "/tests/run"]) {
    const respuesta = await fetch(`${base}${ruta}`);
    assert.equal(respuesta.status, 403, `${ruta} debe estar denegado`);
  }

  const portada = await fetch(`${base}/`);
  assert.equal(portada.status, 200);
  assert.match(await portada.text(), /Panel de desarrollo/);
  const tokens = await fetch(`${base}/site/css/tokens.css`);
  assert.equal(tokens.status, 200);
  assert.match(await tokens.text(), /--bg:\s*#f3ebdd/);

  const sinJson = await fetch(`${base}/api/simular`, { method: "POST", body: "{}" });
  assert.equal(sinJson.status, 415);

  const simular = await fetch(`${base}/api/simular`, {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}",
  });
  assert.equal(simular.status, 200);
  const simulado = await simular.json();
  assert.equal(simulado.ok, true);
  assert.equal(simulado.sinCambios, true);
  assert.match(simulado.token, /^[0-9a-f-]{36}$/);
  assert.equal(simulado.salidas.length, 2, "dos procesos separados y en serie");

  const sinToken = await fetch(`${base}/api/aplicar`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ confirmacion: "APLICAR" }),
  });
  assert.equal(sinToken.status, 400);
  const sinConfirmar = await fetch(`${base}/api/aplicar`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: simulado.token, confirmacion: "otro" }),
  });
  assert.equal(sinConfirmar.status, 400);

  const inexistente = await fetch(`${base}/__preview/no-existe/index.html`);
  assert.equal(inexistente.status, 403);

  const invalida = await fetch(`${base}/api/borradores`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tipo: "publicacion", title: "Oficial inválida", slug: "oficial-invalida",
      category: "Texto oficial", types: ["Texto oficial"], author: "Prueba",
      createdAt: "2026-11-25", kind: "oficial", documentUrl: "",
      documentoPendiente: "no", cover: {}, content: "Cuerpo",
    }),
  });
  assert.equal(invalida.status, 400);
  assert.equal(fs.existsSync(path.join(ROOT, "envios", "oficial-invalida.md")), false);
});

test("HTTP: preview staged no toca la semana real y sirve sin CSP", async (t) => {
  const antes = instantanea();
  const real = path.join(ROOT, "preguntas", "abiertas", "2026-11-23-que-sigue-siendo-tuyo.md");
  const contenidoReal = fs.readFileSync(real, "utf8");
  const panel = crearPanel({ root: ROOT, puerto: 0 });
  const direccion = await panel.iniciar();
  t.after(async () => {
    const ids = panel.estado().vistasPrevias.map((v) => v.id);
    await panel.cerrar();
    for (const id of ids) {
      assert.equal(fs.existsSync(path.join(TMP_BASE, id)), false, `la copia ${id} se limpia al cerrar`);
    }
    assert.deepEqual(instantanea(), antes, "la preview no modifica artefactos reales");
    assert.equal(fs.readFileSync(real, "utf8"), contenidoReal, "la semana abierta real sigue abierta");
    assert.equal(fs.existsSync(path.join(ROOT, "preguntas", "cerradas", "2026-11-23-que-sigue-siendo-tuyo.md")), false);
  });
  const base = `http://127.0.0.1:${direccion.port}`;
  const creada = await fetch(`${base}/api/preview`, {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}",
  });
  if (creada.status !== 200) assert.fail(`preview falló: ${await creada.text()}`);
  const preview = await creada.json();
  assert.equal(preview.ok, true);
  assert.match(preview.id, /^blogfilosofico-preview-/);
  assert.ok(preview.vistas.some((v) => v.hash === "#/pregunta"));

  const historico = await fetch(`${base}${preview.vistas[0].url}`);
  assert.equal(historico.status, 200);
  assert.equal(historico.headers.get("content-security-policy"), null, "sin CSP de producción");
  assert.match(await historico.text(), /<!DOCTYPE html>/);

  const traversal = await fetch(`${base}/__preview/${preview.id}/../../.git/config`);
  assert.notEqual(traversal.status, 200);
});
