export const SCREENSHOT_MAX_BYTES = 8 * 1024 * 1024;
export type ScreenshotSource = "upload" | "screen";
export type ScreenshotTextSource = "manual" | "windows-ocr";
export type CharacterDraft = { name?: string; uid?: string; level?: number; server?: string };
export type ParsedScreenshot = {
  page?: string;
  moduleCount?: number;
  character: CharacterDraft;
  item: { gameConfigId?: string; gameInstanceId?: string };
  attributes: Array<{ name: string; value: number }>;
  warnings: string[];
};
export type ScreenshotBotPayload = {
  event: "game_screen";
  region: "tw-hk-mo";
  capturedAt: string;
  source: ScreenshotSource;
  textSource: ScreenshotTextSource;
  page: string;
  ocrText: string;
  parsed: ParsedScreenshot;
  confirmedCharacter?: CharacterDraft;
};

// Only explicit labels become identity fields. Unlabelled game text cannot be
// reliably identified without a verified screenshot layout for that version.
export function parseScreenshotText(text: string): ParsedScreenshot {
  const parsed: ParsedScreenshot = { character: {}, item: {}, attributes: [], warnings: [] };
  const fields = new Map<string, Set<string>>();
  const labels: Record<string, string> = {
    "角色名稱": "name", "角色名": "name", "冒險者名稱": "name",
    "uid": "uid", "角色uid": "uid", "角色id": "uid", "角色編號": "uid",
    "等級": "level", "角色等級": "level", "level": "level",
    "伺服器": "server", "區服": "server", "server": "server",
    "物品代碼": "gameConfigId", "物品種類代碼": "gameConfigId", "configid": "gameConfigId",
    "物品實例id": "gameInstanceId", "物品實例編號": "gameInstanceId", "uuid": "gameInstanceId",
    "模組數量": "moduleCount", "模組數": "moduleCount", "模組": "moduleCount", "modules": "moduleCount",
    "頁面": "page", "畫面": "page", "page": "page",
  };
  for (const rawLine of text.slice(0, 20_000).split(/\r?\n/)) {
    const line = rawLine.normalize("NFKC").trim();
    const labelMatch = line.match(/^([^:+]{1,40})\s*(?::|\s)\s*(.+)$/);
    if (labelMatch) {
      const key = labels[labelMatch[1].replace(/\s+/g, "").toLowerCase()];
      if (key) {
        const values = fields.get(key) ?? new Set<string>();
        values.add(labelMatch[2].trim()); fields.set(key, values); continue;
      }
    }
    const match = line.match(/^([^:+]{1,40})\s*[+:]\s*\+?(\d+(?:\.\d+)?)\s*$/);
    if (match) {
      const name = match[1].trim();
      if (labels[name.replace(/\s+/g, "").toLowerCase()]) continue;
      const value = Number(match[2]);
      if (Number.isFinite(value)) parsed.attributes.push({ name, value });
    }
  }
  for (const [key, values] of fields) {
    if (values.size !== 1) { parsed.warnings.push(`「${key}」辨識到不同內容，請核對原圖後手動填寫。`); continue; }
    const value = [...values][0];
    if (["uid", "gameConfigId", "gameInstanceId"].includes(key)) {
      if (!/^\d{1,80}$/.test(value)) { parsed.warnings.push(`「${key}」包含非數字或長度異常，未猜測或替換代碼。`); continue; }
      if (key === "uid") parsed.character.uid = value;
      else parsed.item[key as "gameConfigId" | "gameInstanceId"] = value;
    } else if (key === "level" || key === "moduleCount") {
      if (!/^\d{1,6}$/.test(value)) { parsed.warnings.push(`「${key}」數值不清楚，請核對。`); continue; }
      if (key === "level") parsed.character.level = Number(value);
      else parsed.moduleCount = Number(value);
    } else if (key === "name" || key === "server") parsed.character[key] = value.slice(0, 80);
    else if (key === "page") parsed.page = value.slice(0, 120);
  }
  return parsed;
}

export function validateConfirmedCharacter(value: unknown): CharacterDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("確認角色資料格式不正確。");
  const entry = value as Record<string, unknown>;
  if (Object.keys(entry).some(key => !["name", "uid", "level", "server"].includes(key))) throw new Error("確認角色資料含不支援的欄位。");
  if (typeof entry.name !== "string" || !entry.name.trim() || entry.name.length > 80 || typeof entry.uid !== "string" || !/^\d{1,80}$/.test(entry.uid)) throw new Error("請核對角色名稱與純數字 UID。");
  const result: CharacterDraft = { name: entry.name.trim(), uid: entry.uid };
  if (entry.server !== undefined) {
    if (typeof entry.server !== "string" || entry.server.length > 80) throw new Error("伺服器名稱格式不正確。");
    result.server = entry.server.trim();
  }
  if (entry.level !== undefined) {
    if (typeof entry.level !== "number" || !Number.isInteger(entry.level) || entry.level < 0 || entry.level > 999999) throw new Error("角色等級格式不正確。");
    result.level = entry.level;
  }
  return result;
}

export function createScreenshotPayload(input: {
  source: ScreenshotSource;
  page: string;
  ocrText: string;
  textSource?: ScreenshotTextSource;
  capturedAt?: string;
  confirmedCharacter?: CharacterDraft;
}): ScreenshotBotPayload {
  return {
    event: "game_screen",
    region: "tw-hk-mo",
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    source: input.source,
    textSource: input.textSource ?? "manual",
    page: input.page.trim() || "未命名畫面",
    ocrText: input.ocrText,
    parsed: parseScreenshotText(input.ocrText),
    ...(input.confirmedCharacter ? { confirmedCharacter: validateConfirmedCharacter(input.confirmedCharacter) } : {}),
  };
}
