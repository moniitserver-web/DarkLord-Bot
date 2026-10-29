import {
  MODULE_TYPES,
  moduleTotal,
  validateInventory,
  type ModuleItem,
  type ModuleType,
} from "./module-inventory";

export type StatRule = { stat: string; weight: number; min: number };

export type OptimizeOptions = {
  type: ModuleType;
  threshold: number;
  rules: StatRule[];
  limit?: number;
  maxNodes?: number;
};

export type ModuleCombination = {
  ids: string[];
  stats: Record<string, number>;
  total: number;
  score: number;
};

export type OptimizationResult = {
  combinations: ModuleCombination[];
  candidateCount: number;
  visitedNodes: number;
  evaluatedCount: number;
  complete: boolean;
};

export const MODULE_SLOTS = 5;
export const DEFAULT_MAX_NODES = 300_000;
export const MAX_SEARCH_NODES = 2_000_000;

const UNSAFE_NAMES = new Set([...Object.getOwnPropertyNames(Object.prototype), "prototype"]);

function integerInRange(value: unknown, low: number, high: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= low && value <= high;
}

function validateOptions(options: OptimizeOptions) {
  if (!options || !MODULE_TYPES.includes(options.type)) throw new Error("請選擇有效的模組類型。");
  if (!integerInRange(options.threshold, 0, 12_000)) throw new Error("排除門檻須為 0 至 12000 的整數。");
  if (!Array.isArray(options.rules) || options.rules.length < 1 || options.rules.length > 64) {
    throw new Error("請設定 1 至 64 個期望詞條。");
  }
  const names = new Set<string>();
  const rules = options.rules.map((rule) => {
    if (!rule || typeof rule.stat !== "string" || !rule.stat.trim() || [...rule.stat].length > 40
      || rule.stat !== rule.stat.trim() || /[\u0000-\u001f\u007f]/u.test(rule.stat)
      || UNSAFE_NAMES.has(rule.stat) || names.has(rule.stat)) {
      throw new Error("期望詞條名稱須為 1 至 40 個字，且不能重複或使用保留名稱。");
    }
    names.add(rule.stat);
    if (typeof rule.weight !== "number" || !Number.isFinite(rule.weight) || rule.weight < 0 || rule.weight > 100
      || Math.abs(rule.weight * 10 - Math.round(rule.weight * 10)) > 1e-8) {
      throw new Error("詞條權重須為 0 至 100，最多一位小數。");
    }
    if (!integerInRange(rule.min, 0, 5_000)) throw new Error("五件合計下限須為 0 至 5000 的整數。");
    return { ...rule, scaledWeight: Math.round(rule.weight * 10) };
  });
  if (!rules.some((rule) => rule.scaledWeight > 0)) throw new Error("至少一個詞條的權重必須大於 0。");
  const limit = options.limit ?? 10;
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  if (!integerInRange(limit, 1, 50)) throw new Error("顯示組合數須為 1 至 50 的整數。");
  if (!integerInRange(maxNodes, 1, MAX_SEARCH_NODES)) throw new Error("搜尋上限須為 1 至 2000000 的整數。");
  return { rules, limit, maxNodes };
}

/**
 * Searches five distinct inventory items using additive user-defined weights.
 * This is not a game's damage formula. Positive minima apply to the sum of
 * five items, including rules with weight zero.
 *
 * Branch bounds are admissible: score uses the best remaining item scores;
 * each minimum uses a suffix DP for its best achievable remaining stat sum.
 * A completed search proves the returned score ranking among eligible items.
 * At tied scores, the first deterministic DFS combinations are retained; there
 * is deliberately no claim to enumerate all ties or rank ties by total stats.
 * If the node budget is reached, complete=false and results are provisional.
 */
export function optimizeModules(modules: ModuleItem[], options: OptimizeOptions): OptimizationResult {
  const inventory = validateInventory(modules);
  const { rules, limit, maxNodes } = validateOptions(options);
  const required = rules.filter((rule) => rule.min > 0);
  const candidates = inventory
    .filter((item) => item.type === options.type && moduleTotal(item) > options.threshold)
    .map((item) => ({
      item,
      total: moduleTotal(item),
      score: rules.reduce((sum, rule) => sum + (item.stats[rule.stat] ?? 0) * rule.scaledWeight, 0),
      requiredValues: required.map((rule) => item.stats[rule.stat] ?? 0),
    }))
    .sort((a, b) => b.score - a.score || (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0));

  const result: OptimizationResult = {
    combinations: [],
    candidateCount: candidates.length,
    visitedNodes: 0,
    evaluatedCount: 0,
    complete: true,
  };
  const n = candidates.length;
  if (n < MODULE_SLOTS) return result;

  // Scores are integers scaled by ten, keeping score comparisons exact for
  // the supported one-decimal weights even across many additions.
  const prefixScores = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefixScores[i + 1] = prefixScores[i] + candidates[i].score;

  const stride = MODULE_SLOTS + 1;
  const suffixMaxima = required.map((_, ruleIndex) => {
    const table = new Float64Array((n + 1) * stride).fill(-Infinity);
    table[n * stride] = 0;
    for (let i = n - 1; i >= 0; i--) {
      table[i * stride] = 0;
      for (let count = 1; count <= MODULE_SLOTS; count++) {
        table[i * stride + count] = Math.max(
          table[(i + 1) * stride + count],
          candidates[i].requiredValues[ruleIndex] + table[(i + 1) * stride + count - 1],
        );
      }
    }
    return table;
  });

  const selected: number[] = [];
  const requiredTotals = required.map(() => 0);
  // Keep integer scores alongside display values; do not round-trip decimals
  // when testing bounds against the worst retained result.
  const winners: { combination: ModuleCombination; score: number }[] = [];

  function worstScore() {
    return winners.length === limit ? winners[winners.length - 1].score : -Infinity;
  }

  function visit(start: number, slots: number, score: number, total: number) {
    if (result.visitedNodes >= maxNodes) {
      result.complete = false;
      return;
    }
    result.visitedNodes++;
    if (slots === 0) {
      result.evaluatedCount++;
      if (required.some((rule, i) => requiredTotals[i] < rule.min) || score <= worstScore()) return;
      const stats: Record<string, number> = {};
      for (const index of selected) {
        for (const [stat, value] of Object.entries(candidates[index].item.stats)) {
          stats[stat] = (stats[stat] ?? 0) + value;
        }
      }
      const combination: ModuleCombination = {
        ids: selected.map((index) => candidates[index].item.id),
        stats,
        total,
        score: score / 10,
      };
      // Inserting after equal scores preserves deterministic discovery order.
      const position = winners.findIndex((winner) => winner.score < score);
      if (position < 0) winners.push({ combination, score });
      else winners.splice(position, 0, { combination, score });
      if (winners.length > limit) winners.pop();
      return;
    }
    if (n - start < slots) return;
    if (score + prefixScores[start + slots] - prefixScores[start] <= worstScore()) return;
    if (required.some((rule, i) => requiredTotals[i] + suffixMaxima[i][start * stride + slots] < rule.min)) return;

    for (let index = start; index <= n - slots; index++) {
      // This bound decreases as index increases because candidates are sorted.
      // It safely skips the entire remaining sibling range, including ties.
      if (score + prefixScores[index + slots] - prefixScores[index] <= worstScore()) break;
      const candidate = candidates[index];
      selected.push(index);
      for (let r = 0; r < required.length; r++) requiredTotals[r] += candidate.requiredValues[r];
      visit(index + 1, slots - 1, score + candidate.score, total + candidate.total);
      for (let r = 0; r < required.length; r++) requiredTotals[r] -= candidate.requiredValues[r];
      selected.pop();
      if (!result.complete) break;
    }
  }

  visit(0, MODULE_SLOTS, 0, 0);
  result.combinations = winners.map((winner) => winner.combination);
  return result;
}
