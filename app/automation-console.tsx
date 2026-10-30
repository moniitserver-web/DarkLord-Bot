"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  Activity,
  Anchor,
  Bell,
  Bot,
  Camera,
  Check,
  CheckCircle2,
  CircleDot,
  Clock3,
  Code2,
  Fish,
  Gamepad2,
  Keyboard,
  Music2,
  Pause,
  Pickaxe,
  Play,
  RotateCcw,
  Settings2,
  Shield,
  Square,
  Swords,
  Terminal,
  Workflow,
  Zap,
} from "lucide-react";
import styles from "./automation-console.module.css";

type TaskId = "auto-fishing" | "auto-gathering" | "auto-dungeon" | "auto-hunt" | "auto-performance" | "assist-combat";
type ViewId = "overview" | "realtime" | TaskId | "tools" | "scripts" | "engine" | "notifications" | "shortcuts" | "settings";
type Icon = ComponentType<{ size?: number; className?: string }>;

type TaskDefinition = {
  id: TaskId;
  name: string;
  description: string;
  icon: Icon;
  defaultInterval: number;
};

type TaskSetting = {
  enabled: boolean;
  interval: number;
  screenshot: boolean;
  ocr: boolean;
  autoStart: boolean;
  mode: "dry-run" | "native";
};

const TASKS: TaskDefinition[] = [
  { id: "auto-fishing", name: "自動釣魚", description: "偵測魚咬鉤、收線並重新拋竿。", icon: Fish, defaultInterval: 900 },
  { id: "auto-gathering", name: "自動採集", description: "巡迴採集點並在畫面變更時回報。", icon: Pickaxe, defaultInterval: 1_500 },
  { id: "auto-dungeon", name: "自動副本", description: "依隊伍與副本流程執行進場、戰鬥、結算。", icon: Shield, defaultInterval: 2_000 },
  { id: "auto-hunt", name: "自動討伐", description: "追蹤目標、戰鬥並在完成後回到起點。", icon: Swords, defaultInterval: 1_200 },
  { id: "auto-performance", name: "自動演奏", description: "依譜面節拍送出鍵位並記錄結果。", icon: Music2, defaultInterval: 500 },
  { id: "assist-combat", name: "原地戰鬥", description: "在固定位置循環技能與畫面檢查。", icon: Activity, defaultInterval: 800 },
];

const NAV_GROUPS: Array<{ label: string; items: Array<{ id: ViewId; label: string; icon: Icon }> }> = [
  { label: "控制", items: [{ id: "overview", label: "啟動", icon: Play }, { id: "realtime", label: "即時觸發", icon: Zap }] },
  {
    label: "全自動",
    items: TASKS.filter(task => task.id !== "assist-combat").map(task => ({ id: task.id, label: task.name, icon: task.icon })),
  },
  {
    label: "輔助工具",
    items: [
      { id: "assist-combat", label: "原地戰鬥", icon: Activity },
      { id: "tools", label: "遊戲工具", icon: Gamepad2 },
      { id: "scripts", label: "獨立腳本", icon: Code2 },
      { id: "engine", label: "腳本引擎", icon: Workflow },
      { id: "notifications", label: "通知", icon: Bell },
      { id: "shortcuts", label: "快捷鍵", icon: Keyboard },
      { id: "settings", label: "設定", icon: Settings2 },
    ],
  },
];

const defaultSettings = (): Record<TaskId, TaskSetting> => Object.fromEntries(
  TASKS.map(task => [task.id, { enabled: true, interval: task.defaultInterval, screenshot: true, ocr: false, autoStart: false, mode: "dry-run" }]),
) as Record<TaskId, TaskSetting>;

const backendId = (taskId: TaskId) => taskId;
type ServerTask = { id: string; status: "stopped" | "running" | "paused" | "error"; steps: number; mode: "dry-run" | "native"; config: { intervalMs: number; screenshotOnStep: boolean } };

const formatTime = (date: Date) => date.toLocaleTimeString("zh-TW", { hour12: false });

export function AutomationConsole() {
  const [view, setView] = useState<ViewId>("overview");
  const [settings, setSettings] = useState<Record<TaskId, TaskSetting>>(defaultSettings);
  const [running, setRunning] = useState<Record<TaskId, boolean>>(() => Object.fromEntries(TASKS.map(task => [task.id, false])) as Record<TaskId, boolean>);
  const [logs, setLogs] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [gameWindow, setGameWindow] = useState("遊戲視窗");
  const [captureInterval, setCaptureInterval] = useState(1_500);
  const [safeMode, setSafeMode] = useState(true);
  const [serverTasks, setServerTasks] = useState<Record<string, ServerTask>>({});
  const [script, setScript] = useState("# 每行一個動作\nscreenshot page=模組背包\nwait 1500\nnotify 模組畫面已更新");
  const [engineSteps, setEngineSteps] = useState("截取畫面\n等待文字辨識完成\n判斷畫面狀態\n執行下一個鍵位");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("blacklord-automation-settings-v1") ?? localStorage.getItem("starbox-automation-settings-v1");
      if (raw) {
        const saved = JSON.parse(raw) as { settings?: Record<TaskId, TaskSetting>; gameWindow?: string; captureInterval?: number; safeMode?: boolean };
        if (saved.settings) setSettings(previous => Object.fromEntries(TASKS.map(task => [task.id, { ...previous[task.id], ...(saved.settings?.[task.id] ?? {}), mode: saved.settings?.[task.id]?.mode === "native" ? "native" : previous[task.id].mode }])) as Record<TaskId, TaskSetting>);
        if (typeof saved.gameWindow === "string") setGameWindow(saved.gameWindow);
        if (Number.isFinite(saved.captureInterval)) setCaptureInterval(saved.captureInterval as number);
        if (typeof saved.safeMode === "boolean") setSafeMode(saved.safeMode);
      }
    } catch {
      setNotice("設定檔無法讀取，已使用預設值。");
    } finally {
      setLoaded(true);
      appendLog("控制台已載入，等待啟動。", setLogs);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function syncRunner() {
      try {
        const response = await fetch("/api/automation", { cache: "no-store" });
        const body = await response.json() as { tasks?: ServerTask[] };
        if (!cancelled && Array.isArray(body.tasks)) {
          setServerTasks(Object.fromEntries(body.tasks.map(task => [task.id, task])));
          setRunning(previous => Object.fromEntries(TASKS.map(task => {
            const server = body.tasks?.find(item => item.id === backendId(task.id));
            return [task.id, server ? server.status === "running" : previous[task.id]];
          })) as Record<TaskId, boolean>);
        }
      } catch {
        if (!cancelled) setNotice("本機 runner 尚未連線；目前仍可檢視與編輯設定。");
      }
    }
    void syncRunner();
    const timer = window.setInterval(() => { void syncRunner(); }, 1_500);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem("blacklord-automation-settings-v1", JSON.stringify({ settings, gameWindow, captureInterval, safeMode })); }
    catch { setNotice("設定無法寫入瀏覽器儲存空間。請先匯出設定或檢查瀏覽器權限。"); }
  }, [captureInterval, gameWindow, loaded, safeMode, settings]);

  const activeCount = Object.values(running).filter(Boolean).length;
  const enabledCount = Object.values(settings).filter(setting => setting.enabled).length;
  const selectedTask = useMemo(() => TASKS.find(task => task.id === view), [view]);

  function updateSetting(taskId: TaskId, patch: Partial<TaskSetting>) {
    setSettings(previous => ({ ...previous, [taskId]: { ...previous[taskId], ...patch } }));
    setNotice("設定已更新，儲存後會套用到下一次啟動。");
    const config: Record<string, unknown> = {};
    if (patch.interval !== undefined) config.intervalMs = Math.max(250, patch.interval);
    if (patch.screenshot !== undefined) config.screenshotOnStep = patch.screenshot;
    void fetch(`/api/automation/${backendId(taskId)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "update", mode: patch.mode, config }),
    }).catch(() => undefined);
  }

  async function callTask(taskId: TaskId, action: "start" | "pause" | "stop" | "tick") {
    const response = await fetch(`/api/automation/${backendId(taskId)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = await response.json() as { ok?: boolean; error?: string; tasks?: ServerTask[] };
    if (!response.ok || body.ok !== true) throw new Error(body.error || "自動化操作失敗。");
    if (Array.isArray(body.tasks)) setServerTasks(Object.fromEntries(body.tasks.map(task => [task.id, task])));
    return body;
  }

  async function startTask(taskId: TaskId) {
    if (!settings[taskId].enabled) {
      setNotice("此系統目前停用，請先開啟啟用開關。");
      return;
    }
    try {
      const updateResponse = await fetch(`/api/automation/${backendId(taskId)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update", mode: settings[taskId].mode, config: { intervalMs: Math.max(250, settings[taskId].interval), screenshotOnStep: settings[taskId].screenshot } }) });
      if (!updateResponse.ok) throw new Error("無法更新自動化任務設定。");
      await callTask(taskId, "start");
      setRunning(previous => ({ ...previous, [taskId]: true }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "自動化操作失敗。");
      return;
    }
    appendLog(`${TASKS.find(task => task.id === taskId)?.name ?? taskId} 已啟動。`, setLogs);
    setNotice(settings[taskId].mode === "native" ? "已啟動原生模式；請確認本機執行器已連線。" : "已啟動預覽模式；執行器會擷取畫面並建立機器人事件，不會送出遊戲按鍵。");
  }

  async function stopTask(taskId: TaskId) {
    try { await callTask(taskId, "stop"); } catch (error) { setNotice(error instanceof Error ? error.message : "自動化操作失敗。"); return; }
    setRunning(previous => ({ ...previous, [taskId]: false }));
    appendLog(`${TASKS.find(task => task.id === taskId)?.name ?? taskId} 已停止。`, setLogs);
    setNotice("已停止此自動系統。");
  }

  async function startAll() {
    const next = { ...running };
    for (const task of TASKS) if (settings[task.id].enabled) await startTask(task.id);
    TASKS.forEach(task => { if (settings[task.id].enabled) next[task.id] = true; });
    setRunning(next);
    appendLog(`已啟動 ${enabledCount} 個啟用系統。`, setLogs);
    setNotice("自動化已啟動。請確認遊戲視窗與螢幕錄製權限。");
  }

  async function stopAll() {
    for (const task of TASKS) if (running[task.id]) await stopTask(task.id);
    setRunning(Object.fromEntries(TASKS.map(task => [task.id, false])) as Record<TaskId, boolean>);
    appendLog("已停止全部自動系統。", setLogs);
    setNotice("全部系統已停止。");
  }

  function trigger(taskId: TaskId | "capture") {
    if (taskId === "capture") {
      window.dispatchEvent(new CustomEvent("blacklord:request-capture"));
      appendLog(`即時擷取：${gameWindow}，已要求截圖橋接擷取畫面。`, setLogs);
      setNotice("已要求截圖橋接擷取一次遊戲畫面。");
      return;
    }
    void callTask(taskId, "tick").then(() => {
      appendLog(`即時觸發：${TASKS.find(task => task.id === taskId)?.name ?? taskId}。`, setLogs);
      setNotice("已送出一次即時觸發指令。若任務未執行，請先啟動它。");
    }).catch(error => setNotice(error instanceof Error ? error.message : "即時觸發失敗。"));
  }

  function saveScript() {
    try { localStorage.setItem("blacklord-automation-script-v1", script); setNotice("獨立腳本已儲存到此瀏覽器。"); appendLog("獨立腳本已儲存。", setLogs); }
    catch { setNotice("腳本儲存失敗。"); }
  }

  function resetSettings() {
    setSettings(defaultSettings()); setGameWindow("遊戲視窗"); setCaptureInterval(1_500); setSafeMode(true); setNotice("已還原預設設定。"); appendLog("設定已還原。", setLogs);
  }

  return <section className={styles.console} aria-label="遊戲自動化控制台">
    <aside className={styles.sidebar} aria-label="自動化功能導覽">
      <div className={styles.brand}><Bot size={20}/><div><strong>自動化控制台</strong><small>獨立本機執行</small></div></div>
      {NAV_GROUPS.map(group => <div className={styles.navGroup} key={group.label}><div className={styles.navLabel}>{group.label}</div>{group.items.map(item => { const IconComponent = item.icon; return <button key={item.id} type="button" className={`${styles.navButton} ${view === item.id ? styles.active : ""}`} onClick={() => setView(item.id)}><IconComponent size={15}/><span>{item.label}</span></button>; })}</div>)}
    </aside>
    <div className={styles.content}>
      <header className={styles.contentHeader}>
        <div><p className={styles.eyebrow}>遊戲自動化 / 本機控制台</p><h2>{selectedTask?.name ?? titleFor(view)}</h2><p className={styles.subtitle}>{selectedTask?.description ?? descriptionFor(view)}</p></div>
        <div className={styles.headerActions}><span className={`${styles.statusPill} ${activeCount ? "" : styles.off}`}><CircleDot size={12}/>{activeCount ? `${activeCount} 個系統執行中` : "目前未執行"}</span>{view === "overview" && <><button className={`${styles.button} ${styles.primary}`} type="button" onClick={startAll}><Play size={14}/>啟動全部</button><button className={styles.dangerButton} type="button" onClick={stopAll}><Square size={14}/>停止全部</button></>}</div>
      </header>
      {notice && <p className={styles.notice} role="status"><Check size={14}/>{notice}</p>}
      {view === "overview" && <Overview running={running} settings={settings} activeCount={activeCount} enabledCount={enabledCount} logs={logs} startAll={startAll} stopAll={stopAll} onNavigate={setView}/>} 
      {view === "realtime" && <Realtime onTrigger={trigger} gameWindow={gameWindow} setGameWindow={setGameWindow} captureInterval={captureInterval} setCaptureInterval={setCaptureInterval}/>} 
      {selectedTask && <TaskPanel task={selectedTask} setting={settings[selectedTask.id]} isRunning={running[selectedTask.id]} onChange={patch => updateSetting(selectedTask.id, patch)} onStart={() => startTask(selectedTask.id)} onStop={() => stopTask(selectedTask.id)} logs={logs}/>} 
      {view === "tools" && <Tools safeMode={safeMode} setSafeMode={setSafeMode} gameWindow={gameWindow} setGameWindow={setGameWindow}/>} 
      {view === "scripts" && <Scripts script={script} setScript={setScript} onSave={saveScript} onRun={() => { appendLog("獨立腳本已排入執行佇列。", setLogs); setNotice("腳本已排入本機執行佇列。"); }}/>} 
      {view === "engine" && <Engine steps={engineSteps} setSteps={setEngineSteps} onRun={() => { appendLog("腳本引擎流程已排入執行佇列。", setLogs); setNotice("流程已排入本機執行佇列。"); }}/>} 
      {view === "notifications" && <Notifications/>} 
      {view === "shortcuts" && <Shortcuts/>} 
      {view === "settings" && <SettingsPanel safeMode={safeMode} setSafeMode={setSafeMode} gameWindow={gameWindow} setGameWindow={setGameWindow} captureInterval={captureInterval} setCaptureInterval={setCaptureInterval} onReset={resetSettings}/>} 
    </div>
  </section>;
}

function Overview({ running, settings, activeCount, enabledCount, logs, startAll, stopAll, onNavigate }: { running: Record<TaskId, boolean>; settings: Record<TaskId, TaskSetting>; activeCount: number; enabledCount: number; logs: string[]; startAll: () => void; stopAll: () => void; onNavigate: (view: ViewId) => void }) {
  return <>
    <div className={styles.dashboardGrid}><div className={styles.metric}><span>已啟用系統</span><strong>{enabledCount} / {TASKS.length}</strong><small>關閉的系統不會被「啟動全部」排程。</small></div><div className={styles.metric}><span>執行中</span><strong>{activeCount}</strong><small>{activeCount ? "正在依各自頻率檢查畫面。" : "尚未啟動任何自動系統。"}</small></div><div className={styles.metric}><span>截圖事件</span><strong>{Object.values(settings).filter(setting => setting.screenshot).length}</strong><small>可在每個系統的設定中關閉。</small></div></div>
    <section className={styles.section}><div className={styles.sectionHeading}><div><h3>全自動系統</h3><p className={styles.hint}>啟動後會使用截圖、文字辨識與本機執行器完成流程。Windows 請另外執行 `scripts\start-blacklord-windows.bat`。</p></div><div className={styles.taskActions}><button className={`${styles.compactButton} ${styles.primary}`} type="button" onClick={startAll}><Play size={12}/>啟動</button><button className={styles.compactButton} type="button" onClick={stopAll}><Square size={12}/>停止</button></div></div><div className={styles.taskGrid}>{TASKS.map(task => <TaskCard key={task.id} task={task} isRunning={running[task.id]} setting={settings[task.id]} onOpen={() => onNavigate(task.id)} onToggle={() => running[task.id] ? stopAll() : startAll()}/>)}</div></section>
    <section className={styles.section}><div className={styles.sectionHeading}><div><h3>最近活動</h3><p className={styles.hint}>本機控制台事件記錄，重新整理後會清空。</p></div><Clock3 size={17} color="#8fa2b7"/></div>{logs.length ? <pre className={styles.log}>{logs.slice(-12).reverse().join("\n")}</pre> : <div className={styles.empty}>尚未有活動記錄。</div>}</section>
  </>;
}

function TaskCard({ task, isRunning, setting, onOpen, onToggle }: { task: TaskDefinition; isRunning: boolean; setting: TaskSetting; onOpen: () => void; onToggle: () => void }) {
  const IconComponent = task.icon;
  return <article className={`${styles.taskCard} ${isRunning ? styles.active : ""}`}><button type="button" className={styles.taskTitle} onClick={onOpen}><IconComponent size={18}/><span><strong>{task.name}</strong><small>{task.description}</small></span></button><div className={styles.taskMeta}><span>{setting.enabled ? `每 ${formatInterval(setting.interval)}` : "已停用"}</span><div className={styles.taskActions}><button type="button" className={`${styles.compactButton} ${isRunning ? "" : styles.primary}`} onClick={onToggle}>{isRunning ? <><Pause size={11}/>停止</> : <><Play size={11}/>啟動</>}</button></div></div></article>;
}

function TaskPanel({ task, setting, isRunning, onChange, onStart, onStop, logs }: { task: TaskDefinition; setting: TaskSetting; isRunning: boolean; onChange: (patch: Partial<TaskSetting>) => void; onStart: () => void; onStop: () => void; logs: string[] }) {
  const IconComponent = task.icon;
  return <section className={styles.section}><div className={styles.sectionHeading}><div className={styles.taskTitle}><IconComponent size={20}/><span><h3>{task.name}</h3><p className={styles.hint}>{task.description}</p></span></div><span className={`${styles.statusPill} ${isRunning ? "" : styles.off}`}>{isRunning ? "執行中" : "已停止"}</span></div><div className={styles.formGrid}><label className={styles.field}>檢查間隔（毫秒）<input type="number" min="120" max="60000" step="10" value={setting.interval} onChange={event => onChange({ interval: Number(event.target.value) || 120 })}/></label><label className={styles.field}>執行器模式<select value={setting.mode} onChange={event => onChange({ mode: event.target.value as TaskSetting["mode"] })}><option value="dry-run">預覽：只擷取與記錄</option><option value="native">原生：交給本機執行器</option></select></label><label className={styles.field}>流程模式<select defaultValue="screen"><option value="screen">畫面偵測＋機器人事件</option><option value="manual">人工確認每一步</option><option value="script">使用獨立腳本</option></select></label><label className={styles.checkRow}><input type="checkbox" checked={setting.enabled} onChange={event => onChange({ enabled: event.target.checked })}/>啟用此自動系統</label><label className={styles.checkRow}><input type="checkbox" checked={setting.screenshot} onChange={event => onChange({ screenshot: event.target.checked })}/>每次流程擷取一張畫面</label><label className={styles.checkRow}><input type="checkbox" checked={false} disabled/>自動辨識尚未串接；請至截圖機器人手動辨識</label><label className={styles.checkRow}><input type="checkbox" checked={setting.autoStart} onChange={event => onChange({ autoStart: event.target.checked })}/>控制台啟動時自動執行</label></div><div className={styles.formActions}>{isRunning ? <button className={styles.dangerButton} type="button" onClick={onStop}><Square size={14}/>停止 {task.name}</button> : <button className={`${styles.button} ${styles.primary}`} type="button" onClick={onStart} disabled={!setting.enabled}><Play size={14}/>啟動 {task.name}</button>}<button className={styles.button} type="button" onClick={() => onChange({ enabled: !setting.enabled })}>{setting.enabled ? "停用系統" : "啟用系統"}</button></div><div className={styles.log}>{logs.filter(log => log.includes(task.name)).slice(-5).reverse().join("\n") || "此系統尚未有活動記錄。"}</div></section>;
}

function Realtime({ onTrigger, gameWindow, setGameWindow, captureInterval, setCaptureInterval }: { onTrigger: (taskId: TaskId | "capture") => void; gameWindow: string; setGameWindow: (value: string) => void; captureInterval: number; setCaptureInterval: (value: number) => void }) {
  return <section className={styles.section}><div className={styles.sectionHeading}><div><h3>即時觸發</h3><p className={styles.hint}>需要時立即建立一次畫面事件，不改變全自動系統的排程。</p></div><Zap size={17} color="#e7b573"/></div><div className={styles.formGrid}><label className={styles.field}>遊戲視窗名稱<input value={gameWindow} onChange={event => setGameWindow(event.target.value)} placeholder="遊戲視窗"/></label><label className={styles.field}>背景擷取間隔（毫秒）<input type="number" min="300" max="60000" step="100" value={captureInterval} onChange={event => setCaptureInterval(Number(event.target.value) || 300)}/></label></div><div className={styles.triggerGrid}><button type="button" className={styles.trigger} onClick={() => onTrigger("capture")}><Camera size={17}/><span><strong>擷取遊戲畫面</strong><small>送到截圖機器人</small></span></button>{TASKS.map(task => { const IconComponent = task.icon; return <button type="button" className={styles.trigger} key={task.id} onClick={() => onTrigger(task.id)}><IconComponent size={17}/><span><strong>{task.name}</strong><small>觸發一次流程</small></span></button>; })}</div></section>;
}

function Tools({ safeMode, setSafeMode, gameWindow, setGameWindow }: { safeMode: boolean; setSafeMode: (value: boolean) => void; gameWindow: string; setGameWindow: (value: string) => void }) {
  return <section className={styles.section}><div className={styles.sectionHeading}><div><h3>遊戲工具</h3><p className={styles.hint}>管理視窗、擷取權限與執行模式。</p></div><Gamepad2 size={17} color="#8fa2b7"/></div><div className={styles.formGrid}><label className={styles.field}>目標視窗<input value={gameWindow} onChange={event => setGameWindow(event.target.value)} placeholder="遊戲視窗"/></label><label className={styles.field}>執行模式<select defaultValue="local"><option value="local">本機執行器</option><option value="manual">人工確認</option><option value="dry">只擷取與解析</option></select></label><label className={styles.checkRow}><input type="checkbox" checked={safeMode} onChange={event => setSafeMode(event.target.checked)}/>安全模式：每次輸入前要求確認</label></div><div className={styles.notice}><CheckCircle2 size={14}/>瀏覽器擷取需要允許螢幕錄製；鍵鼠輸入由本機執行器處理。</div></section>;
}

function Scripts({ script, setScript, onSave, onRun }: { script: string; setScript: (value: string) => void; onSave: () => void; onRun: () => void }) {
  return <section className={styles.section}><div className={styles.sectionHeading}><div><h3>獨立腳本</h3><p className={styles.hint}>每行一個動作，可交給本機執行器排程。</p></div><Terminal size={17} color="#8fa2b7"/></div><label className={styles.field}>腳本內容<textarea value={script} onChange={event => setScript(event.target.value)} spellCheck={false}/></label><div className={styles.formActions}><button className={`${styles.button} ${styles.primary}`} type="button" onClick={onRun}><Play size={14}/>執行腳本</button><button className={styles.button} type="button" onClick={onSave}><Check size={14}/>儲存腳本</button></div></section>;
}

function Engine({ steps, setSteps, onRun }: { steps: string; setSteps: (value: string) => void; onRun: () => void }) {
  return <section className={styles.section}><div className={styles.sectionHeading}><div><h3>腳本引擎</h3><p className={styles.hint}>用步驟串接截圖、文字辨識、等待與通知。</p></div><Workflow size={17} color="#8fa2b7"/></div><label className={styles.field}>流程步驟<textarea value={steps} onChange={event => setSteps(event.target.value)} spellCheck={false}/></label><div className={styles.formActions}><button className={`${styles.button} ${styles.primary}`} type="button" onClick={onRun}><Play size={14}/>測試流程</button><button className={styles.button} type="button"><RotateCcw size={14}/>重新載入範本</button></div></section>;
}

function Notifications() { return <section className={styles.section}><div className={styles.sectionHeading}><div><h3>通知</h3><p className={styles.hint}>設定任務開始、完成、錯誤與需要人工確認時的提示。</p></div><Bell size={17} color="#8fa2b7"/></div><div className={styles.formGrid}><label className={styles.checkRow}><input type="checkbox" defaultChecked/>任務啟動與停止</label><label className={styles.checkRow}><input type="checkbox" defaultChecked/>截圖解析失敗</label><label className={styles.checkRow}><input type="checkbox" defaultChecked/>副本或討伐完成</label><label className={styles.checkRow}><input type="checkbox"/>使用系統通知</label><label className={styles.checkRow}><input type="checkbox"/>使用音效提示</label></div></section>; }
function Shortcuts() { return <section className={styles.section}><div className={styles.sectionHeading}><div><h3>快捷鍵</h3><p className={styles.hint}>快捷鍵由本機執行器註冊；瀏覽器頁面只保存設定。</p></div><Keyboard size={17} color="#8fa2b7"/></div><div className={styles.formGrid}>{[["啟動全部","F6"],["停止全部","F7"],["即時截圖","F8"],["暫停目前流程","F9"]].map(([label, key]) => <label className={styles.field} key={label}>{label}<input defaultValue={key}/></label>)}</div></section>; }
function SettingsPanel({ safeMode, setSafeMode, gameWindow, setGameWindow, captureInterval, setCaptureInterval, onReset }: { safeMode: boolean; setSafeMode: (value: boolean) => void; gameWindow: string; setGameWindow: (value: string) => void; captureInterval: number; setCaptureInterval: (value: number) => void; onReset: () => void }) { return <section className={styles.section}><div className={styles.sectionHeading}><div><h3>設定</h3><p className={styles.hint}>全域設定儲存在目前瀏覽器，不與原本網站共用。</p></div><Settings2 size={17} color="#8fa2b7"/></div><div className={styles.formGrid}><label className={styles.field}>遊戲視窗<input value={gameWindow} onChange={event => setGameWindow(event.target.value)}/></label><label className={styles.field}>截圖檢查間隔（毫秒）<input type="number" min="300" max="60000" step="100" value={captureInterval} onChange={event => setCaptureInterval(Number(event.target.value) || 300)}/></label><label className={styles.checkRow}><input type="checkbox" checked={safeMode} onChange={event => setSafeMode(event.target.checked)}/>安全模式</label></div><div className={styles.formActions}><button className={styles.button} type="button" onClick={onReset}><RotateCcw size={14}/>還原預設</button></div></section>; }

function formatInterval(value: number) { return value >= 1000 ? `${(value / 1000).toFixed(value % 1000 ? 1 : 0)} 秒` : `${value} 毫秒`; }
function titleFor(view: ViewId) { return ({ overview: "啟動", realtime: "即時觸發", tools: "遊戲工具", scripts: "獨立腳本", engine: "腳本引擎", notifications: "通知", shortcuts: "快捷鍵", settings: "設定" } as Record<string, string>)[view] ?? "自動化"; }
function descriptionFor(view: ViewId) { return ({ overview: "集中管理所有自動系統與本機執行狀態。", realtime: "不改變排程，立即建立一次畫面或流程事件。", tools: "設定遊戲視窗、擷取權限與安全執行模式。", scripts: "編輯可重複使用的本機腳本。", engine: "把截圖、文字辨識、等待與通知串成流程。", notifications: "設定自動系統的通知條件。", shortcuts: "管理啟動、停止、截圖與暫停快捷鍵。", settings: "全域控制台設定。" } as Record<string, string>)[view] ?? ""; }
function appendLog(message: string, setLogs: (value: (previous: string[]) => string[]) => void) { setLogs(previous => [`[${formatTime(new Date())}] ${message}`, ...previous].slice(0, 50)); }
