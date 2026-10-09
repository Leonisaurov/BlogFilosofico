// driver.mjs — zero-dependency browser driver.
//
// Speaks Chromium DevTools Protocol (CDP) and Firefox WebDriver BiDi directly over the
// WebSocket each browser exposes from its own devtools endpoint. Uses only Node builtins
// and globals (WebSocket, fetch). No automation library is involved.
//
// Verified on Termux aarch64:
//   Chromium 152  -> ws://127.0.0.1:<port>/devtools/browser/<id>   (CDP, flattened sessions)
//   Firefox 157   -> ws://127.0.0.1:<port>/session                (WebDriver BiDi)
//
// Public surface:
//   connectChromium(httpBase) -> ChromiumDriver { newPage() }
//   connectFirefox(wsUrl)     -> FirefoxDriver  { newPage() }
//   page.goto / evaluate / waitFor / click / type / press / hover / scrollTo /
//   setViewport / screenshot / close
//   page.console / page.pageErrors / page.failedRequests / page.badResponses

import { delay } from "./util.mjs";

export class ProtocolError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = "ProtocolError";
    this.detail = detail;
  }
}

function toText(data) {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  }
  return String(data);
}

export class Connection {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.listeners = new Set();
    this.closed = false;
    ws.addEventListener("message", (ev) => this.#onMessage(toText(ev.data)));
    ws.addEventListener("close", () => {
      this.closed = true;
      for (const { reject } of this.pending.values()) {
        reject(new ProtocolError("connection closed"));
      }
      this.pending.clear();
    });
    ws.addEventListener("error", (ev) => {
      const msg = ev && ev.message ? ev.message : "websocket error";
      for (const { reject } of this.pending.values()) reject(new ProtocolError(msg));
      this.pending.clear();
    });
  }

  static open(url, { timeoutMs = 15000 } = {}) {
    return new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(url);
      } catch (e) {
        reject(new ProtocolError(`cannot open websocket ${url}: ${e.message}`));
        return;
      }
      const timer = setTimeout(() => {
        try {
          ws.close();
        } catch {}
        reject(new ProtocolError(`timeout opening websocket ${url}`));
      }, timeoutMs);
      ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolve(new Connection(ws));
      });
      ws.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new ProtocolError(`cannot open websocket ${url}`));
      });
    });
  }

  #onMessage(text) {
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(msg, "id") && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) {
        const detail = msg.error;
        const m = typeof detail === "string" ? detail : detail.message || JSON.stringify(detail);
        p.reject(new ProtocolError(m, detail));
      } else {
        p.resolve(msg.result);
      }
      return;
    }
    // BiDi wraps events in {type:"event"}; CDP events carry {method, params}.
    const method = msg.method || (msg.type === "event" ? msg.method : undefined);
    if (method) {
      const params = msg.params || {};
      for (const fn of this.listeners) {
        try {
          fn(method, params, msg.sessionId);
        } catch {
          /* listener errors must not break the connection */
        }
      }
    }
  }

  send(method, params = {}, sessionId) {
    if (this.closed) return Promise.reject(new ProtocolError("connection closed"));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const msg = { id, method, params };
      if (sessionId) msg.sessionId = sessionId;
      this.ws.send(JSON.stringify(msg));
    });
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  close() {
    try {
      this.ws.close();
    } catch {}
    this.closed = true;
  }
}

function buildEvalExpression(fnOrExpr, args) {
  let call;
  if (typeof fnOrExpr === "function") {
    const argList = args.map((a) => JSON.stringify(a === undefined ? null : a)).join(",");
    call = `(${fnOrExpr.toString()})(${argList})`;
  } else if (args.length > 0) {
    throw new ProtocolError("page.evaluate: arguments require a function, not a string expression");
  } else {
    call = `(${String(fnOrExpr)})`;
  }
  return `(async () => {
    try {
      const __v = await (${call});
      return JSON.stringify({ ok: true, value: __v === undefined ? null : __v });
    } catch (e) {
      return JSON.stringify({ ok: false, error: String((e && e.stack) || e) });
    }
  })()`;
}

function parseEvalPayload(text) {
  const parsed = JSON.parse(text);
  if (!parsed.ok) throw new ProtocolError(parsed.error || "in-page evaluation failed");
  return parsed.value;
}

const CLICK = (sel) => {
  const el = document.querySelector(sel);
  if (!el) throw new Error("element not found: " + sel);
  el.scrollIntoView({ block: "center", inline: "center" });
  el.click();
  return true;
};

const TYPE = (sel, text) => {
  const el = document.querySelector(sel);
  if (!el) throw new Error("element not found: " + sel);
  el.focus();
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  if (desc && desc.set) desc.set.call(el, text);
  else el.value = text;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
};

const PRESS = (key, sel) => {
  const el = sel ? document.querySelector(sel) : document.activeElement || document.body;
  if (!el) throw new Error("element not found: " + sel);
  for (const type of ["keydown", "keypress", "keyup"]) {
    el.dispatchEvent(new KeyboardEvent(type, { key: key, bubbles: true, cancelable: true }));
  }
  return true;
};

const HOVER = (sel) => {
  const el = document.querySelector(sel);
  if (!el) throw new Error("element not found: " + sel);
  for (const type of ["mouseover", "mouseenter", "mousemove"]) {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  }
  return true;
};

const SCROLL_TO = (sel) => {
  const el = document.querySelector(sel);
  if (!el) throw new Error("element not found: " + sel);
  el.scrollIntoView({ block: "center", inline: "center" });
  return true;
};

class BasePage {
  constructor() {
    this.console = [];
    this.pageErrors = [];
    this.failedRequests = [];
    this.badResponses = [];
    this._requestUrls = new Map();
  }

  async click(selector) {
    await this.evaluate(CLICK, selector);
  }

  async type(selector, text) {
    await this.evaluate(TYPE, selector, text);
  }

  async press(key, selector) {
    await this.evaluate(PRESS, key, selector === undefined ? null : selector);
  }

  async hover(selector) {
    await this.evaluate(HOVER, selector);
  }

  async scrollTo(selector) {
    await this.evaluate(SCROLL_TO, selector);
  }

  async url() {
    return this.evaluate("location.href");
  }

  async waitFor(fnOrExpr, { timeout = 5000, interval = 100, args = [] } = {}) {
    const deadline = Date.now() + timeout;
    let lastError;
    for (;;) {
      try {
        const value = await this.evaluate(fnOrExpr, ...args);
        if (value) return value;
      } catch (e) {
        lastError = e;
      }
      if (Date.now() >= deadline) {
        const suffix = lastError ? ` (last error: ${lastError.message})` : "";
        throw new ProtocolError(`waitFor timed out after ${timeout}ms${suffix}`);
      }
      await delay(interval);
    }
  }

  async waitForSelector(selector, { timeout = 5000 } = {}) {
    return this.waitFor(
      (sel) => !!document.querySelector(sel),
      { timeout, args: [selector] }
    );
  }

  async waitForText(selector, expected, { timeout = 5000 } = {}) {
    return this.waitFor(
      (sel, text) => {
        const el = document.querySelector(sel);
        return !!el && el.textContent.includes(text);
      },
      { timeout, args: [selector, expected] }
    );
  }

  diagnostics() {
    return {
      console: this.console,
      pageErrors: this.pageErrors,
      failedRequests: this.failedRequests,
      badResponses: this.badResponses,
    };
  }
}

export class ChromiumPage extends BasePage {
  constructor(conn, sessionId) {
    super();
    this.conn = conn;
    this.sessionId = sessionId;
    this.conn.on((method, params, eventSession) => {
      if (eventSession !== this.sessionId) return;
      this.#onEvent(method, params);
    });
  }

  #onEvent(method, params) {
    switch (method) {
      case "Runtime.consoleAPICalled": {
        const text = (params.args || [])
          .map((a) => (a && a.value !== undefined ? a.value : a && a.description) || a.type)
          .join(" ");
        this.console.push({ type: params.type || "log", text: String(text) });
        break;
      }
      case "Runtime.exceptionThrown": {
        const d = params.exceptionDetails || {};
        this.pageErrors.push(d.exception?.description || d.text || "uncaught exception");
        break;
      }
      case "Log.entryAdded": {
        const e = params.entry || {};
        if (e.level === "error") this.console.push({ type: "error", text: e.text || "" });
        break;
      }
      case "Network.requestWillBeSent": {
        if (params.request) this._requestUrls.set(params.requestId, params.request.url);
        break;
      }
      case "Network.loadingFailed": {
        this.failedRequests.push({
          url: this._requestUrls.get(params.requestId) || "",
          error: params.errorText || "loading failed",
        });
        break;
      }
      case "Network.responseReceived": {
        const r = params.response || {};
        if (r.status >= 400) {
          this.badResponses.push({ url: r.url || "", status: r.status });
        }
        break;
      }
      default:
        break;
    }
  }

  async evaluate(fnOrExpr, ...args) {
    const expression = buildEvalExpression(fnOrExpr, args);
    const res = await this.conn.send(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
      this.sessionId
    );
    if (res.exceptionDetails) {
      throw new ProtocolError(
        res.exceptionDetails.exception?.description || res.exceptionDetails.text || "evaluation failed"
      );
    }
    return parseEvalPayload(res.result?.value);
  }

  async goto(url, { timeout = 20000 } = {}) {
    await this.conn.send("Page.navigate", { url }, this.sessionId);
    await this.waitFor("document.readyState === 'complete'", { timeout, interval: 100 });
    return this.url();
  }

  async setViewport({ width, height, deviceScaleFactor = 1, mobile = false, userAgent } = {}) {
    await this.conn.send(
      "Emulation.setDeviceMetricsOverride",
      { width, height, deviceScaleFactor, mobile },
      this.sessionId
    );
    await this.conn.send(
      "Emulation.setTouchEmulationEnabled",
      { enabled: !!mobile, maxTouchPoints: mobile ? 5 : 1 },
      this.sessionId
    );
    if (userAgent) {
      await this.conn.send("Network.setUserAgentOverride", { userAgent }, this.sessionId);
    }
  }

  async screenshot() {
    const res = await this.conn.send("Page.captureScreenshot", { format: "png" }, this.sessionId);
    return res.data;
  }

  async close() {
    if (this.targetId) {
      await this.conn.send("Target.closeTarget", { targetId: this.targetId }).catch(() => {});
    }
  }
}

export class BidiPage extends BasePage {
  constructor(conn, context) {
    super();
    this.conn = conn;
    this.context = context;
    this.conn.on((method, params) => this.#onEvent(method, params));
  }

  #onEvent(method, params) {
    if (method === "log.entryAdded") {
      const e = params;
      const level = e.level || "info";
      const text = e.text || "";
      if (level === "error") {
        this.console.push({ type: "error", text });
        this.pageErrors.push(text);
      } else {
        this.console.push({ type: level, text });
      }
      return;
    }
    if (method === "network.responseCompleted") {
      const response = params.response || {};
      const status = Number(response.status || 0);
      if (status >= 400) {
        this.badResponses.push({ url: response.url || params.request?.url || "", status });
      }
      return;
    }
    if (method === "network.fetchError") {
      this.failedRequests.push({
        url: params.request?.url || "",
        error: params.errorText || "fetch error",
      });
    }
  }

  async evaluate(fnOrExpr, ...args) {
    const expression = buildEvalExpression(fnOrExpr, args);
    const res = await this.conn.send("script.evaluate", {
      expression,
      target: { context: this.context },
      awaitPromise: true,
      resultOwnership: "root",
    });
    if (res.type === "exception") {
      const d = res.exceptionDetails || {};
      throw new ProtocolError(d.exception?.description || d.text || "evaluation failed");
    }
    return parseEvalPayload(res.result?.value);
  }

  async goto(url, { timeout = 20000 } = {}) {
    await this.conn.send("browsingContext.navigate", {
      context: this.context,
      url,
      wait: "complete",
    });
    await this.waitFor("document.readyState === 'complete'", { timeout, interval: 100 });
    return this.url();
  }

  async setViewport({ width, height, deviceScaleFactor = 1, userAgent } = {}) {
    await this.conn.send("browsingContext.setViewport", {
      context: this.context,
      viewport: { width, height },
      devicePixelRatio: deviceScaleFactor,
    });
    if (userAgent) {
      await this.conn.send("emulation.setUserAgentOverride", { userAgent });
    }
  }

  async screenshot() {
    const res = await this.conn.send("browsingContext.captureScreenshot", { context: this.context });
    return res.data;
  }

  async close() {
    await this.conn.send("browsingContext.close", { context: this.context }).catch(() => {});
  }
}

export class ChromiumDriver {
  constructor(conn, info) {
    this.conn = conn;
    this.info = info;
    this.pages = [];
  }

  async newPage() {
    const target = await this.conn.send("Target.createTarget", { url: "about:blank" });
    const attached = await this.conn.send("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: true,
    });
    const sessionId = attached.sessionId;
    for (const method of ["Page.enable", "Runtime.enable", "Log.enable", "Network.enable"]) {
      await this.conn.send(method, {}, sessionId).catch(() => {});
    }
    const page = new ChromiumPage(this.conn, sessionId);
    page.targetId = target.targetId;
    this.pages.push(page);
    return page;
  }

  close() {
    this.conn.close();
  }
}

export class FirefoxDriver {
  constructor(conn, session) {
    this.conn = conn;
    this.session = session;
    this.pages = [];
  }

  async newPage() {
    const created = await this.conn.send("browsingContext.create", { type: "tab" });
    const context = created.context;
    await this.conn
      .send("session.subscribe", {
        events: ["log.entryAdded", "network.responseCompleted", "network.fetchError"],
        contexts: [context],
      })
      .catch(() => {});
    const page = new BidiPage(this.conn, context);
    this.pages.push(page);
    return page;
  }

  close() {
    this.conn.close();
  }
}

export async function connectChromium(httpBase, opts = {}) {
  const info = await (await fetch(`${httpBase.replace(/\/$/, "")}/json/version`)).json();
  if (!info.webSocketDebuggerUrl) {
    throw new ProtocolError("Chromium did not expose webSocketDebuggerUrl");
  }
  const conn = await Connection.open(info.webSocketDebuggerUrl, opts);
  return new ChromiumDriver(conn, info);
}

export async function connectFirefox(wsUrl, opts = {}) {
  const conn = await Connection.open(wsUrl, opts);
  const session = await conn.send("session.new", { capabilities: {} });
  return new FirefoxDriver(conn, session);
}
