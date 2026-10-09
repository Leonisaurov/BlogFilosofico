/**
 * sections.js — Explorador temático del blog.
 *
 * Dos vistas sobre el mismo componente:
 *   #/secciones              → cuadrícula de todas las secciones.
 *   #/secciones/<slug>       → página de una sección con sus artículos.
 *
 * Toda la información (nombres, contadores y artículos) se DERIVA del catálogo
 * central (`js/data/sections.js`) y de `ARTICLES`: no hay listas manuales ni
 * copias por sección. Al añadir o recategorizar una publicación en
 * `articles.js`, estas vistas se actualizan solas en el siguiente render.
 *
 * Los artículos se muestran con la MISMA tarjeta del feed (`card.js`), en su
 * variante de cuadrícula (`variant: "grid"`), y abren la página individual
 * mediante la navegación existente (`#/articulos/<slug>`).
 */

import {
  SECTION_GROUPS,
  articlesForSection,
  sectionHref,
  sectionsWithCounts,
} from "../data/sections.js";
import { escapeHtml } from "../lib/dom.js";
import { createCard } from "./card.js";

const BACK_ARROW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M20 12H5M11 6l-6 6 6 6"/></svg>`;

/** Texto del contador, siempre calculado a partir de los datos reales. */
function countLabel(count) {
  if (count === 0) return "Próximamente";
  return count === 1 ? "1 artículo" : `${count} artículos`;
}

/** Tarjeta de una sección (imagen + nombre + descripción + contador). */
function sectionCard(section) {
  const card = document.createElement("a");
  card.className = "section-card";
  if (section.count === 0) card.classList.add("section-card--empty");
  card.href = sectionHref(section);
  card.setAttribute(
    "aria-label",
    `${section.name} — ${countLabel(section.count)}. Abrir sección.`
  );
  card.innerHTML = `
    <span class="section-card__media">
      <img class="section-card__img" src="${escapeHtml(section.image)}" alt=""
        loading="lazy" decoding="async" />
    </span>
    <span class="section-card__body">
      <span class="section-card__name">${escapeHtml(section.name)}</span>
      <span class="section-card__desc">${escapeHtml(section.description)}</span>
      <span class="section-card__count">${escapeHtml(countLabel(section.count))}</span>
    </span>
  `;
  return card;
}

/** Estado vacío cuidado: nunca se rellena con artículos de otras temáticas. */
function emptyState() {
  const box = document.createElement("div");
  box.className = "section-empty";
  box.innerHTML = `
    <p class="section-empty__mark" aria-hidden="true">&#966;</p>
    <h2 class="section-empty__title">Todavía no hay artículos en esta sección</h2>
    <p class="section-empty__text">
      Esta temática todavía no tiene publicaciones. Podés explorar otras secciones
      o volver al Blog mientras preparamos nuevos artículos.
    </p>
    <span class="section-empty__actions">
      <a class="section-empty__link" href="#/secciones">Ver todas las secciones</a>
      <a class="section-empty__link section-empty__link--ghost" href="#/">Volver al Blog</a>
    </span>
  `;
  return box;
}

export function createSections(root) {
  let isOpen = false;

  /** Pinta la cuadrícula completa, agrupada por época y por problema. */
  function renderGrid() {
    const sections = sectionsWithCounts();

    root.innerHTML = `
      <div class="sections__bar">
        <a class="sections__back" href="#/">${BACK_ARROW}<span>Volver al Blog</span></a>
        <span class="sections__bar-label">Secciones</span>
      </div>
      <div class="sections__scroll" data-scroll>
        <div class="sections__inner">
          <header class="sections__intro">
            <p class="eyebrow">Explorar</p>
            <h1 class="sections__title" tabindex="-1">Explorar secciones</h1>
            <p class="sections__lede">
              La filosofía no es un bloque: es un mapa de preguntas. Recorré las
              distintas áreas por época o por problema y encontrá por dónde empezar.
            </p>
          </header>
          ${SECTION_GROUPS.map((group) => {
            const items = sections.filter((section) => section.group === group.id);
            if (!items.length) return "";
            return `
              <section class="sections__group" aria-labelledby="grupo-${group.id}">
                <div class="sections__group-head">
                  <h2 class="sections__group-title" id="grupo-${group.id}">${escapeHtml(
                    group.label
                  )}</h2>
                  <p class="sections__group-note">${escapeHtml(group.note)}</p>
                </div>
                <div class="sections__grid" data-grid="${group.id}"></div>
              </section>`;
          }).join("")}
        </div>
      </div>
    `;

    for (const group of SECTION_GROUPS) {
      const grid = root.querySelector(`[data-grid="${group.id}"]`);
      if (!grid) continue;
      for (const section of sections.filter((s) => s.group === group.id)) {
        grid.append(sectionCard(section));
      }
    }
  }

  /** Pinta la página de una sección con sus artículos (o su estado vacío). */
  function renderSection(section) {
    const articles = articlesForSection(section);
    const group = SECTION_GROUPS.find((item) => item.id === section.group);
    const groupLabel = group?.label ?? "Sección";

    root.innerHTML = `
      <div class="sections__bar">
        <a class="sections__back" href="#/secciones">${BACK_ARROW}<span>Volver a secciones</span></a>
        <span class="sections__bar-label">${escapeHtml(groupLabel)}</span>
      </div>
      <div class="sections__scroll" data-scroll>
        <div class="sections__inner">
          <header class="section-hero">
            <div class="section-hero__media">
              <img class="section-hero__img" src="${escapeHtml(section.image)}" alt=""
                decoding="async" />
            </div>
            <div class="section-hero__text">
              <p class="eyebrow section-hero__eyebrow">${escapeHtml(groupLabel)}</p>
              <h1 class="section-hero__title" tabindex="-1">${escapeHtml(section.name)}</h1>
              <p class="section-hero__desc">${escapeHtml(section.description)}</p>
              <p class="section-hero__count">${escapeHtml(countLabel(articles.length))}</p>
            </div>
          </header>
          <div class="section-articles card-grid" data-articles></div>
        </div>
      </div>
    `;

    const list = root.querySelector("[data-articles]");
    if (!articles.length) {
      list.replaceWith(emptyState());
      return;
    }
    for (const article of articles) {
      list.append(createCard(article, { variant: "grid" }));
    }
  }

  function show() {
    isOpen = true;
    root.hidden = false;
    const scroll = root.querySelector("[data-scroll]");
    if (scroll) scroll.scrollTop = 0;
    requestAnimationFrame(() => {
      root.classList.add("is-open");
      root.querySelector("h1[tabindex]")?.focus({ preventScroll: true });
    });
  }

  function openGrid() {
    renderGrid();
    show();
  }

  function openSection(section) {
    renderSection(section);
    show();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    root.classList.remove("is-open");
    setTimeout(() => {
      if (!isOpen) {
        root.hidden = true;
        root.innerHTML = "";
      }
    }, 300);
  }

  return {
    openGrid,
    openSection,
    close,
    get isOpen() {
      return isOpen;
    },
  };
}
