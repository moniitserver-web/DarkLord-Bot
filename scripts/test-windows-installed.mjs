import { _electron as electron } from "@playwright/test";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, cp, mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const projectRoot = resolve(import.meta.dirname, "..");
const logDir = resolve(process.env.SMOKE_LOG_DIR ?? join(tmpdir(), "darklord-windows-smoke-logs"));
const smokeRoot = await mkdtemp(join(tmpdir(), "DarkLord Bot Windows 測試 "));
const installDir = join(smokeRoot, "安裝路徑 with spaces");
const userDataDir = join(smokeRoot, "使用者資料");
let installerPath;
const installedExecutable = join(installDir, "DarkLord Bot.exe");
const runTimeout = 45_000;
const processHandles = new Set();
const electronApps = new Set();
const report = {
  installDir,
  installedExecutable,
  smokeRoot,
  runs: [],
  failures: [],
};

await mkdir(logDir, { recursive: true });
await mkdir(smokeRoot, { recursive: true });
await writeFile(join(logDir, "environment.txt"), [
  `node=${process.version}`,
  `platform=${process.platform}`,
  `arch=${process.arch}`,
  `cwd=${process.cwd()}`,
  `projectRoot=${projectRoot}`,
  `smokeRoot=${smokeRoot}`,
  "",
].join("\n"), "utf8");

try {
  if (process.platform !== "win32") throw new Error("This test requires Windows.");
  if (!relative(projectRoot, smokeRoot).startsWith("..") && !relative(projectRoot, smokeRoot).includes(":")) {
    throw new Error("The installed test must run outside the source checkout.");
  }
  installerPath = await findInstaller();
  report.installerPath = installerPath;
  await installApplication();
  await assertInstalledExecutable();
  const autoStarted = await installedProcesses();
  if (autoStarted.length > 0) throw new Error(`The silent installer unexpectedly launched the app: ${JSON.stringify(autoStarted)}`);
  await runApplication(1);
  await runApplication(2);
} catch (error) {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  report.failures.push(message);
  console.error(message);
  process.exitCode = 1;
} finally {
  for (const cleanup of [closeElectronApps, terminateTrackedProcesses, collectAppLogs]) {
    try {
      await cleanup();
    } catch (error) {
      report.failures.push(`Cleanup failed: ${String(error)}`);
      process.exitCode = 1;
    }
  }
  await writeReport();
}
if (!process.exitCode) console.log(`Windows installed smoke test passed: ${installedExecutable}`);

async function findInstaller() {
  const distDir = join(projectRoot, "dist");
  const entries = await readdir(distDir, { withFileTypes: true });
  const installers = entries
    .filter(entry => entry.isFile() && /^DarkLord-Bot-[\d.]+-x64\.exe$/.test(entry.name))
    .map(entry => join(distDir, entry.name));
  if (installers.length !== 1) {
    throw new Error(`Expected exactly one NSIS installer in ${distDir}, found ${installers.length}.`);
  }
  return installers[0];
}

async function installApplication() {
  const result = await runProcess(installerPath, ["/S", `/D=${installDir}`], join(logDir, "installer.log"), 120_000);
  if (result.code !== 0) {
    throw new Error(`NSIS installer failed with exit code ${result.code}. See installer.log.`);
  }
}

async function assertInstalledExecutable() {
  try {
    await access(installedExecutable);
  } catch {
    throw new Error(`Installed executable was not found at ${installedExecutable}.`);
  }
}

async function runApplication(runNumber) {
  const runLogDir = join(logDir, `run-${runNumber}`);
  await mkdir(runLogDir, { recursive: true });
  const responses = [];
  const failedRequests = [];
  let app;
  let page;
  let appUrl;
  const env = { ...process.env, NODE_ENV: "production" };
  for (const name of ["NODE_PATH", "NODE_OPTIONS", "ELECTRON_RUN_AS_NODE"]) delete env[name];
  try {
    app = await electron.launch({
      executablePath: installedExecutable,
      cwd: smokeRoot,
      args: [`--user-data-dir=${userDataDir}`],
      env,
      timeout: runTimeout,
    });
    electronApps.add(app);
    const child = app.process();
    attachProcessLogs(child, join(runLogDir, "electron.stdout.log"), join(runLogDir, "electron.stderr.log"));
    const runtime = await app.evaluate(({ app }) => ({
      packaged: app.isPackaged,
      executable: process.execPath,
      userData: app.getPath("userData"),
      logs: app.getPath("logs"),
    }));
    report.runtime = runtime;
    if (!runtime.packaged || runtime.executable.toLowerCase() !== installedExecutable.toLowerCase()) {
      throw new Error(`The test did not launch the installed app: ${JSON.stringify(runtime)}`);
    }

    page = await app.firstWindow({ timeout: runTimeout });
    await page.waitForLoadState("load", { timeout: runTimeout });
    page.on("response", response => {
      const record = { url: response.url(), status: response.status(), type: response.request().resourceType() };
      responses.push(record);
      if (record.status >= 400 && ["stylesheet", "script", "document"].includes(record.type)) failedRequests.push(record);
    });
    page.on("requestfailed", request => {
      if (["stylesheet", "script", "document"].includes(request.resourceType())) {
        failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? "request failed", type: request.resourceType() });
      }
    });

    // firstWindow may already have loaded; reload so the document and asset responses are observed.
    await page.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\//, { timeout: runTimeout });
    appUrl = page.url();
    const documentResponse = await page.reload({ waitUntil: "load", timeout: runTimeout });
    if (documentResponse?.status() !== 200) throw new Error(`The installed UI returned HTTP ${documentResponse?.status()}.`);
    await page.locator("h1").first().waitFor({ state: "visible", timeout: runTimeout });

    const title = await page.title();
    const heading = await page.locator("h1").first().innerText();
    const brandVisible = await page.getByText("DarkLord Bot", { exact: true }).first().isVisible();
    const resources = await page.evaluate(() => ({
      css: Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(node => node.href),
      js: Array.from(document.scripts).map(node => node.src).filter(Boolean),
      stylesheets: document.styleSheets.length,
      url: location.href,
    }));

    if (!title.includes("黑帝") && !title.includes("DarkLord")) throw new Error(`Unexpected page title: ${title}`);
    if (!heading.trim()) throw new Error("The main UI heading is empty.");
    if (!brandVisible) throw new Error("The DarkLord Bot brand is not visible.");
    if (resources.css.length === 0 || resources.stylesheets === 0) throw new Error("No stylesheet was loaded by the installed app.");
    if (resources.js.length === 0) throw new Error("No JavaScript bundle was loaded by the installed app.");
    const assets = await Promise.all([...resources.css, ...resources.js].map(async url => {
      const response = await page.request.get(url, { timeout: 10_000 });
      const asset = { url, status: response.status(), bytes: (await response.body()).length };
      await response.dispose();
      if (asset.status !== 200 || asset.bytes === 0) throw new Error(`Invalid installed asset: ${JSON.stringify(asset)}`);
      return asset;
    }));
    if (failedRequests.length > 0) throw new Error(`Installed app reported failed resources: ${JSON.stringify(failedRequests)}`);
    if (!responses.some(response => response.status === 200 && response.type === "document")) throw new Error("The installed UI document did not return HTTP 200.");

    if (runNumber === 1) {
      // Exercise the installed preload/IPC and the real Windows OCR engine,
      // including the previously lost capture event on the automation page.
      await page.getByRole("button", { name: "即時觸發", exact: true }).click();
      await page.getByRole("button", { name: /擷取遊戲畫面/ }).first().click();
      await page.getByRole("heading", { name: "讀取遊戲畫面" }).waitFor();
      const capture = await page.evaluate(async () => {
        const sources = await window.darklordDesktop.listCaptureSources();
        const source = sources.find(item => item.id.startsWith("screen:"));
        if (!source) throw new Error("No desktop source available on Windows runner");
        const result = await window.darklordDesktop.captureSource(source.id);
        return { sourceCount: sources.length, png: result.dataUrl.startsWith("data:image/png;base64,"), bytes: result.dataUrl.length };
      });
      if (!capture.png || capture.bytes < 100) throw new Error("Installed desktop capture did not return an image");
      const fixture = resolve(process.env.OCR_LOG_DIR || "ocr-logs", "fixture.png");
      await page.locator('input[type="file"]').setInputFiles(fixture);
      await page.getByRole("button", { name: "辨識圖片文字", exact: true }).click();
      await page.waitForFunction(() => document.querySelector('textarea')?.value.replace(/\s+/g, '').includes('12345678'), null, { timeout: 60_000 }).catch(async error => {
        const details = await page.getByRole('alert').allTextContents();
        throw new Error(`Installed OCR did not produce the fixture UID: ${details.join('; ') || error.message}`);
      });
      const recognized = await page.locator('textarea').inputValue();
      if (!/角色|測試/.test(recognized.replace(/\s/g, ''))) throw new Error("Installed OCR did not return Chinese text");
      await page.locator('textarea').fill('角色名稱：測試角色\nUID：001234567890123456789\n等級：60\n模組數量：929\n攻速專注 +8');
      if (await page.getByLabel("確認角色 UID", { exact: true }).inputValue() !== '001234567890123456789') throw new Error("Character UID precision was lost");
      await page.getByRole("button", { name: "確認並儲存角色資訊" }).click();
      await page.getByText(/上次確認：測試角色/).waitFor();
      await page.screenshot({ path: join(runLogDir, "ocr-window.png"), fullPage: true });
      await page.getByRole("button", { name: "模組分析室", exact: true }).click();
      if (await page.getByTestId("module-inventory-count").innerText() !== '0') throw new Error("Public snapshot was mistaken for the personal inventory");
      report.captureAndOcr = { ...capture, recognized, confirmedUid: '001234567890123456789' };
    }
    await page.screenshot({ path: join(runLogDir, "window.png"), fullPage: true });
    await writeFile(join(runLogDir, "result.json"), JSON.stringify({ runNumber, title, heading, brandVisible, runtime, resources, assets, responses }, null, 2), "utf8");
    report.runs.push({ runNumber, title, heading, url: resources.url, cssCount: resources.css.length, jsCount: resources.js.length });
  } catch (error) {
    await writeFailureSnapshot(page, runLogDir, error);
    throw new Error(`Installed app run ${runNumber} failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (app) {
      await withTimeout(app.close(), 10_000, "The installed app did not close normally.");
      electronApps.delete(app);
    }
    await collectAppLogs();
  }
  await assertAppStopped(appUrl, runLogDir);
}

function attachProcessLogs(child, stdoutPath, stderrPath) {
  processHandles.add(child);
  const stdout = createWriteStream(stdoutPath, { flags: "a" });
  const stderr = createWriteStream(stderrPath, { flags: "a" });
  child.stdout?.pipe(stdout);
  child.stderr?.pipe(stderr);
  child.once("close", () => {
    processHandles.delete(child);
    stdout.end();
    stderr.end();
  });
}

function runProcess(command, args, logPath, timeout) {
  return new Promise((resolveProcess, rejectProcess) => {
    // NSIS requires /D to be last and unquoted, including when the path contains spaces.
    const child = spawn(command, args, { cwd: smokeRoot, windowsHide: true, windowsVerbatimArguments: true, stdio: ["ignore", "pipe", "pipe"] });
    processHandles.add(child);
    const log = createWriteStream(logPath, { flags: "a" });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    const timer = setTimeout(() => {
      terminateProcess(child).finally(() => rejectProcess(new Error(`${command} timed out after ${timeout}ms.`)));
    }, timeout);
    child.once("error", error => {
      clearTimeout(timer);
      processHandles.delete(child);
      log.end();
      rejectProcess(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      processHandles.delete(child);
      log.end();
      resolveProcess({ code: code ?? -1, signal });
    });
  });
}

async function writeFailureSnapshot(page, runLogDir, error) {
  await writeFile(join(runLogDir, "failure.txt"), error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error), "utf8");
  if (page) await page.screenshot({ path: join(runLogDir, "failure.png"), fullPage: true, timeout: 5_000 }).catch(() => {});
}

async function writeReport() {
  await writeFile(join(logDir, "summary.json"), JSON.stringify(report, null, 2), "utf8");
}

async function closeElectronApps() {
  await Promise.all([...electronApps].map(app => withTimeout(app.close(), 5_000, "Cleanup timed out.").catch(() => {})));
  electronApps.clear();
}

async function terminateTrackedProcesses() {
  await Promise.all([...processHandles].map(child => terminateProcess(child)));
  processHandles.clear();
  if (process.platform === "win32") {
    const survivors = await installedProcesses();
    for (const item of survivors) await terminateProcess({ pid: item.ProcessId, exitCode: null });
  }
}

async function terminateProcess(child) {
  if (!child || child.exitCode !== null || child.killed) return;
  if (process.platform === "win32" && child.pid) {
    await new Promise(resolve => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
      killer.once("close", resolve);
      killer.once("error", resolve);
    });
  } else {
    child.kill("SIGTERM");
  }
}

async function assertAppStopped(appUrl, runLogDir) {
  let remaining = [];
  for (let attempt = 0; attempt < 10; attempt += 1) {
    remaining = await installedProcesses();
    if (remaining.length === 0) break;
    await delay(500);
  }
  await writeFile(join(runLogDir, "remaining-processes.json"), JSON.stringify(remaining, null, 2), "utf8");
  if (remaining.length > 0) throw new Error(`Installed processes remained after close: ${JSON.stringify(remaining)}`);
  let response;
  try {
    response = await fetch(appUrl, { signal: AbortSignal.timeout(2_000) });
  } catch {
    return;
  }
  await response.body?.cancel();
  throw new Error(`The local server still responds after the app closed: ${appUrl}`);
}

async function installedProcesses() {
  const command = "$ErrorActionPreference='Stop'; [Console]::OutputEncoding = [Text.UTF8Encoding]::new(); " +
    "@(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($env:DARKLORD_SMOKE_INSTALL_DIR, [System.StringComparison]::OrdinalIgnoreCase) } | Select-Object ProcessId,ParentProcessId,ExecutablePath) | ConvertTo-Json -Compress";
  const encoded = Buffer.from(command, "utf16le").toString("base64");
  const output = await new Promise((resolveOutput, rejectOutput) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], {
      windowsHide: true,
      env: { ...process.env, DARKLORD_SMOKE_INSTALL_DIR: installDir },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.once("error", rejectOutput);
    child.once("close", code => code === 0 ? resolveOutput(stdout) : rejectOutput(new Error(stderr)));
  });
  const value = output.trim() ? JSON.parse(output.trim()) : [];
  return Array.isArray(value) ? value : [value];
}

async function collectAppLogs() {
  const candidates = new Set([join(userDataDir, "logs"), report.runtime?.logs]);
  if (report.runtime?.userData) candidates.add(join(report.runtime.userData, "logs"));
  if (process.env.APPDATA) candidates.add(join(process.env.APPDATA, "darklord-bot", "logs"));
  let index = 0;
  for (const source of candidates) {
    if (!source) continue;
    try {
      await cp(source, join(logDir, `application-logs-${index++}`), { recursive: true });
    } catch (error) {
      if (error.code !== "ENOENT") console.error(`Could not collect ${source}: ${error.message}`);
    }
  }
}

function withTimeout(promise, milliseconds, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); }),
  ]).finally(() => clearTimeout(timer));
}
