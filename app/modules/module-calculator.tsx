"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Box, Calculator, ChevronDown, Cpu, Layers3, Play, Plus, RotateCcw, SlidersHorizontal, Square, Trash2 } from "lucide-react";
import { containsPublicSnapshotModules, FULL_MODULES, FULL_MODULES_SOURCE } from "@/data/full-modules";
import { GAME_REGION_LABELS, GAME_REGIONS, inventoryStats, MAX_IMPORT_BYTES, MAX_INVENTORY_SIZE, MODULE_STAT_LABELS, MODULE_TYPES, moduleTotal, parseInventory, serializeInventory, type GameRegion, type ModuleItem, type ModuleType } from "@/lib/module-inventory";
import type { OptimizationResult, StatRule } from "@/lib/module-optimizer";
import type { ModuleWorkerReply, ModuleWorkerRequest } from "./module-worker";
import styles from "./modules.module.css";

type RuleInput = { enabled: boolean; weight: string; min: string };
type Report = OptimizationResult & { elapsedMs: number };
type StatInput = { name: string; value: string };
const defaultRule: RuleInput = { enabled: true, weight: "1", min: "0" };
const blankStats = (): StatInput[] => [{ name: "", value: "1" }, { name: "", value: "1" }, { name: "", value: "1" }];
const number = (value: number) => value.toLocaleString("zh-TW", { maximumFractionDigits: 1 });
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "操作失敗，請再試一次。";

export function ModuleCalculator({ storageKey }: { storageKey: string }) {
  const [personal, setPersonal] = useState<ModuleItem[] | null>(null);
  const [mode, setMode] = useState<"demo" | "personal">("personal");
  const [loaded, setLoaded] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState("");
  const [type, setType] = useState<ModuleType>("輔助");
  const [threshold, setThreshold] = useState(12);
  const [ruleInputs, setRuleInputs] = useState<Record<string, RuleInput>>({});
  const [limit, setLimit] = useState(10);
  const [maxNodes, setMaxNodes] = useState(300_000);
  const [running, setRunning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [manage, setManage] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftType, setDraftType] = useState<ModuleType>("輔助");
  const [draftGameConfigId, setDraftGameConfigId] = useState("");
  const [draftGameInstanceId, setDraftGameInstanceId] = useState("");
  const [draftRegion, setDraftRegion] = useState<GameRegion>("tw-hk-mo");
  const [draftStats, setDraftStats] = useState<StatInput[]>(blankStats);
  const [editId, setEditId] = useState<string | null>(null);
  const [inventoryPage, setInventoryPage] = useState(0);
  const [removed, setRemoved] = useState<ModuleItem | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const draftNameRef = useRef<HTMLInputElement>(null);
  const importSequence = useRef(0);

  const modules = mode === "demo" ? FULL_MODULES : personal ?? [];
  const personalHasSnapshot = useMemo(() => containsPublicSnapshotModules(personal ?? []), [personal]);
  const currentModules = useMemo(() => modules.filter(item => item.type === type), [modules, type]);
  const statNames = useMemo(() => inventoryStats(currentModules), [currentModules]);
  const allStatNames = useMemo(() => [...new Set([...MODULE_STAT_LABELS, ...inventoryStats(modules)])], [modules]);
  const candidates = useMemo(() => currentModules.filter(item => moduleTotal(item) > threshold), [currentModules, threshold]);
  const itemById = useMemo(() => new Map(modules.map(item => [item.id, item])), [modules]);
  const counts = MODULE_TYPES.map(kind => modules.filter(item => item.type === kind).length);
  const selectedCount = statNames.filter(stat => ruleFor(stat).enabled).length;
  const maxTotal = Math.max(30, ...currentModules.map(moduleTotal));
  const visibleInventoryPage = Math.min(inventoryPage, Math.max(0, Math.ceil(currentModules.length / 20) - 1));

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const envelope = JSON.parse(saved);
        if (envelope?.version !== 1) throw new Error("不支援的儲存版本");
        const inventory = parseInventory(JSON.stringify(envelope.inventory));
        setPersonal(inventory.modules);
        setMode("personal");
        if (typeof envelope.updatedAt === "string" && Number.isFinite(Date.parse(envelope.updatedAt))) setUpdatedAt(envelope.updatedAt);
      }
    } catch {
      setStorageWarning("無法讀取此瀏覽器的背包。現有儲存內容未變更，可匯入備份繼續使用。");
    } finally { setLoaded(true); }
    return () => { workerRef.current?.terminate(); importSequence.current += 1; };
  }, [storageKey]);

  function ruleFor(stat: string): RuleInput { return ruleInputs[JSON.stringify([type, stat])] ?? defaultRule; }

  function invalidate(message = "設定已變更，請重新計算。") {
    workerRef.current?.terminate();
    workerRef.current = null;
    setRunning(false);
    setReport(null);
    setError("");
    setNotice(message);
  }

  function changeRule(stat: string, patch: Partial<RuleInput>) {
    const key = JSON.stringify([type, stat]);
    setRuleInputs(previous => ({ ...previous, [key]: { ...(previous[key] ?? defaultRule), ...patch } }));
    invalidate();
  }

  function savePersonal(next: ModuleItem[], message: string) {
    const inventory = parseInventory(serializeInventory(next));
    const now = new Date().toISOString();
    invalidate(message);
    setPersonal(inventory.modules);
    setMode("personal");
    setUpdatedAt(now);
    setRemoved(null);
    setStorageWarning("");
    try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, updatedAt: now, inventory })); }
    catch { setStorageWarning("瀏覽器儲存失敗；本次背包仍可計算，請先匯出備份，避免重新整理後遺失。"); }
  }

  async function importInventory(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const sequence = ++importSequence.current;
    setImporting(true);
    setError("");
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error("資料檔案不可超過 2 MB。");
      const imported = parseInventory(await file.text());
      if (sequence !== importSequence.current) return;
      if (containsPublicSnapshotModules(imported.modules)) throw new Error("這份檔案包含公開示範快照的模組，不能當成你的遊戲背包匯入。請用「查看示範快照」試算，或匯入自己的資料。");
      savePersonal(imported.modules, `已匯入 ${imported.modules.length} 件模組，請開始計算。`);
      setRuleInputs({});
      setInventoryPage(0);
      resetDraft();
    } catch (cause) {
      if (sequence === importSequence.current) setError(`${errorMessage(cause)} 原有背包未變更。`);
    } finally { if (sequence === importSequence.current) setImporting(false); }
  }

  function exportInventory() {
    try {
      const url = URL.createObjectURL(new Blob([serializeInventory(modules)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = mode === "demo" ? "blacklord-public-snapshot-v1.json" : "blacklord-module-inventory-v1.json";
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (cause) { setError(errorMessage(cause)); }
  }

  function startCalculation(event: FormEvent) {
    event.preventDefault();
    invalidate("");
    try {
      const rules: StatRule[] = statNames.filter(stat => ruleFor(stat).enabled).map(stat => {
        const input = ruleFor(stat);
        const weight = Number(input.weight), min = Number(input.min);
        if (!input.weight.trim() || !Number.isFinite(weight) || weight < 0 || weight > 100 || Math.abs(weight * 10 - Math.round(weight * 10)) > 1e-8) throw new Error(`${stat}：權重須為 0 至 100，最多一位小數。`);
        if (!input.min.trim() || !Number.isInteger(min) || min < 0 || min > 5_000) throw new Error(`${stat}：最低合計須為 0 至 5000 的整數。`);
        return { stat, weight, min };
      });
      if (!rules.some(rule => rule.weight > 0)) throw new Error("請至少勾選一個詞條，並設定大於 0 的權重。");
      if (candidates.length < 5) throw new Error("篩選後不足 5 件模組，請降低排除門檻或加入更多同類型模組。");
      const worker = new Worker(new URL("./module-worker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      setRunning(true);
      worker.onmessage = (event: MessageEvent<ModuleWorkerReply>) => {
        if (workerRef.current !== worker) return;
        workerRef.current = null; worker.terminate(); setRunning(false);
        if (event.data.ok) { setReport({ ...event.data.result, elapsedMs: event.data.elapsedMs }); setNotice("計算完成。"); }
        else setError(event.data.error);
      };
      worker.onerror = () => {
        if (workerRef.current !== worker) return;
        worker.terminate(); workerRef.current = null; setRunning(false);
        setError("計算程序無法啟動，請重新整理頁面後再試。");
      };
      worker.postMessage({ modules, options: { type, threshold, rules, limit, maxNodes } } satisfies ModuleWorkerRequest);
    } catch (cause) { workerRef.current?.terminate(); workerRef.current = null; setRunning(false); setError(errorMessage(cause)); }
  }

  function resetDraft() {
    setDraftName(""); setDraftStats(blankStats()); setEditId(null);
    setDraftGameConfigId(""); setDraftGameInstanceId(""); setDraftRegion("tw-hk-mo");
  }

  function submitModule(event: FormEvent) {
    event.preventDefault();
    try {
      const stats: Record<string, number> = Object.create(null);
      for (const row of draftStats) {
        if (!row.name.trim()) continue;
        const name = row.name.trim();
        if (Object.hasOwn(stats, name)) throw new Error(`詞條「${name}」重複，請合併為一列。`);
        stats[name] = row.value.trim() ? Number(row.value) : NaN;
      }
      const item: ModuleItem = {
        id: editId ?? crypto.randomUUID(), name: draftName.trim(), type: draftType, stats,
        ...(draftGameConfigId.trim() ? { gameConfigId: draftGameConfigId.trim() } : {}),
        ...(draftGameInstanceId.trim() ? { gameInstanceId: draftGameInstanceId.trim() } : {}),
        ...(draftRegion !== "unknown" ? { region: draftRegion } : {}),
      };
      // Demo items never enter a real bag; viewing the demo must not erase an existing bag.
      const existing = personal ?? [];
      const next = editId ? existing.map(entry => entry.id === editId ? item : entry) : [...existing, item];
      savePersonal(next, editId ? "已儲存模組修改，請重新計算。" : "已新增模組至你的背包。");
      resetDraft();
    } catch (cause) { setError(errorMessage(cause)); }
  }

  function editModule(item: ModuleItem) {
    setEditId(item.id); setDraftName(item.name); setDraftType(item.type);
    setDraftGameConfigId(item.gameConfigId ?? ""); setDraftGameInstanceId(item.gameInstanceId ?? ""); setDraftRegion(item.region ?? "unknown");
    setDraftStats(Object.entries(item.stats).map(([name, value]) => ({ name, value: String(value) })));
    draftNameRef.current?.focus();
  }

  return <div className={styles.page}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>輔助工具 / 配裝實驗室</p><h1>模組計算</h1><p className={styles.muted}>選出五件模組，讓每一點詞條都用在你需要的地方。</p></div>
      <div className={styles.toolbar}>
        <input ref={importRef} className={styles.fileInput} type="file" accept="application/json,.json" aria-label="匯入背包資料" onChange={importInventory} disabled={!loaded || importing}/>
        <button type="button" disabled={!loaded || importing} onClick={() => importRef.current?.click()}><ArrowUpFromLine size={15}/>{importing ? "匯入中…" : "匯入資料"}</button>
        <button type="button" disabled={!loaded || importing} onClick={exportInventory}><ArrowDownToLine size={15}/>匯出背包</button>
        <button type="button" aria-expanded={manage} aria-controls="inventory-manager" onClick={() => setManage(value => !value)}><Box size={15}/>管理背包</button>
      </div>
    </header>
    <div className={styles.sourceBanner}>
      <span className={styles.sourceTag}>{mode === "demo" ? "示範快照" : personalHasSnapshot ? "含示範資料" : "我的背包"}</span>
      <p>{!loaded ? "正在讀取本機背包…" : mode === "demo" ? `${FULL_MODULES_SOURCE.note} 共 ${FULL_MODULES_SOURCE.snapshotModuleCount.toLocaleString("zh-TW")} 件，僅供試算。` : "台港澳玩家請匯入或填寫自己的模組資料。背包儲存在此裝置，未自動連接遊戲帳號；代碼與區服由你提供，尚未與遊戲驗證。"}</p>
      {loaded && <button type="button" disabled={importing} onClick={() => { invalidate(); resetDraft(); setInventoryPage(0); setMode(mode === "demo" ? "personal" : "demo"); }}>{mode === "demo" ? "返回我的背包" : "查看示範快照"}</button>}
    </div>
    {mode === "personal" && personalHasSnapshot && <p role="status" className={styles.warning}>舊的本機存檔包含公開示範快照。原資料已保留，但不代表你的遊戲背包，也未驗證適用台港澳。請先匯出備份，再匯入你自己的模組資料。</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {storageWarning && <p role="alert" className={styles.warning}>{storageWarning}</p>}

    {manage && <section id="inventory-manager" className={styles.inventory} aria-labelledby="inventory-title">
      <div className={styles.sectionHeading}><div><h2 id="inventory-title">背包管理</h2><p>支援手動輸入與本工具的資料格式，最多 {number(MAX_INVENTORY_SIZE)} 件。</p></div><span className={styles.smallBadge}>本機儲存</span></div>
      <details className={styles.formatHelp}><summary>查看匯入格式與計算規則</summary><p>匯入會取代目前背包，建議先匯出備份。這是 DarkLord Bot 自有 JSON 格式，不直接支援其他工具的 .vdata 二進位檔案。每件模組需要唯一的本機 id、名稱、類型及詞條數值；本機 id 不是遊戲物品代碼。</p><pre>{JSON.stringify({ version: 1, modules: [{ id: "my-001", name: "我的輔助模組", type: "輔助", stats: { "特攻治療加持": 8, "攻速專注": 5 }, region: "tw-hk-mo" }] }, null, 2)}</pre><p>可選欄位：gameConfigId 為遊戲物品種類代碼，gameInstanceId 為該件物品的遊戲實例識別碼，兩者必須用字串；不知道就省略。region 可用 tw-hk-mo（台港澳）、cn、global 或 unknown，省略代表未指定。這些欄位記錄你提供的資料，不代表官方驗證。</p><p>類型為攻擊、守護或輔助；每件 1–12 個詞條，數值為 1–1000 的整數。這些是工具輸入限制，並非遊戲裝備上限。計算僅使用輸入的詞條點數與權重，尚未套用遊戲的詞條等級、收益曲線或其他遊戲評分公式。</p></details>
      <div className={styles.inventoryGrid}>
        <form className={styles.editor} onSubmit={submitModule}>
          <h3>{editId ? "編輯模組" : "新增模組"}</h3>
          {mode === "demo" && <p className={styles.hint}>{personal !== null ? "新增模組會加入已儲存的背包，並切回「我的背包」。" : "新增第一件會建立你的背包，取代畫面中的公開快照。"}</p>}
          <fieldset disabled={!loaded || importing}>
            <div className={styles.editorFields}><label>模組名稱<input ref={draftNameRef} required maxLength={80} value={draftName} placeholder="例如：卓越輔助 01" onChange={event => setDraftName(event.target.value)}/></label><label>模組類型<select aria-label="模組類型" value={draftType} onChange={event => setDraftType(event.target.value as ModuleType)}>{MODULE_TYPES.map(kind => <option key={kind}>{kind}</option>)}</select></label></div>
            <div className={styles.editorFields}><label>遊戲物品代碼（選填）<input maxLength={80} value={draftGameConfigId} placeholder="只填你確認的代碼；未知請留白" onChange={event => setDraftGameConfigId(event.target.value)}/></label><label>資料區服<select value={draftRegion} onChange={event => setDraftRegion(event.target.value as GameRegion)}>{GAME_REGIONS.map(region => <option key={region} value={region}>{GAME_REGION_LABELS[region]}</option>)}</select></label></div>
            <div className={styles.editorFields}><label>遊戲實例識別碼（選填）<input maxLength={80} value={draftGameInstanceId} placeholder="該件模組的識別碼；未知請留白" onChange={event => setDraftGameInstanceId(event.target.value)}/></label></div>
            <p className={styles.hint}>代碼僅供你核對及保存，不影響詞條計算，也不會自動查詢遊戲。{editId ? `本機識別碼：${editId}（不是遊戲代碼）` : "本機識別碼會由工具自動建立，與遊戲代碼分開保存。"}</p>
            <p className={styles.hint}>詞條建議來自公開繁中字典，未完成台港澳實機核對。只整理已確認為同一效果的舊名稱；你也可以輸入遊戲畫面上的其他詞條。</p>
            <datalist id="known-module-stats">{allStatNames.map(stat => <option key={stat} value={stat}/>)}</datalist>
            {draftStats.map((row, index) => <div key={index} className={styles.statEditor}><input aria-label={`詞條 ${index + 1}`} list="known-module-stats" placeholder="輸入或選擇詞條" maxLength={40} value={row.name} onChange={event => setDraftStats(values => values.map((value, i) => i === index ? { ...value, name: event.target.value } : value))}/><input aria-label={`數值 ${index + 1}`} type="number" min="1" max="1000" step="1" value={row.value} onChange={event => setDraftStats(values => values.map((value, i) => i === index ? { ...value, value: event.target.value } : value))}/><button type="button" aria-label={`移除詞條 ${index + 1}`} disabled={draftStats.length === 1} onClick={() => setDraftStats(values => values.filter((_, i) => i !== index))}><Trash2 size={14}/></button></div>)}
            <div className={styles.editorActions}><button type="button" disabled={draftStats.length >= 12} onClick={() => setDraftStats(values => [...values, { name: "", value: "1" }])}><Plus size={14}/>新增詞條</button><button className={styles.primary} type="submit">{editId ? "儲存修改" : "新增模組"}</button>{editId && <button type="button" onClick={resetDraft}>取消編輯</button>}</div>
          </fieldset>
        </form>
        <div className={styles.inventoryList}>
          <h3>{type}模組 <span>{currentModules.length} 件</span></h3><p className={styles.hint}>依下方模組類型切換清單。</p>
          {currentModules.slice(visibleInventoryPage * 20, (visibleInventoryPage + 1) * 20).map(item => <div key={item.id} className={styles.inventoryItem}><div><b>{item.name}</b><small>{Object.entries(item.stats).map(([stat, value]) => `${stat} +${value}`).join(" · ")}</small><small>區服：{GAME_REGION_LABELS[item.region ?? "unknown"]} · 遊戲物品代碼：{item.gameConfigId ?? "未提供"}{item.gameInstanceId ? ` · 遊戲實例：${item.gameInstanceId}` : ""}</small></div>{mode === "personal" && <div className={styles.itemActions}><button type="button" disabled={importing} onClick={() => editModule(item)} aria-label={`編輯 ${item.name}`}>編輯</button><button type="button" disabled={importing} aria-label={`移除 ${item.name}`} onClick={() => { savePersonal(modules.filter(entry => entry.id !== item.id), "已移除模組。"); setRemoved(item); if (editId === item.id) resetDraft(); }}><Trash2 size={14}/></button></div>}</div>)}
          {!currentModules.length && <p className={styles.hint}>還沒有此類型模組。</p>}
          {currentModules.length > 20 && <div className={styles.pagination}><button type="button" disabled={visibleInventoryPage === 0} onClick={() => setInventoryPage(visibleInventoryPage - 1)}>上一頁</button><span>{visibleInventoryPage + 1} / {Math.ceil(currentModules.length / 20)}</span><button type="button" disabled={(visibleInventoryPage + 1) * 20 >= currentModules.length} onClick={() => setInventoryPage(visibleInventoryPage + 1)}>下一頁</button></div>}
          {removed && mode === "personal" && <button className={styles.undo} type="button" disabled={importing} onClick={() => savePersonal([...modules, removed], "已復原刪除的模組。")}><RotateCcw size={14}/>復原刪除</button>}
        </div>
      </div>
    </section>}

    <div className={styles.layout}>
      <aside className={styles.panel} aria-label="計算條件">
        <div className={styles.summary}><div><strong data-testid="module-inventory-count">{number(modules.length)}</strong><span> 個模組</span><Layers3 size={23}/></div><dl>{MODULE_TYPES.map((kind, i) => <div key={kind}><dt>{kind}模組</dt><dd>{number(counts[i])}</dd></div>)}</dl><small>{mode === "demo" ? `公開資料快照 · ${FULL_MODULES_SOURCE.repository}` : updatedAt ? `更新於 ${new Date(updatedAt).toLocaleString("zh-TW", { hour12: false })}` : "尚未儲存"}</small></div>
        <form onSubmit={startCalculation}>
          <fieldset disabled={!loaded || importing}>
            <h2>模組類型</h2><div className={styles.tabs} role="group" aria-label="計算模組類型">{MODULE_TYPES.map(kind => <button key={kind} type="button" aria-pressed={type === kind} className={type === kind ? styles.active : ""} onClick={() => { setType(kind); if (!editId) setDraftType(kind); setInventoryPage(0); invalidate(); }}>{kind}</button>)}</div>
            <div className={styles.threshold}><label htmlFor="exclude-threshold">排除總屬性不超過</label><input id="exclude-threshold" type="number" min="0" max="12000" step="1" required value={threshold} onChange={event => { setThreshold(event.target.value === "" ? 0 : Number(event.target.value)); invalidate(); }}/></div>
            <input className={styles.range} aria-label="總屬性排除門檻滑桿" type="range" min="0" max={Math.max(maxTotal, threshold)} step="1" value={threshold} onChange={event => { setThreshold(Number(event.target.value)); invalidate(); }}/>
            <p className={styles.hint}>單件詞條合計需大於 {number(threshold)}。符合：<b>{candidates.length}</b> / {currentModules.length} 件。</p>
            <div className={styles.rulesHeading}><h2>期望詞條 <small>({selectedCount})</small></h2><button type="button" onClick={() => { setRuleInputs(previous => { const next = { ...previous }; statNames.forEach(stat => { next[JSON.stringify([type, stat])] = { ...defaultRule }; }); return next; }); invalidate(); }}>全屬性等權</button></div>
            <p className={styles.hint}>勾選詞條才計分與檢查最低合計；最低值以五件相加計算。</p>
            <div className={styles.ruleLabels}><span>計入的詞條</span><span>權重</span><span>最低合計</span></div>
            <div className={styles.rules}>{statNames.map(stat => { const rule = ruleFor(stat); return <div className={styles.rule} key={stat}><label><input type="checkbox" checked={rule.enabled} onChange={event => changeRule(stat, { enabled: event.target.checked })}/><span>{stat}</span></label><input type="number" aria-label={`${stat} 權重`} disabled={!rule.enabled} min="0" max="100" step="0.1" required value={rule.weight} onChange={event => changeRule(stat, { weight: event.target.value })}/><input type="number" aria-label={`${stat} 最低合計`} disabled={!rule.enabled} min="0" max="5000" step="1" required value={rule.min} onChange={event => changeRule(stat, { min: event.target.value })}/></div>; })}{!statNames.length && <p className={styles.hint}>加入此類型模組後即可選擇詞條。</p>}</div>
            <details className={styles.searchOptions}><summary><SlidersHorizontal size={13}/>搜尋設定</summary><label>保留組合數<select value={limit} onChange={event => { setLimit(Number(event.target.value)); invalidate(); }}><option value="10">前 10 組</option><option value="20">前 20 組</option><option value="50">前 50 組</option></select></label><label>搜尋上限<select value={maxNodes} onChange={event => { setMaxNodes(Number(event.target.value)); invalidate(); }}><option value="300000">一般 · 30 萬個節點</option><option value="2000000">深入 · 200 萬個節點</option></select></label><p className={styles.hint}>到達上限會保留已找到的組合，並標記為暫定結果。</p></details>
            {running ? <button key="cancel" className={styles.run} type="button" onClick={event => { event.preventDefault(); invalidate("已取消計算。可調整條件後重新開始。"); }}><Square size={15}/>取消計算</button> : <button key="start" className={styles.run} type="submit" disabled={candidates.length < 5 || !selectedCount}><Play size={15}/>開始計算</button>}
            {candidates.length < 5 && <p className={styles.hint}>需至少 5 件符合條件的同類型模組。</p>}
          </fieldset>
        </form>
      </aside>
      <section className={styles.results} aria-labelledby="results-title" aria-busy={running}>
        <div className={styles.resultHead}><div><h2 id="results-title">計算結果</h2><p>篩選後 {number(candidates.length)} 個模組 <span>·</span> 槽位 5 個</p></div><div className={styles.resultMeta}><span className={styles.cpu}><Cpu size={13}/>本機處理器</span>{report && <span>耗時 {(report.elapsedMs / 1_000).toFixed(3)} 秒</span>}</div></div>
        <div className={styles.formula}>加權分數 = Σ（勾選詞條的五件合計 × 權重）<span>依加權分數排序</span></div>
        <p className={styles.status} role="status">{running ? "正在搜尋五件組合… 可隨時取消或修改條件。" : notice}</p>
        {report && <div className={report.complete ? styles.searchSummary : styles.partial}><b>{report.complete ? "搜尋完成" : "暫定結果 · 已達搜尋上限"}</b><span>搜尋 {number(report.visitedNodes)} 個節點 · 評估 {number(report.evaluatedCount)} 組</span>{!report.complete && <p>尚未保證為最佳組合。可提高搜尋上限、增加單件排除門檻，或縮小背包後再試。</p>}</div>}
        {report?.combinations.map((combination, index) => <details className={styles.result} key={JSON.stringify(combination.ids)} data-testid="module-result">
          <summary><span className={styles.rank}>{String(index + 1).padStart(2, "0")}</span><div className={styles.resultBody}><div className={styles.score}><strong data-testid="module-score">{number(combination.score)}</strong><span>加權分數</span><small>總屬性值 <b>{number(combination.total)}</b></small></div><div className={styles.chips}>{Object.entries(combination.stats).sort(([a, av], [b, bv]) => Number(ruleFor(b).enabled) - Number(ruleFor(a).enabled) || bv - av || a.localeCompare(b)).map(([stat, value]) => <span className={ruleFor(stat).enabled ? styles.desiredChip : ""} key={stat}>{stat} <b>{number(value)}</b></span>)}</div></div><ChevronDown className={styles.chevron} size={17}/></summary>
          <div className={styles.members}><p>組合內的五件模組 · 本機識別碼不是遊戲代碼</p>{combination.ids.map((id, slot) => { const item = itemById.get(id)!; return <div key={id} className={styles.member} data-testid="module-member"><span className={styles.slot}>{slot + 1}</span><div><b>{item.name}</b><small title={`本機識別碼（不是遊戲代碼）：${id}`}>本機識別碼：{id}</small><small title={`遊戲物品代碼：${item.gameConfigId ?? "未提供"}`}>遊戲代碼：{item.gameConfigId ?? "未提供"}</small>{item.gameInstanceId && <small title={`遊戲實例識別碼：${item.gameInstanceId}`}>遊戲實例：{item.gameInstanceId}</small>}<small>區服：{GAME_REGION_LABELS[item.region ?? "unknown"]}</small></div><div className={styles.memberStats}>{Object.entries(item.stats).map(([stat, value]) => <span key={stat}>{stat} <b>+{value}</b></span>)}</div></div>; })}</div>
        </details>)}
        {!report && <div className={styles.empty}><div className={styles.emptyIcon}><Calculator size={28}/></div><h3>{running ? "正在尋找適合你的組合" : "準備好你的下一套配裝"}</h3><p>{running ? "計算在獨立程序執行，操作頁面仍然流暢。" : "選擇模組類型、調整詞條權重，按下「開始計算」。"}</p><div className={styles.slots}>{[1, 2, 3, 4, 5].map(slot => <span key={slot}><Layers3 size={18}/><small>槽位 {slot}</small></span>)}</div></div>}
        {report && !report.combinations.length && <div className={styles.empty}><Box size={32}/><h3>{report.complete ? "沒有符合條件的組合" : "搜尋範圍內尚未找到組合"}</h3><p>{report.complete ? "試著降低詞條最低合計，或加入更多同類型模組。" : "可提高搜尋上限或放寬詞條最低合計後重試。"}</p></div>}
        <p className={styles.resultFoot}>每組使用五件不同 ID 的同類型模組。分數為自訂權重試算，未套用遊戲收益公式。</p>
      </section>
    </div>
  </div>;
}
