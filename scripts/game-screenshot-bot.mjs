#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { mkdir, readFile, unlink } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const execFileAsync = promisify(execFile);
const baseUrl = (process.env.STARBOX_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
const intervalMs = Math.max(300, Number(process.env.SCREENSHOT_INTERVAL_MS || 1_500));
const outputDir = resolve(process.env.SCREENSHOT_OUTPUT_DIR || ".screenshots");
const windowId = process.env.SCREENSHOT_WINDOW_ID?.trim();
const page = process.env.GAME_PAGE || "遊戲畫面";
const once = process.argv.includes("--once");
let stopped = false;
let previousHash = "";

async function capture(path) {
  const args = ["-x", "-t", "png"];
  if (windowId) args.push("-l", windowId);
  args.push(path);
  await execFileAsync("screencapture", args);
}

async function send(path, bytes) {
  const form = new FormData();
  form.append("image", new Blob([bytes], { type: "image/png" }), basename(path));
  form.append("source", "screen");
  form.append("page", page);
  form.append("capturedAt", new Date().toISOString());
  const response = await fetch(`${baseUrl}/api/bot/screenshot`, { method: "POST", body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok !== true) throw new Error(body.error || `API 回應 ${response.status}`);
  return body;
}

async function tick() {
  const path = join(outputDir, `frame-${Date.now()}.png`);
  try {
    await capture(path);
    const bytes = await readFile(path);
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (hash === previousHash) {
      await unlink(path);
      return;
    }
    previousHash = hash;
    const body = await send(path, bytes);
    console.log(`[${new Date().toISOString()}] 畫面變更，已送出 ${basename(path)}${body.forwarded ? "（已轉送 bot）" : "（API 已接收，未設定 webhook）"}`);
  } catch (error) {
    await unlink(path).catch(() => {});
    console.error(`[${new Date().toISOString()}] 截圖或送出失敗：${error instanceof Error ? error.message : error}`);
  }
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  console.log(`監看遊戲畫面：${baseUrl}，每 ${intervalMs} ms 檢查一次${windowId ? `，視窗 ${windowId}` : ""}`);
  do {
    await tick();
    if (!once && !stopped) await new Promise(resolvePromise => setTimeout(resolvePromise, intervalMs));
  } while (!once && !stopped);
}

process.on("SIGINT", () => { stopped = true; console.log("\n已停止遊戲畫面監看。"); });
process.on("SIGTERM", () => { stopped = true; });
main().catch(error => { console.error(error); process.exitCode = 1; });
