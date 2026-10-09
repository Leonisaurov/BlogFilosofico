/**
 * cover.js — Portadas editoriales locales en SVG.
 *
 * Genera una portada tipográfica (degradado + numeral + geometría) como
 * data-URI. Se usa como capa de respaldo garantizada: no depende de la red
 * ni de servidores externos, así que la tarjeta siempre tiene portada.
 * Si la imagen remota de dominio público carga, se superpone encima.
 */

import { escapeHtml as esc } from "./dom.js";

const DEFAULT_PALETTE = { from: "#6b5842", to: "#3f3225", accent: "#c8ab84" };

/** Paletas de reserva: portadas cálidas (café/sepia) para publicaciones sin
    paleta propia. Conservan el contraste con el texto marfil superpuesto. */
const FALLBACK_PALETTES = [
  { from: "#6b5842", to: "#3f3225", accent: "#c8ab84" },
  { from: "#7a6248", to: "#463829", accent: "#d0b48c" },
  { from: "#5f4d3a", to: "#382d21", accent: "#c2a67f" },
  { from: "#836a4d", to: "#4a3b2a", accent: "#d6bb92" },
  { from: "#6e5740", to: "#403223", accent: "#c9ad86" },
  { from: "#75604a", to: "#443628", accent: "#cdb28b" },
  { from: "#64523e", to: "#3a2e22", accent: "#c5a882" },
];

function hashText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

/** Paleta de la portada: la declarada o una estable derivada del id/slug. */
function paletteFor(article) {
  if (article?.cover?.palette) return article.cover.palette;
  if (!article) return DEFAULT_PALETTE;
  const key = String(article.id ?? article.slug ?? article.title ?? "");
  if (!key) return DEFAULT_PALETTE;
  return FALLBACK_PALETTES[hashText(key) % FALLBACK_PALETTES.length];
}

/**
 * Devuelve el marcado SVG de la portada para una publicación.
 * Las medidas se derivan de width/height, así que sirve tanto para la
 * tarjeta (retrato) como para la cabecera del artículo (apaisado).
 */
export function coverSvg(article, { width = 1200, height = 1600 } = {}) {
  const palette = paletteFor(article);
  const numeral = article?.cover?.numeral ?? "·";
  const title = article?.title ?? "";

  const short = Math.min(width, height);
  const pad = Math.round(width * 0.075);
  const numSize = Math.round(short * 0.42);
  const markSize = Math.round(short * 0.03);
  const cx = Math.round(width * 0.84);
  const cy = Math.round(height * 0.24);
  const r1 = Math.round(short * 0.3);
  const r2 = Math.round(short * 0.2);
  const hairline = Math.round(height * 0.52);
  const gradientId = `cover-${String(article?.id ?? "x").replace(/[^a-z0-9-]/gi, "")}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(title)}">
  <defs>
    <linearGradient id="${gradientId}" x1="0" y1="0" x2="0.75" y2="1">
      <stop offset="0" stop-color="${esc(palette.from)}"/>
      <stop offset="1" stop-color="${esc(palette.to)}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#${gradientId})"/>
  <g fill="none" stroke="${esc(palette.accent)}" opacity="0.24">
    <circle cx="${cx}" cy="${cy}" r="${r1}"/>
    <circle cx="${cx}" cy="${cy}" r="${r2}" opacity="0.7"/>
  </g>
  <g stroke="#f4efe6" opacity="0.10">
    <line x1="${pad}" y1="${hairline}" x2="${width - pad}" y2="${hairline}"/>
    <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}"/>
  </g>
  <text x="${width - pad}" y="${pad + Math.round(numSize * 0.78)}" text-anchor="end"
        font-family="Georgia, serif" font-size="${numSize}"
        fill="#f4efe6" opacity="0.15">${esc(numeral)}</text>
  <text x="${pad}" y="${pad + markSize}" font-family="Georgia, serif"
        font-size="${markSize}" fill="${esc(palette.accent)}" opacity="0.9"
        letter-spacing="2">&#966; &#183; BLOG DE FILOSOF&#205;A</text>
</svg>`;
}

/** Igual que coverSvg, pero codificado como data-URI listo para CSS o <img>. */
export function coverDataUri(article, options) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(coverSvg(article, options))}`;
}
