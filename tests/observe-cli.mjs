// observe-cli.mjs — implements --explore / --snapshot / --diff / --scaffold.
//
// Gives the agent a structured view of what the page actually contains, what changed
// since the stored snapshot, and a reviewable draft spec derived from the page, the
// git diff and any plan files found in the project.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { launchChromium } from "./browsers.mjs";
import { startDevServer } from "./devserver.mjs";
import {
  captureOutline,
  formatOutline,
  formatDiff,
  diffOutline,
  loadSnapshot,
  saveSnapshot,
  scaffolds,
} from "./outline.mjs";

const VIEWPORT_ORDER = ["desktop", "mobile"];

function resolveTarget(config, maybe) {
  if (!maybe) return { url: config.url, path: "/" };
  if (/^https?:\/\//.test(maybe)) {
    const u = new URL(maybe);
    return { url: u.href, path: u.pathname + u.search };
  }
  const base = config.url.endsWith("/") ? config.url : `${config.url}/`;
  return { url: new URL(String(maybe).replace(/^\//, ""), base).href, path: maybe };
}

function gitDiff(cwd) {
  try {
    const filesOut = execFileSync("git", ["diff", "--name-only"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const files = filesOut ? filesOut.split("\n").filter(Boolean) : [];
    const patch = execFileSync("git", ["diff", "--unified=0"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).slice(0, 20000);
    return { files, patch };
  } catch {
    return { files: [], patch: "" };
  }
}

function findPlanSources(cwd) {
  const candidates = ["SPEC.md", "spec.md", "PLAN.md", "plan.md", "README.md", "docs/SPEC.md", "docs/plan.md"];
  const found = [];
  for (const rel of candidates) {
    const full = path.join(cwd, rel);
    try {
      if (fs.existsSync(full)) found.push(rel);
    } catch {
      /* ignore */
    }
  }
  return found;
}

export async function runObserve({ config, opts }) {
  const target = resolveTarget(config, opts.exploreUrl);
  const artifactsDir = path.resolve(config.__baseDir, config.artifactsDir);
  fs.mkdirSync(artifactsDir, { recursive: true });

  let server = null;
  if (!opts.noServer && config.devServer && config.devServer.command) {
    server = await startDevServer({
      command: config.devServer.command,
      cwd: path.resolve(config.__baseDir, config.devServer.cwd || "."),
      url: config.url,
      timeoutMs: config.devServer.timeoutMs,
      env: config.devServer.env,
    });
  }

  let browser = null;
  const cleanup = async () => {
    if (browser) {
      try {
        await browser.stop();
      } catch {}
      browser = null;
    }
    if (server) {
      try {
        await server.stop();
      } catch {}
      server = null;
    }
  };
  const onSignal = async (sig) => {
    await cleanup();
    process.exit(sig === "SIGINT" ? 130 : 143);
  };
  process.once("SIGINT", () => onSignal("SIGINT"));
  process.once("SIGTERM", () => onSignal("SIGTERM"));

  browser = await launchChromium();
  const outlines = {};
  try {
    for (const viewportName of VIEWPORT_ORDER) {
      const viewport = config.viewports[viewportName];
      if (!viewport) continue;
      const page = await browser.newPage();
      try {
        await page.setViewport(viewport);
        await page.goto(target.url, { timeout: config.timeoutMs });
        const outline = await captureOutline(page);
        outlines[viewportName] = outline;
        process.stdout.write(`\n--- outline [${viewportName}] ---\n${formatOutline(outline)}\n`);
        const diag = page.diagnostics();
        for (const e of diag.pageErrors) process.stdout.write(`page error: ${e}\n`);
        for (const r of diag.badResponses) process.stdout.write(`bad response: HTTP ${r.status} ${r.url}\n`);
        for (const r of diag.failedRequests) process.stdout.write(`failed request: ${r.url} (${r.error})\n`);

        if (opts.snapshot) {
          const file = saveSnapshot(artifactsDir, viewportName, outline);
          process.stdout.write(`snapshot saved: ${file}\n`);
        }
        if (opts.diff) {
          const previous = loadSnapshot(artifactsDir, viewportName);
          if (!previous) {
            process.stdout.write(`no previous snapshot for ${viewportName} (run --snapshot first)\n`);
          } else {
            process.stdout.write(`\n--- diff [${viewportName}] ---\n${formatDiff(diffOutline(previous, outline))}\n`);
          }
        }
      } finally {
        try {
          await page.close();
        } catch {}
      }
    }

    if (opts.scaffold) {
      const cwd = path.resolve(config.__baseDir, config.devServer?.cwd || "..");
      const git = gitDiff(cwd);
      const planSources = findPlanSources(cwd);
      const sc = scaffolds({
        outline: outlines.desktop || Object.values(outlines)[0] || { title: "", headings: [], landmarks: [], links: [], buttons: [], images: [], forms: [], overflow: {} },
        diff: null,
        gitDiff: git,
        planSources,
        path: target.path,
      });
      const dir = path.resolve(config.__baseDir, config.specDir);
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, sc.filename);
      fs.writeFileSync(file, sc.source);
      process.stdout.write(`\nscaffolded spec: ${file}\nReview every TODO(verify) before committing.\n`);
    }
  } finally {
    await cleanup();
  }
  return 0;
}
