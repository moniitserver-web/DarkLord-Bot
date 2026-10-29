import type { ModuleItem } from "../lib/module-inventory";

/** Fixed examples for exercising the calculator, not a player's bag or verified game rolls. */
export const DEMO_MODULES: ModuleItem[] = [
  { id: "demo-attack-01", name: "示範攻擊・01", type: "攻擊", stats: { "攻擊專注": 8, "暴擊專注": 6, "攻速專注": 3 } },
  { id: "demo-attack-02", name: "示範攻擊・02", type: "攻擊", stats: { "攻擊專注": 4, "暴擊專注": 8, "幸運專注": 6 } },
  { id: "demo-attack-03", name: "示範攻擊・03", type: "攻擊", stats: { "攻擊專注": 7, "攻速專注": 7, "幸運專注": 5 } },
  { id: "demo-attack-04", name: "示範攻擊・04", type: "攻擊", stats: { "暴擊專注": 7, "攻速專注": 6, "幸運專注": 3 } },
  { id: "demo-attack-05", name: "示範攻擊・05", type: "攻擊", stats: { "攻擊專注": 9, "暴擊專注": 4, "幸運專注": 7 } },
  { id: "demo-attack-06", name: "示範攻擊・06", type: "攻擊", stats: { "攻擊專注": 2, "攻速專注": 9, "幸運專注": 4 } },
  { id: "demo-attack-07", name: "示範攻擊・07", type: "攻擊", stats: { "暴擊專注": 8, "攻速專注": 8, "幸運專注": 6 } },
  { id: "demo-attack-08", name: "示範攻擊・08", type: "攻擊", stats: { "攻擊專注": 5, "暴擊專注": 4, "攻速專注": 3 } },
  { id: "demo-defense-01", name: "示範守護・01", type: "守護", stats: { "防禦專注": 8, "生命專注": 6, "抗性專注": 4 } },
  { id: "demo-defense-02", name: "示範守護・02", type: "守護", stats: { "防禦專注": 4, "生命專注": 9, "抗性專注": 6 } },
  { id: "demo-defense-03", name: "示範守護・03", type: "守護", stats: { "防禦專注": 6, "生命專注": 4, "抗性專注": 7 } },
  { id: "demo-defense-04", name: "示範守護・04", type: "守護", stats: { "防禦專注": 9, "生命專注": 7, "抗性專注": 4 } },
  { id: "demo-defense-05", name: "示範守護・05", type: "守護", stats: { "防禦專注": 3, "生命專注": 7, "抗性專注": 6 } },
  { id: "demo-defense-06", name: "示範守護・06", type: "守護", stats: { "防禦專注": 4, "生命專注": 3, "抗性專注": 5 } },
  { id: "demo-defense-07", name: "示範守護・07", type: "守護", stats: { "防禦專注": 7, "生命專注": 8, "抗性專注": 7 } },
  { id: "demo-defense-08", name: "示範守護・08", type: "守護", stats: { "防禦專注": 5, "生命專注": 2, "抗性專注": 7 } },
  { id: "demo-support-01", name: "示範輔助・01", type: "輔助", stats: { "特攻治療加持": 2, "專精治療加持": 8, "攻速專注": 7 } },
  { id: "demo-support-02", name: "示範輔助・02", type: "輔助", stats: { "特攻治療加持": 2, "攻速專注": 5, "極-全隊幸暴": 10 } },
  { id: "demo-support-03", name: "示範輔助・03", type: "輔助", stats: { "特攻治療加持": 7, "專精治療加持": 5, "攻速專注": 6 } },
  { id: "demo-support-04", name: "示範輔助・04", type: "輔助", stats: { "特攻治療加持": 6, "施法專注": 2, "極-全隊幸暴": 7 } },
  { id: "demo-support-05", name: "示範輔助・05", type: "輔助", stats: { "特攻治療加持": 3, "專精治療加持": 7, "極-全隊幸暴": 3 } },
  { id: "demo-support-06", name: "示範輔助・06", type: "輔助", stats: { "專精治療加持": 9, "施法專注": 8, "極-全隊幸暴": 5 } },
  { id: "demo-support-07", name: "示範輔助・07", type: "輔助", stats: { "特攻治療加持": 8, "施法專注": 7, "攻速專注": 5 } },
  { id: "demo-support-08", name: "示範輔助・08", type: "輔助", stats: { "專精治療加持": 4, "攻速專注": 4, "極-全隊幸暴": 4 } },
];
