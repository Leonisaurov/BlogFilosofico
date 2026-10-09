#!/usr/bin/env node
// runner.mjs — the web-page-verification harness entry point.
//
// Boots the project's dev server, then for each browser (chromium, then firefox) runs
// the full spec set at desktop size and then at mobile size, writes a JSON report and
// screenshots, prints a summary, and tears everything down. Zero external dependencies.
//
// Usage (normally through ./run):
//   ./run                      run every spec
//   ./run --browser chromium   only chromium
//   ./run --viewport mobile    only mobile
//   ./run --spec home          only specs whose name matches
//   ./run --no-server          do not start the dev server (assume it is already up)
//   ./run --strict             a browser that cannot start is a failure
//   ./run --list               list discovered specs and exit
//   ./run --explore [url]      print a page outline instead of running specs
//   ./run --scaffold           draft specs from the page + git diff
//   ./run --diff               compare the current outline with the stored snapshot

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launchChromium, launchFirefox } from "./browsers.mjs";
import { startDevServer } from "./devserver.mjs";
import { runDeclarative, Assertions, AssertionError } from "./assertions.mjs";
import { waitForHttp } from "./util.mjs";
import { captureOutline, diffOutline, loadSnapshot, saveSnapshot, scaffolds } from "./outline.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_CONFIG = {
  url: "http://127.0.0.1:5173",
  devServer: {
    command: "",
    cwd: ".",
    env: {},
    timeoutMs: 60000,
  },
  browsers: ["chromium", "firefox"],
  viewports: {
    desktop: { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false },
    mobile: {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
      userAgent:
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    },
  },
  specDir: "specs",
  specSuffix: ".spec.mjs",
  artifactsDir: "artifacts",
  screenshots: true,
  failOnConsoleError: true,
  failOnPageError: true,
  failOnBadResponse: false,
  timeoutMs: 20000,
  strict: false,
};

function deepMerge(base, override) {
  if (Array.isArray(override)) return override;
  if (override && typeof override === "object") {
    const out = { ...base };
    for (const key of Object.keys(override)) {
      out[key] = deepMerge(base && typeof base[key] === "object" ? base[key] : {}, override[key]);
    }
    return out;
  }
  return override === undefined ? base : override;
}

export function findConfigPath(explicit) {
  if (explicit) return path.resolve(explicit);
  for (const name of ["harness.config.mjs", "harness.config.json", "harness.config.js"]) {
    const p = path.join(HERE, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export async function loadConfig(explicit) {
  const configPath = findConfigPath(explicit);
  let userConfig = {};
  if (configPath) {
    if (configPath.endsWith(".json")) {
      userConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } else {
      const mod = await import(pathToFileURL(configPath).href);
      userConfig = mod.default || mod.config || {};
    }
  }
  const config = deepMerge(DEFAULT_CONFIG, userConfig);
  config.__configPath = configPath;
  config.__baseDir = HERE;
  return config;
}

function walk(dir, suffix, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, suffix, out);
    } else if (entry.isFile() && entry.name.endsWith(suffix)) {
      out.push(full);
    }
  }
  return out.sort();
}

export async function loadSpecs(config) {
  const dir = path.resolve(config.__baseDir, config.specDir);
  const files = walk(dir, config.specSuffix);
  const specs = [];
  for (const file of files) {
    const fallbackName = path.basename(file, config.specSuffix);
    try {
      const mod = await import(pathToFileURL(file).href);
      const spec = mod.default || mod.spec;
      if (!spec || typeof spec !== "object") {
        specs.push({ name: fallbackName, __file: file, __loadError: "no default export object" });
      } else {
        specs.push({ name: spec.name || fallbackName, ...spec, __file: file });
      }
    } catch (err) {
      specs.push({ name: fallbackName, __file: file, __loadError: err.stack || err.message });
    }
  }
  return specs;
}

function resolveSpecUrl(config, spec) {
  if (spec.url) return spec.url;
  const base = config.url.endsWith("/") ? config.url : `${config.url}/`;
  const target = (spec.path || "").replace(/^\//, "");
  return new URL(target, base).href;
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

function appliesTo(spec, key, value) {
  const list = spec[key];
  if (!list) return true;
  return Array.isArray(list) && list.includes(value);
}

function diagnosticsFailures(config, diag) {
  const failures = [];
  if (config.failOnPageError) {
    for (const e of diag.pageErrors) failures.push({ label: "uncaught page error", detail: e });
  }
  if (config.failOnConsoleError) {
    for (const c of diag.console) {
      if (c.type === "error" && !diag.pageErrors.includes(c.text)) {
        failures.push({ label: "console.error", detail: c.text });
      }
    }
  }
  if (config.failOnBadResponse) {
    for (const r of diag.badResponses) failures.push({ label: `HTTP ${r.status}`, detail: r.url });
  }
  for (const r of diag.failedRequests) {
    if (r.url.startsWith("data:") || r.url.startsWith("blob:")) continue;
    failures.push({ label: "request failed", detail: `${r.url} (${r.error})` });
  }
  return failures;
}

async function runOneSpec({ config, spec, page, browserName, viewportName, screenshotDir }) {
  const checks = [];
  const url = resolveSpecUrl(config, spec);
  const fail = (label, detail) => checks.push({ label, pass: false, detail: detail || "" });
  const pass = (label, detail) => checks.push({ label, pass: true, detail: detail || "" });

  if (spec.__loadError) {
    fail("spec load", spec.__loadError);
    return { url, checks, pass: false };
  }

  try {
    await withTimeout(page.goto(url, { timeout: config.timeoutMs }), config.timeoutMs + 5000, `goto ${url}`);
  } catch (err) {
    fail("navigation", err.message);
    return { url, checks, pass: false };
  }

  try {
    const declarative = await withTimeout(
      runDeclarative(page, spec.expect),
      config.timeoutMs,
      `checks ${spec.name}`
    );
    checks.push(...declarative);
  } catch (err) {
    fail("declarative checks", err.message);
  }

  if (typeof spec.run === "function") {
    const t = new Assertions(page);
    try {
      await withTimeout(spec.run(page, t), config.timeoutMs, `hook ${spec.name}`);
    } catch (err) {
      if (!(err instanceof AssertionError)) {
        t.results.push({ label: "hook", pass: false, detail: err.message });
      }
    }
    checks.push(...t.results);
  }

  const diag = page.diagnostics();
  for (const f of diagnosticsFailures(config, diag)) {
    checks.push({ label: f.label, pass: false, detail: f.detail });
  }
  if (!checks.length) {
    pass("page loaded", url);
  }

  if (config.screenshots && screenshotDir) {
    try {
      const data = await page.screenshot();
      const file = path.join(screenshotDir, `${browserName}-${viewportName}-${spec.name.replace(/[^\w.-]+/g, "_")}.png`);
      fs.writeFileSync(file, Buffer.from(data, "base64"));
    } catch {
      /* screenshots are best effort */
    }
  }

  return { url, checks, pass: checks.every((c) => c.pass) };
}

function makeSkipped(browserName, viewportName, spec, reason) {
  return {
    browser: browserName,
    viewport: viewportName,
    spec: spec.name,
    url: null,
    skipped: true,
    reason,
    pass: true,
    checks: [{ label: "skipped", pass: true, detail: reason }],
  };
}

export async function runMatrix(config, specs, options = {}) {
  const startedAt = new Date().toISOString();
  const browsers = options.browsers && options.browsers.length ? options.browsers : config.browsers;
  const viewports = options.viewports && options.viewports.length ? options.viewports : ["desktop", "mobile"];
  const specFilter = options.spec ? String(options.spec) : null;
  const matching = specs.filter((s) => !specFilter || s.name.includes(specFilter));

  const artifactsDir = path.resolve(config.__baseDir, config.artifactsDir);
  fs.mkdirSync(artifactsDir, { recursive: true });
  const screenshotDir = config.screenshots ? path.join(artifactsDir, "screenshots") : null;
  if (screenshotDir) fs.mkdirSync(screenshotDir, { recursive: true });

  const results = [];
  const browserInfo = {};
  let activeBrowser = null;
  let activeServer = null;

  const cleanup = async () => {
    if (activeBrowser) {
      try {
        await activeBrowser.stop();
      } catch {}
      activeBrowser = null;
    }
    if (activeServer) {
      try {
        await activeServer.stop();
      } catch {}
      activeServer = null;
    }
  };
  const onSignal = async (sig) => {
    process.stderr.write(`\nReceived ${sig}, cleaning up...\n`);
    await cleanup();
    process.exit(sig === "SIGINT" ? 130 : 143);
  };
  process.once("SIGINT", () => onSignal("SIGINT"));
  process.once("SIGTERM", () => onSignal("SIGTERM"));

  if (!options.noServer && config.devServer && config.devServer.command) {
    activeServer = await startDevServer({
      command: config.devServer.command,
      cwd: path.resolve(config.__baseDir, config.devServer.cwd || "."),
      url: config.url,
      timeoutMs: config.devServer.timeoutMs,
      env: config.devServer.env,
    });
  } else if (!options.noServer) {
    // No command configured: still wait for the URL so a pre-existing server works.
    try {
      await waitForHttp(config.url, { timeout: 15000 });
    } catch {
      /* if nobody is serving, individual checks will report it */
    }
  }

  const launchers = { chromium: launchChromium, firefox: launchFirefox };

  for (const browserName of browsers) {
    const launcher = launchers[browserName];
    if (!launcher) {
      browserInfo[browserName] = { launched: false, reason: `unknown browser ${browserName}` };
      for (const viewportName of viewports) {
        for (const spec of matching) results.push(makeSkipped(browserName, viewportName, spec, "unknown browser"));
      }
      continue;
    }
    let browser;
    try {
      browser = await launcher();
      browserInfo[browserName] = { launched: true, port: browser.port };
      activeBrowser = browser;
    } catch (err) {
      browserInfo[browserName] = { launched: false, reason: err.message };
      for (const viewportName of viewports) {
        for (const spec of matching) results.push(makeSkipped(browserName, viewportName, spec, err.message));
      }
      continue;
    }

    for (const viewportName of viewports) {
      const viewport = config.viewports[viewportName];
      if (!viewport) continue;
      for (const spec of matching) {
        if (!appliesTo(spec, "viewports", viewportName) || !appliesTo(spec, "browsers", browserName)) {
          results.push(makeSkipped(browserName, viewportName, spec, "not applicable"));
          continue;
        }
        let page;
        try {
          page = await browser.newPage();
          await page.setViewport(viewport);
          const outcome = await runOneSpec({ config, spec, page, browserName, viewportName, screenshotDir });
          results.push({ browser: browserName, viewport: viewportName, spec: spec.name, ...outcome });
        } catch (err) {
          results.push({
            browser: browserName,
            viewport: viewportName,
            spec: spec.name,
            url: null,
            pass: false,
            checks: [{ label: "harness", pass: false, detail: err.message }],
          });
        } finally {
          if (page) {
            try {
              await page.close();
            } catch {}
          }
        }
      }
    }

    await browser.stop();
    activeBrowser = null;
  }

  await cleanup();

  const flatChecks = results.flatMap((r) =>
    r.checks.map((c) => ({ ...c, browser: r.browser, viewport: r.viewport, spec: r.spec }))
  );
  const failedChecks = flatChecks.filter((c) => !c.pass);
  const skipped = results.filter((r) => r.skipped);
  const summary = {
    runs: results.length,
    passedRuns: results.filter((r) => !r.skipped && r.pass).length,
    failedRuns: results.filter((r) => !r.skipped && !r.pass).length,
    skippedRuns: skipped.length,
    checks: flatChecks.length,
    failedChecks: failedChecks.length,
  };

  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    baseUrl: config.url,
    configPath: config.__configPath,
    browsers: browserInfo,
    summary,
    results,
    failures: failedChecks,
  };
  fs.writeFileSync(path.join(artifactsDir, "report.json"), JSON.stringify(report, null, 2));

  const strictFailure = config.strict && Object.values(browserInfo).some((b) => !b.launched);
  return { report, artifactsDir, ok: summary.failedRuns === 0 && !strictFailure };
}

export function printReport({ report, artifactsDir }) {
  const lines = [];
  lines.push("== web-page-verification ==");
  lines.push(`base: ${report.baseUrl}`);
  for (const r of report.results) {
    if (r.skipped && r.reason === "not applicable") continue;
    const tag = r.skipped ? "SKIP" : r.pass ? "PASS" : "FAIL";
    lines.push(`[${r.browser}/${r.viewport}] ${r.spec}: ${tag}${r.url ? ` (${r.url})` : ""}`);
    if (!r.pass) {
      for (const c of r.checks) {
        if (!c.pass) lines.push(`    - ${c.label}: ${c.detail}`);
      }
    }
  }
  for (const [name, info] of Object.entries(report.browsers)) {
    lines.push(`browser ${name}: ${info.launched ? `ok (port ${info.port})` : `UNAVAILABLE (${info.reason})`}`);
  }
  const s = report.summary;
  lines.push(
    `Summary: ${s.passedRuns} passed, ${s.failedRuns} failed, ${s.skippedRuns} skipped ` +
      `(${s.checks} checks, ${s.failedChecks} failed)`
  );
  lines.push(`report: ${path.join(artifactsDir, "report.json")}`);
  process.stdout.write(lines.join("\n") + "\n");
}

function parseArgs(argv) {
  const opts = { browsers: [], viewports: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--browser") opts.browsers.push(argv[++i]);
    else if (a === "--viewport") opts.viewports.push(argv[++i]);
    else if (a === "--spec") opts.spec = argv[++i];
    else if (a === "--config") opts.config = argv[++i];
    else if (a === "--no-server") opts.noServer = true;
    else if (a === "--strict") opts.strict = true;
    else if (a === "--list") opts.list = true;
    else if (a === "--explore") {
      opts.explore = true;
      if (argv[i + 1] && !argv[i + 1].startsWith("--")) opts.exploreUrl = argv[++i];
    } else if (a === "--scaffold") opts.scaffold = true;
    else if (a === "--snapshot") opts.snapshot = true;
    else if (a === "--diff") opts.diff = true;
    else if (a === "--help" || a === "-h") opts.help = true;
  }
  return opts;
}

const HELP = `web-page-verification runner

  ./run                      run every spec on chromium+mobile/desktop then firefox
  ./run --browser chromium   restrict browsers (repeatable)
  ./run --viewport mobile    restrict viewports (repeatable)
  ./run --spec NAME          restrict to specs whose name contains NAME
  ./run --no-server          do not start the dev server
  ./run --strict             an unavailable browser fails the run
  ./run --list               list discovered specs
  ./run --explore [url]      print a structured page outline
  ./run --snapshot           save the current outline as the baseline
  ./run --diff               diff the current outline against the baseline
  ./run --scaffold           draft specs from the outline + git diff
`;

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const config = await loadConfig(opts.config);
  if (opts.strict) config.strict = true;

  if (opts.list) {
    const specs = await loadSpecs(config);
    process.stdout.write(specs.map((s) => `${s.name}\t${s.__file}`).join("\n") + "\n");
    return 0;
  }

  if (opts.explore || opts.diff || opts.scaffold || opts.snapshot) {
    const { runObserve } = await import("./observe-cli.mjs");
    return runObserve({ config, opts, loadSpecs });
  }

  const specs = await loadSpecs(config);
  if (!specs.length) {
    process.stderr.write(
      `No specs found in ${path.resolve(config.__baseDir, config.specDir)} (suffix ${config.specSuffix}).\n` +
        `Add a *.spec.mjs file, or run --scaffold to draft one.\n`
    );
    return 2;
  }
  const result = await runMatrix(config, specs, opts);
  printReport(result);
  return result.ok ? 0 : 1;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(`runner crashed: ${err.stack || err.message}\n`);
      process.exit(1);
    });
}
