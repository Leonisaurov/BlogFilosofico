// aportar.spec.mjs — Aviso de revisión editorial en el diálogo de envío.
//
// Comprueba que «Enviar una aportación» deja claro que no hay publicación ni
// respuesta automática, y que «Continuar al correo» sigue guiando al mailto.

export default {
  name: "aportar",
  path: "/",
  browsers: ["chromium", "firefox"],

  expect: [{ selector: "#app", exists: true }],

  async run(page, t) {
    await page.evaluate(() => {
      location.hash = "#/aportar";
    });
    await page.waitForSelector("#editor:not([hidden])", { timeout: 8000 });

    // El diálogo exige título y contenido: se completan con datos mínimos.
    await page.type('[data-field="title"]', "Aportación de prueba sobre la memoria");
    await page.type('[data-field="content"]', "## Una idea\n\nTexto de prueba para revisar.");
    await page.click("[data-editor-proposal]");
    await page.waitForSelector("[data-share-dialog][open]", { timeout: 8000 });

    const dialog = await page.evaluate(() => {
      const element = document.querySelector("[data-share-dialog]");
      return {
        heading: element.querySelector("#proposal-heading")?.textContent.trim() || "",
        text: element.textContent.replace(/\s+/g, " "),
        continueLabel:
          element.querySelector("[data-proposal-continue]")?.textContent.trim() || "",
      };
    });

    t.assert(dialog.heading === "Enviar una aportación", "el diálogo se llama «Enviar una aportación»");
    t.assert(/revisión/i.test(dialog.text), "el diálogo avisa de la revisión editorial");
    t.assert(
      /(?:no la publica|no se publica) automáticamente/i.test(dialog.text),
      "el diálogo avisa de que la aportación no se publica automáticamente"
    );
    t.assert(
      /72 horas/i.test(dialog.text) && /15 días hábiles/i.test(dialog.text),
      "el diálogo explica los plazos humanos de la política editorial"
    );
    t.assert(
      /no hay respuesta automática/i.test(dialog.text) && /no se despliega/i.test(dialog.text),
      "el diálogo distingue la respuesta humana del despliegue automático"
    );
    t.assert(/correo/i.test(dialog.continueLabel), "el botón sigue guiando al correo");

    const { mail, adminEmail } = await page.evaluate(async () => {
      const [{ buildProposalMailto }, { SITE }] = await Promise.all([
        import("./js/lib/share.js"),
        import("./js/data/config.js"),
      ]);
      return { mail: buildProposalMailto(), adminEmail: SITE.adminEmail };
    });
    t.assert(mail.to === adminEmail, "el destinatario del correo es exactamente SITE.adminEmail");
    t.assert(
      mail.href.startsWith(`mailto:${adminEmail}?`),
      "el mailto apunta a SITE.adminEmail, sin backend falso"
    );
    t.assert(
      /revisión editorial/i.test(mail.body) && /72 horas/i.test(mail.body),
      "el cuerpo del correo pide revisión y recuerda el plazo humano de acuse"
    );
    t.assert(
      /no hay respuesta automática/i.test(mail.body) && /no se despliega/i.test(mail.body),
      "el cuerpo del correo avisa: sin respuesta ni despliegue automático"
    );
    t.assert(
      /no hay respuesta automática ni confirmación automática/i.test(mail.body),
      "el cuerpo del correo no promete confirmación automática"
    );

    await page.click("[data-share-close]");
    await page.waitFor(() => !document.querySelector("[data-share-dialog]").open, { timeout: 5000 });
    await page.evaluate(() => {
      location.hash = "#/";
    });
    await page.waitForSelector(".home__hero", { timeout: 8000 });
  },
};
