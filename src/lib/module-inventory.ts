/** User-entered attribute points; these limits are input safeguards, not game rules. */
export const MODULE_TYPES = ["攻擊", "守護", "輔助"] as const;
export type ModuleType = (typeof MODULE_TYPES)[number];
export type ModuleItem = {
  id: string;
  name: string;
  type: ModuleType;
  stats: Record<string, number>;
};
export type InventoryDocument = { version: 1; modules: ModuleItem[] };

export const MAX_INVENTORY_SIZE = 2_000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const forbiddenKeys = new Set([...Object.getOwnPropertyNames(Object.prototype), "prototype"]);

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}必須是物件。`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label}格式不正確。`);
  }
  return value as Record<string, unknown>;
}

function fields(value: Record<string, unknown>, expected: string[], label: string) {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) {
    throw new Error(`${label}只能包含 ${expected.join("、")}，而且不可缺少欄位。`);
  }
}

function name(value: unknown, limit: number, label: string): string {
  if (typeof value !== "string" || !value.trim() || [...value.trim()].length > limit) {
    throw new Error(`${label}必須是 1 至 ${limit} 字的文字。`);
  }
  const trimmed = value.trim();
  if (forbiddenKeys.has(trimmed) || /[\u0000-\u001f\u007f]/u.test(trimmed)) {
    throw new Error(`${label}含有不支援的名稱或控制字元。`);
  }
  return trimmed;
}

/** Validate without coercing numeric strings or silently discarding unknown fields. */
export function validateInventory(value: unknown): ModuleItem[] {
  if (!Array.isArray(value)) throw new Error("modules 必須是模組陣列。");
  if (value.length > MAX_INVENTORY_SIZE) {
    throw new Error(`最多可匯入 ${MAX_INVENTORY_SIZE} 個模組。`);
  }
  const ids = new Set<string>();
  const allStats = new Set<string>();
  return value.map((raw, index) => {
    const label = `第 ${index + 1} 個模組`;
    const item = object(raw, label);
    fields(item, ["id", "name", "type", "stats"], label);
    const id = name(item.id, 80, `${label}的 id`);
    if (ids.has(id)) throw new Error(`${label}的 id「${id}」重複；每件模組必須有不同 id。`);
    ids.add(id);
    const moduleName = name(item.name, 80, `${label}的名稱`);
    if (!MODULE_TYPES.includes(item.type as ModuleType)) {
      throw new Error(`${label}的 type 必須是攻擊、守護或輔助。`);
    }
    const sourceStats = object(item.stats, `${label}的 stats`);
    const entries = Object.entries(sourceStats);
    if (entries.length < 1 || entries.length > 12) {
      throw new Error(`${label}必須有 1 至 12 個詞條。`);
    }
    const stats: Record<string, number> = {};
    for (const [rawStat, amount] of entries) {
      const stat = name(rawStat, 40, `${label}的詞條名稱`);
      if (Object.hasOwn(stats, stat)) throw new Error(`${label}的詞條「${stat}」重複。`);
      if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 1 || amount > 1_000) {
        throw new Error(`${label}的「${stat}」必須是 1 至 1000 的整數。`);
      }
      stats[stat] = amount;
      allStats.add(stat);
      if (allStats.size > 64) throw new Error("背包最多可包含 64 種不同的詞條。");
    }
    return { id, name: moduleName, type: item.type as ModuleType, stats };
  });
}

function checkSize(text: string) {
  if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) {
    throw new Error("背包檔案不可超過 2 MiB。");
  }
}

export function parseInventory(text: string): InventoryDocument {
  if (typeof text !== "string") throw new Error("請提供 JSON 文字。");
  checkSize(text);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("JSON 格式不正確，請檢查括號、引號與逗號。");
  }
  const envelope = object(raw, "背包資料");
  fields(envelope, ["version", "modules"], "背包資料");
  if (envelope.version !== 1) throw new Error("只支援 version 為 1 的背包格式。");
  return { version: 1, modules: validateInventory(envelope.modules) };
}

export function serializeInventory(modules: ModuleItem[]): string {
  const inventory: InventoryDocument = { version: 1, modules: validateInventory(modules) };
  const pretty = JSON.stringify(inventory, null, 2);
  if (new TextEncoder().encode(pretty).byteLength <= MAX_IMPORT_BYTES) return pretty;
  // Formatting must not make a valid compact import impossible to save or
  // export again. Keep readable output where possible, compact it near the cap.
  const compact = JSON.stringify(inventory);
  checkSize(compact);
  return compact;
}

export function inventoryStats(modules: ModuleItem[]): string[] {
  return [...new Set(modules.flatMap((item) => Object.keys(item.stats)))].sort();
}

export function moduleTotal(item: ModuleItem): number {
  return Object.values(item.stats).reduce((sum, amount) => sum + amount, 0);
}
