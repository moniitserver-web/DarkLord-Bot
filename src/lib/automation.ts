export const AUTOMATION_KINDS = [
  "fishing",
  "gathering",
  "dungeon",
  "hunt",
  "performance",
  "combat",
] as const;

export type AutomationKind = (typeof AUTOMATION_KINDS)[number];
export type AutomationMode = "dry-run" | "native";
export type AutomationStatus = "stopped" | "running" | "paused" | "error";

export type AutomationConfig = {
  page: string;
  intervalMs: number;
  screenshotOnStep: boolean;
  stopOnError: boolean;
  maxSteps: number;
  notes: string;
};

export type AutomationTask = {
  id: string;
  kind: AutomationKind;
  name: string;
  description: string;
  mode: AutomationMode;
  status: AutomationStatus;
  config: AutomationConfig;
  steps: number;
  lastRunAt?: string;
  lastError?: string;
};

export type AutomationAction =
  | { type: "capture_screen"; page: string }
  | { type: "wait"; milliseconds: number }
  | { type: "native_adapter_required"; reason: string };

export type AutomationSnapshot = {
  ok: true;
  generatedAt: string;
  runner: {
    mode: "dry-run" | "native";
    connected: boolean;
    message: string;
  };
  tasks: AutomationTask[];
};

type AutomationStore = { tasks: AutomationTask[] };

const globalKey = Symbol.for("starbox.automation.store");
const globalScope = globalThis as typeof globalThis & { [globalKey]?: AutomationStore };

const defaultTasks: AutomationTask[] = [
  {
    id: "auto-fishing",
    kind: "fishing",
    name: "自動釣魚",
    description: "偵測釣魚畫面，按節拍擷取畫面並交給 runner 判斷。",
    mode: "dry-run",
    status: "stopped",
    config: { page: "釣魚", intervalMs: 1_500, screenshotOnStep: true, stopOnError: true, maxSteps: 0, notes: "" },
    steps: 0,
  },
  {
    id: "auto-gathering",
    kind: "gathering",
    name: "自動採集",
    description: "按採集節奏輪詢畫面，預留節點辨識與路線 adapter。",
    mode: "dry-run",
    status: "stopped",
    config: { page: "採集", intervalMs: 2_000, screenshotOnStep: true, stopOnError: true, maxSteps: 0, notes: "" },
    steps: 0,
  },
  {
    id: "auto-dungeon",
    kind: "dungeon",
    name: "自動副本",
    description: "以副本頁面為狀態來源，保留進場、戰鬥與結算階段。",
    mode: "dry-run",
    status: "stopped",
    config: { page: "副本", intervalMs: 2_000, screenshotOnStep: true, stopOnError: true, maxSteps: 0, notes: "" },
    steps: 0,
  },
  {
    id: "auto-hunt",
    kind: "hunt",
    name: "自動討伐",
    description: "監看討伐畫面，將每次狀態變化送到 bot。",
    mode: "dry-run",
    status: "stopped",
    config: { page: "討伐", intervalMs: 1_500, screenshotOnStep: true, stopOnError: true, maxSteps: 0, notes: "" },
    steps: 0,
  },
  {
    id: "auto-performance",
    kind: "performance",
    name: "自動演奏",
    description: "以節拍器事件驅動演奏流程，原生按鍵由 adapter 執行。",
    mode: "dry-run",
    status: "stopped",
    config: { page: "演奏", intervalMs: 500, screenshotOnStep: false, stopOnError: true, maxSteps: 0, notes: "" },
    steps: 0,
  },
  {
    id: "assist-combat",
    kind: "combat",
    name: "原地戰鬥",
    description: "只處理原地循環；移動與技能按鍵交給原生 adapter。",
    mode: "dry-run",
    status: "stopped",
    config: { page: "戰鬥", intervalMs: 1_000, screenshotOnStep: true, stopOnError: true, maxSteps: 0, notes: "" },
    steps: 0,
  },
];

function cloneTasks() {
  return defaultTasks.map((task) => ({ ...task, config: { ...task.config } }));
}

function store(): AutomationStore {
  if (!globalScope[globalKey]) globalScope[globalKey] = { tasks: cloneTasks() };
  return globalScope[globalKey];
}

function taskOrThrow(id: string) {
  const task = store().tasks.find((entry) => entry.id === id);
  if (!task) throw new Error(`找不到自動化任務「${id}」。`);
  return task;
}

export function getAutomationTask(id: string) {
  const task = taskOrThrow(id);
  return { ...task, config: { ...task.config } };
}

function integer(value: unknown, low: number, high: number, fallback: number) {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < low || value > high) {
    throw new Error(`數值必須是 ${low} 至 ${high} 的整數。`);
  }
  return value;
}

export function getAutomationSnapshot(): AutomationSnapshot {
  const tasks = store().tasks.map((task) => ({ ...task, config: { ...task.config } }));
  const hasNative = tasks.some((task) => task.mode === "native" && task.status === "running");
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    runner: {
      mode: hasNative ? "native" : "dry-run",
      connected: true,
      message: hasNative ? "已選擇 native 模式；請在 Windows 啟動桌面 runner 與 adapter。" : "控制台 API 已就緒；Windows runner 啟動後會擷取畫面，dry-run 不會送出遊戲按鍵。",
    },
    tasks,
  };
}

export function updateAutomation(id: string, input: Partial<Pick<AutomationTask, "mode" | "name">> & { config?: Partial<AutomationConfig> }) {
  const task = taskOrThrow(id);
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name || name.length > 80) throw new Error("任務名稱必須是 1 至 80 個字。 ");
    task.name = name;
  }
  if (input.mode !== undefined) {
    if (input.mode !== "dry-run" && input.mode !== "native") throw new Error("不支援的 runner 模式。 ");
    task.mode = input.mode;
    if (input.mode === "native" && task.status === "running") task.status = "paused";
  }
  if (input.config) {
    const config = input.config;
    if (config.page !== undefined) {
      const page = config.page.trim();
      if (!page || page.length > 120) throw new Error("遊戲頁面必須是 1 至 120 個字。 ");
      task.config.page = page;
    }
    task.config.intervalMs = integer(config.intervalMs, 250, 60_000, task.config.intervalMs);
    task.config.maxSteps = integer(config.maxSteps, 0, 10_000_000, task.config.maxSteps);
    if (config.screenshotOnStep !== undefined) task.config.screenshotOnStep = Boolean(config.screenshotOnStep);
    if (config.stopOnError !== undefined) task.config.stopOnError = Boolean(config.stopOnError);
    if (config.notes !== undefined) task.config.notes = String(config.notes).slice(0, 2_000);
  }
  return getAutomationSnapshot();
}

export function startAutomation(id: string) {
  const task = taskOrThrow(id);
  task.status = "running";
  task.lastError = undefined;
  return getAutomationSnapshot();
}

export function pauseAutomation(id: string) {
  const task = taskOrThrow(id);
  if (task.status === "running") task.status = "paused";
  return getAutomationSnapshot();
}

export function stopAutomation(id: string) {
  const task = taskOrThrow(id);
  task.status = "stopped";
  return getAutomationSnapshot();
}

export function tickAutomation(id: string): { snapshot: AutomationSnapshot; task: AutomationTask; actions: AutomationAction[] } {
  const task = taskOrThrow(id);
  if (task.status !== "running") return { snapshot: getAutomationSnapshot(), task: { ...task, config: { ...task.config } }, actions: [] };
  if (task.config.maxSteps > 0 && task.steps >= task.config.maxSteps) {
    task.status = "stopped";
    return { snapshot: getAutomationSnapshot(), task: { ...task, config: { ...task.config } }, actions: [] };
  }
  task.steps += 1;
  task.lastRunAt = new Date().toISOString();
  const actions: AutomationAction[] = [];
  if (task.config.screenshotOnStep) actions.push({ type: "capture_screen", page: task.config.page });
  actions.push({ type: "wait", milliseconds: task.config.intervalMs });
  if (task.mode === "native") actions.push({ type: "native_adapter_required", reason: "此任務需要桌面原生輸入 adapter 才能送出遊戲按鍵。" });
  return { snapshot: getAutomationSnapshot(), task: { ...task, config: { ...task.config } }, actions };
}

export function resetAutomation() {
  globalScope[globalKey] = { tasks: cloneTasks() };
  return getAutomationSnapshot();
}
