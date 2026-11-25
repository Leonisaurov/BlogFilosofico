// portada.spec.mjs — Portada editorial, índice, pregunta, información y #/leer.
//
// La portada ya no es el feed: esta spec comprueba la nueva arquitectura y
// que el feed siga disponible como vista de lectura.

export default {
  name: "portada",
  path: "/",
  browsers: ["chromium", "firefox"],

  expect: [
    { selector: ".home__hero", visible: true },
    { selector: ".home__title", text: { includes: "Pensar" } },
    { selector: ".home__letter", visible: true },
    { selector: ".question-card", visible: true },
    { selector: ".post--feature", visible: true },
    { selector: ".home__rhythm-grid .rhythm-card", count: 2 },
    { selector: ".home__index-row", count: { gte: 3 } },
    { selector: "#feed", visible: false },
    { selector: '.site-nav [data-nav="#/indice"]', exists: true },
  ],

  async run(page, t) {
    t.assert(
      (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0,
      "la portada no produce desborde horizontal"
    );

    // El índice reúne todos los artículos y enlaza a las secciones.
    await page.evaluate(() => {
      location.hash = "#/indice";
    });
    await page.waitForSelector(".index__list", { timeout: 8000 });
    const index = await page.evaluate(async () => {
      const { ARTICLES } = await import("./js/data/articles.js");
      return {
        rows: document.querySelectorAll(".index__row").length,
        articles: ARTICLES.length,
        hasChips: document.querySelectorAll(".index__chip").length > 0,
        view: document.querySelector("#app").dataset.view,
      };
    });
    t.assert(index.rows === index.articles, "el índice lista todas las publicaciones");
    t.assert(index.hasChips, "el índice ofrece accesos por sección");
    t.assert(index.view === "index", "la vista activa es el índice");
    t.assert(
      (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0,
      "el índice no produce desborde horizontal"
    );

    // Pregunta de la semana: postal, respuesta por correo y archivo.
    await page.evaluate(() => {
      location.hash = "#/pregunta";
    });
    await page.waitForSelector(".question__postcard", { timeout: 8000 });
    const question = await page.evaluate(() => ({
      view: document.querySelector("#app").dataset.view,
      mailto: document.querySelector(".question__actions a")?.getAttribute("href") || "",
      archive: document.querySelectorAll(".question__archive-item").length,
    }));
    t.assert(question.view === "question", "la vista activa es la pregunta");
    t.assert(question.mailto.startsWith("mailto:"), "la respuesta abre el correo, sin backend falso");
    t.assert(question.archive >= 3, "hay archivo de preguntas anteriores");

    // Información: carta, compromisos, periodicidades y contacto.
    await page.evaluate(() => {
      location.hash = "#/informacion";
    });
    await page.waitForSelector(".info__letter", { timeout: 8000 });
    const info = await page.evaluate(() => ({
      view: document.querySelector("#app").dataset.view,
      commitments: document.querySelectorAll(".info__commitment").length,
      rhythms: document.querySelectorAll(".info__rhythm").length,
      hasPolicy: !!document.querySelector("#informacion-politica"),
      hasContact: !!document.querySelector("#informacion-contacto"),
    }));
    t.assert(info.view === "information", "la vista activa es Información");
    t.assert(info.hasPolicy && info.hasContact, "política y contacto están presentes");
    t.assert(info.commitments === 4, "la política publica sus cuatro compromisos");
    t.assert(info.rhythms === 2, "las dos periodicidades están explicadas");
    t.assert(
      (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0,
      "Información no produce desborde horizontal"
    );
    await page.click('[data-info-target="informacion-politica"]');
    await page.waitFor(() => document.querySelector(".info").scrollTop > 100, { timeout: 5000 });
    t.assert(true, "el índice de Información desplaza a la política editorial");

    // #/leer recupera el feed; la portada no era el feed.
    await page.evaluate(() => {
      location.hash = "#/leer";
    });
    await page.waitForSelector("#feed", { timeout: 8000 });
    const read = await page.evaluate(() => ({
      view: document.querySelector("#app").dataset.view,
      display: getComputedStyle(document.querySelector("#feed")).display,
      cards: document.querySelectorAll("#feed .post").length,
    }));
    t.assert(read.view === "read", "la vista activa es Leer");
    t.assert(read.display !== "none", "el feed es visible en #/leer");
    t.assert(read.cards > 0, "el feed conserva sus tarjetas");

    // El alias histórico #/crear normaliza a #/aportar y abre el editor.
    await page.evaluate(() => {
      location.hash = "#/crear";
    });
    await page.waitForSelector("#editor:not([hidden])", { timeout: 8000 });
    const editor = await page.evaluate(() => ({
      hash: location.hash,
      view: document.querySelector("#app").dataset.view,
      title: document.querySelector('[data-field="title"]')?.getAttribute("placeholder") || "",
    }));
    t.assert(editor.hash === "#/aportar", "el alias #/crear se normaliza a #/aportar");
    t.assert(editor.view === "editor", "el editor de aportaciones está abierto");
    t.assert(/aportación/i.test(editor.title), "el editor habla de aportaciones, no de crear artículos");

    // Volver a la portada deja la captura final en la vista principal.
    await page.evaluate(() => {
      location.hash = "#/";
    });
    await page.waitForSelector(".home__hero", { timeout: 8000 });
    await page.waitFor(() => document.querySelector("#editor").hidden === true, {
      timeout: 5000,
    });
  },
};
