/**
 * front-matter.mjs — serializadores del panel y validación estricta previa.
 *
 * Los importadores (`scripts/import-submissions.mjs` y
 * `scripts/import-questions.mjs`) siguen siendo la AUTORIDAD: acá solo se
 * escriben las mismas claves exactas y se rechazan de entrada los casos que la
 * condición crítica del panel exige (XOR del documento oficial, booleanos
 * literales, HTTPS, estado coherente y correo válido). Los lectores son los
 * propios `parseSubmission` / `parseQuestion` / `parseResponse`.
 */

import { SITE } from "../../js/data/config.js";
import { SECTIONS, TEXT_TYPES } from "../../js/data/sections.js";
import { parseDocumentUrl } from "../../js/lib/document-embed.js";
import { slugify } from "../../js/lib/slug.js";
import { parseSubmission } from "../../scripts/import-submissions.mjs";
import {
  isMondayISO,
  parseQuestion,
  parseResponse,
  unitSlug,
} from "../../scripts/import-questions.mjs";

export { parseSubmission, parseQuestion, parseResponse, isMondayISO, unitSlug };

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const OFICIAL = "Texto oficial";

/** Valor escalar seguro para el front matter (una sola línea, JSON escapado). */
function yaml(value) {
  return JSON.stringify(String(value ?? ""));
}

/** "si" / "sí" literal, NUNCA `Boolean("no")`. */
export function esSi(value) {
  const limpio = String(value ?? "").trim().toLowerCase();
  return limpio === "si" || limpio === "sí";
}

/** Normaliza un sí/no estricto; cualquier otro valor es error. */
export function siNo(value, nombre) {
  const limpio = String(value ?? "").trim().toLowerCase();
  if (limpio === "si" || limpio === "sí") return "si";
  if (limpio === "no") return "no";
  throw new Error(`${nombre} debe ser "si" o "no" (no "${String(value ?? "")}")`);
}

/** Slug de autor: minúsculas, números y guiones, sin acentos. */
export function autorSlug(nombre) {
  const slug = slugify(nombre);
  return SLUG_RE.test(slug) ? slug : "";
}

/** Serializa una pregunta con las claves exactas de import-questions.mjs:42-44. */
export function serializarPregunta(q) {
  const lineas = [
    "---",
    `week: ${yaml(q.week)}`,
    `slug: ${yaml(q.slug)}`,
    `estado: ${yaml(q.estado)}`,
    `question: ${yaml(q.question)}`,
    `context: ${yaml(q.context)}`,
  ];
  if (String(q.note ?? "").trim()) lineas.push(`note: ${yaml(q.note)}`);
  if (String(q.closing ?? "").trim()) lineas.push(`closing: ${yaml(q.closing)}`);
  if (String(q.cover ?? "").trim()) lineas.push(`cover: ${yaml(q.cover)}`);
  if (String(q.unidad ?? "").trim()) lineas.push(`unidad: ${yaml(q.unidad)}`);
  lineas.push("---", "", String(q.content ?? ""), "");
  return lineas.join("\n");
}

/** Serializa una respuesta con las claves exactas de import-questions.mjs:45-47. */
export function serializarRespuesta(r) {
  const lineas = [
    "---",
    `week: ${yaml(r.week)}`,
    `slug: ${yaml(r.slug)}`,
    `author: ${yaml(r.author)}`,
    `authorization: ${yaml(r.authorization)}`,
  ];
  if (String(r.city ?? "").trim()) lineas.push(`city: ${yaml(r.city)}`);
  if (String(r.email ?? "").trim()) lineas.push(`email: ${yaml(r.email)}`);
  lineas.push(`publicarEmail: ${yaml(r.publicarEmail)}`);
  lineas.push("---", "", String(r.content ?? ""), "");
  return lineas.join("\n");
}

/**
 * Validación de la publicación en el panel. Devuelve los errores en español y
 * el valor normalizado de `documentoPendiente` ("si" o cadena vacía) para que
 * `createPublication()` no convierta `"no"` en `true` con `Boolean`.
 */
export function validarPublicacion(publicacion) {
  const errores = [];
  const pub = publicacion ?? {};
  const titulo = String(pub.title ?? "").trim();
  const slug = String(pub.slug ?? "").trim();
  if (!titulo) errores.push("el título está vacío");
  if (!SLUG_RE.test(slug) || slug.length > 60) {
    errores.push(`el slug "${slug}" no es válido (minúsculas, números y guiones; máximo 60 caracteres)`);
  }
  const fecha = String(pub.createdAt ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(new Date(`${fecha}T00:00:00Z`).getTime())) {
    errores.push(`createdAt "${fecha}" no es una fecha ISO válida`);
  }

  const tipos = Array.isArray(pub.types) ? pub.types.map((t) => String(t).trim()) : [];
  const conocidos = new Set(TEXT_TYPES.map((t) => t.toLowerCase()));
  for (const tipo of tipos) {
    if (!conocidos.has(tipo.toLowerCase())) errores.push(`el tipo "${tipo}" no está en el catálogo`);
  }
  // Mismo catálogo que el importador: SITE.categories + nombres y alias.
  const categorias = new Set([
    ...SITE.categories,
    ...SECTIONS.flatMap((seccion) => [seccion.name, ...(seccion.aliases ?? [])]),
  ].map((valor) => valor.toLowerCase()));
  if (!categorias.has(String(pub.category ?? "").trim().toLowerCase())) {
    errores.push(`la categoría "${pub.category}" no está en el catálogo`);
  }

  // XOR estricta: una sola de las dos, y solo dentro de un Texto oficial.
  const esOficial = String(pub.kind ?? "").trim() === "oficial";
  const url = String(pub.documentUrl ?? "").trim();
  const pendiente = esSi(pub.documentoPendiente);
  const tieneUrl = Boolean(url);
  if (esOficial) {
    if (tieneUrl === pendiente) {
      errores.push('un Texto oficial exige exactamente una de "documentUrl" o "documentoPendiente"');
    }
    if (tieneUrl) {
      try {
        parseDocumentUrl(url);
      } catch (error) {
        errores.push(`documentUrl: ${error.message}`);
      }
    }
    if (!String(pub.cover?.credit ?? "").trim()) {
      errores.push("la cita bajo la portada (cover.credit) es obligatoria en un Texto oficial");
    }
    if (!tipos.some((tipo) => tipo.toLowerCase() === OFICIAL.toLowerCase())) {
      errores.push(`el tipo "${OFICIAL}" es obligatorio en un Texto oficial`);
    }
  } else {
    if (tieneUrl) errores.push('documentUrl solo se admite en un Texto oficial (kind: oficial)');
    if (pendiente) errores.push('documentoPendiente solo se admite en un Texto oficial (kind: oficial)');
    if (tipos.some((tipo) => tipo.toLowerCase() === OFICIAL.toLowerCase())) {
      errores.push('el tipo "Texto oficial" exige kind: oficial');
    }
  }

  return { errores, documentoPendiente: pendiente ? "si" : "" };
}

/** Validación de la pregunta: `estado` coherente con su carpeta. */
export function validarPregunta(pregunta, { estado } = {}) {
  const errores = [];
  const q = pregunta ?? {};
  if (!["abierta", "cerrada"].includes(String(q.estado ?? ""))) {
    errores.push(`estado "${q.estado}" no válido (usa abierta o cerrada)`);
  }
  if (estado && q.estado !== estado) {
    errores.push(`estado "${q.estado}" no coincide con la carpeta ${estado === "abierta" ? "abiertas/" : "cerradas/"}`);
  }
  if (!isMondayISO(q.week)) errores.push(`week "${q.week}" no es un lunes ISO válido`);
  if (!SLUG_RE.test(String(q.slug ?? "")) || String(q.slug ?? "").length > 60) {
    errores.push(`el slug "${q.slug}" no es válido`);
  }
  if (!String(q.question ?? "").trim()) errores.push("la pregunta está vacía");
  if (!String(q.context ?? "").trim()) errores.push("el contexto está vacío");
  if (String(q.unidad ?? "").trim() && String(q.unidad).trim() !== "no") {
    errores.push('la clave opcional "unidad" solo admite el valor "no"');
  }
  if (unitSlug(q).length > 60) errores.push("el slug de la unidad supera los 60 caracteres");
  return errores;
}

/**
 * Validación de la respuesta: sí/no literales y correo válido si se publica.
 * `authorization: si` es obligatorio para que la unidad la incluya; el panel
 * lo advierte sin impedir guardar una respuesta todavía no autorizada.
 */
export function validarRespuesta(respuesta) {
  const errores = [];
  const r = respuesta ?? {};
  if (!isMondayISO(r.week)) errores.push(`week "${r.week}" no es un lunes ISO válido`);
  if (!SLUG_RE.test(String(r.slug ?? "")) || String(r.slug ?? "").length > 60) {
    errores.push(`el slug "${r.slug}" no es válido`);
  }
  if (!String(r.author ?? "").trim()) errores.push("el autor está vacío");
  let authorization;
  let publicarEmail;
  try {
    authorization = siNo(r.authorization, "authorization");
  } catch (error) {
    errores.push(error.message);
  }
  try {
    publicarEmail = siNo(r.publicarEmail, "publicarEmail");
  } catch (error) {
    errores.push(error.message);
  }
  if (publicarEmail === "si" && !EMAIL_RE.test(String(r.email ?? "").trim())) {
    errores.push("publicarEmail: si exige un correo electrónico válido");
  }
  if (r.publicar && authorization !== "si") {
    errores.push("para incluir la respuesta en la unidad hace falta authorization: si");
  }
  return errores;
}
