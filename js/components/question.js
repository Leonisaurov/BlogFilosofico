/**
 * question.js — Pregunta de la semana.
 *
 * Una sola pregunta, un mecanismo honesto para responder (correo, porque el
 * sitio es estático) y el archivo de preguntas anteriores. No simula un foro
 * ni un formulario que no existe.
 */

import { SITE } from "../data/config.js";
import { CURRENT_QUESTION } from "../data/editorial.js";
import { escapeHtml } from "../lib/dom.js";

function responseMailto() {
  const subject = `Respuesta a la pregunta: ${CURRENT_QUESTION.question}`;
  const body = [
    "Hola:",
    "",
    "Mi respuesta a la pregunta de la semana:",
    "",
    "",
    "—",
    "Nombre:",
    "Ciudad:",
    "¿Autorizo la publicación de mi respuesta? (sí / no):",
  ].join("\n");
  return `mailto:${SITE.adminEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function createQuestion(root) {
  const mailto = responseMailto();
  const archive = CURRENT_QUESTION.archive
    .map(
      (item) => `
      <li class="question__archive-item">
        <p class="question__archive-edition">${escapeHtml(item.edition)}</p>
        <p class="question__archive-question">${escapeHtml(item.question)}</p>
        <p class="question__archive-note">${escapeHtml(item.note)}</p>
      </li>`
    )
    .join("");

  root.innerHTML = `
    <div class="question__inner">
      <header class="question__header">
        <p class="eyebrow">${escapeHtml(CURRENT_QUESTION.kicker)}</p>
        <h1 class="question__title">Una pregunta,<br /><em>una semana</em>.</h1>
        <p class="question__lede">
          Cada lunes abrimos una pregunta. No hay respuesta correcta ni
          extensión obligatoria: nos interesa una idea bien pensada, no una
          performance de erudición.
        </p>
      </header>

      <article class="question__postcard" aria-labelledby="current-question">
        <div class="question__stamp" aria-hidden="true">
          <span>Pregunta</span>
          <span>de la</span>
          <span>semana</span>
        </div>
        <div class="question__postcard-body">
          <p class="question__postcard-label">Esta semana</p>
          <h2 class="question__postcard-question" id="current-question">${escapeHtml(
            CURRENT_QUESTION.question
          )}</h2>
          <p class="question__postcard-text">${escapeHtml(CURRENT_QUESTION.context)}</p>
          <p class="question__postcard-text">${escapeHtml(CURRENT_QUESTION.closing)}</p>
          <div class="question__actions">
            <a class="button button--primary" href="${escapeHtml(mailto)}">Responder por correo</a>
            <a class="button button--ghost" href="#/informacion">Cómo se edita una respuesta</a>
          </div>
        </div>
      </article>

      <section class="question__how" aria-labelledby="question-how-title">
        <h2 class="question__subtitle" id="question-how-title">Cómo funciona</h2>
        <ol class="question__steps">
          <li>
            <span class="question__step-num" aria-hidden="true">01</span>
            <h3>Leé la pregunta</h3>
            <p>No hace falta investigar: alcanza con pensar desde lo que ya sabés.</p>
          </li>
          <li>
            <span class="question__step-num" aria-hidden="true">02</span>
            <h3>Escribí una respuesta breve</h3>
            <p>Una idea, un ejemplo o una objeción. Entre 150 y 600 palabras es un buen lugar.</p>
          </li>
          <li>
            <span class="question__step-num" aria-hidden="true">03</span>
            <h3>Mandala por correo</h3>
            <p>El botón abre tu cliente de correo. Si tu respuesta se publica, te pedimos permiso antes.</p>
          </li>
        </ol>
      </section>

      <section class="question__archive" aria-labelledby="question-archive-title">
        <div class="question__archive-head">
          <h2 class="question__subtitle" id="question-archive-title">Preguntas anteriores</h2>
          <a class="text-link" href="#/indice">Seguir leyendo <span aria-hidden="true">→</span></a>
        </div>
        <ul class="question__archive-list">${archive}</ul>
      </section>

      <section class="question__note">
        <p class="eyebrow">Una aclaración</p>
        <p>
          La pregunta de la semana no es una encuesta ni un concurso. Es una
          excusa para pensar en compañía. Las respuestas se leen con la misma
          política editorial que las aportaciones.
        </p>
        <a class="text-link" href="#/informacion">Leer la política editorial <span aria-hidden="true">→</span></a>
      </section>
    </div>
  `;

  return { element: root };
}
