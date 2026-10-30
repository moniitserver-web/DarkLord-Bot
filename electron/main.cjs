const { app, BrowserWindow, dialog, desktopCapturer, screen, nativeImage, ipcMain } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { createStartupLogger, observeServerProcess } = require("./startup-logging.cjs");
const { createDesktopCaptureService, assertTrustedCaptureCaller } = require("./desktop-capture.cjs");

const HOST = "127.0.0.1";
const DEV_PORT = 3001;
const PACKAGED_PORT = 3817;
let serverProcess = null;
let mainWindow = null;
let startupLogger = null;
let serverObserver = null;
let captureOrigin = null;

const captureService = createDesktopCaptureService({ desktopCapturer, screen, nativeImage });
for (const [channel, method] of [
  ["darklord:list-capture-sources", "listCaptureSources"],
  ["darklord:capture-source", "captureSource"],
  ["darklord:recognize-image", "recognizeImage"],
]) {
  ipcMain.handle(channel, (event, value) => {
    assertTrustedCaptureCaller(event, mainWindow, captureOrigin);
    return captureService[method](value);
  });
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function isPortAvailable(port) {
  return new Promise(resolve => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, HOST);
  });
}

async function choosePort(start) {
  for (let port = start; port < start + 25; port += 1) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error("找不到可用的本機服務埠號。");
}

function requestPage(url) {
  return new Promise(resolve => {
    const request = http.get(url, response => {
      response.resume();
      resolve(Boolean(response.statusCode && response.statusCode < 500));
    });
    request.setTimeout(1000, () => { request.destroy(); resolve(false); });
    request.on("error", () => resolve(false));
  });
}

async function waitForServer(port) {
  const url = `http://${HOST}:${port}/`;
  const probeOrFailure = async operation => {
    if (serverObserver?.error) throw serverObserver.error;
    const result = serverObserver
      ? await Promise.race([operation, serverObserver.failure])
      : await operation;
    if (result instanceof Error) throw result;
    return result;
  };
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await probeOrFailure(requestPage(url))) return url;
    await probeOrFailure(wait(250));
  }
  throw new Error("DarkLord Bot 本機服務啟動逾時。");
}

function startNextServer(port) {
  const environment = {
    ...process.env,
    HOSTNAME: HOST,
    PORT: String(port),
    NODE_ENV: "production",
    ELECTRON_RUN_AS_NODE: "1",
  };

  if (!app.isPackaged) {
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    serverProcess = spawn(npmCommand, ["run", "dev"], {
      cwd: path.join(__dirname, ".."),
      env: { ...environment, PORT: String(DEV_PORT), NODE_ENV: "development" },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    serverObserver = observeServerProcess(serverProcess, startupLogger);
    return DEV_PORT;
  }

  const serverPath = path.join(process.resourcesPath, "server", "server.js");
  if (!fs.existsSync(serverPath)) throw new Error(`找不到內建服務：${serverPath}`);
  serverProcess = spawn(process.execPath, [serverPath], {
    cwd: path.dirname(serverPath),
    env: environment,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverObserver = observeServerProcess(serverProcess, startupLogger);
  return port;
}

function stopNextServer() {
  if (!serverProcess || serverProcess.killed) return;
  serverProcess.kill();
  serverProcess = null;
}

async function createWindow(url) {
  captureOrigin = new URL(url).origin;
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 920,
    minHeight: 680,
    backgroundColor: "#06080a",
    title: "DarkLord Bot",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.on("closed", () => { mainWindow = null; });
  await mainWindow.loadURL(url);
}

async function boot() {
  startupLogger = createStartupLogger(path.join(app.getPath("userData"), "logs", "startup.log"));
  startupLogger.write("app", `Starting DarkLord Bot ${app.getVersion()} (${process.platform} ${process.arch})`);
  const port = app.isPackaged ? await choosePort(PACKAGED_PORT) : DEV_PORT;
  const actualPort = startNextServer(port);
  startupLogger.write("app", `Waiting for local service at ${HOST}:${actualPort}`);
  const url = await waitForServer(actualPort);
  await createWindow(url);
  startupLogger.write("app", "Main window loaded successfully");
}

function showStartupError(error) {
  const message = error instanceof Error ? error.message : String(error);
  startupLogger?.write("app", error instanceof Error ? error.stack || message : message);
  const logDetails = startupLogger
    ? `\n\n啟動記錄：${startupLogger.path}${startupLogger.error ? `\n記錄無法寫入：${startupLogger.error.message}` : ""}`
    : "";
  dialog.showErrorBox("DarkLord Bot 啟動失敗", `${message}${logDetails}`);
}

app.whenReady().then(() => boot().catch(error => {
  showStartupError(error);
  app.quit();
}));

app.on("before-quit", stopNextServer);
app.on("window-all-closed", () => {
  stopNextServer();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) boot().catch(showStartupError);
});
