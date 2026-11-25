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

import {
  ROOT,
  TMP_BASE,
  ARTEFACTOS,
  Mutex,
  huella,
  rutaDentro,
  rutaDentroPreview,
  crearTemporal,
  ejecutarNode,
} from "../tools/lib/workspace.mjs";
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

// --- Subida de archivos del participante ----------------------------------

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
const JSON_HEADER = { "content-type": "application/json" };

function rootTemporal(label) {
  const dir = crearTemporal(`blogfilosofico-archivos-test-${label}-`);
  for (const rel of ["js", "scripts", "envios", "preguntas", "feed.xml", "sitemap.xml", "css"]) {
    fs.cpSync(path.join(ROOT, rel), path.join(dir, rel), { recursive: true });
  }
  return dir;
}

async function subir(base, tipo, archivos) {
  return fetch(`${base}/api/archivos`, {
    method: "POST",
    headers: JSON_HEADER,
    body: JSON.stringify({ tipo, archivos }),
  });
}

test("HTTP: subir publicación y portada con el nombre del front matter", async (t) => {
  const dir = rootTemporal("publicacion");
  const panel = crearPanel({ root: dir, puerto: 0 });
  const direccion = await panel.iniciar();
  t.after(async () => {
    await panel.cerrar();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${direccion.port}`;
  const portada = "retrato-participante.png";
  const md = [
    "---",
    'title: "Aporte del participante"',
    "slug: aporte-del-participante",
    'description: "Ensayo recibido por correo."',
    'category: "Ensayo"',
    'types: ["Ensayo"]',
    'author: "Participante"',
    `coverImage: "./assets/${portada}"`,
    "createdAt: 2026-11-25",
    `# Imagen local pendiente: copiar "${portada}" a la carpeta assets/`,
    "---",
    "",
    "Texto del ensayo.",
    "",
  ].join("\n");

  const respuesta = await subir(base, "publicacion", [
    { nombre: "aporte.md", contenido: md },
    { nombre: portada, contenido: "", dataUrl: PNG },
  ]);
  if (respuesta.status !== 200) assert.fail(`subida falló: ${await respuesta.text()}`);
  const datos = await respuesta.json();
  assert.ok(datos.guardados.includes("envios/aporte-del-participante.md"));
  assert.ok(fs.existsSync(path.join(dir, "envios", portada)), "la portada conserva el nombre del front matter");
  assert.equal(
    fs.existsSync(path.join(dir, "envios", "aporte-del-participante-cover.png")),
    false,
    "NO se renombra a <slug>-cover.<ext>"
  );
  const estado = await (await fetch(`${base}/api/estado`)).json();
  assert.ok(estado.borradores.some((b) => b.archivo === "envios/aporte-del-participante.md"));

  const importador = await ejecutarNode(
    ["scripts/import-submissions.mjs", "--apply", "--input", path.join(dir, "envios")],
    { cwd: dir }
  );
  assert.equal(importador.code, 0, importador.stderr);
  assert.match(importador.stdout, /aporte-del-participante\.md: válida/);
});

test("HTTP: ida y vuelta del switch del panel — kind: oficial sobrevive al .md", async (t) => {
  const dir = rootTemporal("kind-oficial");
  const panel = crearPanel({ root: dir, puerto: 0 });
  const direccion = await panel.iniciar();
  t.after(async () => {
    await panel.cerrar();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${direccion.port}`;
  const enviar = (datos) => fetch(`${base}/api/borradores`, {
    method: "POST", headers: JSON_HEADER, body: JSON.stringify(datos),
  });
  const datos = {
    tipo: "publicacion",
    title: "Informe del panel",
    slug: "informe-del-panel",
    description: "Informe preparado con el switch.",
    category: "Texto oficial",
    types: ["Texto oficial"],
    author: "Prueba",
    createdAt: "2026-11-25",
    kind: "oficial",
    documentUrl: "https://drive.google.com/file/d/ABC123/preview",
    documentoPendiente: "no",
    cover: { credit: "Archivo" },
    content: "Cuerpo del informe.",
  };
  const primera = await enviar(datos);
  if (primera.status !== 200) assert.fail(`guardar: ${await primera.text()}`);
  const archivo = path.join(dir, "envios", "informe-del-panel.md");
  const md = fs.readFileSync(archivo, "utf8");
  assert.match(md, /^kind: oficial$/m, "el .md guardado declara kind: oficial");
  assert.doesNotMatch(md, /^kind: normal$/m, "«normal» nunca se emite al .md");

  // El panel repuebla el switch leyendo el .md desde /api/estado.
  const estado = await (await fetch(`${base}/api/estado`)).json();
  const borrador = estado.borradores.find((b) => b.archivo === "envios/informe-del-panel.md");
  assert.ok(borrador, "el borrador reaparece en el panel");
  assert.equal(borrador.datos.kind, "oficial", "el switch se repuebla desde el .md");
  assert.equal(borrador.datos.cover.credit, "Archivo");

  // Reenviar tal como lo haría el panel tras repoblar conserva el modelo.
  const segunda = await enviar({
    ...datos,
    kind: borrador.datos.kind,
    cover: borrador.datos.cover,
    documentUrl: borrador.datos.documentUrl,
    content: borrador.datos.content,
  });
  if (segunda.status !== 200) assert.fail(`re guardar: ${await segunda.text()}`);
  const mdReenviado = fs.readFileSync(archivo, "utf8");
  assert.match(mdReenviado, /^kind: oficial$/m, "kind: oficial sobrevive borrador → panel → .md");
  assert.match(mdReenviado, /^documentUrl: .*drive\.google\.com/m, "se conserva el visor");
  assert.match(mdReenviado, /Cuerpo del informe\./, "se conserva el cuerpo");
});

test("HTTP: subir pregunta y respuesta con autor-slug del nombre de archivo", async (t) => {
  const dir = rootTemporal("pregunta-respuesta");
  const panel = crearPanel({ root: dir, puerto: 0 });
  const direccion = await panel.iniciar();
  t.after(async () => {
    await panel.cerrar();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${direccion.port}`;

  const pregunta = [
    "---",
    'week: "2027-01-11"',
    'slug: "pregunta-subida"',
    'estado: "abierta"',
    'question: "¿Qué es la justicia?"',
    'context: "Contexto de la pregunta subida."',
    "---",
    "",
    "Cuerpo de la pregunta.",
    "",
  ].join("\n");
  const subidaPregunta = await subir(base, "pregunta", [
    { nombre: "pregunta-subida.md", contenido: pregunta },
  ]);
  if (subidaPregunta.status !== 200) assert.fail(`pregunta: ${await subidaPregunta.text()}`);
  assert.ok(
    fs.existsSync(path.join(dir, "preguntas", "abiertas", "2027-01-11-pregunta-subida.md"))
  );

  const respuesta = [
    "---",
    'week: "2026-11-09"',
    'slug: "no-pensar-sin-imagenes"',
    'author: "Ana Nueva"',
    "authorization: si",
    "publicarEmail: no",
    "---",
    "",
    "Una respuesta sin datos de terceros.",
    "",
  ].join("\n");
  const subidaRespuesta = await subir(base, "respuesta", [
    { nombre: "ana-nueva.md", contenido: respuesta },
  ]);
  if (subidaRespuesta.status !== 200) assert.fail(`respuesta: ${await subidaRespuesta.text()}`);
  const destino = path.join(
    dir, "preguntas", "respuestas", "2026-11-09-no-pensar-sin-imagenes", "ana-nueva.md"
  );
  assert.ok(fs.existsSync(destino), "el autor-slug sale del nombre del archivo");
  const estado = await (await fetch(`${base}/api/estado`)).json();
  assert.ok(estado.borradores.some((b) => b.archivo.endsWith("/ana-nueva.md")));
});

test("HTTP: rechaza traversal, tamaño por archivo y contenido ya importado", async (t) => {
  const dir = rootTemporal("rechazos");
  const panel = crearPanel({ root: dir, puerto: 0 });
  const direccion = await panel.iniciar();
  t.after(async () => {
    await panel.cerrar();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${direccion.port}`;

  const traversal = await subir(base, "publicacion", [{ nombre: "../mal.md", contenido: "x" }]);
  assert.equal(traversal.status, 400);
  assert.match((await traversal.json()).error, /nombre de archivo no seguro/);

  const grande = await subir(base, "publicacion", [
    { nombre: "grande.md", contenido: "a".repeat(512 * 1024 + 1) },
  ]);
  assert.equal(grande.status, 413);
  assert.match((await grande.json()).error, /512 KiB/);

  const imagenGrande = Buffer.alloc(2 * 1024 * 1024 + 1);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(imagenGrande, 0);
  const granImagen = await subir(base, "publicacion", [
    {
      nombre: "gran-portada.png",
      contenido: "",
      dataUrl: `data:image/png;base64,${imagenGrande.toString("base64")}`,
    },
  ]);
  assert.equal(granImagen.status, 413);
  assert.match((await granImagen.json()).error, /2 MiB/);

  const yaImportada = fs.readFileSync(
    path.join(ROOT, "preguntas", "cerradas", "2026-11-09-no-pensar-sin-imagenes.md"),
    "utf8"
  );
  const repetida = await subir(base, "pregunta", [
    { nombre: "2026-11-09-no-pensar-sin-imagenes.md", contenido: yaImportada },
  ]);
  assert.equal(repetida.status, 400);
  assert.match((await repetida.json()).error, /ya importada/);
  assert.equal(
    fs.existsSync(path.join(dir, "preguntas", "cerradas", "2026-11-09-no-pensar-sin-imagenes.md.dup")),
    false
  );
});

test("HTTP: subir entre simular y aplicar da 409; ids de subida únicos", async (t) => {
  const dir = rootTemporal("token");
  const panel = crearPanel({ root: dir, puerto: 0 });
  const direccion = await panel.iniciar();
  t.after(async () => {
    await panel.cerrar();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${direccion.port}`;

  const simulacion = await fetch(`${base}/api/simular`, {
    method: "POST", headers: JSON_HEADER, body: "{}",
  });
  const simulado = await simulacion.json();
  assert.equal(simulado.ok, true);
  const pregunta = [
    "---",
    'week: "2027-01-18"',
    'slug: "pregunta-nueva"',
    'estado: "abierta"',
    'question: "¿Nueva pregunta?"',
    'context: "Contexto."',
    "---",
    "",
    "Cuerpo.",
    "",
  ].join("\n");
  assert.equal((await subir(base, "pregunta", [{ nombre: "nueva.md", contenido: pregunta }])).status, 200);

  const aplicar = await fetch(`${base}/api/aplicar`, {
    method: "POST",
    headers: JSON_HEADER,
    body: JSON.stringify({ token: simulado.token, confirmacion: "APLICAR" }),
  });
  assert.equal(aplicar.status, 409);
  assert.match((await aplicar.json()).error, /archivos nuevos|volvé a simular/);

  const html = await (await fetch(`${base}/`)).text();
  for (const id of [
    "archivos-publicacion", "selector-publicacion", "boton-subir-publicacion", "lista-archivos-publicacion",
    "archivos-pregunta", "selector-pregunta", "boton-subir-pregunta", "lista-archivos-pregunta",
    "archivos-respuesta", "selector-respuesta", "boton-subir-respuesta", "lista-archivos-respuesta",
  ]) {
    assert.equal(html.split(`id="${id}"`).length - 1, 1, `${id} debe ser único`);
  }
  assert.equal(html.split('role="separator"').length - 1, 3, "un separador «o» por pestaña");
});
