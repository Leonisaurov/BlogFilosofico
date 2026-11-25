/**
 * information.js — Información, carta y política editorial.
 *
 * La página madre del contrato con el lector: qué es el blog, cómo trabaja,
 * cuánto tarda en responder, qué pide y cómo corrige. Todo el texto viene de
 * `js/data/editorial.js`; la vista solo compone.
 */

import { SITE } from "../data/config.js";
import {
  EDITORIAL_POLICY,
  INFORMATION,
  RHYTHMS,
  WELCOME_LETTER,
} from "../data/editorial.js";
import { escapeHtml } from "../lib/dom.js";

function letterHtml() {
  return `
    <article class="info__letter">
      <p class="eyebrow">${escapeHtml(WELCOME_LETTER.eyebrow)}</p>
      <h2 class="info__letter-title">${escapeHtml(WELCOME_LETTER.title)}</h2>
      <p class="info__letter-greeting">${escapeHtml(WELCOME_LETTER.greeting)}</p>
      ${WELCOME_LETTER.paragraphs
        .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
        .join("")}
      <p class="info__letter-closing">${escapeHtml(WELCOME_LETTER.closing)}</p>
      <p class="info__letter-sign">${escapeHtml(WELCOME_LETTER.signature)}<br /><span>${escapeHtml(
        WELCOME_LETTER.role
      )}</span></p>
    </article>`;
}

function commitmentsHtml() {
  return EDITORIAL_POLICY.commitments
    .map(
      (item) => `
      <li class="info__commitment">
        <span class="info__commitment-label">${escapeHtml(item.label)}</span>
        <strong class="info__commitment-value">${escapeHtml(item.value)}</strong>
        <span class="info__commitment-detail">${escapeHtml(item.detail)}</span>
      </li>`
    )
    .join("");
}

function listHtml(items) {
  return `<ul class="info__list">${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("")}</ul>`;
}

function rhythmsHtml() {
  return RHYTHMS.map(
    (rhythm) => `
      <article class="info__rhythm">
        <p class="eyebrow">${escapeHtml(rhythm.eyebrow)}</p>
        <p class="info__rhythm-cadence">${escapeHtml(rhythm.cadence)}</p>
        <h3>${escapeHtml(rhythm.title)}</h3>
        <p>${escapeHtml(rhythm.description)}</p>
      </article>`
  ).join("");
}

export function createInformation(root) {
  const infoSections = INFORMATION.sections
    .map(
      (section) => `
      <section class="info__block">
        <h2 class="info__subtitle">${escapeHtml(section.title)}</h2>
        ${section.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}
      </section>`
    )
    .join("");

  root.innerHTML = `
    <div class="info__inner">
      <header class="info__header">
        <p class="eyebrow">${escapeHtml(INFORMATION.eyebrow)}</p>
        <h1 class="info__title">${escapeHtml(INFORMATION.title)}</h1>
        <p class="info__lede">${escapeHtml(INFORMATION.intro)}</p>
        <nav class="info__toc" aria-label="Contenido de información">
          <button type="button" data-info-target="informacion-carta">Carta</button>
          <button type="button" data-info-target="informacion-politica">Política editorial</button>
          <button type="button" data-info-target="informacion-ritmo">Periodicidades</button>
          <button type="button" data-info-target="informacion-contacto">Contacto y licencia</button>
        </nav>
      </header>

      ${infoSections}

      <section class="info__block info__block--letter" id="informacion-carta">
        ${letterHtml()}
      </section>

      <section class="info__block" id="informacion-politica">
        <p class="eyebrow">${escapeHtml(EDITORIAL_POLICY.eyebrow)}</p>
        <h2 class="info__subtitle">${escapeHtml(EDITORIAL_POLICY.title)}</h2>
        <p class="info__lead">${escapeHtml(EDITORIAL_POLICY.intro)}</p>
        <ul class="info__commitments">${commitmentsHtml()}</ul>

        <div class="info__columns">
          <div>
            <h3 class="info__minor-title">Qué pedimos</h3>
            ${listHtml(EDITORIAL_POLICY.requirements)}
          </div>
          <div>
            <h3 class="info__minor-title">Cómo leemos</h3>
            ${listHtml(EDITORIAL_POLICY.rigor)}
          </div>
        </div>

        <div class="info__honesty">
          <h3 class="info__minor-title">Lo que no prometemos</h3>
          ${listHtml(EDITORIAL_POLICY.honesty)}
        </div>
      </section>

      <section class="info__block" id="informacion-ritmo">
        <p class="eyebrow">El ritmo del sitio</p>
        <h2 class="info__subtitle">Periodicidad de las cosas y de las preguntas</h2>
        <div class="info__rhythms">${rhythmsHtml()}</div>
      </section>

      <section class="info__block info__block--contact" id="informacion-contacto">
        <div>
          <p class="eyebrow">Contacto y licencia</p>
          <h2 class="info__subtitle">Escribir, corregir, citar</h2>
          <p>${escapeHtml(EDITORIAL_POLICY.contact)}</p>
          <p>${escapeHtml(EDITORIAL_POLICY.license)}</p>
          <p>
            Para correcciones, escribí a
            <a href="mailto:${escapeHtml(SITE.adminEmail)}">${escapeHtml(SITE.adminEmail)}</a>
            con el asunto «Corrección». La versión corregida queda fechada.
          </p>
        </div>
        <div class="info__contact-actions">
          <a class="button button--primary" href="#/aportar">Enviar una aportación</a>
          <a class="button button--ghost" href="mailto:${escapeHtml(SITE.adminEmail)}">Escribir al comité</a>
        </div>
      </section>
    </div>
  `;

  root.querySelectorAll("[data-info-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = root.querySelector(`#${button.dataset.infoTarget}`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  return { element: root };
}
