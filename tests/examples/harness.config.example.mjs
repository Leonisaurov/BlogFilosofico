// web-page-verification config template.
// Copy to `harness.config.mjs` (same directory as runner.mjs) and edit.
export default {
  // Base URL the specs are resolved against. The runner waits for it to answer.
  url: "http://127.0.0.1:5173",

  // Command that starts the dev server. Run through `sh -c` in its own process group.
  // Leave `command` empty to manage no server (assume something already serves `url`).
  devServer: {
    command: "npm run dev",
    cwd: "..", // relative to this tests/ directory
    env: {},
    timeoutMs: 60000,
  },

  // Order is preserved: chromium runs fully (desktop, mobile) before firefox starts.
  browsers: ["chromium", "firefox"],

  // desktop first, then mobile, for each browser.
  viewports: {
    desktop: { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false },
    mobile: { width: 390, height: 844, deviceScaleFactor: 3, mobile: true },
  },

  specDir: "specs",
  specSuffix: ".spec.mjs",
  artifactsDir: "artifacts",
  screenshots: true,

  // Diagnostics that fail a spec.
  failOnConsoleError: true,
  failOnPageError: true,
  failOnBadResponse: false,

  timeoutMs: 20000,
};
