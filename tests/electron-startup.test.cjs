const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");

const {
  createStartupLogger,
  observeServerProcess,
} = require("../electron/startup-logging.cjs");

test("startup logger appends child output to a persistent log", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darklord-startup-"));
  const logPath = path.join(directory, "logs", "startup.log");
  const logger = createStartupLogger(logPath, () => "2026-10-29T12:00:00.000Z");

  logger.write("stderr", "Cannot find module 'next'\n");
  logger.write("stdout", "server booting\n");

  const contents = fs.readFileSync(logPath, "utf8");
  assert.match(contents, /2026-10-29T12:00:00\.000Z \[stderr\] Cannot find module 'next'/);
  assert.match(contents, /2026-10-29T12:00:00\.000Z \[stdout\] server booting/);
});

test("child failure interrupts readiness and preserves stderr", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darklord-child-"));
  const logger = createStartupLogger(path.join(directory, "startup.log"));
  const child = spawn(process.execPath, ["-e", "console.error(\"Cannot find module 'next'\"); process.exit(1)"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const closed = once(child, "close");
  const observer = observeServerProcess(child, logger);
  const timeout = setTimeout(() => child.kill(), 2000);
  const result = await Promise.race([
    observer.failure,
    new Promise((_, reject) => setTimeout(() => reject(new Error("child exit was ignored")), 2000).unref()),
  ]);
  clearTimeout(timeout);
  assert.match(result.message, /結束碼 1/);
  await closed;
  assert.match(fs.readFileSync(logger.path, "utf8"), /Cannot find module 'next'/);
  assert.equal(observer.error, result);
});

test("spawn errors are available without an unhandled error event", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darklord-spawn-"));
  const logger = createStartupLogger(path.join(directory, "startup.log"));
  const child = spawn(path.join(directory, "missing-runtime"));
  const observer = observeServerProcess(child, logger);
  const error = await observer.failure;
  assert.match(error.message, /ENOENT/);
  assert.match(fs.readFileSync(logger.path, "utf8"), /ENOENT/);
});

test("logging failure does not turn a startup error into another crash", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darklord-log-error-"));
  const logPath = path.join(directory, "startup.log");
  fs.mkdirSync(logPath);
  const logger = createStartupLogger(logPath);
  assert.doesNotThrow(() => logger.write("stderr", "original failure"));
  assert.match(logger.error.message, /EISDIR/);
});
