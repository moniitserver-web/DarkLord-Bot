import rawModules from "./full-modules.json";
import { validateInventory, type ModuleItem } from "../lib/module-inventory";

/** 1,371 records decoded from a public StarResonanceAutoMod modules.vdata snapshot. */
// Preserve the archived file; display only verified same-effect label aliases.
// No game type/instance identifiers or server region are inferred from local ids.
export const FULL_MODULES = validateInventory(rawModules);

export const FULL_MODULES_SOURCE = {
  repository: "fudiyangjin/StarResonanceAutoMod",
  file: "modules.vdata",
  snapshotModuleCount: 1371,
  snapshotDate: "2026-10-28",
  region: "unknown",
  note: "示範用公開背包快照；未驗證適用台港澳服，不是你的背包或完整物品代碼表。",
  parserUrl: "https://github.com/fudiyangjin/StarResonanceAutoMod/blob/cb4505fc5439ec0241270d14f47e07eb9b00cc44/module_parser.py",
  definitionsUrl: "https://github.com/fudiyangjin/StarResonanceAutoMod/blob/cb4505fc5439ec0241270d14f47e07eb9b00cc44/module_types.py",
  labelsUrl: "https://github.com/Bing-su/bpsr-data/blob/1a8d8d78623969599f9fdadff85f2d9e827b798a/src/data/traditionalchinese/ZTable/ModEffectTable.json",
} as const;

const publicSnapshotIds = new Set(FULL_MODULES.map((item) => item.id));

/** Recognize old snapshot exports without rewriting or deleting the user's saved data. */
export function containsPublicSnapshotModules(modules: ModuleItem[]): boolean {
  return modules.some((item) => publicSnapshotIds.has(item.id));
}
