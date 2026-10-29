#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);
const baseUrl = (process.env.STARBOX_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
const intervalMs = Math.max(300, Number(process.env.AUTOMATION_POLL_MS || 1_000));
const once = process.argv.includes("--once");
const nativeAdapter = process.env.AUTOMATION_NATIVE_ADAPTER?.trim();
let stopped = false;
const previousFrameHashes = new Map();

async function json(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok !== true) throw new Error(body.error || `API 回應 ${response.status}`);
  return body;
}

async function captureAndSend(page) {
  const folder = await mkdtemp(join(tmpdir(), "starbox-auto-"));
  const path = join(folder, "frame.png");
  try {
    await execFileAsync("screencapture", ["-x", "-t", "png", path]);
    const bytes = await readFile(path);
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (previousFrameHashes.get(page) === hash) return;
    previousFrameHashes.set(page, hash);
    const form = new FormData();
    form.append("image", new Blob([bytes], { type: "image/png" }), "automation-frame.png");
    form.append("source", "screen");
    form.append("page", page);
    form.append("capturedAt", new Date().toISOString());
    const body = await json(`${baseUrl}/api/bot/screenshot`, { method: "POST", body: form });
    console.log(`  畫面已送出：${page}${body.forwarded ? "（已轉送 bot）" : "（API 已接收）"}`);
  } finally {
    await rm(folder, { recursive: true, force: true }).catch(() => {});
  }
}

async function runNativeAction(action, task) {
  if (!nativeAdapter) {
    console.log(`  [dry-run] ${task.name} 需要原生 adapter：${action.reason}`);
    return;
  }
  const child = execFile(nativeAdapter, [], { env: { ...process.env, STARBOX_AUTOMATION_TASK: task.id } });
  child.stdin?.end(JSON.stringify({ event: "automation_action", task, action }));
  await new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`native adapter 結束碼 ${code}`)));
  });
}

async function tickTask(task) {
  const result = await json(`${baseUrl}/api/automation/${encodeURIComponent(task.id)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "tick" }),
  });
  if (!result.actions?.length) return;
  console.log(`[${new Date().toISOString()}] ${task.name} step ${result.task.steps}`);
  for (const action of result.actions) {
    if (action.type === "capture_screen") await captureAndSend(action.page);
    if (action.type === "native_adapter_required") await runNativeAction(action, result.task);
  }
}

async function tick() {
  const snapshot = await json(`${baseUrl}/api/automation`);
  for (const task of snapshot.tasks ?? []) {
    if (task.status === "running") await tickTask(task);
  }
}

async function main() {
  console.log(`自動化 runner：${baseUrl}，每 ${intervalMs} ms 輪詢${nativeAdapter ? `，adapter ${nativeAdapter}` : "，dry-run 模式"}`);
  do {
    try { await tick(); } catch (error) { console.error(`[${new Date().toISOString()}] runner 失敗：${error instanceof Error ? error.message : error}`); }
    if (!once && !stopped) await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs));
  } while (!once && !stopped);
}

process.on("SIGINT", () => { stopped = true; console.log("\n已停止自動化 runner。"); });
process.on("SIGTERM", () => { stopped = true; });
main().catch((error) => { console.error(error); process.exitCode = 1; });
