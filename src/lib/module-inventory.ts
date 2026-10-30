/** User-entered attribute points; these limits are input safeguards, not game rules. */
export const MODULE_TYPES = ["攻擊", "守護", "輔助"] as const;
export type ModuleType = (typeof MODULE_TYPES)[number];
export const GAME_REGIONS = ["tw-hk-mo", "cn", "global", "unknown"] as const;
export type GameRegion = (typeof GAME_REGIONS)[number];
export const GAME_REGION_LABELS: Record<GameRegion, string> = {
  "tw-hk-mo": "台港澳", cn: "中國大陸", global: "其他國際區服", unknown: "未指定",
};
/** Same-EffectID aliases from the pinned sources in docs/tw-hk-mo-data-sources.md.
 * Public Traditional Chinese labels; not a verified Taiwan server item/code table.
 */
const moduleStatNames: readonly (readonly string[])[] = [
  ["力量加持"], // 1110
  ["敏捷加持"], // 1111
  ["智力加持"], // 1112
  ["特攻傷害加持", "特攻伤害加持", "特攻傷害", "特攻伤害"], // 1113
  ["精英打擊", "精英打击"], // 1114
  ["特攻治療加持", "特攻治疗加持"], // 1205
  ["專精治療加持", "专精治疗加持"], // 1206
  ["抵禦魔法", "抵御魔法"], // 1307
  ["抵禦物理", "抵御物理"], // 1308
  ["施法專注", "施法专注"], // 1407
  ["攻速專注", "攻速专注"], // 1408
  ["暴擊專注", "暴击专注"], // 1409
  ["幸運專注", "幸运专注"], // 1410
  ["極·傷害疊加", "极·伤害叠加", "極-傷害疊加", "极-伤害叠加"], // 2104
  ["極·靈活身法", "极·灵活身法", "極-靈活身法", "极-灵活身法"], // 2105
  ["極·生命凝聚", "极·生命凝聚", "極-生命凝聚", "极-生命凝聚"], // 2204
  ["極·急救措施", "极·急救措施", "極-急救措施", "极-急救措施"], // 2205
  ["極·絕境守護", "极·绝境守护", "極-絕境守護", "极-绝境守护"], // 2304
  ["極·生命波動", "极·生命波动", "極-生命波動", "极-生命波动"], // 2404
  ["極·生命吸取", "极·生命吸取", "極-生命汲取", "极-生命汲取"], // 2405
  ["極·全隊幸暴", "极·全队幸暴", "極-全隊幸暴", "极-全队幸暴"], // 2406
];
export const MODULE_STAT_LABELS = moduleStatNames.map(([canonical]) => canonical);
const moduleStatAliases = new Map(moduleStatNames.flatMap(([canonical, ...aliases]) => aliases.map((alias) => [alias, canonical] as const)));

export function normalizeModuleStatName(value: string): string {
  return moduleStatAliases.get(value) ?? value;
}

export type ModuleItem = {
  /** Internal inventory key; never a substitute for a game item code. */
  id: string;
  name: string;
  type: ModuleType;
  stats: Record<string, number>;
  /** User-provided game metadata. Its presence does not imply official verification. */
  gameConfigId?: string;
  gameInstanceId?: string;
  region?: GameRegion;
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

function fields(value: Record<string, unknown>, expected: string[], label: string, optional: string[] = []) {
  const keys = Object.keys(value);
  if (expected.some((key) => !Object.hasOwn(value, key)) || keys.some((key) => !expected.includes(key) && !optional.includes(key))) {
    throw new Error(`${label}需要 ${expected.join("、")}；${optional.length ? `可選欄位為 ${optional.join("、")}；` : ""}不可包含其他欄位。`);
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
  const instanceRegions = new Map<string, Set<GameRegion>>();
  const allStats = new Set<string>();
  return value.map((raw, index) => {
    const label = `第 ${index + 1} 個模組`;
    const item = object(raw, label);
    fields(item, ["id", "name", "type", "stats"], label, ["gameConfigId", "gameInstanceId", "region"]);
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
      const stat = normalizeModuleStatName(name(rawStat, 40, `${label}的詞條名稱`));
      if (Object.hasOwn(stats, stat)) throw new Error(`${label}的詞條「${stat}」重複（含同一效果的簡繁或舊名稱），請確認後只保留一筆。`);
      if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 1 || amount > 1_000) {
        throw new Error(`${label}的「${stat}」必須是 1 至 1000 的整數。`);
      }
      stats[stat] = amount;
      allStats.add(stat);
      if (allStats.size > 64) throw new Error("背包最多可包含 64 種不同的詞條。");
    }
    const result: ModuleItem = { id, name: moduleName, type: item.type as ModuleType, stats };
    if (Object.hasOwn(item, "gameConfigId")) result.gameConfigId = name(item.gameConfigId, 80, `${label}的遊戲物品代碼`);
    if (Object.hasOwn(item, "gameInstanceId")) result.gameInstanceId = name(item.gameInstanceId, 80, `${label}的遊戲實例識別碼`);
    if (Object.hasOwn(item, "region")) {
      if (!GAME_REGIONS.includes(item.region as GameRegion)) throw new Error(`${label}的 region 必須是 tw-hk-mo、cn、global 或 unknown。`);
      result.region = item.region as GameRegion;
    }
    if (result.gameInstanceId !== undefined) {
      const region = result.region ?? "unknown";
      const seenRegions = instanceRegions.get(result.gameInstanceId) ?? new Set<GameRegion>();
      if (seenRegions.size && (region === "unknown" || seenRegions.has("unknown"))) {
        throw new Error(`${label}的遊戲實例識別碼「${result.gameInstanceId}」重複，且至少一筆區服未指定；請先核對區服與是否為同一件模組。`);
      }
      if (seenRegions.has(region)) {
        throw new Error(`${label}的遊戲實例識別碼「${result.gameInstanceId}」在${GAME_REGION_LABELS[region]}重複；同一件模組不能重複加入背包。`);
      }
      seenRegions.add(region);
      instanceRegions.set(result.gameInstanceId, seenRegions);
    }
    return result;
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
