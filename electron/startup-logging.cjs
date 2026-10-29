const fs = require("node:fs");
const path = require("node:path");

function createStartupLogger(logPath, now = () => new Date().toISOString()) {
  const logger = {
    path: logPath,
    error: null,
    write(source, chunk) {
      const text = String(chunk).replace(/\r?\n$/, "");
      if (!text) return;
      try {
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
        fs.appendFileSync(logPath, `${now()} [${source}] ${text}\n`, "utf8");
      } catch (error) {
        logger.error = error;
      }
    },
  };
  return logger;
}

function formatChildTermination(code, signal) {
  if (signal) {
    return `本機服務程序被訊號 ${signal} 終止。請查看啟動記錄。`;
  }
  return `本機服務程序提前結束（結束碼 ${code ?? "未知"}）。請查看啟動記錄。`;
}

function observeServerProcess(child, logger) {
  let resolveFailure;
  const observer = {
    error: null,
    failure: new Promise(resolve => { resolveFailure = resolve; }),
  };
  const fail = error => {
    if (observer.error) return;
    observer.error = error;
    logger.write("server", error.stack || error.message);
    resolveFailure(error);
  };

  child.stdout?.on("data", chunk => logger.write("stdout", chunk));
  child.stderr?.on("data", chunk => logger.write("stderr", chunk));
  child.once("error", error => fail(new Error(`無法啟動本機服務：${error.message}`)));
  child.once("exit", (code, signal) => fail(new Error(formatChildTermination(code, signal))));

  return observer;
}

module.exports = { createStartupLogger, observeServerProcess };
