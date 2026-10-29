"use client";

import { useState } from "react";
import { Bot, Calculator, Camera, CircleCheck, Cpu, Radio, ShieldCheck, Terminal, Zap } from "lucide-react";
import { AutomationConsole } from "./automation-console";
import { ModuleCalculator } from "./modules/module-calculator";
import { ScreenshotBridge } from "./screenshot-bridge";
import styles from "./workspace-shell.module.css";

type Workspace = "automation" | "modules" | "screenshots";

const workspaces: Array<{ id: Workspace; label: string; description: string; icon: typeof Bot }> = [
  { id: "automation", label: "自動化控制台", description: "任務與 Windows 執行狀態", icon: Bot },
  { id: "modules", label: "模組分析室", description: "五件模組組合與背包管理", icon: Calculator },
  { id: "screenshots", label: "截圖機器人", description: "擷取遊戲畫面並傳送資料", icon: Camera },
];

const telemetry = [
  { label: "畫面擷取", value: "就緒", tone: "good" },
  { label: "文字辨識", value: "待命", tone: "muted" },
  { label: "執行器連線", value: "本機", tone: "accent" },
];

export function WorkspaceShell() {
  const [workspace, setWorkspace] = useState<Workspace>("automation");
  const current = workspaces.find(item => item.id === workspace)!;

  return <div className={styles.shell}>
    <aside className={styles.rail} aria-label="DarkLord Bot 工作區導覽">
      <div className={styles.brandBlock}><strong>DarkLord Bot</strong><small>黑帝遊戲機器人</small></div>
      <div className={styles.railRule}/>
      <nav className={styles.railNav} aria-label="工具工作區">
        {workspaces.map(item => { const Icon = item.icon; return <button key={item.id} title={item.label} type="button" className={`${styles.railButton} ${workspace === item.id ? styles.active : ""}`} aria-label={item.label} aria-current={workspace === item.id ? "page" : undefined} onClick={() => setWorkspace(item.id)}><span className={styles.railIcon}><Icon size={17}/></span>{workspace === item.id && <span className={styles.railDot}/>}</button>; })}
      </nav>
      <div className={styles.railFooter}><span className={styles.footerIcon}><ShieldCheck size={15}/></span></div>
    </aside>

    <section className={styles.surface}>
      <header className={styles.topbar}>
        <div className={styles.breadcrumb}><span>黑帝 ／ 控制中心</span><i>·</i><strong>{current.label}</strong></div>
        <div className={styles.topbarActions}><span className={styles.runtime}><CircleCheck size={13}/>本機已連線</span><button className={styles.iconButton} type="button" aria-label="開啟本機執行器資訊"><Terminal size={15}/></button></div>
      </header>
      <div className={styles.commandStrip}>
        <div className={styles.commandTitle}><span className={styles.signal}><Radio size={14}/></span><div><span className={styles.kicker}>目前工作區 ／ 0{workspace === "automation" ? 1 : workspace === "modules" ? 2 : 3}</span><h1>{current.label}</h1></div></div>
        <div className={styles.commandStats}><span><Cpu size={13}/>處理器 <b>本機</b></span><span><Camera size={13}/>畫面 <b>事件觸發</b></span><span><Zap size={13}/>模式 <b>預覽</b></span></div>
      </div>
      <StatusDock />
      <main className={styles.workspace}>
        {workspace === "automation" && <AutomationConsole/>}
        {workspace === "modules" && <ModuleCalculator storageKey="blacklord-standalone-module-inventory-v1"/>}
        {workspace === "screenshots" && <ScreenshotBridge/>}
      </main>
    </section>

  </div>;
}

function StatusDock() {
  return <section className={styles.statusDock} aria-label="黑帝系統狀態">
    <div className={styles.statusIntro}><span className={styles.statusIcon}><CircleCheck size={15}/></span><div><strong>系統已就緒</strong><small>本機服務正常運作</small></div></div>
    <div className={styles.statusItems}>{telemetry.map(item => <div className={styles.statusItem} key={item.label}><span><i className={`${styles.tone} ${styles[item.tone]}`}/>{item.label}</span><b>{item.value}</b></div>)}</div>
    <div className={styles.statusEvents}><span>最近事件</span><b>工作區已準備完成</b><small>剛剛</small></div>
  </section>;
}
