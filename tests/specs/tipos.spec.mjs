// tipos.spec.mjs — Verifica la nueva clasificación por tipo de texto.
//
// Deriva de la especificación de la tarea: existe una tercera agrupación en
// «Secciones», con cinco tipos de texto, cada tarjeta con su imagen, y los
// artículos se agrupan por tipo (incluido uno que tiene dos tipos a la vez).
export default {
  name: "tipos",
  path: "/",
  browsers: ["chromium", "firefox"],

  expect: [{ selector: "#feed", exists: true }],

  async run(page, t) {
    const TYPES = [
      ["ensayo", "Ensayo"],
      ["articulo", "Artículo"],
      ["resena", "Reseña"],
      ["cuento", "Cuento"],
      ["poesia", "Poesía"],
    ];

    // 1) La cuadrícula de secciones incluye el grupo «Por tipo de texto».
    await page.evaluate(() => {
      location.hash = "#/secciones";
    });
    await page.waitForSelector(".section-card", { timeout: 8000 });
    await page.waitFor(
      () =>
        [...document.querySelectorAll(".sections__group-title")].some(
          (h) => h.textContent.trim() === "Por tipo de texto"
        ),
      { timeout: 8000 }
    );
    t.assert(true, "el grupo «Por tipo de texto» está en la cuadrícula");

    // 2) Cada tipo tiene su tarjeta y su imagen local efectivamente cargada.
    for (const [slug, name] of TYPES) {
      const selector = `a.section-card[href="#/secciones/${slug}"]`;
      await t.exists(selector, true);
      // Las tarjetas son `loading="lazy"`: hay que acercarlas al viewport
      // para que el navegador descargue la imagen y podamos comprobarla.
      await page.scrollTo(selector);
      await page.waitFor(
        (sel) => {
          const img = document.querySelector(sel)?.querySelector("img.section-card__img");
          return !!img && img.complete && img.naturalWidth > 0;
        },
        { args: [selector], timeout: 8000 }
      );
      const usesAsset = await page.evaluate(
        (sel) =>
          (
            document.querySelector(sel)?.querySelector("img.section-card__img")?.getAttribute("src") ||
            ""
          ).includes("assets/sections/"),
        selector
      );
      t.assert(usesAsset, `la tarjeta «${name}» usa una imagen de assets/sections/`);
    }

    // 3) Agrupamiento por tipo: Ensayo y Artículo, con un artículo en ambos.
    const readSection = async (slug) => {
      await page.evaluate((value) => {
        location.hash = `#/secciones/${value}`;
      }, slug);
      await page.waitForSelector(".section-hero__title", { timeout: 8000 });
      return page.evaluate(() => ({
        title: document.querySelector(".section-hero__title")?.textContent.trim(),
        hrefs: [...document.querySelectorAll(".section-articles .post--grid")].map((a) =>
          a.getAttribute("href")
        ),
      }));
    };

    const ensayo = await readSection("ensayo");
    t.assert(ensayo.title === "Ensayo", `esperaba la sección Ensayo, llegó «${ensayo.title}»`);
    t.assert(
      ensayo.hrefs.includes("#/articulos/la-caverna-y-los-ecos"),
      "la sección Ensayo agrupa «La caverna y los ecos»"
    );

    const articulo = await readSection("articulo");
    t.assert(articulo.title === "Artículo", `esperaba la sección Artículo, llegó «${articulo.title}»`);
    t.assert(
      articulo.hrefs.includes("#/articulos/la-caverna-y-los-ecos"),
      "un artículo con dos tipos aparece también en Artículo"
    );

    // 4) Un tipo sin artículos no se rellena con los de otra sección.
    await page.evaluate(() => {
      location.hash = "#/secciones/cuento";
    });
    await page.waitForSelector(".section-empty", { timeout: 8000 });
    await t.exists(".section-articles .post--grid", false);
  },
};
