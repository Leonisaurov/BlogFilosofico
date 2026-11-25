/**
 * check-feeds.mjs — Comprueba que los feeds generados siguen a ARTICLES.
 *
 * Sin dependencias. Se puede ejecutar solo (`node scripts/check-feeds.mjs`) o
 * desde cualquier verificación: falla con exit 1 si falta algún archivo o si
 * `feed.xml` / `sitemap.xml` no coinciden byte a byte con lo que generaría
 * `scripts/generate-feeds.mjs`.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ARTICLES } from "../js/data/articles.js";
import { buildFeedXml, buildSitemapXml } from "./generate-feeds.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED = {
  "feed.xml": buildFeedXml(),
  "sitemap.xml": buildSitemapXml(),
};

let failed = false;
for (const [filename, expected] of Object.entries(EXPECTED)) {
  const target = path.join(ROOT, filename);
  if (!fs.existsSync(target)) {
    console.error(`FAIL ${filename}: no existe (ejecutá node scripts/generate-feeds.mjs)`);
    failed = true;
    continue;
  }
  const actual = fs.readFileSync(target, "utf8");
  if (actual !== expected) {
    console.error(`FAIL ${filename}: desincronizado con ARTICLES`);
    failed = true;
  } else {
    console.log(`OK ${filename}: coincide con ${ARTICLES.length} publicaciones`);
  }
}

if (failed) process.exitCode = 1;
else console.log("Feeds al día.");
