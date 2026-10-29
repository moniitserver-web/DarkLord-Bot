import { NextResponse } from "next/server";
import { SCREENSHOT_MAX_BYTES, parseScreenshotText } from "@/lib/screenshot-bridge";

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
  const form = await request.formData();
  const image = form.get("image");
  if (!(image instanceof Blob)) return jsonError("請提供遊戲畫面截圖。", 422);
  if (!image.type.startsWith("image/")) return jsonError("只接受圖片格式的截圖。", 415);
  if (image.size <= 0 || image.size > SCREENSHOT_MAX_BYTES) return jsonError("截圖大小必須介於 1 byte 與 8 MB。", 413);

  const source = form.get("source") === "screen" ? "screen" : "upload";
  const page = String(form.get("page") ?? "未命名畫面").trim().slice(0, 120) || "未命名畫面";
  const ocrText = String(form.get("ocrText") ?? "").slice(0, 20_000);
  const capturedAt = String(form.get("capturedAt") ?? new Date().toISOString());
  const parsed = parseScreenshotText(ocrText);
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
          capturedAt,
          source,
          page,
          ocrText,
          parsed,
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
    },
    message: forwarded ? "截圖已送到機器人服務。" : "截圖已接收；尚未設定轉送網址，因此還沒有送到機器人服務。",
  });
}
