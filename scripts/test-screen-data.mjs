import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

// Run against an already started server: BASE_URL=http://127.0.0.1:3001 node scripts/test-screen-data.mjs
// The main flow uses the real UI and local screenshot route. Only clipboard writes
// are observed. A separate context delays the desktop OCR boundary to test races.
const baseUrl = new URL(process.argv[2] ?? process.env.BASE_URL ?? "http://127.0.0.1:3001").href;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XkAAAAASUVORK5CYII=", "base64");
const checks = [];
const browserErrors = [];
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext();
  const statusResponse = await context.request.get(new URL("/api/bot/screenshot", baseUrl).href);
  assert.equal(statusResponse.status(), 200, "Screenshot route must be available before testing");
  const status = await statusResponse.json();
  assert.equal(status.webhookConfigured, false, "Run this test with BOT_WEBHOOK_URL unset; it must not forward test data externally");
  await observeClipboard(context);
  const page = await context.newPage();
  observePageErrors(page);
  await page.goto(baseUrl);

  await page.getByRole("button", { name: "即時觸發", exact: true }).click();
  await page.getByRole("button", { name: /擷取遊戲畫面.*送到截圖機器人/ }).click();
  await expect(page.getByRole("heading", { name: "讀取遊戲畫面", exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "擷取遊戲視窗" })).toBeVisible();
  await expect(page.getByRole("button", { name: "擷取遊戲視窗", exact: true })).toBeEnabled();
  checks.push("automation capture request opens the screenshot workspace and preserves the browser capture prompt");

  await upload(page, "first-frame.png");
  await expect(page.getByAltText("已選取的遊戲截圖")).toBeVisible();
  await expect(page.getByRole("button", { name: "辨識圖片文字", exact: true })).toBeDisabled();
  await expect(page.getByLabel("辨識文字（請對照原圖修正）")).toBeEnabled();
  const emptyResponse = await postScreenshot(page);
  assert.equal(emptyResponse.forwarded, false);
  assert.equal(emptyResponse.received.recognition, "not-run");
  assert.deepEqual(emptyResponse.received.parsed.character, {});
  assert.deepEqual(emptyResponse.received.parsed.attributes, []);
  checks.push("browser upload/manual-text fallback works and an image alone is reported as recognition not-run");

  const rawUid = "001234567890123456789";
  const correctedUid = "001234567890123456788";
  await page.getByLabel("辨識文字（請對照原圖修正）").fill(`角色名稱：測試角色\nUID：${rawUid}\n等級：60\n伺服器：測試服\n模組數量：929\n特攻傷害加持 +12`);
  await expect(page.getByLabel("確認角色名稱", { exact: true })).toHaveValue("測試角色");
  await expect(page.getByLabel("確認角色 UID", { exact: true })).toHaveValue(rawUid);
  const unconfirmedPayload = await copyPayload(page);
  assert.deepEqual(unconfirmedPayload.parsed.attributes, [{ name: "特攻傷害加持", value: 12 }]);
  assert.equal(unconfirmedPayload.parsed.character.uid, rawUid);
  assert.equal(Object.hasOwn(unconfirmedPayload, "confirmedCharacter"), false);
  checks.push("explicit character fields keep long UID strings and are not parsed as module attributes");

  await page.getByLabel("確認角色 UID", { exact: true }).fill(correctedUid);
  await page.getByRole("button", { name: "確認並儲存角色資訊", exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("darklord-tw-character-v1")));
  assert.equal(saved.region, "tw-hk-mo");
  assert.equal(saved.character.uid, correctedUid);
  const confirmedPayload = await copyPayload(page);
  assert.equal(confirmedPayload.confirmedCharacter.uid, correctedUid);
  assert.equal(confirmedPayload.parsed.character.uid, rawUid);
  const confirmedResponse = await postScreenshot(page);
  assert.equal(confirmedResponse.received.confirmedCharacter.uid, correctedUid);
  assert.equal(confirmedResponse.received.parsed.character.uid, rawUid);
  assert.deepEqual(confirmedResponse.received.parsed.attributes, [{ name: "特攻傷害加持", value: 12 }]);
  checks.push("a manually corrected UID is stored and sent as confirmedCharacter while raw recognition remains separate");

  await upload(page, "new-frame.png");
  await expect(page.getByLabel("辨識文字（請對照原圖修正）")).toHaveValue("");
  await expect(page.getByLabel("確認角色 UID", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("確認角色名稱", { exact: true })).toHaveValue("");
  const clearedPayload = await copyPayload(page);
  assert.equal(Object.hasOwn(clearedPayload, "confirmedCharacter"), false);
  assert.deepEqual(clearedPayload.parsed.character, {});
  assert.deepEqual(clearedPayload.parsed.attributes, []);
  checks.push("selecting a new image clears the previous text and confirmation from outgoing data");

  await page.getByLabel("辨識文字（請對照原圖修正）").fill("名稱：一般模組名稱\n物品代碼：5500203\n攻速專注 +8");
  await expect(page.getByLabel("確認角色名稱", { exact: true })).toHaveValue("");
  const itemPayload = await copyPayload(page);
  assert.deepEqual(itemPayload.parsed.character, {});
  assert.equal(itemPayload.parsed.item.gameConfigId, "5500203");
  assert.deepEqual(itemPayload.parsed.attributes, [{ name: "攻速專注", value: 8 }]);
  checks.push("a generic item name cannot become the character name");

  await page.getByRole("button", { name: "模組分析室", exact: true }).click();
  await expect(page.getByRole("button", { name: "查看示範快照", exact: true })).toBeEnabled();
  await expect(page.getByTestId("module-inventory-count")).toHaveText("0");
  checks.push("a fresh personal inventory starts empty");
  await context.close();

  await testLateDesktopOcr();
  assert.deepEqual(browserErrors, [], "No unhandled browser errors are expected");
  console.log(JSON.stringify({ ok: true, baseUrl, checks, browserErrors }, null, 2));
} finally {
  await browser.close();
}

function observePageErrors(page) {
  page.on("pageerror", error => browserErrors.push(error.message));
}

async function observeClipboard(context) {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async text => { window.__screenDataClipboard = text; } },
    });
  });
}

async function upload(page, name) {
  await page.locator('input[type="file"][accept="image/png,image/jpeg"]').setInputFiles({ name, mimeType: "image/png", buffer: png });
}

async function copyPayload(page) {
  await page.evaluate(() => { window.__screenDataClipboard = null; });
  await page.getByRole("button", { name: /^(複製辨識資料|已複製)$/ }).click();
  await expect.poll(() => page.evaluate(() => typeof window.__screenDataClipboard)).toBe("string");
  return JSON.parse(await page.evaluate(() => window.__screenDataClipboard));
}

async function postScreenshot(page) {
  const [response] = await Promise.all([
    page.waitForResponse(candidate => new URL(candidate.url()).pathname === "/api/bot/screenshot" && candidate.request().method() === "POST"),
    page.getByRole("button", { name: "送出截圖與文字", exact: true }).click(),
  ]);
  assert.equal(response.status(), 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  return body;
}

async function testLateDesktopOcr() {
  const context = await browser.newContext();
  await observeClipboard(context);
  await context.addInitScript(() => {
    // Deliberately keep one OCR invocation pending while the user changes workspace.
    // This is the only desktop API substitute; it does not assert Windows OCR quality.
    window.darklordDesktop = {
      appName: "DarkLord Bot test", platform: "win32",
      listCaptureSources: async () => [],
      captureSource: async () => { throw new Error("Capture is not used by this race test"); },
      recognizeImage: () => new Promise(resolve => { window.__completeDelayedOcr = resolve; }),
    };
  });
  const page = await context.newPage();
  observePageErrors(page);
  await page.goto(baseUrl);
  await page.getByRole("button", { name: "截圖機器人", exact: true }).click();
  await upload(page, "old-pending-frame.png");
  await page.getByRole("button", { name: "辨識圖片文字", exact: true }).click();
  await page.waitForFunction(() => typeof window.__completeDelayedOcr === "function");
  await page.getByRole("button", { name: "模組分析室", exact: true }).click();
  await page.getByRole("button", { name: "截圖機器人", exact: true }).click();
  await upload(page, "replacement-frame.png");
  await page.getByLabel("辨識文字（請對照原圖修正）").fill("角色名稱：新圖角色\nUID：000222\n攻速專注 +9");
  await page.getByRole("button", { name: "確認並儲存角色資訊", exact: true }).click();
  await page.evaluate(async () => {
    window.__completeDelayedOcr({ text: "角色名稱：過期角色\nUID：999999", language: "zh-Hant" });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await expect(page.getByLabel("確認角色名稱", { exact: true })).toHaveValue("新圖角色");
  await expect(page.getByLabel("確認角色 UID", { exact: true })).toHaveValue("000222");
  const payload = await copyPayload(page);
  assert.equal(payload.confirmedCharacter.uid, "000222");
  assert.equal(payload.parsed.character.name, "新圖角色");
  assert.deepEqual(payload.parsed.attributes, [{ name: "攻速專注", value: 9 }]);
  checks.push("late OCR from an abandoned screenshot workspace cannot overwrite a new frame and its confirmed character");
  await context.close();
}
