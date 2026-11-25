/**
 * home.js — Portada editorial.
 *
 * La portada no es un feed: presenta la voz del proyecto (carta), una pregunta
 * para pensar, una aportación destacada, los dos ritmos del sitio y un
 * sumario breve. El feed y la cuadrícula viven en `#/leer`; el catálogo
 * completo, en `#/indice`.
 */

import { ARTICLES, getArticle } from "../data/articles.js";
import { FEATURED_SLUG, RHYTHMS, WELCOME_LETTER } from "../data/editorial.js";
import { QUESTIONS } from "../data/questions.js";
import { escapeHtml } from "../lib/dom.js";
import { formatShortDate } from "../lib/format.js";
import { createCard } from "./card.js";

function byDateDesc(a, b) {
  return String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""));
}

function featuredArticle() {
  return getArticle(FEATURED_SLUG) ?? [...ARTICLES].sort(byDateDesc)[0] ?? null;
}

function summaryRows(featured) {
  return [...ARTICLES]
    .filter((article) => article.id !== featured?.id)
    .sort(byDateDesc)
    .slice(0, 5);
}

function summaryHtml(articles) {
  return articles
    .map(
      (article, index) => `
      <a class="home__index-row" href="#/articulos/${escapeHtml(article.slug)}">
        <span class="home__index-num" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
        <span class="home__index-copy">
          <span class="home__index-title">${escapeHtml(article.title)}</span>
          <span class="home__index-meta">${escapeHtml(article.category || "Filosofía")} · ${escapeHtml(
            formatShortDate(article.createdAt)
          )}</span>
        </span>
        <span class="home__index-arrow" aria-hidden="true">↗</span>
      </a>`
    )
    .join("");
}

function rhythmsHtml() {
  return RHYTHMS.map(
    (rhythm) => `
      <article class="rhythm-card rhythm-card--${escapeHtml(rhythm.id)}">
        <p class="eyebrow">${escapeHtml(rhythm.eyebrow)}</p>
        <p class="rhythm-card__cadence">${escapeHtml(rhythm.cadence)}</p>
        <h3 class="rhythm-card__title">${escapeHtml(rhythm.title)}</h3>
        <p class="rhythm-card__text">${escapeHtml(rhythm.description)}</p>
        <a class="rhythm-card__link" href="${escapeHtml(rhythm.action.href)}">
          ${escapeHtml(rhythm.action.label)} <span aria-hidden="true">→</span>
        </a>
      </article>`
  ).join("");
}

export function createHome(root) {
  const featured = featuredArticle();
  const recent = featured ? summaryRows(featured) : [];
  const question = QUESTIONS.open;

  root.innerHTML = `
    <div class="home__inner">
      <header class="home__hero">
        <div class="home__hero-copy">
          <p class="eyebrow">Una publicación para pensar despacio</p>
          <h1 class="home__title">Pensar<br /><em>despacio</em>.</h1>
          <p class="home__lede">
            Filosofía sin prisa, sin jerga innecesaria y sin la obligación de
            concluir. Una pregunta por semana, una aportación cada quince días
            y un archivo para volver.
          </p>
          <div class="home__actions">
            <a class="button button--primary" href="#/leer">Empezar a leer</a>
            <a class="button button--ghost" href="#/indice">Ver el índice</a>
          </div>
          <p class="home__micro">
            ¿Escribís? Las aportaciones se leen, se editan y se responden.
            <a href="#/aportar">Enviar una aportación</a>.
          </p>
        </div>

        <aside class="home__letter" aria-labelledby="welcome-title">
          <p class="eyebrow">${escapeHtml(WELCOME_LETTER.eyebrow)}</p>
          <h2 class="home__letter-title" id="welcome-title">${escapeHtml(
            WELCOME_LETTER.title
          )}</h2>
          <p class="home__letter-greeting">${escapeHtml(WELCOME_LETTER.greeting)}</p>
          <p class="home__letter-text">${escapeHtml(WELCOME_LETTER.paragraphs[0])}</p>
          <p class="home__letter-sign">${escapeHtml(WELCOME_LETTER.signature)}<br /><span>${escapeHtml(
            WELCOME_LETTER.role
          )}</span></p>
          <a class="home__letter-link" href="#/informacion">Leer la carta completa <span aria-hidden="true">→</span></a>
        </aside>
      </header>

      <section class="home__question" aria-labelledby="home-question-title">
        <div class="question-card">
          <div class="question-card__stamp" aria-hidden="true">
            <span>Pregunta</span>
            <span>de la</span>
            <span>semana</span>
          </div>
          <div class="question-card__body">
            <p class="eyebrow">Pregunta de la semana</p>
            <h2 class="question-card__question" id="home-question-title">${escapeHtml(
              question?.question || "¿Qué vamos a pensar esta semana?"
            )}</h2>
            <p class="question-card__text">${escapeHtml(
              question?.context || "La pregunta de esta semana se está preparando. Volé el lunes."
            )}</p>
            <a class="question-card__link" href="#/pregunta">Responder o leer el archivo <span aria-hidden="true">→</span></a>
          </div>
        </div>
      </section>

      <section class="home__feature" aria-labelledby="home-feature-title">
        <div class="home__section-head">
          <div>
            <p class="eyebrow">Aportación destacada</p>
            <h2 class="home__section-title" id="home-feature-title">Para empezar por acá</h2>
          </div>
          <a class="text-link" href="#/indice">Todo el índice <span aria-hidden="true">→</span></a>
        </div>
        <div class="home__feature-stage" data-feature></div>
      </section>

      <section class="home__rhythms" aria-labelledby="home-rhythms-title">
        <div class="home__section-head">
          <div>
            <p class="eyebrow">El ritmo del sitio</p>
            <h2 class="home__section-title" id="home-rhythms-title">Dos relojes, no uno</h2>
          </div>
          <a class="text-link" href="#/informacion">Cómo trabajamos <span aria-hidden="true">→</span></a>
        </div>
        <div class="home__rhythm-grid">${rhythmsHtml()}</div>
      </section>

      <section class="home__index" aria-labelledby="home-index-title">
        <div class="home__section-head">
          <div>
            <p class="eyebrow">Sumario</p>
            <h2 class="home__section-title" id="home-index-title">Lo último</h2>
          </div>
          <a class="text-link" href="#/indice">Índice completo <span aria-hidden="true">→</span></a>
        </div>
        <div class="home__index-list">${summaryHtml(recent)}</div>
      </section>

      <section class="home__cta" aria-labelledby="home-cta-title">
        <p class="eyebrow">Tu turno</p>
        <h2 class="home__cta-title" id="home-cta-title">La filosofía también se escribe en primera persona.</h2>
        <p class="home__cta-text">
          Si tenés una idea que resiste una conversación, enviala. La leemos,
          la editamos con vos y, si está a la altura, la publicamos.
        </p>
        <a class="button button--primary" href="#/aportar">Enviar una aportación</a>
        <a class="button button--ghost" href="#/pregunta">Responder la pregunta</a>
      </section>
    </div>
  `;

  if (featured) {
    root.querySelector("[data-feature]")?.append(
      createCard(featured, { variant: "feature", eager: true })
    );
  }

  return { element: root };
}
