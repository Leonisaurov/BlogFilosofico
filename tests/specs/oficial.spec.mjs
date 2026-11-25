// oficial.spec.mjs — Opción «Texto oficial / formato académico» de extremo a extremo.
//
// Comprueba el tipo en el catálogo, el switch de la barra, el workspace sin
// Markdown, el estado del editor (guardar → recargar → descargar .md), la cita
// compartida, el visor de Drive derivado del enlace y el paso condicional del
// diálogo de envío. La lista de hosts está cerrada: el iframe solo se crea si
// el host coincide; el campo `documentUrl` es un canal interno oculto.

export default {
  name: "oficial",
  path: "/",
  browsers: ["chromium", "firefox"],

  expect: [{ selector: "#app", exists: true }],

  async run(page, t) {
    const wait = (label, fn, options = {}) =>
      page.waitFor(fn, { timeout: 8000, ...options }).catch((error) => {
        throw new Error(`waitFor "${label}": ${error.message}`);
      });
    const waitSel = (label, selector, options = {}) =>
      page.waitForSelector(selector, { timeout: 8000, ...options }).catch((error) => {
        throw new Error(`waitForSelector "${label}": ${error.message}`);
      });
    // Clics reales en el switch segmentado de la barra: el editor deriva
    // `state.kind` del botón con aria-pressed="true".
    const setOfficial = (activo) =>
      page.click(`[data-kind-btn="${activo ? "oficial" : "normal"}"]`);
    // El usuario pega el enlace compartido; la URL del visor nunca se escribe.
    const pegarDrive = (texto) =>
      page.evaluate((valor) => {
        const campo = document.querySelector('[data-field="driveLink"]');
        const evento = new Event("paste", { bubbles: true, cancelable: true });
        Object.defineProperty(evento, "clipboardData", {
          value: { getData: () => valor },
        });
        campo.dispatchEvent(evento);
      }, texto);
    const leerDocumento = () =>
      page.evaluate(() => ({
        url: document.querySelector('[data-field="documentUrl"]').value,
        pendiente: document.querySelector("[data-official-pending]").checked,
        aviso: document.querySelector("[data-editor-notice]")?.textContent || "",
      }));
    const urlGuardada = () =>
      page.evaluate(() => {
        const value = localStorage.getItem("blogfilosofia.borrador.v2");
        const draft = value ? JSON.parse(value) : null;
        return draft?.publication?.documentUrl ?? "";
      });
    // getBoundingClientRect() de los grupos visibles de la barra a 1440/720/375 px.
    // Solo se cuentan los elementos en flujo (en oficial el grupo de vistas se oculta).
    const medirBarra = async () => {
      const medidas = await page.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
        dpr: devicePixelRatio,
      }));
      const resultados = [];
      for (const ancho of [1440, 720, 375]) {
        await page.setViewport({
          width: ancho,
          height: medidas.height,
          deviceScaleFactor: medidas.dpr,
        });
        const barra = await page.evaluate(() => {
          const grupos = [...document.querySelectorAll(".editor__bar-right > *")]
            .filter((el) => getComputedStyle(el).display !== "none")
            .map((el) => el.getBoundingClientRect());
          const tops = grupos.map((r) => r.top).sort((a, b) => a - b);
          let filas = tops.length ? 1 : 0;
          for (let i = 1; i < tops.length; i += 1) {
            if (tops[i] - tops[i - 1] > 8) filas += 1;
          }
          return {
            filas,
            desborde: document.documentElement.scrollWidth - innerWidth,
            dentro: grupos.every((r) => r.left >= -1 && r.right <= innerWidth + 1),
            rects: grupos.map((r) => [Math.round(r.top), Math.round(r.left), Math.round(r.right)]),
          };
        });
        resultados.push({ ancho, ...barra });
      }
      await page.setViewport({
        width: medidas.width,
        height: medidas.height,
        deviceScaleFactor: medidas.dpr,
      });
      return resultados;
    };
    const barraCabe = (resultados) =>
      resultados.every((r) => r.filas <= 2 && r.desborde === 0 && r.dentro);

    // 1) El tipo «Texto oficial» está en el catálogo (grupo «Por tipo de texto»).
    await page.evaluate(() => {
      location.hash = "#/secciones";
    });
    await waitSel("catálogo", 'a.section-card[href="#/secciones/texto-oficial"]');
    t.assert(true, "la sección «Texto oficial» está en el catálogo");

    // 2) Editor: el switch vive en la barra; el Markdown se escribe en Redacción.
    await page.evaluate(() => {
      location.hash = "#/aportar";
    });
    await waitSel("editor abierto", "#editor:not([hidden])");
    // El arnés no tiene red: se vacía la lista de hosts permitidos ANTES de
    // pegar el enlace, para que nunca se intente cargar el iframe de Drive.
    await page.evaluate(async () => {
      const { SITE } = await import("./js/data/config.js");
      SITE.documentEmbedHosts.length = 0;
    });
    // Medir ANTES de activar oficial: es el caso real con los cinco grupos visibles.
    const barraRedaccion = await medirBarra();
    t.assert(
      barraCabe(barraRedaccion),
      `barra en Redacción: ≤2 filas y sin desborde a 1440/720/375 px (${JSON.stringify(barraRedaccion.map((r) => [r.ancho, r.filas, r.desborde, r.rects]))})`
    );
    await page.type('[data-field="title"]', "Informe oficial de prueba");
    await page.type('[data-field="content"]', "## Informe\n\nTexto del documento.");
    const contentBeforeToggle = await page.evaluate(
      () => document.querySelector('[data-field="content"]').value
    );
    t.assert(
      contentBeforeToggle.includes("Texto del documento."),
      "el contenido se conserva al escribir"
    );
    await setOfficial(true);
    await wait("«Documento oficial» presionado en la barra", () =>
      document.querySelector('[data-kind-btn="oficial"]').getAttribute("aria-pressed") === "true"
    );
    const contentAfterToggle = await page.evaluate(
      () => document.querySelector('[data-field="content"]').value
    );
    t.assert(
      contentAfterToggle === contentBeforeToggle,
      "activar «oficial» no reescribe el contenido"
    );
    await wait(
      "campos de oficial integrados en la ficha",
      () => !document.querySelector("[data-official-fields]").hidden
    );
    await page.type('[data-field="types"]', "Ensayo");
    await page.type('[data-field="coverCredit"]', "Archivo · dominio público");
    await pegarDrive("https://drive.google.com/file/d/ABC123xyz-_/view?usp=sharing");

    // El workspace oficial quita del flujo el Markdown, la toolbar, los modos
    // de vista y el campo oculto, pero NO los borra del DOM (exists=true +
    // display:none). La etiqueta «Documento oficial» sí se ve en el pane.
    await wait("workspace oficial sin Markdown", () =>
      ['.editor__input', '.editor__toolbar', '.editor__modes--view', '.editor__outline', '[data-field="documentUrl"]'].every(
        (sel) => {
          const el = document.querySelector(sel);
          const exists = !!el;
          const display = el ? getComputedStyle(el).display : "";
          return exists === true && display === "none";
        }
      )
    );
    await wait("etiqueta visible del modo oficial", () => {
      const el = document.querySelector("[data-editor-kind-badge]");
      return !!el && el.textContent.trim() === "Documento oficial" && getComputedStyle(el).display !== "none";
    });

    // La misma medición con el grupo de vistas oculto (modo oficial).
    const barraOficial = await medirBarra();
    t.assert(
      barraCabe(barraOficial),
      `barra en oficial: ≤2 filas y sin desborde a 1440/720/375 px (${JSON.stringify(barraOficial.map((r) => [r.ancho, r.filas, r.desborde]))})`
    );

    const form = await page.evaluate(() => ({
      types: document.querySelector('[data-field="types"]').value,
      content: document.querySelector('[data-field="content"]').value,
      hasSuggestion: [...document.querySelectorAll("#editor-types option")].some(
        (option) => option.value === "Texto oficial"
      ),
      pendingEnabled: !document.querySelector("[data-official-pending]").disabled,
    }));
    const types = form.types.split(",").map((item) => item.trim()).filter(Boolean);
    t.assert(types.includes("Texto oficial"), "al marcar se añade el tipo «Texto oficial»");
    t.assert(types.includes("Ensayo"), "se conservan los tipos ya declarados");
    t.assert(form.hasSuggestion, "el datalist ofrece «Texto oficial»");
    t.assert(form.pendingEnabled, "el estado pendiente se puede declarar en el editor");
    t.assert(
      form.content.includes("Texto del documento."),
      "el contenido sigue en el editor tras completar los campos académicos"
    );

    // 3) Vista previa: con la lista de hosts vacía se comprueba el gate (aviso
    // + enlace directo, nunca un iframe). La URL sigue siendo la derivada de Drive.
    await page.click('[data-preview-tab="article"]');
    await waitSel("vista de artículo", "[data-article-stage] .reader__article");
    await wait("aviso de documento", () =>
      !!document.querySelector("[data-article-stage] .reader__document-note")
    );
    const preview = await page.evaluate(() => ({
      note: document
        .querySelector("[data-article-stage] .reader__document-note")
        ?.textContent.trim(),
      iframes: document.querySelectorAll("[data-article-stage] iframe").length,
      links: [...document.querySelectorAll("[data-article-stage] .reader__document-link")].map(
        (link) => link.href
      ),
      credit: document.querySelector("[data-article-stage] .reader__credit")?.textContent.trim(),
      cardCredit: document.querySelector("[data-card-stage] .post__credit")?.textContent.trim(),
    }));
    t.assert(
      preview.note === "Documento pendiente de elegir servicio",
      "sin proveedor elegido se muestra el aviso exacto"
    );
    t.assert(preview.iframes === 0, "sin host permitido NO se crea ningún iframe");
    t.assert(
      preview.links.some((href) => href.startsWith("https://drive.google.com/file/d/")),
      "el aviso ofrece el enlace directo al documento derivado de Drive"
    );
    t.assert(preview.credit === "Archivo · dominio público", "la cita se ve bajo la portada");
    t.assert(preview.cardCredit === "Archivo · dominio público", "la tarjeta comparte la cita");

    // 4) Guardar → recargar → descargar .md: todo el estado oficial sobrevive.
    await wait("borrador guardado", () =>
      /Borrador guardado/.test(document.querySelector("[data-editor-saved]")?.textContent || "")
    );
    const url = await page.url();
    await page.goto(`${url.split("#")[0]}?oficial-recarga=1`);
    // Otra vez sin red: se vacía la lista antes de abrir el editor, para que la
    // vista previa restaurada no intente cargar el iframe de Drive.
    await page.evaluate(async () => {
      const { SITE } = await import("./js/data/config.js");
      SITE.documentEmbedHosts.length = 0;
    });
    await page.evaluate(() => {
      location.hash = "#/aportar";
    });
    await waitSel("editor tras recargar", "#editor:not([hidden])");
    const restored = await page.evaluate(() => ({
      title: document.querySelector('[data-field="title"]').value,
      content: document.querySelector('[data-field="content"]').value.length,
      types: document.querySelector('[data-field="types"]').value,
      credit: document.querySelector('[data-field="coverCredit"]').value,
      pressed: document.querySelector('[data-kind-btn="oficial"]').getAttribute("aria-pressed"),
    }));
    t.assert(restored.pressed === "true", "tras recargar sigue elegido «Documento oficial»");
    t.assert(restored.title === "Informe oficial de prueba", "se restaura el título");
    const storedContent = await page.evaluate(() => {
      const value = localStorage.getItem("blogfilosofia.borrador.v2");
      const draft = value ? JSON.parse(value) : null;
      return draft?.publication?.content?.length ?? -1;
    });
    t.assert(restored.content > 0, "se restaura el contenido en el editor");
    t.assert(storedContent > 0, "el borrador en localStorage conserva el contenido");
    t.assert(
      restored.types.split(",").map((item) => item.trim()).includes("Texto oficial"),
      "se restaura el tipo"
    );
    t.assert(restored.credit === "Archivo · dominio público", "se restaura la cita");
    t.assert(
      (await urlGuardada()) === "https://drive.google.com/file/d/ABC123xyz-_/preview",
      "se restaura la URL derivada en el borrador"
    );

    await page.evaluate(() => {
      window.__mdBlob = null;
      window.__capturedDownload = null;
      window.__originalCreateObjectURL = URL.createObjectURL;
      const create = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        if (blob && /markdown/.test(blob.type)) window.__mdBlob = blob;
        return create(blob);
      };
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.download) {
          window.__capturedDownload = this.download;
          return;
        }
        return click.call(this);
      };
    });
    await page.click("[data-editor-download]");
    const md = await page.evaluate(async () =>
      window.__mdBlob ? await window.__mdBlob.text() : ""
    );
    t.assert(/^kind: oficial$/m.test(md), "el .md descargado declara kind: oficial");
    t.assert(
      /^documentUrl: "https:\/\/drive\.google\.com\/file\/d\/ABC123xyz-_\/preview"$/m.test(md),
      "el .md descargado conserva la URL HTTPS derivada"
    );
    t.assert(/^cover: .*"credit":"Archivo/m.test(md), "el .md descargado conserva cover.credit");
    t.assert(!/^coverCredit:/m.test(md), "no se emite un coverCredit top-level");
    t.assert(md.includes("Texto del documento."), "el .md descargado conserva el cuerpo Markdown");

    // 4b) Drive: botón, campo, conversión, rechazos y XOR con «pendiente».
    const ayuda = await page.evaluate(() => ({
      boton: document.querySelector("[data-drive-upload]")?.textContent.trim() || "",
      campo: !!document.querySelector('[data-field="driveLink"]'),
      texto: document.querySelector("[data-drive-hint]")?.textContent || "",
    }));
    t.assert(ayuda.boton === "Subir documento a Google Drive", "el botón abre el flujo de Drive");
    t.assert(ayuda.campo, "hay campo para pegar el enlace de Drive");
    t.assert(
      /Cualquiera con el enlace/.test(ayuda.texto) && /\/preview/.test(ayuda.texto),
      "la ayuda explica el enlace público y el patrón del visor"
    );

    await page.evaluate(() => {
      window.__driveOpen = null;
      window.__originalOpen = window.open;
      window.open = (url, target, features) => {
        window.__driveOpen = { url, target, features };
        return null;
      };
    });
    await page.click("[data-drive-upload]");
    await wait("mensaje al volver de Drive", () =>
      /Pegá acá el enlace cuando vuelvas de Drive/.test(
        document.querySelector("[data-editor-notice]")?.textContent || ""
      )
    );
    const pulsado = await page.evaluate(() => ({
      abierto: window.__driveOpen,
      habilitado: !document.querySelector('[data-field="driveLink"]').disabled,
    }));
    t.assert(
      pulsado.abierto?.url === "https://drive.google.com/" &&
        pulsado.abierto?.target === "_blank" &&
        pulsado.abierto?.features === "noopener",
      "el botón abre Drive en otra pestaña sin referrer"
    );
    t.assert(pulsado.habilitado, "el campo de enlace queda habilitado al pulsar");

    await pegarDrive("https://drive.google.com/file/d/ABC123xyz-_/view?usp=sharing");
    const compartido = await leerDocumento();
    t.assert(
      compartido.url === "https://drive.google.com/file/d/ABC123xyz-_/preview",
      "un enlace /view?usp=sharing se convierte al visor /preview"
    );
    t.assert(!compartido.pendiente, "pegar un enlace desmarca «documento pendiente»");

    await pegarDrive("https://drive.google.com/file/d/OTROid456/preview?usp=sharing");
    const directo = await leerDocumento();
    t.assert(
      directo.url === "https://drive.google.com/file/d/OTROid456/preview",
      "un enlace /preview ya convertido se conserva como URL del visor"
    );

    await pegarDrive("https://docs.google.com/document/d/OTROid456/edit");
    const ajeno = await leerDocumento();
    t.assert(/drive\.google\.com/.test(ajeno.aviso), "rechaza un host ajeno con mensaje en español");
    t.assert(
      ajeno.url === "https://drive.google.com/file/d/OTROid456/preview",
      "el rechazo no sobrescribe la URL anterior"
    );

    await pegarDrive("https://drive.google.com/uc?id=ABC123xyz-_&export=download");
    const descarga = await leerDocumento();
    t.assert(/descarga el archivo/.test(descarga.aviso), "rechaza uc?export=download con mensaje en español");
    t.assert(
      descarga.url === "https://drive.google.com/file/d/OTROid456/preview",
      "el enlace de descarga no sobrescribe la URL del visor"
    );

    await page.evaluate(() => {
      const casilla = document.querySelector("[data-official-pending]");
      casilla.checked = true;
      casilla.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const pendiente = await leerDocumento();
    t.assert(pendiente.url === "", "marcar «pendiente» limpia la URL del documento (XOR)");
    await pegarDrive("https://drive.google.com/file/d/FINAL789/view");
    const reconvertido = await leerDocumento();
    t.assert(
      reconvertido.url === "https://drive.google.com/file/d/FINAL789/preview" && !reconvertido.pendiente,
      "pegar de nuevo limpia «pendiente» y escribe el visor"
    );
    await page.evaluate(() => {
      window.open = window.__originalOpen || window.open;
    });

    // 5) Al desmarcar se quita SOLO «Texto oficial» y vuelve el modo Edición.
    await page.evaluate(() => {
      URL.createObjectURL = window.__originalCreateObjectURL || URL.createObjectURL;
    });
    await setOfficial(false);
    const unchecked = await page.evaluate(() => ({
      types: document.querySelector('[data-field="types"]').value,
      hidden: document.querySelector("[data-official-fields]").hidden,
    }));
    t.assert(
      unchecked.types.split(",").map((item) => item.trim()).join("|") === "Ensayo",
      "al desmarcar se quita solo «Texto oficial»"
    );
    t.assert(unchecked.hidden, "los campos académicos se ocultan al desmarcar");

    // 6) El diálogo de envío exige confirmar el enlace de Drive / el .docx.
    await setOfficial(true);
    const beforeDialog = await page.evaluate(() => ({
      title: document.querySelector('[data-field="title"]').value,
      content: document.querySelector('[data-field="content"]').value.length,
      official: document.querySelector('[data-kind-btn="oficial"]').getAttribute("aria-pressed") === "true",
      notice: document.querySelector("[data-editor-notice]")?.textContent || "",
    }));
    t.assert(
      !!beforeDialog.title && beforeDialog.content > 0 && beforeDialog.official,
      "el editor conserva título, contenido y modo oficial antes de enviar"
    );
    await page.click("[data-editor-proposal]");
    await waitSel("diálogo de envío", "[data-share-dialog][open]");
    const dialog = await page.evaluate(() => ({
      stepVisible: !document.querySelector('[data-proposal-step="official"]').hidden,
      checkVisible: !document.querySelector("[data-proposal-check-official-row]").hidden,
      continueDisabled: document.querySelector("[data-proposal-continue]").disabled,
    }));
    t.assert(dialog.stepVisible, "el diálogo muestra el paso del documento oficial");
    t.assert(dialog.checkVisible, "el diálogo pide confirmar el enlace o el .docx adjuntado");
    t.assert(dialog.continueDisabled, "no se puede continuar sin la confirmación");
    await page.click("[data-proposal-check-official]");
    await page.click("[data-proposal-download-md]");
    await page.click("[data-proposal-check-md]");
    const enabled = await page.evaluate(
      () => !document.querySelector("[data-proposal-continue]").disabled
    );
    t.assert(enabled, "con las confirmaciones se habilita «Continuar al correo»");
    await page.click("[data-share-close]");
  },
};
