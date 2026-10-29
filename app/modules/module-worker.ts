import { optimizeModules, type OptimizeOptions, type OptimizationResult } from "@/lib/module-optimizer";
import type { ModuleItem } from "@/lib/module-inventory";

export type ModuleWorkerRequest = { modules: ModuleItem[]; options: OptimizeOptions };
export type ModuleWorkerReply =
  | { ok: true; result: OptimizationResult; elapsedMs: number }
  | { ok: false; error: string };

// Terminating a separate worker per run also cancels a synchronous search.
self.onmessage = (event: MessageEvent<ModuleWorkerRequest>) => {
  const started = performance.now();
  try {
    const result = optimizeModules(event.data.modules, event.data.options);
    self.postMessage({ ok: true, result, elapsedMs: performance.now() - started } satisfies ModuleWorkerReply);
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : "計算失敗，請檢查背包與條件。" } satisfies ModuleWorkerReply);
  }
};
