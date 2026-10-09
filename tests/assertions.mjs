// assertions.mjs — declarative checks + hook assertion helpers.
//
// Two layers, both zero-dependency:
//
//  1. Declarative: `runDeclarative(page, checks)` compiles a spec's `expect` array into
//     ONE in-page evaluation and returns [{label, pass, detail}]. Cheap and fast.
//
//  2. Hooks: `Assertions` gives complex cases a `t` object with imperative assertions
//     that read the live page through the driver and throw `AssertionError` on failure.
//
// Matcher language (same in both layers):
//   "exact"                 string/number/boolean equality (stringified)
//   { exists: true|false }
//   { includes: "x" } / { notIncludes: "x" }
//   { matches: "regex" } / { notMatches: "regex" }   (optional `flags`)
//   { nonEmpty: true }
//   { min: n, max: n } / { gte: n } / { lte: n }

export class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = "AssertionError";
  }
}

function normalize(value) {
  return String(value == null ? "" : value)
    .replace(/\s+/g, " ")
    .trim();
}

// Node-side matcher, used by hook assertions.
export function matchValue(value, spec) {
  if (spec === null || spec === undefined) return { pass: true, detail: "" };
  if (typeof spec !== "object") {
    return {
      pass: String(value) === String(spec),
      detail: `got ${JSON.stringify(value)}, expected ${JSON.stringify(spec)}`,
    };
  }
  if (spec.exists !== undefined) {
    const exists = value !== null && value !== undefined;
    return { pass: exists === !!spec.exists, detail: `exists=${exists}` };
  }
  if (spec.includes !== undefined) {
    return { pass: String(value).includes(spec.includes), detail: `got ${JSON.stringify(value)}, expected to include ${JSON.stringify(spec.includes)}` };
  }
  if (spec.notIncludes !== undefined) {
    return { pass: !String(value).includes(spec.notIncludes), detail: `got ${JSON.stringify(value)}, expected not to include ${JSON.stringify(spec.notIncludes)}` };
  }
  if (spec.matches !== undefined) {
    const re = new RegExp(spec.matches, spec.flags || "");
    return { pass: re.test(String(value)), detail: `got ${JSON.stringify(value)}, expected to match /${spec.matches}/` };
  }
  if (spec.notMatches !== undefined) {
    const re = new RegExp(spec.notMatches, spec.flags || "");
    return { pass: !re.test(String(value)), detail: `got ${JSON.stringify(value)}, expected not to match /${spec.notMatches}/` };
  }
  if (spec.nonEmpty) {
    return { pass: normalize(value).length > 0, detail: `got ${JSON.stringify(value)}` };
  }
  if (spec.min !== undefined || spec.max !== undefined) {
    const n = Number(value);
    const okMin = spec.min === undefined || n >= spec.min;
    const okMax = spec.max === undefined || n <= spec.max;
    const range = `${spec.min ?? "-"}..${spec.max ?? "-"}`;
    return { pass: okMin && okMax, detail: `got ${value}, expected ${range}` };
  }
  if (spec.gte !== undefined) return { pass: Number(value) >= spec.gte, detail: `got ${value}, expected >= ${spec.gte}` };
  if (spec.lte !== undefined) return { pass: Number(value) <= spec.lte, detail: `got ${value}, expected <= ${spec.lte}` };
  return { pass: false, detail: `unsupported matcher ${JSON.stringify(spec)}` };
}

// This function is serialized and executed inside the page. It must not reference any
// variable from module scope (page.evaluate uses fn.toString()).
function checkPageFunction(checks) {
  const norm = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  const match = (value, spec) => {
    if (spec === null || spec === undefined) return { pass: true, detail: "" };
    if (typeof spec !== "object") {
      return { pass: String(value) === String(spec), detail: `got ${JSON.stringify(value)}, expected ${JSON.stringify(spec)}` };
    }
    if (spec.exists !== undefined) {
      const exists = value !== null && value !== undefined;
      return { pass: exists === !!spec.exists, detail: `exists=${exists}` };
    }
    if (spec.includes !== undefined) return { pass: String(value).includes(spec.includes), detail: `got ${JSON.stringify(value)}, expected to include ${JSON.stringify(spec.includes)}` };
    if (spec.notIncludes !== undefined) return { pass: !String(value).includes(spec.notIncludes), detail: `got ${JSON.stringify(value)}, expected not to include ${JSON.stringify(spec.notIncludes)}` };
    if (spec.matches !== undefined) {
      const re = new RegExp(spec.matches, spec.flags || "");
      return { pass: re.test(String(value)), detail: `got ${JSON.stringify(value)}, expected to match /${spec.matches}/` };
    }
    if (spec.notMatches !== undefined) {
      const re = new RegExp(spec.notMatches, spec.flags || "");
      return { pass: !re.test(String(value)), detail: `got ${JSON.stringify(value)}, expected not to match /${spec.notMatches}/` };
    }
    if (spec.nonEmpty) return { pass: norm(value).length > 0, detail: `got ${JSON.stringify(value)}` };
    if (spec.min !== undefined || spec.max !== undefined) {
      const n = Number(value);
      const okMin = spec.min === undefined || n >= spec.min;
      const okMax = spec.max === undefined || n <= spec.max;
      return { pass: okMin && okMax, detail: `got ${value}, expected ${spec.min ?? "-"}..${spec.max ?? "-"}` };
    }
    if (spec.gte !== undefined) return { pass: Number(value) >= spec.gte, detail: `got ${value}, expected >= ${spec.gte}` };
    if (spec.lte !== undefined) return { pass: Number(value) <= spec.lte, detail: `got ${value}, expected <= ${spec.lte}` };
    return { pass: false, detail: `unsupported matcher ${JSON.stringify(spec)}` };
  };

  const results = [];
  const record = (label, r) => results.push({ label, pass: !!r.pass, detail: r.detail || "" });
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));
  const isVisible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return !!(r.width || r.height) && st.visibility !== "hidden" && st.display !== "none" && st.opacity !== "0";
  };
  const inViewport = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0;
  };

  for (const c of checks) {
    try {
      if (c.title !== undefined) {
        record("title", match(document.title, c.title));
        continue;
      }
      if (c.url !== undefined) {
        record("url", match(location.href, c.url));
        continue;
      }
      const sel = c.selector;
      if (!sel) {
        record(JSON.stringify(c), { pass: false, detail: "check has no selector" });
        continue;
      }
      const els = qsa(sel);
      const el = els[0] || null;
      let matchedKind = false;
      if (c.exists !== undefined) {
        record(`${sel} exists`, match(el, { exists: c.exists }));
        matchedKind = true;
      }
      if (c.count !== undefined) {
        record(`${sel} count`, match(els.length, c.count));
        matchedKind = true;
      }
      if (c.text !== undefined) {
        record(`${sel} text`, match(el ? norm(el.textContent) : null, c.text));
        matchedKind = true;
      }
      if (c.value !== undefined) {
        record(`${sel} value`, match(el ? el.value : null, c.value));
        matchedKind = true;
      }
      if (c.html !== undefined) {
        record(`${sel} html`, match(el ? el.innerHTML : null, c.html));
        matchedKind = true;
      }
      if (c.attribute !== undefined) {
        for (const attr of Object.keys(c.attribute)) {
          record(`${sel}[${attr}]`, match(el ? el.getAttribute(attr) : null, c.attribute[attr]));
        }
        matchedKind = true;
      }
      if (c.visible !== undefined) {
        record(`${sel} visible`, { pass: isVisible(el) === !!c.visible, detail: `visible=${isVisible(el)}` });
        matchedKind = true;
      }
      if (c.aboveFold !== undefined) {
        record(`${sel} aboveFold`, { pass: inViewport(el) === !!c.aboveFold, detail: `aboveFold=${inViewport(el)}` });
        matchedKind = true;
      }
      if (c.computedStyle !== undefined) {
        for (const prop of Object.keys(c.computedStyle)) {
          const v = el ? getComputedStyle(el)[prop] : null;
          record(`${sel} style.${prop}`, match(v, c.computedStyle[prop]));
        }
        matchedKind = true;
      }
      if (!matchedKind) {
        record(`${sel} exists`, { pass: els.length > 0, detail: `${els.length} match(es)` });
      }
    } catch (e) {
      record(c && c.selector ? c.selector : "check", { pass: false, detail: String(e) });
    }
  }
  return results;
}

export async function runDeclarative(page, checks) {
  if (!Array.isArray(checks) || checks.length === 0) return [];
  return page.evaluate(checkPageFunction, checks);
}

// Hook assertion helper. Records every check; throws AssertionError on the first failure.
export class Assertions {
  constructor(page) {
    this.page = page;
    this.results = [];
  }

  #record(label, verdict) {
    this.results.push({ label, pass: !!verdict.pass, detail: verdict.detail || "" });
    if (!verdict.pass) throw new AssertionError(`${label}: ${verdict.detail}`);
    return true;
  }

  assert(condition, message = "assertion failed") {
    return this.#record(message, { pass: !!condition, detail: condition ? "" : message });
  }

  async expect(actual, expected, label = "value") {
    return this.#record(label, matchValue(actual, expected));
  }

  async text(selector, expected) {
    const value = await this.page.evaluate(
      (sel) => {
        const el = document.querySelector(sel);
        return el ? el.textContent.replace(/\s+/g, " ").trim() : null;
      },
      selector
    );
    return this.#record(`text ${selector}`, matchValue(value, expected));
  }

  async count(selector, expected) {
    const n = await this.page.evaluate((sel) => document.querySelectorAll(sel).length, selector);
    return this.#record(`count ${selector}`, matchValue(n, expected));
  }

  async visible(selector, expected = true) {
    const vis = await this.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return !!(r.width || r.height) && st.visibility !== "hidden" && st.display !== "none" && st.opacity !== "0";
    }, selector);
    return this.#record(`visible ${selector}`, { pass: vis === !!expected, detail: `visible=${vis}` });
  }

  async aboveFold(selector, expected = true) {
    const ok = await this.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0;
    }, selector);
    return this.#record(`aboveFold ${selector}`, { pass: ok === !!expected, detail: `aboveFold=${ok}` });
  }

  async attribute(selector, attr, expected) {
    const value = await this.page.evaluate(
      (sel, a) => {
        const el = document.querySelector(sel);
        return el ? el.getAttribute(a) : null;
      },
      selector,
      attr
    );
    return this.#record(`attribute ${selector}[${attr}]`, matchValue(value, expected));
  }

  async style(selector, property, expected) {
    const value = await this.page.evaluate(
      (sel, prop) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el)[prop] : null;
      },
      selector,
      property
    );
    return this.#record(`style ${selector}.${property}`, matchValue(value, expected));
  }

  async exists(selector, expected = true) {
    const n = await this.page.evaluate((sel) => document.querySelectorAll(sel).length, selector);
    return this.#record(`exists ${selector}`, { pass: n > 0 === !!expected, detail: `${n} match(es)` });
  }
}
