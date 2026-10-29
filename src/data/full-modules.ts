import rawModules from "./full-modules.json";
import type { ModuleItem } from "../lib/module-inventory";

/** 1,371 records decoded from a public StarResonanceAutoMod modules.vdata snapshot. */
// JSON imports infer a large union from the different stat combinations; the
// inventory validator performs the runtime shape check when data is saved.
export const FULL_MODULES = rawModules as unknown as ModuleItem[];

export const FULL_MODULES_SOURCE = {
  repository: "fudiyangjin/StarResonanceAutoMod",
  file: "modules.vdata",
  snapshotModuleCount: 1371,
  snapshotDate: "2026-10-28",
  note: "公開資料快照；不代表即時遊戲背包。",
} as const;
