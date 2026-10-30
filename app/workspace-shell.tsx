"use client";

import { useEffect, useState } from "react";
import { Bot, Calculator, Camera, CircleCheck, Cpu, Radio, ShieldCheck, Terminal, Zap } from "lucide-react";
import { AutomationConsole } from "./automation-console";
import { ModuleCalculator } from "./modules/module-calculator";
import { ScreenshotBridge } from "./screenshot-bridge";
import styles from "./workspace-shell.module.css";

type Workspace = "automation" | "modules" | "screenshots";

const workspaces: Array<{ id: Workspace; label: string; description: string; icon: typeof Bot }> = [
  { id: "screenshots", label: "擷取角色資訊", description: "第一步：先截取角色畫面", icon: Camera },
  { id: "modules", label: "模組分析室", description: "五件模組組合與背包管理", icon: Calculator },
  { id: "automation", label: "自動化控制台", description: "任務與 Windows 執行狀態", icon: Bot },
];

const telemetry = [
  { label: "遊戲區服", value: "台港澳", tone: "accent" },
  { label: "角色資料", value: "從截圖確認", tone: "muted" },
  { label: "物品代碼", value: "依實際資料", tone: "muted" },
];

export function WorkspaceShell() {
  const [workspace, setWorkspace] = useState<Workspace>("screenshots");
  const [captureRequest, setCaptureRequest] = useState(0);
  useEffect(() => {
    const capture = () => { setWorkspace("screenshots"); setCaptureRequest(value => value + 1); };
    window.addEventListener("blacklord:request-capture", capture);
    return () => window.removeEventListener("blacklord:request-capture", capture);
  }, []);
  const current = workspaces.find(item => item.id === workspace)!;

  return <div className={styles.shell}>
    <aside className={styles.rail} aria-label="DarkLord Bot 工作區導覽">
      <div className={styles.brandBlock}><strong>DarkLord Bot</strong><small>黑帝遊戲機器人</small></div>
      <div className={styles.railRule}/>
      <nav className={styles.railNav} aria-label="工具工作區">
        {workspaces.map(item => { const Icon = item.icon; return <button key={item.id} title={item.description} type="button" className={`${styles.railButton} ${workspace === item.id ? styles.active : ""}`} aria-label={item.label} aria-current={workspace === item.id ? "page" : undefined} onClick={() => { if (item.id !== "screenshots") setCaptureRequest(0); setWorkspace(item.id); }}><span className={styles.railIcon}><Icon size={17}/></span><span className={styles.railLabel}>{item.label}{item.id === "screenshots" && <small>第一步・從這裡開始</small>}</span>{workspace === item.id && <span className={styles.railDot}/>}</button>; })}
      </nav>
      <div className={styles.railFooter}><span className={styles.footerIcon}><ShieldCheck size={15}/></span></div>
    </aside>

    <section className={styles.surface}>
      <header className={styles.topbar}>
        <div className={styles.breadcrumb}><span>黑帝 ／ 控制中心</span><i>·</i><strong>{current.label}</strong></div>
        <div className={styles.topbarActions}><span className={styles.runtime}><CircleCheck size={13}/>本機頁面已載入</span><button className={styles.iconButton} type="button" aria-label="開啟本機執行器資訊"><Terminal size={15}/></button></div>
      </header>
      <div className={styles.commandStrip}>
        <div className={styles.commandTitle}><span className={styles.signal}><Radio size={14}/></span><div><span className={styles.kicker}>{workspace === "screenshots" ? "開始使用 ／ 先準備角色截圖" : `目前工作區 ／ 0${workspace === "modules" ? 2 : 3}`}</span><h1>{current.label}</h1></div></div>
        {workspace !== "screenshots" && <div className={styles.commandStats}><span><Cpu size={13}/>處理器 <b>本機</b></span><span><Camera size={13}/>畫面 <b>事件觸發</b></span><span><Zap size={13}/>模式 <b>預覽</b></span></div>}
      </div>
      {workspace !== "screenshots" && <StatusDock />}
      <main className={styles.workspace}>
        {workspace === "automation" && <AutomationConsole/>}
        {workspace === "modules" && <ModuleCalculator storageKey="blacklord-standalone-module-inventory-v1"/>}
        {workspace === "screenshots" && <ScreenshotBridge captureRequest={captureRequest}/>}
      </main>
    </section>

  </div>;
}

function StatusDock() {
  return <section className={styles.statusDock} aria-label="黑帝系統狀態">
    <div className={styles.statusIntro}><span className={styles.statusIcon}><CircleCheck size={15}/></span><div><strong>台港澳資料工作區</strong><small>角色與背包以你確認的資料為準</small></div></div>
    <div className={styles.statusItems}>{telemetry.map(item => <div className={styles.statusItem} key={item.label}><span><i className={`${styles.tone} ${styles[item.tone]}`}/>{item.label}</span><b>{item.value}</b></div>)}</div>
    <div className={styles.statusEvents}><span>最近事件</span><b>工作區已準備完成</b><small>剛剛</small></div>
  </section>;
}
