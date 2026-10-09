// browsers.mjs — launch and stop headless Chromium and Firefox, zero dependencies.
//
// Both browsers are assumed installed and in PATH (chromium-browser, firefox). This
// module never downloads anything. It:
//   - picks free localhost ports,
//   - uses a throwaway profile under $TMPDIR,
//   - waits for the devtools endpoint,
//   - connects the driver,
//   - guarantees teardown of the whole process group.
//
// Termux specifics verified on device: Chromium needs --no-sandbox/--disable-gpu/
// --disable-dev-shm-usage; Firefox needs the profile directory to already exist.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { freePort, waitForHttp, delay } from "./util.mjs";
import { connectChromium, connectFirefox } from "./driver.mjs";

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function spawnGroup(command, args, options = {}) {
  const proc = spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    ...options,
  });
  const logs = [];
  const collect = (chunk) => {
    logs.push(chunk.toString());
    if (logs.length > 200) logs.shift();
  };
  proc.stdout?.on("data", collect);
  proc.stderr?.on("data", collect);
  proc.logText = () => logs.join("");
  proc.exited = new Promise((resolve) => {
    proc.on("exit", (code, signal) => resolve({ code, signal }));
    proc.on("error", (err) => resolve({ code: null, signal: null, error: err }));
  });
  return proc;
}

export async function killTree(proc, { graceMs = 4000 } = {}) {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return;
  const pid = proc.pid;
  const killGroup = (sig) => {
    try {
      process.kill(-pid, sig);
    } catch {
      try {
        proc.kill(sig);
      } catch {}
    }
  };
  killGroup("SIGTERM");
  const timer = setTimeout(() => killGroup("SIGKILL"), graceMs);
  try {
    await Promise.race([proc.exited, delay(graceMs + 2000)]);
  } finally {
    clearTimeout(timer);
  }
  // Best effort: make sure nothing survives even if the race resolved early.
  try {
    process.kill(-pid, 0);
    killGroup("SIGKILL");
  } catch {}
}

function rmBestEffort(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

export async function launchChromium({
  bin = "chromium-browser",
  port,
  userDataDir,
  extraArgs = [],
  timeoutMs = 30000,
} = {}) {
  const usePort = port || (await freePort());
  const dataDir = userDataDir || makeTempDir("wpv-chromium-");
  const args = [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--hide-scrollbars",
    "--mute-audio",
    `--remote-debugging-port=${usePort}`,
    `--user-data-dir=${dataDir}`,
    ...extraArgs,
    "about:blank",
  ];
  const httpBase = `http://127.0.0.1:${usePort}`;
  const proc = spawnGroup(bin, args);
  try {
    await waitForHttp(`${httpBase}/json/version`, { timeout: timeoutMs });
    const driver = await connectChromium(httpBase, { timeoutMs });
    return {
      name: "chromium",
      driver,
      proc,
      port: usePort,
      httpBase,
      profile: dataDir,
      logs: proc.logText,
      newPage: (...args) => driver.newPage(...args),
      async stop() {
        try {
          driver.close();
        } catch {}
        await killTree(proc);
        rmBestEffort(dataDir);
      },
    };
  } catch (err) {
    await killTree(proc);
    rmBestEffort(dataDir);
    throw new Error(`chromium failed to start: ${err.message}\n${proc.logText()}`);
  }
}

const FIREFOX_PREFS = [
  'user_pref("browser.shell.checkDefaultBrowser", false);',
  'user_pref("browser.startup.homepage_override.mstone", "ignore");',
  'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
  'user_pref("toolkit.telemetry.enabled", false);',
  'user_pref("browser.tabs.warnOnClose", false);',
  'user_pref("browser.warnOnQuit", false);',
  "",
].join("\n");

export async function launchFirefox({
  bin = "firefox",
  port,
  profileDir,
  extraArgs = [],
  timeoutMs = 40000,
} = {}) {
  const usePort = port || (await freePort());
  const profile = profileDir || makeTempDir("wpv-firefox-");
  fs.writeFileSync(path.join(profile, "user.js"), FIREFOX_PREFS);
  const args = [
    "--headless",
    "--no-remote",
    "--new-instance",
    `--profile=${profile}`,
    `--remote-debugging-port=${usePort}`,
    ...extraArgs,
    "about:blank",
  ];
  const proc = spawnGroup(bin, args);
  try {
    await waitForHttp(`http://127.0.0.1:${usePort}/`, { timeout: timeoutMs });
    const driver = await connectFirefox(`ws://127.0.0.1:${usePort}/session`, { timeoutMs });
    return {
      name: "firefox",
      driver,
      proc,
      port: usePort,
      httpBase: `http://127.0.0.1:${usePort}`,
      profile,
      logs: proc.logText,
      newPage: (...args) => driver.newPage(...args),
      async stop() {
        try {
          driver.close();
        } catch {}
        await killTree(proc);
        rmBestEffort(profile);
      },
    };
  } catch (err) {
    await killTree(proc);
    rmBestEffort(profile);
    throw new Error(`firefox failed to start: ${err.message}\n${proc.logText()}`);
  }
}

export const LAUNCHERS = {
  chromium: launchChromium,
  firefox: launchFirefox,
};
