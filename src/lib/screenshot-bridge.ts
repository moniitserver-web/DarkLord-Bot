export const SCREENSHOT_MAX_BYTES = 8 * 1024 * 1024;

export type ScreenshotSource = "upload" | "screen";

export type ParsedScreenshot = {
  page?: string;
  moduleCount?: number;
  attributes: Array<{ name: string; value: number }>;
};

export type ScreenshotBotPayload = {
  event: "game_screen";
  capturedAt: string;
  source: ScreenshotSource;
  page: string;
  ocrText: string;
  parsed: ParsedScreenshot;
};

export function parseScreenshotText(text: string): ParsedScreenshot {
  const page = text.match(/(?:頁面|畫面|page)\s*[:：]?\s*([^\n]+)/i)?.[1]?.trim();
  const countMatch = text.match(/(?:模組|modules?)\s*(?:數量|數|count)?\s*[:：]?\s*(\d+)/i);
  const attributes: Array<{ name: string; value: number }> = [];

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([^:+：]{1,40})\s*[+：:]\s*\+?(\d+(?:\.\d+)?)\s*$/);
    if (!match) continue;
    const name = match[1].trim();
    const value = Number(match[2]);
    if (name && Number.isFinite(value)) attributes.push({ name, value });
  }

  return {
    ...(page ? { page } : {}),
    ...(countMatch ? { moduleCount: Number(countMatch[1]) } : {}),
    attributes,
  };
}

export function createScreenshotPayload(input: {
  source: ScreenshotSource;
  page: string;
  ocrText: string;
  capturedAt?: string;
}): ScreenshotBotPayload {
  return {
    event: "game_screen",
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    source: input.source,
    page: input.page.trim() || "未命名畫面",
    ocrText: input.ocrText,
    parsed: parseScreenshotText(input.ocrText),
  };
}
