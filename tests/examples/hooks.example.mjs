// Example hook spec: complex behaviour a declarative check cannot express.
//
// The hook runs INSIDE the same browser session, after the declarative `expect` block.
// `t` records assertions and throws on the first failure, so the report points at the
// exact broken expectation. `page` is the raw driver (evaluate, click, type, press,
// hover, scrollTo, waitFor, waitForSelector, waitForText, screenshot).
export default {
  name: "signup-flow",
  path: "/",
  browsers: ["chromium", "firefox"],

  expect: [{ selector: "#signup", exists: true }],

  async run(page, t) {
    // Fill and submit a form.
    await t.visible("#email");
    await page.type("#email", "persona@example.com");
    await page.click("#submit");

    // Wait for the result instead of sleeping.
    await page.waitForSelector("#status", { timeout: 3000 });
    await t.text("#status", "Listo");

    // Read computed state out of the live page.
    const value = await page.evaluate(() => document.querySelector("#email").value);
    await t.expect(value, "persona@example.com", "email keeps its value");

    // Conditional assertions when the plan only promises behaviour on one viewport.
    const width = await page.evaluate("innerWidth");
    if (width < 600) {
      await t.visible("#mobile-menu", false);
    }

    // Fail with a human message when a complex invariant is broken.
    const errors = await page.evaluate(() => document.querySelectorAll(".error").length);
    t.assert(errors === 0, `expected no .error elements, found ${errors}`);
  },
};
