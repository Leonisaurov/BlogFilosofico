// devserver.mjs — start the project's dev server and stop it when done.
//
// The command is configurable per project (harness.config). It is run through `sh -c`
// in its own process group so that `npm run dev` style wrappers and their children are
// all terminated on exit (including on SIGINT).

import { spawn } from "node:child_process";
import { waitForHttp } from "./util.mjs";
import { killTree } from "./browsers.mjs";

export function startDevServer({
  command,
  cwd = process.cwd(),
  url,
  timeoutMs = 60000,
  env = {},
} = {}) {
  if (!command) {
    return Promise.resolve({
      proc: null,
      managed: false,
      logs: () => "",
      async stop() {},
    });
  }
  const proc = spawn("sh", ["-c", command], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const logs = [];
  const collect = (chunk) => {
    logs.push(chunk.toString());
    if (logs.length > 400) logs.shift();
  };
  proc.stdout?.on("data", collect);
  proc.stderr?.on("data", collect);
  const text = () => logs.join("");
  return (async () => {
    try {
      await waitForHttp(url, { timeout: timeoutMs });
    } catch (err) {
      await killTree(proc);
      throw new Error(`dev server did not become ready: ${err.message}\n--- server output ---\n${text()}`);
    }
    return {
      proc,
      managed: true,
      logs: text,
      async stop() {
        await killTree(proc);
      },
    };
  })();
}
