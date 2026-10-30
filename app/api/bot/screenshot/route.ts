import { NextResponse } from "next/server";
import { SCREENSHOT_MAX_BYTES, parseScreenshotText, validateConfirmedCharacter } from "@/lib/screenshot-bridge";

export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    webhookConfigured: Boolean(process.env.BOT_WEBHOOK_URL),
    maxBytes: SCREENSHOT_MAX_BYTES,
  });
}

export async function POST(request: Request) {
  let form: FormData;
  try { form = await request.formData(); }
  catch { return jsonError("截圖資料格式不正確，請重新選擇圖片再送出。", 400); }
  const image = form.get("image");
  if (!(image instanceof Blob)) return jsonError("請提供遊戲畫面截圖。", 422);
  if (!image.type.startsWith("image/")) return jsonError("只接受圖片格式的截圖。", 415);
  if (image.size <= 0 || image.size > SCREENSHOT_MAX_BYTES) return jsonError("截圖大小必須介於 1 byte 與 8 MB。", 413);

  const source = form.get("source") === "screen" ? "screen" : "upload";
  const page = String(form.get("page") ?? "未命名畫面").trim().slice(0, 120) || "未命名畫面";
  const ocrText = String(form.get("ocrText") ?? "").slice(0, 20_000);
  const textSource = form.get("textSource") === "windows-ocr" ? "windows-ocr" : "manual";
  const capturedAt = String(form.get("capturedAt") ?? new Date().toISOString());
  const parsed = parseScreenshotText(ocrText);
  let confirmedCharacter;
  try {
    const confirmed = form.get("confirmedCharacter");
    if (confirmed) confirmedCharacter = validateConfirmedCharacter(JSON.parse(String(confirmed)));
  } catch { return jsonError("確認角色資料格式不正確，請重新核對角色資料。", 422); }
  const webhook = process.env.BOT_WEBHOOK_URL?.trim();
  let forwarded = false;

  if (webhook) {
    const imageBase64 = Buffer.from(await image.arrayBuffer()).toString("base64");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event: "game_screen",
          region: "tw-hk-mo",
          textSource,
          capturedAt,
          source,
          page,
          ocrText,
          parsed,
          confirmedCharacter,
          image: { mimeType: image.type, size: image.size, base64: imageBase64 },
        }),
        signal: controller.signal,
      });
      if (!response.ok) return jsonError(`機器人轉送服務回應 ${response.status}，截圖未送達。`, 502);
      forwarded = true;
    } catch {
      return jsonError("無法連線到機器人轉送服務，截圖未送達。", 502);
    } finally {
      clearTimeout(timeout);
    }
  }

  return NextResponse.json({
    ok: true,
    forwarded,
    received: {
      source,
      page,
      capturedAt,
      fileName: image instanceof File ? image.name : "game-screen",
      mimeType: image.type,
      size: image.size,
      parsed,
      region: "tw-hk-mo",
      confirmedCharacter,
      textSource,
      recognition: ocrText.trim() ? "text-provided" : "not-run",
    },
    message: (forwarded ? "截圖與文字已轉送；這不代表遊戲帳號已同步。" : "本機已收到截圖；尚未設定轉送服務。") + (!ocrText.trim() ? " 尚未辨識圖片，請先按「辨識圖片文字」或手動填入文字。" : ""),
  });
}
