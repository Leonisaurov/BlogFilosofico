/**
 * generate-feeds.mjs — Regenera el RSS y el sitemap desde la fuente única.
 *
 * Node >= 22, sin dependencias. `js/data/articles.js` es la única fuente de
 * publicaciones: este script solo la lee y escribe `feed.xml` y `sitemap.xml`
 * en la raíz. Es determinista (mismo orden que ARTICLES, sin marcas de tiempo
 * de generación) e idempotente (no reescribe archivos iguales).
 *
 * El sitio es estático: el navegador NO genera el feed. Hay que ejecutar este
 * script tras añadir o editar una publicación y desplegar los archivos.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ARTICLES } from "../js/data/articles.js";
import { SITE } from "../js/data/config.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Escapa texto para XML (incluye comillas, aunque no van en nodos). */
export function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** URL pública canónica de una publicación (hash routing). */
export function articleUrl(article) {
  return `${SITE.url.replace(/\/$/, "")}/#/articulos/${encodeURIComponent(article.slug)}`;
}

/** Fecha RFC 822 para RSS, derivada de `createdAt` (medianoche UTC). */
export function pubDate(article) {
  const date = new Date(`${article.createdAt}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? "" : date.toUTCString();
}

export function buildFeedXml(articles = ARTICLES) {
  const items = articles
    .map((article) => {
      const url = articleUrl(article);
      const date = pubDate(article);
      return [
        "    <item>",
        `      <title>${escapeXml(article.title)}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        date ? `      <pubDate>${date}</pubDate>` : "",
        `      <description>${escapeXml(article.description || "")}</description>`,
        article.category ? `      <category>${escapeXml(article.category)}</category>` : "",
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "  <channel>",
    `    <title>${escapeXml(SITE.name)}</title>`,
    `    <link>${escapeXml(SITE.url)}</link>`,
    `    <description>${escapeXml(
      "Una publicación para pensar despacio: filosofía sin prisa, una pregunta por semana y aportaciones que se leen, se editan y se responden."
    )}</description>`,
    "    <language>es</language>",
    items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

export function buildSitemapXml(articles = ARTICLES) {
  const urls = [SITE.url, ...articles.map(articleUrl)]
    .map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`)
    .join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>",
    "",
  ].join("\n");
}

/** Escribe solo si cambió: el contenido es estable entre ejecuciones. */
function writeIfChanged(filename, content) {
  const target = path.join(ROOT, filename);
  const previous = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
  if (previous === content) return false;
  fs.writeFileSync(target, content, "utf8");
  return true;
}

export function generate() {
  const written = [
    writeIfChanged("feed.xml", buildFeedXml()),
    writeIfChanged("sitemap.xml", buildSitemapXml()),
  ];
  return written.filter(Boolean).length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const changed = generate();
  console.log(
    `feed.xml y sitemap.xml generados desde ${ARTICLES.length} publicaciones ` +
      `(${changed} archivo(s) actualizado(s)).`
  );
}
