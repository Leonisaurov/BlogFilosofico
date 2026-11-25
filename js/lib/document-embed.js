/**
 * document-embed.js — Documento externo de los «Textos oficiales».
 *
 * El `.docx` NO se aloja en este sitio: la publicación solo guarda la URL HTTPS
 * de un visor externo (o la marca «pendiente» mientras el admin la revisa).
 *
 * Dos reglas compartidas por el editor, el importador y la vista de lectura:
 *   - `parseDocumentUrl` acepta SOLO sintaxis HTTPS (sin credenciales ni
 *     caracteres de control, hasta 2000 caracteres).
 *   - `canEmbed(host, allowedHosts)` es el ÚNICO gate para crear un iframe: la
 *     lista de hosts es obligatoria y, mientras esté vacía, no se embebe nada.
 *
 * Sin dependencias y sin DOM: se usa tanto en Node como en el navegador.
 */

export const DOCUMENT_URL_MAX = 2000;

/**
 * Valida una URL de documento y devuelve su `URL` normalizada.
 * Lanza un Error en español con el motivo del rechazo.
 */
export function parseDocumentUrl(value) {
  const raw = String(value ?? "");
  if (!raw.trim()) throw new Error("falta la URL del documento");
  if (raw.length > DOCUMENT_URL_MAX) {
    throw new Error(`la URL del documento supera ${DOCUMENT_URL_MAX} caracteres`);
  }
  // Espacios, saltos de línea y cualquier carácter de control quedan fuera:
  // no se normalizan para que una URL arms no pueda esconderse en el texto.
  if (/[\u0000-\u0020\u007f-\u009f]/.test(raw)) {
    throw new Error("la URL del documento contiene espacios o caracteres de control");
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("la URL del documento no es válida");
  }
  if (url.protocol !== "https:") {
    throw new Error('la URL del documento debe usar HTTPS (se rechaza "' + url.protocol + '")');
  }
  if (url.username || url.password) {
    throw new Error("la URL del documento no puede incluir credenciales");
  }
  if (!url.hostname || !/^[a-z0-9.-]+$/i.test(url.hostname)) {
    throw new Error("la URL del documento no tiene un host válido");
  }
  return url;
}

const DRIVE_HOST = "drive.google.com";
const DRIVE_ID_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Convierte un enlace compartido de Google Drive en la URL del visor.
 *
 * Acepta `https://drive.google.com/file/d/<ID>/view[?…]`, `/preview[?…]` y
 * `https://drive.google.com/open?id=<ID>`. Devuelve siempre
 * `https://drive.google.com/file/d/<ID>/preview` y valida el resultado con
 * `parseDocumentUrl`. Rechaza otros hosts/esquemas, IDs inválidos y los enlaces
 * de descarga directa (`uc?export=download`), con mensajes en español.
 */
export function documentUrlFromDriveLink(raw) {
  const texto = String(raw ?? "").trim();
  if (!texto) throw new Error("pegá el enlace de Google Drive para convertirlo");

  let url;
  try {
    url = new URL(texto);
  } catch {
    throw new Error("el enlace de Google Drive no es una URL válida");
  }
  if (url.protocol !== "https:") {
    throw new Error(`el enlace de Google Drive debe usar HTTPS (se rechaza "${url.protocol}")`);
  }
  if (url.username || url.password) {
    throw new Error("el enlace de Google Drive no puede incluir credenciales");
  }
  if (url.hostname.toLowerCase() !== DRIVE_HOST) {
    throw new Error(`el enlace debe ser de drive.google.com (se rechaza "${url.hostname}")`);
  }
  if (
    url.pathname.replace(/\/$/, "") === "/uc" &&
    (url.searchParams.get("export") === "download" || url.searchParams.has("download"))
  ) {
    throw new Error("ese enlace descarga el archivo (uc?export=download); usá el enlace del visor /file/d/<ID>/preview");
  }

  const delArchivo = url.pathname.match(/^\/file\/d\/([^/]+)\/(?:view|preview)\/?$/i);
  const id = delArchivo
    ? delArchivo[1]
    : url.pathname.replace(/\/$/, "") === "/open"
      ? url.searchParams.get("id") ?? ""
      : "";
  if (!DRIVE_ID_RE.test(id)) {
    throw new Error("el enlace no tiene un identificador de documento válido");
  }

  const preview = `https://${DRIVE_HOST}/file/d/${id}/preview`;
  parseDocumentUrl(preview); // Validación final de autoridad sobre el resultado.
  return preview;
}

/** ¿Es este host el autorizado para embebirse? Sin lista, nunca. */
export function canEmbed(host, allowedHosts) {
  if (!Array.isArray(allowedHosts) || allowedHosts.length === 0) return false;
  const normalize = (value) =>
    String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/[:\/].*$/, "")
      .replace(/\.$/, "");
  const clean = normalize(host);
  if (!clean || !/^[a-z0-9.-]+$/.test(clean)) return false;
  return allowedHosts.some((entry) => normalize(entry) === clean);
}
