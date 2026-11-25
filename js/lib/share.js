/**
 * share.js — Exportar una aportación y preparar el correo de envío.
 *
 * Esta página es estática: no puede enviar correos ni adjuntar archivos por sí
 * sola. Estas funciones generan el `.md` (y el `.json`) para descargar y arman
 * un `mailto:` breve para presentar la aportación. Nunca se afirma que el
 * mensaje se haya enviado, que los archivos estén adjuntos ni que la aportación
 * esté publicada: el usuario debe adjuntar los archivos y enviarlos desde su
 * propio cliente de correo. La aportación queda sujeta a revisión editorial:
 * no se publica, no se despliega y no hay respuesta automática.
 */

import { SITE } from "../data/config.js";
import { toFrontMatter, toJson } from "./publication.js";
import { slugify } from "./slug.js";

export { slugify };

/** Asunto fijo de la propuesta (no depende del título ni de su longitud). */
export const PROPOSAL_SUBJECT = "Aportación para Blog de Filosofía";

/**
 * Cuerpo del correo, deliberadamente breve: saludo, motivo y el aviso de
 * revisión humana con los plazos de la política editorial. No incluye la
 * aportación, no adjunta nada y no promete más de lo que dice esa política.
 */
export const PROPOSAL_BODY = [
  "Hola:",
  "",
  `Adjunto una aportación para el ${SITE.name}.`,
  "",
  "Queda sujeta a revisión editorial. Según nuestra política acusamos recibo por correo en hasta 72 horas y comunicamos la decisión en hasta 15 días hábiles.",
  "",
  "No hay respuesta automática ni confirmación automática: no se publica y no se despliega nada desde el sitio; la revisión la hace una persona.",
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

/** JSON con todos los campos, útil como registro de la aportación importada. */
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
