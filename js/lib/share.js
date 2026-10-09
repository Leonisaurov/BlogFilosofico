/**
 * share.js — Exportar una publicación y preparar la propuesta por correo.
 *
 * Esta página es estática: no puede enviar correos ni adjuntar archivos por sí
 * sola. Estas funciones generan el `.md` (y el `.json`) para descargar y arman
 * un `mailto:` breve para presentar la propuesta. Nunca se afirma que el
 * mensaje se haya enviado, que los archivos estén adjuntos ni que el artículo
 * esté publicado: el usuario debe adjuntar los archivos y enviarlos desde su
 * propio cliente de correo.
 */

import { SITE } from "../data/config.js";
import { toFrontMatter, toJson } from "./publication.js";
import { slugify } from "./slug.js";

export { slugify };

/** Asunto fijo de la propuesta (no depende del título ni de su longitud). */
export const PROPOSAL_SUBJECT = "Propuesta de artículo para Blog de Filosofía";

/**
 * Cuerpo del correo, deliberadamente mínimo: un saludo y el motivo. No incluye
 * el artículo, no da instrucciones a quien recibe y no adjunta nada.
 */
export const PROPOSAL_BODY = [
  "Hola:",
  "",
  `Adjunto una propuesta de artículo para el ${SITE.name} para su revisión.`,
  "",
  "Gracias.",
].join("\n");

/**
 * Construye el enlace `mailto:` de la propuesta con destinatario, asunto y
 * cuerpo codificados. No adjunta archivos (mailto: no lo permite).
 * @returns {{href:string, subject:string, body:string, to:string}}
 */
export function buildProposalMailto({ to = SITE.adminEmail } = {}) {
  const subject = PROPOSAL_SUBJECT;
  const body = PROPOSAL_BODY;
  const href = `mailto:${to}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
  return { href, subject, body, to };
}

/** Markdown con front matter: sirve para incorporar la publicación al repo. */
export function buildPublicationMarkdownFile(publication) {
  return {
    filename: `${publication.slug || slugify(publication.title)}.md`,
    content: toFrontMatter(publication),
  };
}

/** JSON con todos los campos, listo para pegar en js/data/articles.js. */
export function buildPublicationJsonFile(publication) {
  return {
    filename: `${publication.slug || slugify(publication.title)}.json`,
    content: toJson(publication),
  };
}

/** Descarga un Blob ya construido (texto, imagen, etc.). */
export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Descarga texto como archivo. */
export function downloadText(filename, text, type = "text/plain;charset=utf-8") {
  downloadBlob(filename, new Blob([text], { type }));
}

/** Copia al portapapeles con alternativa para entornos sin Clipboard API. */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* se intenta el método clásico */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
