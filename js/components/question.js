/**
 * question.js — Pregunta de la semana.
 *
 * Una pregunta abierta, un mecanismo honesto para responder (correo, porque el
 * sitio es estático) y el archivo de semanas cerradas, con enlace a la unidad
 * publicada cuando la hubo. No simula un foro ni un formulario que no existe.
 */

import { SITE } from "../data/config.js";
import { QUESTIONS } from "../data/questions.js";
import { escapeHtml } from "../lib/dom.js";

const KICKER = "Pregunta de la semana";

function editionLabel(week) {
  const date = new Date(`${week}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return `Semana del ${week}`;
  const formatted = new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
  return `Semana del ${formatted}`;
}

function responseMailto() {
  const question = QUESTIONS.open?.question || "la pregunta de la semana";
  const subject = `Respuesta a la pregunta: ${question}`;
  const body = [
    "Hola:",
    "",
    "Mi respuesta a la pregunta de la semana:",
    "",
    "",
    "—",
    "Nombre:",
    "Ciudad (opcional):",
    "Correo (opcional):",
    "¿Publicar mi correo? (no / sí):",
    "¿Autorizo la publicación de mi respuesta? (sí / no):",
  ].join("\n");
  return `mailto:${SITE.adminEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function createQuestion(root) {
  const open = QUESTIONS.open;
  const mailto = responseMailto();
  const archive = QUESTIONS.weeks
    .map((item) => {
      const question = item.href
        ? `<a class="text-link question__archive-link" href="${escapeHtml(item.href)}">${escapeHtml(
            item.question
          )}</a>`
        : escapeHtml(item.question);
      return `
      <li class="question__archive-item">
        <p class="question__archive-edition">${escapeHtml(editionLabel(item.week))}</p>
        <p class="question__archive-question">${question}</p>
        <p class="question__archive-note">${escapeHtml(item.note || "")}</p>
      </li>`;
    })
    .join("");

  root.innerHTML = `
    <div class="question__inner">
      <header class="question__header">
        <p class="eyebrow">${KICKER}</p>
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
            open?.question || "La pregunta de esta semana se está preparando"
          )}</h2>
          <p class="question__postcard-text">${escapeHtml(
            open?.context || "Volé el lunes para leer la nueva pregunta."
          )}</p>
          ${open?.closing ? `<p class="question__postcard-text">${escapeHtml(open.closing)}</p>` : ""}
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
            <h3>Lunes: leé la pregunta</h3>
            <p>Cada lunes abrimos una pregunta nueva. Alcanza con pensar desde lo que ya sabés.</p>
          </li>
          <li>
            <span class="question__step-num" aria-hidden="true">02</span>
            <h3>Hasta el domingo: respondé</h3>
            <p>Una idea, un ejemplo o una objeción. El botón abre tu cliente de correo; no hay formulario ni backend.</p>
          </li>
          <li>
            <span class="question__step-num" aria-hidden="true">03</span>
            <h3>Domingo: publicamos las respuestas</h3>
            <p>El blog se actualiza con las respuestas el domingo, siempre con tu permiso. Publicamos las respuestas tal cual, sin editar el estilo; solo excluimos lo dañino y lo no autorizado.</p>
          </li>
          <li>
            <span class="question__step-num" aria-hidden="true">04</span>
            <h3>Después: queda en el archivo</h3>
            <p>La semana cerrada se guarda como una unidad en el índice. Si no hubo respuestas autorizadas, solo queda la pregunta en el archivo.</p>
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
          Tu correo no se publica salvo que lo autorices expresamente: hace falta
          la autorización de publicación y, además, tu permiso específico para
          mostrar el correo. El blog es estático: el administrador importa las
          respuestas y despliega a mano; no hay cron ni publicación automática.
        </p>
        <p>
          El acuse en 72 horas, la decisión en 15 días hábiles y las dos rondas
          de edición son compromisos de las <strong>aportaciones</strong>, no de
          las respuestas. Estas últimas no se editan: se publican tal cual o se
          excluyen.
        </p>
        <a class="text-link" href="#/informacion">Leer la política editorial <span aria-hidden="true">→</span></a>
      </section>
    </div>
  `;

  return { element: root };
}
