/**
 * index-view.js — Índice general del sitio.
 *
 * No es una cuadrícula de tarjetas: es un sumario editorial. Los artículos se
 * ordenan por fecha y se presentan como entradas de índice; las secciones se
 * derivan de `SECTIONS` y sus contadores de `ARTICLES`.
 */

import { ARTICLES, articleHref } from "../data/articles.js";
import { SECTION_GROUPS, sectionsWithCounts } from "../data/sections.js";
import { escapeHtml } from "../lib/dom.js";
import { formatShortDate } from "../lib/format.js";

export function createIndexView(root) {
  const articles = [...ARTICLES].sort((a, b) =>
    String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))
  );
  const sections = sectionsWithCounts();

  const sectionLinks = SECTION_GROUPS.map((group) => {
    const items = sections.filter((section) => section.group === group.id);
    if (!items.length) return "";
    return `
      <div class="index__section-group">
        <h3 class="index__section-label">${escapeHtml(group.label)}</h3>
        <div class="index__chips">
          ${items
            .map(
              (section) => `
              <a class="index__chip${section.count === 0 ? " is-empty" : ""}"
                 href="#/secciones/${escapeHtml(section.slug)}">
                ${escapeHtml(section.name)}
                <span>${section.count === 0 ? "pronto" : section.count}</span>
              </a>`
            )
            .join("")}
        </div>
      </div>`;
  }).join("");

  const rows = articles
    .map((article, index) => {
      const types = Array.isArray(article.types) && article.types.length
        ? article.types.join(" · ")
        : "Texto";
      return `
        <a class="index__row" href="${articleHref(article)}">
          <span class="index__num" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
          <span class="index__body">
            <span class="index__row-title">${escapeHtml(article.title)}</span>
            <span class="index__excerpt">${escapeHtml(article.description || "")}</span>
            <span class="index__meta">
              ${escapeHtml(article.category || "Filosofía")} · ${escapeHtml(types)}
              ${article.author ? ` · ${escapeHtml(article.author)}` : ""}
            </span>
          </span>
          <span class="index__date">${escapeHtml(formatShortDate(article.createdAt))}</span>
          <span class="index__arrow" aria-hidden="true">↗</span>
        </a>`;
    })
    .join("");

  root.innerHTML = `
    <div class="index__inner">
      <header class="index__header">
        <p class="eyebrow">Índice general</p>
        <h1 class="index__title">Todo lo publicado,<br /><em>en orden de fecha</em>.</h1>
        <p class="index__lede">
          ${articles.length} aportaciones y un mapa de secciones para entrar por
          donde más te interese. El índice se actualiza con cada publicación.
        </p>
        <div class="index__actions">
          <a class="button button--primary" href="#/leer">Leer de corrido</a>
          <a class="button button--ghost" href="#/aportar">Enviar una aportación</a>
        </div>
      </header>

      <section class="index__sections" aria-labelledby="index-sections-title">
        <div class="index__section-head">
          <h2 class="index__subtitle" id="index-sections-title">Por sección</h2>
          <a class="text-link" href="#/secciones">Explorar el mapa completo <span aria-hidden="true">→</span></a>
        </div>
        ${sectionLinks}
      </section>

      <section class="index__catalog" aria-labelledby="index-catalog-title">
        <div class="index__section-head">
          <h2 class="index__subtitle" id="index-catalog-title">Todo lo publicado</h2>
          <span class="index__count">${articles.length} textos</span>
        </div>
        <div class="index__list">${rows}</div>
      </section>
    </div>
  `;

  return { element: root };
}
