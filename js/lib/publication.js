/**
 * publication.js — Modelo común de publicación.
 *
 * Una publicación del Blog de Filosofía se representa con estos campos y se
 * usa en las dos vistas: la tarjeta del feed y la página de lectura.
 *
 *   id             Identificador único y estable.
 *   slug           Identificador legible para la URL (#/articulos/<slug>).
 *   title          Título del artículo.
 *   description    Descripción breve que se superpone en la tarjeta.
 *   category       Categoría filosófica.
 *   types          Tipos de texto (género literario). Siempre una lista:
 *                  un artículo puede ser, por ejemplo, ensayo y artículo.
 *   author         Autor (opcional).
 *   coverImage     Referencia de portada: URL, ruta ./assets/... o data-URL.
 *   coverLocalName Nombre del archivo local pendiente de incorporar a assets/
 *                  (auxiliar; solo para exportar/compartir).
 *   content        Contenido completo en Markdown.
 *   createdAt      Fecha de creación (YYYY-MM-DD).
 *
 * El contenido Markdown es el cuerpo completo; la descripción breve es un
 * campo aparte y nunca se confunde con él.
 */

import { SITE } from "../data/config.js";
import { slugify } from "./slug.js";

/** Minutos de lectura estimados (≈200 palabras por minuto). */
export function estimateReadingTime(markdown) {
  const words = String(markdown ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`|\-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Normaliza los tipos de texto a una lista limpia y sin repetidos. */
export function normalizeTypes(value) {
  const list = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const type = String(item ?? "").trim();
    if (type && !seen.has(type.toLowerCase())) {
      seen.add(type.toLowerCase());
      out.push(type);
    }
  }
  return out;
}

/** Normaliza datos parciales a una publicación completa. */
export function createPublication(partial = {}) {
  const title = String(partial.title ?? "").trim();
  const slug = partial.slug || slugify(title || "borrador");
  return {
    id: partial.id || slug,
    slug,
    title,
    description: String(partial.description ?? "").trim(),
    category: String(partial.category ?? "").trim(),
    types: normalizeTypes(partial.types),
    author: String(partial.author ?? "").trim(),
    coverImage: String(partial.coverImage ?? "").trim(),
    coverLocalName: String(partial.coverLocalName ?? "").trim(),
    content: String(partial.content ?? ""),
    createdAt: partial.createdAt || new Date().toISOString().slice(0, 10),
  };
}

/** ¿La publicación no tiene nada escrito? */
export function isPublicationEmpty(publication) {
  return !(
    publication.title ||
    publication.description ||
    publication.content ||
    publication.coverImage
  );
}

/** Valor escalar seguro para YAML (comillas dobles con escapes). */
function yamlValue(value) {
  return JSON.stringify(String(value ?? ""));
}

/** Serializa la publicación como Markdown con front matter YAML. */
export function toFrontMatter(publication) {
  const lines = [
    "---",
    `title: ${yamlValue(publication.title)}`,
    `slug: ${publication.slug}`,
    `description: ${yamlValue(publication.description)}`,
    `category: ${yamlValue(publication.category)}`,
    `types: ${JSON.stringify(publication.types ?? [])}`,
    `author: ${yamlValue(publication.author)}`,
    `coverImage: ${yamlValue(publication.coverImage)}`,
    `createdAt: ${publication.createdAt}`,
  ];
  if (publication.coverLocalName) {
    lines.push(`# Imagen local pendiente: copiar "${publication.coverLocalName}" a la carpeta assets/ del proyecto.`);
  }
  lines.push("---", "", publication.content ?? "", "");
  return lines.join("\n");
}

/** Serializa la publicación como JSON listo para incorporar a ARTICLES. */
export function toJson(publication) {
  return (
    JSON.stringify(
      {
        ...publication,
        readingTime: estimateReadingTime(publication.content),
      },
      null,
      2
    ) + "\n"
  );
}

/** Categorías sugeridas para el editor. */
export const CATEGORY_OPTIONS = SITE.categories;
