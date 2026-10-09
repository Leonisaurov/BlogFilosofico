// util.mjs — tiny helpers shared by the harness. Node builtins only.

import net from "node:net";

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function nowIso() {
  return new Date().toISOString();
}

// Pick a free localhost TCP port by binding to port 0 and reading the assigned port.
export async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

export async function waitForHttp(url, { timeout = 30000, interval = 250 } = {}) {
  const deadline = Date.now() + timeout;
  let lastError = "no response";
  for (;;) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(url, { method: "GET", redirect: "manual", signal: controller.signal });
      clearTimeout(timer);
      if (res.status < 500) return res.status;
      lastError = `HTTP ${res.status}`;
    } catch (e) {
      lastError = e.message;
    }
    if (Date.now() >= deadline) {
      throw new Error(`dev server not reachable at ${url} after ${timeout}ms (${lastError})`);
    }
    await delay(interval);
  }
}

export function formatDuration(ms) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}
