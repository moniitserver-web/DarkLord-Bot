"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, Check, Clipboard, MonitorUp, Send, Upload, X } from "lucide-react";
import { SCREENSHOT_MAX_BYTES, createScreenshotPayload, type ScreenshotSource } from "@/lib/screenshot-bridge";
import styles from "./screenshot-bridge.module.css";

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "操作失敗，請再試一次。";

export function ScreenshotBridge() {
  const [source, setSource] = useState<ScreenshotSource>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [page, setPage] = useState("模組背包");
  const [ocrText, setOcrText] = useState("");
  const [capturedAt, setCapturedAt] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [response, setResponse] = useState<Record<string, unknown> | null>(null);
  const [copied, setCopied] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    streamRef.current?.getTracks().forEach(track => track.stop());
  }, [previewUrl]);

  useEffect(() => {
    const handleCaptureRequest = () => { void captureScreen(); };
    window.addEventListener("blacklord:request-capture", handleCaptureRequest);
    return () => window.removeEventListener("blacklord:request-capture", handleCaptureRequest);
  }, []);

  function clearFrame() {
    setFile(null);
    setPreviewUrl(current => { if (current) URL.revokeObjectURL(current); return ""; });
    setCapturedAt("");
    setResponse(null);
    setNotice("");
    setError("");
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0];
    event.target.value = "";
    if (!next) return;
    setError(""); setNotice(""); setResponse(null);
    if (!next.type.startsWith("image/")) { setError("請選擇圖片格式的遊戲截圖。"); return; }
    if (next.size > SCREENSHOT_MAX_BYTES) { setError("截圖不可超過 8 MB。"); return; }
    setFile(next);
    setSource("upload");
    setPreviewUrl(current => { if (current) URL.revokeObjectURL(current); return URL.createObjectURL(next); });
    setCapturedAt(new Date().toISOString());
  }

  async function captureScreen() {
    setError(""); setNotice(""); setResponse(null); setCapturing(true);
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("此瀏覽器不支援畫面擷取，請改用上傳截圖。");
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      streamRef.current = stream;
      const video = document.createElement("video");
      video.srcObject = stream; video.muted = true;
      await video.play();
      await new Promise<void>(resolve => { if (video.readyState >= 2) resolve(); else video.onloadeddata = () => resolve(); });
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
      stream.getTracks().forEach(track => track.stop()); streamRef.current = null;
      if (!blob) throw new Error("無法建立畫面截圖。");
      const next = new File([blob], `game-screen-${Date.now()}.png`, { type: "image/png" });
      if (next.size > SCREENSHOT_MAX_BYTES) throw new Error("截圖不可超過 8 MB。");
      setFile(next); setSource("screen");
      setPreviewUrl(current => { if (current) URL.revokeObjectURL(current); return URL.createObjectURL(next); });
      setCapturedAt(new Date().toISOString());
      setNotice("已擷取一張遊戲畫面；補充辨識文字後即可傳給遊戲機器人。");
    } catch (cause) {
      streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null;
      if ((cause as DOMException)?.name !== "AbortError") setError(errorMessage(cause));
    } finally { setCapturing(false); }
  }

  async function sendToBot() {
    if (!file) { setError("請先上傳或擷取一張遊戲畫面。"); return; }
    setError(""); setNotice(""); setResponse(null); setSending(true);
    const payload = createScreenshotPayload({ source, page, ocrText, capturedAt });
    try {
      const form = new FormData();
      form.append("image", file, file.name);
      form.append("source", payload.source); form.append("page", payload.page);
      form.append("capturedAt", payload.capturedAt); form.append("ocrText", payload.ocrText);
      const result = await fetch("/api/bot/screenshot", { method: "POST", body: form });
      const body = await result.json() as Record<string, unknown>;
      if (!result.ok || body.ok !== true) throw new Error(typeof body.error === "string" ? body.error : "截圖送出失敗。");
      setResponse(body); setNotice(typeof body.message === "string" ? body.message : "截圖已接收。");
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setSending(false); }
  }

  async function copyPayload() {
    const payload = createScreenshotPayload({ source, page, ocrText, capturedAt });
    await navigator.clipboard?.writeText(JSON.stringify(payload, null, 2));
    setCopied(true); window.setTimeout(() => setCopied(false), 1_500);
  }

  const parsed = createScreenshotPayload({ source, page, ocrText, capturedAt }).parsed;

  return <section className={styles.bridge} aria-labelledby="screenshot-bridge-title">
    <div className={styles.heading}><div><p className={styles.eyebrow}>遊戲畫面串接 · 每次過圖傳送一次</p><h2 id="screenshot-bridge-title">把遊戲畫面交給機器人</h2><p>你可以手動上傳圖片，或直接擷取目前螢幕。黑帝會把畫面、遊戲頁面與補充文字整理好，再送給機器人判斷目前狀態。</p></div><Camera size={25}/></div>
    <ol className={styles.steps} aria-label="截圖傳送流程"><li><b>一</b><span>選擇或擷取遊戲畫面</span></li><li><b>二</b><span>補充頁面與辨識文字</span></li><li><b>三</b><span>送給機器人分析</span></li></ol>
    <div className={styles.grid}>
      <div className={styles.sourcePanel}>
        <p className={styles.helper}>這裡的上傳不是一般檔案寄送，而是把遊戲當下畫面交給機器人讀取。Windows 執行器在每次過圖時也會走同一條流程。</p>
        <div className={styles.sourceButtons} role="group" aria-label="截圖來源">
          <button type="button" className={source === "upload" ? styles.active : ""} onClick={() => setSource("upload")}><Upload size={15}/>上傳截圖</button>
          <button type="button" className={source === "screen" ? styles.active : ""} onClick={captureScreen} disabled={capturing}><MonitorUp size={15}/>{capturing ? "擷取中…" : "擷取畫面"}</button>
        </div>
        <input ref={uploadRef} className={styles.hiddenInput} type="file" accept="image/*" onChange={selectFile}/>
        {!file ? <button type="button" className={styles.dropzone} onClick={() => uploadRef.current?.click()}><Upload size={22}/><span>選擇遊戲截圖</span><small>常見圖片格式，最大 8 MB</small></button> : <div className={styles.previewWrap}><img src={previewUrl} alt="已選取的遊戲截圖"/><button type="button" className={styles.clear} onClick={clearFrame} aria-label="清除截圖"><X size={15}/></button><span>{file.name} · {(file.size / 1024).toFixed(0)} KB</span></div>}
      </div>
      <div className={styles.fields}>
        <label>遊戲頁面<input value={page} maxLength={120} onChange={event => setPage(event.target.value)} placeholder="例如：模組背包"/></label>
        <label>畫面辨識文字（可貼上機器人要讀的內容）<textarea value={ocrText} onChange={event => setOcrText(event.target.value)} placeholder={"例如：\n模組數量：929\n特攻傷害 +12\n攻速專注 +8"}/></label>
        <div className={styles.parsed}><span>即時解析</span>{parsed.moduleCount !== undefined && <b>{parsed.moduleCount} 件模組</b>}{parsed.attributes.length ? parsed.attributes.slice(0, 4).map(item => <i key={`${item.name}-${item.value}`}>{item.name} +{item.value}</i>) : <small>填入「詞條 +數值」後顯示</small>}</div>
        <div className={styles.actions}><button type="button" onClick={copyPayload}><Clipboard size={14}/>{copied ? "已複製" : "複製事件資料"}</button><button type="button" className={styles.send} onClick={sendToBot} disabled={!file || sending}><Send size={14}/>{sending ? "傳送中…" : "傳給機器人"}</button></div>
      </div>
    </div>
    {notice && <p className={styles.notice} role="status"><Check size={15}/>{notice}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {response && <details className={styles.response} open><summary>機器人回覆</summary><pre>{JSON.stringify(response, null, 2)}</pre></details>}
  </section>;
}
