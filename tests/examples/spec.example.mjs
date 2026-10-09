// Example declarative spec. Copy to `tests/specs/<page>.spec.mjs` and edit.
//
// Derive `expect` from the page's plan/spec: every statement the plan made about what
// the page shows should become a check here. See references/spec-sources.md.
export default {
  name: "home",

  // Appended to the base URL (leading slash optional). Use `url:` for an absolute URL.
  path: "/",

  // Optional restrictions.
  viewports: ["desktop", "mobile"],
  browsers: ["chromium", "firefox"],

  // Declarative checks: compiled into ONE in-page evaluation per run.
  expect: [
    // Structure and content
    { selector: "h1", text: "Bienvenido" },
    { selector: "nav a", count: { min: 2 } },
    { selector: ".card", count: 2 },
    { selector: "main", exists: true },

    // Attributes and accessibility
    { selector: "#hero", attribute: { alt: { nonEmpty: true } } },
    { selector: "html", attribute: { lang: { matches: "^(es|en)" } } },

    // Layout
    { selector: "h1", aboveFold: true },
    { selector: "#signup", visible: true },
    { selector: "body", computedStyle: { "overflow-x": { notMatches: "scroll" } } },

    // Document-level
    { title: { nonEmpty: true } },
    { url: { matches: "/$" } },

    // Absence is also a plan statement
    { selector: ".error-banner", exists: false },
  ],
};
