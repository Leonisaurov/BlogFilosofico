// pregunta.spec.mjs — Pregunta abierta, mailto con privacidad, archivo y unidad.
//
// Comprueba el flujo completo lunes→domingo desde el navegador: la pregunta
// abierta, el correo con los campos nuevos, el archivo enlazado a la unidad,
// la unidad en el índice y en #/secciones/unidad.

export default {
  name: "pregunta",
  path: "/",
  browsers: ["chromium", "firefox"],

  expect: [{ selector: ".question__postcard", exists: true }],

  async run(page, t) {
    await page.evaluate(() => {
      location.hash = "#/pregunta";
    });
    await page.waitFor(() => document.querySelector("#app").dataset.view === "question", {
      timeout: 8000,
    });
    await page.waitForSelector(".question__postcard", { timeout: 8000 });

    const question = await page.evaluate(async () => {
      const { QUESTIONS } = await import("./js/data/questions.js");
      return {
        question: document.querySelector(".question__postcard-question")?.textContent.trim() || "",
        expected: QUESTIONS.open.question,
        mailto: document.querySelector(".question__actions a")?.getAttribute("href") || "",
        body: decodeURIComponent(document.querySelector(".question__actions a")?.getAttribute("href") || ""),
        guide: (document.querySelector(".question__how")?.textContent || "").replace(/\s+/g, " "),
        note: (document.querySelector(".question__note")?.textContent || "").replace(/\s+/g, " "),
        archive: [...document.querySelectorAll(".question__archive-item")].map((item) => ({
          edition: item.querySelector(".question__archive-edition")?.textContent.trim() || "",
          question: item.querySelector(".question__archive-question")?.textContent.trim() || "",
          href: item.querySelector(".question__archive-question a")?.getAttribute("href") || "",
        })),
        unitHref: QUESTIONS.weeks.find((week) => week.href)?.href || "",
      };
    });

    t.assert(question.question === question.expected, "la postal muestra la pregunta abierta del módulo generado");
    t.assert(question.mailto.startsWith("mailto:"), "la respuesta sigue abriendo el correo, sin backend falso");
    for (const field of [
      "Nombre:",
      "Ciudad (opcional):",
      "Correo (opcional):",
      "¿Publicar mi correo? (no / sí):",
      "¿Autorizo la publicación de mi respuesta? (sí / no):",
    ]) {
      t.assert(question.body.includes(field), `el mailto pide «${field}»`);
    }
    t.assert(/lunes/i.test(question.guide) && /domingo/i.test(question.guide), "la guía sigue el ritmo lunes→domingo");
    t.assert(
      /tal cual, sin editar el estilo/.test(question.guide) && /solo excluimos lo dañino y lo no autorizado/.test(question.guide),
      "la guía explica que las respuestas no se editan"
    );
    t.assert(/blog se actualiza con las respuestas el domingo/i.test(question.guide), "la guía anuncia la actualización del domingo");
    t.assert(
      /correo no se publica salvo que lo autorices expresamente/i.test(question.note),
      "la guía aclara la privacidad del correo"
    );
    t.assert(
      /72 horas/.test(question.note) && /15 días hábiles/.test(question.note) && /aportaciones/.test(question.note),
      "los plazos se atribuyen a las aportaciones, no a las respuestas"
    );

    t.assert(question.archive.length >= 3, "el archivo conserva las preguntas anteriores");
    t.assert(question.unitHref.startsWith("#/articulos/unidad-"), "la semana cerrada tiene una unidad publicada");
    const linked = question.archive.find((item) => item.href === question.unitHref);
    t.assert(!!linked, "el archivo enlaza la unidad publicada");
    t.assert((linked?.question || "").length > 0, "el enlace del archivo muestra la pregunta de esa semana");

    await page.evaluate(() => {
      location.hash = "#/indice";
    });
    await page.waitForSelector(".index__list", { timeout: 8000 });
    const inIndex = await page.evaluate(
      (href) => !!document.querySelector(`.index__row[href="${href}"]`),
      question.unitHref
    );
    t.assert(inIndex, "la unidad aparece en el índice");

    await page.evaluate(() => {
      location.hash = "#/secciones/unidad";
    });
    await page.waitForSelector(".section-hero__title", { timeout: 8000 });
    const section = await page.evaluate(
      (href) => ({
        title: document.querySelector(".section-hero__title")?.textContent.trim() || "",
        hasUnit: !!document.querySelector(`.section-articles a.post--grid[href="${href}"]`),
      }),
      question.unitHref
    );
    t.assert(section.title === "Unidad", "la sección Unidad existe en el catálogo");
    t.assert(section.hasUnit, "la unidad aparece en #/secciones/unidad");
  },
};
