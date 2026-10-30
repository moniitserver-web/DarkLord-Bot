"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, Check, Clipboard, MonitorUp, ScanText, Send, Upload, X } from "lucide-react";
import { SCREENSHOT_MAX_BYTES, createScreenshotPayload, parseScreenshotText, validateConfirmedCharacter, type CharacterDraft, type ScreenshotSource, type ScreenshotTextSource } from "@/lib/screenshot-bridge";
import styles from "./screenshot-bridge.module.css";

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "操作失敗，請再試一次。";
const PROFILE_KEY = "darklord-tw-character-v1";
type CaptureSource = { id: string; name: string; thumbnail: string };

export function ScreenshotBridge({ captureRequest = 0 }: { captureRequest?: number }) {
  const [source, setSource] = useState<ScreenshotSource>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [page, setPage] = useState("角色資訊");
  const [ocrText, setOcrText] = useState("");
  const [textSource, setTextSource] = useState<ScreenshotTextSource>("manual");
  const [capturedAt, setCapturedAt] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [response, setResponse] = useState<Record<string, unknown> | null>(null);
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [desktop, setDesktop] = useState(false);
  const [windowsOcr, setWindowsOcr] = useState(false);
  const [character, setCharacter] = useState<CharacterDraft>({});
  const [confirmedCharacter, setConfirmedCharacter] = useState<CharacterDraft | undefined>();
  const [savedCharacter, setSavedCharacter] = useState<CharacterDraft | null>(null);
  const [copied, setCopied] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameVersion = useRef(0);
  const lastCaptureRequest = useRef(0);
  const mounted = useRef(true);
  const parsed = parseScreenshotText(ocrText);

  useEffect(() => {
    mounted.current = true;
    setDesktop(Boolean(window.darklordDesktop?.listCaptureSources));
    setWindowsOcr(window.darklordDesktop?.platform === "win32");
    try {
      const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "null");
      if (saved?.region === "tw-hk-mo" && saved?.character && typeof saved.character.uid === "string" && typeof saved.character.name === "string") setSavedCharacter(saved.character);
    } catch { setError("上次確認的角色記錄無法讀取；可以重新擷取，不會覆寫原資料。"); }
    return () => { mounted.current = false; frameVersion.current += 1; streamRef.current?.getTracks().forEach(track => track.stop()); };
  }, []);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => {
    if (captureRequest > lastCaptureRequest.current) {
      lastCaptureRequest.current = captureRequest;
      if (window.darklordDesktop?.listCaptureSources) void captureScreen();
      else setNotice("請按「擷取遊戲視窗」選擇遊戲畫面。");
    }
  }, [captureRequest]);

  function acceptFrame(next: File, nextSource: ScreenshotSource, time = new Date().toISOString()) {
    if (next.size <= 0 || next.size > SCREENSHOT_MAX_BYTES) throw new Error("截圖大小必須介於 1 byte 與 8 MB。");
    frameVersion.current += 1;
    setFile(next); setSource(nextSource); setPreviewUrl(URL.createObjectURL(next)); setCapturedAt(time);
    setOcrText(""); setTextSource("manual"); setCharacter({}); setConfirmedCharacter(undefined); setResponse(null); setError(""); setNotice("");
  }
  function clearFrame() {
    frameVersion.current += 1;
    setFile(null); setPreviewUrl(""); setCapturedAt(""); setOcrText(""); setCharacter({}); setConfirmedCharacter(undefined); setResponse(null); setNotice(""); setError("");
  }
  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0]; event.target.value = "";
    if (!next) return;
    try {
      if (!["image/png", "image/jpeg"].includes(next.type)) throw new Error("請選擇 PNG 或 JPEG 遊戲截圖。");
      acceptFrame(next, "upload");
    } catch (cause) { setError(errorMessage(cause)); }
  }
  async function chooseSource(id: string) {
    setCapturing(true); setError("");
    try {
      const frame = await window.darklordDesktop!.captureSource(id);
      const blob = await (await fetch(frame.dataUrl)).blob();
      if (!mounted.current) return;
      acceptFrame(new File([blob], `game-screen-${Date.now()}.png`, { type: "image/png" }), "screen", frame.capturedAt);
      setSources([]); setNotice("已擷取遊戲畫面，請按「辨識圖片文字」。");
    } catch (cause) { if (mounted.current) setError(errorMessage(cause)); }
    finally { if (mounted.current) setCapturing(false); }
  }
  async function captureScreen() {
    setError(""); setNotice(""); setCapturing(true);
    try {
      if (window.darklordDesktop?.listCaptureSources) {
        const available = await window.darklordDesktop.listCaptureSources();
        if (!mounted.current) return;
        if (!available.length) throw new Error("找不到可擷取的視窗。請先開啟遊戲並保持視窗可見。");
        setSources(available); return;
      }
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("此瀏覽器不支援畫面擷取，請改用上傳截圖。");
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      streamRef.current = stream;
      const video = document.createElement("video"); video.srcObject = stream; video.muted = true;
      await video.play();
      const canvas = document.createElement("canvas"); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      if (!canvas.width || !canvas.height) throw new Error("沒有取得遊戲畫面，請保持遊戲視窗可見。");
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("無法建立畫面截圖。");
      if (mounted.current) acceptFrame(new File([blob], `game-screen-${Date.now()}.png`, { type: "image/png" }), "screen");
    } catch (cause) {
      if (mounted.current && (cause as DOMException)?.name !== "AbortError") setError(errorMessage(cause));
    } finally {
      streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null;
      if (mounted.current) setCapturing(false);
    }
  }
  async function recognize() {
    if (!file || !window.darklordDesktop?.recognizeImage) return;
    const version = frameVersion.current;
    setRecognizing(true); setError(""); setNotice(""); setResponse(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("圖片無法讀取。")); reader.readAsDataURL(file);
      });
      const result = await window.darklordDesktop.recognizeImage(dataUrl);
      if (!mounted.current || version !== frameVersion.current) return;
      setOcrText(result.text); setTextSource("windows-ocr"); setCharacter(parseScreenshotText(result.text).character); setConfirmedCharacter(undefined);
      setNotice(result.text.trim() ? `已使用 Windows ${result.language} 辨識。請核對原圖與下方角色資料後再儲存。` : "沒有辨識到文字。請改用清晰的角色資訊截圖，或手動貼入文字。");
    } catch (cause) { if (mounted.current && version === frameVersion.current) setError(errorMessage(cause)); }
    finally { if (mounted.current) setRecognizing(false); }
  }
  function updateText(value: string) {
    frameVersion.current += 1; setOcrText(value); setTextSource("manual"); setCharacter(parseScreenshotText(value).character); setConfirmedCharacter(undefined); setResponse(null);
  }
  function saveCharacter() {
    setError("");
    if (!character.name?.trim() || !character.uid || !/^\d{1,80}$/.test(character.uid)) { setError("請核對並填寫角色名稱與純數字 UID；沒有讀到的資料不會自動補猜。"); return; }
    try {
      const confirmed = validateConfirmedCharacter(character);
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ region: "tw-hk-mo", character: confirmed, confirmedAt: new Date().toISOString() }));
      setConfirmedCharacter(confirmed); setSavedCharacter(confirmed); setNotice("已儲存你確認的角色資訊到本機。這不代表已登入或同步遊戲背包。");
    } catch { setError("角色資訊無法儲存到本機，請檢查儲存空間。"); }
  }
  async function sendToBot() {
    if (!file) return;
    const version = frameVersion.current;
    setError(""); setNotice(""); setResponse(null); setSending(true);
    const payload = createScreenshotPayload({ source, page, ocrText, textSource, capturedAt, confirmedCharacter });
    try {
      const form = new FormData(); form.append("image", file, file.name);
      form.append("source", payload.source); form.append("page", payload.page); form.append("textSource", payload.textSource);
      if (payload.confirmedCharacter) form.append("confirmedCharacter", JSON.stringify(payload.confirmedCharacter));
      form.append("capturedAt", payload.capturedAt); form.append("ocrText", payload.ocrText);
      const result = await fetch("/api/bot/screenshot", { method: "POST", body: form, signal: AbortSignal.timeout(15_000) });
      const body = await result.json() as Record<string, unknown>;
      if (!result.ok || body.ok !== true) throw new Error(typeof body.error === "string" ? body.error : "截圖送出失敗。");
      if (mounted.current && version === frameVersion.current) { setResponse(body); setNotice(String(body.message)); }
    } catch (cause) { if (mounted.current && version === frameVersion.current) setError(errorMessage(cause)); }
    finally { if (mounted.current) setSending(false); }
  }
  async function copyPayload() {
    try {
      if (!navigator.clipboard) throw new Error("無法使用剪貼簿。");
      await navigator.clipboard.writeText(JSON.stringify(createScreenshotPayload({ source, page, ocrText, textSource, capturedAt, confirmedCharacter }), null, 2));
      setCopied(true); window.setTimeout(() => setCopied(false), 1_500);
    } catch (cause) { setError(errorMessage(cause)); }
  }

  return <section className={styles.bridge} aria-labelledby="screenshot-bridge-title">
    <div className={styles.heading}><div><p className={styles.eyebrow}>台港澳服 · 截圖辨識</p><h2 id="screenshot-bridge-title">讀取遊戲畫面</h2><p>開啟角色資訊或物品詳情，擷取可見文字，再核對辨識結果。截圖只能讀到畫面上的內容，無法登入帳號或取得未顯示的完整背包。</p></div><Camera size={25}/></div>
    <ol className={styles.steps}><li><b>一</b><span>選擇遊戲畫面</span></li><li><b>二</b><span>辨識繁中文字</span></li><li><b>三</b><span>核對並確認資料</span></li></ol>
    <div className={styles.grid}>
      <div className={styles.sourcePanel}>
        <p className={styles.helper}>請讓遊戲視窗保持可見。建議先截取角色資訊頁；模組代碼只有在畫面明確顯示時才會讀取。</p>
        <div className={styles.sourceButtons}>
          <button type="button" onClick={() => uploadRef.current?.click()} disabled={capturing || recognizing}><Upload size={15}/>選擇截圖</button>
          <button type="button" onClick={captureScreen} disabled={capturing || recognizing}><MonitorUp size={15}/>{capturing ? "擷取中…" : "擷取遊戲視窗"}</button>
          <button type="button" onClick={recognize} disabled={!file || !windowsOcr || recognizing || capturing}><ScanText size={15}/>{recognizing ? "辨識中…" : "辨識圖片文字"}</button>
        </div>
        {!windowsOcr && <p className={styles.helper}>{desktop ? "圖片文字辨識目前支援 Windows 版。" : "請在 Windows EXE 使用本機文字辨識；瀏覽器版可上傳截圖並手動貼入文字。"}</p>}
        <input ref={uploadRef} className={styles.hiddenInput} type="file" accept="image/png,image/jpeg" onChange={selectFile}/>
        {sources.length > 0 && <div className={styles.sourcePicker} role="group" aria-label="選擇要擷取的視窗"><div><b>選擇遊戲視窗或螢幕</b><button type="button" onClick={() => setSources([])}>取消</button></div>{sources.map(item => <button key={item.id} type="button" onClick={() => chooseSource(item.id)} disabled={capturing}><img src={item.thumbnail} alt=""/><span>{item.name}</span></button>)}</div>}
        {!file ? <button type="button" className={styles.dropzone} disabled={capturing || recognizing} onClick={() => uploadRef.current?.click()}><Upload size={22}/><span>選擇角色資訊或模組詳情截圖</span><small>PNG、JPEG，最大 8 MB</small></button> : <div className={styles.previewWrap}><img src={previewUrl} alt="已選取的遊戲截圖"/><button type="button" className={styles.clear} onClick={clearFrame} aria-label="清除截圖" disabled={recognizing || capturing}><X size={15}/></button><span>{file.name} · {(file.size / 1024).toFixed(0)} KB</span></div>}
      </div>
      <div className={styles.fields}>
        <label>遊戲頁面<input value={page} maxLength={120} onChange={event => setPage(event.target.value)}/></label>
        <label>辨識文字（請對照原圖修正）<textarea value={ocrText} disabled={recognizing} onChange={event => updateText(event.target.value)} placeholder={"角色名稱：你的角色\nUID：畫面顯示的數字\n等級：60\n\n詞條範例：攻速專注 +8"}/></label>
        <div className={styles.parsed}><span>{textSource === "windows-ocr" ? "Windows 圖片辨識" : "手動文字"}</span>{parsed.moduleCount !== undefined && <b>{parsed.moduleCount} 件模組</b>}{parsed.attributes.slice(0, 6).map((item, index) => <i key={index}>{item.name} +{item.value}</i>)}</div>
        <p className={styles.helper}>物品種類代碼：{parsed.item.gameConfigId ?? "未讀取"} · 物品實例編號：{parsed.item.gameInstanceId ?? "未讀取"}。不會依物品名稱猜測代碼。</p>
        {parsed.warnings.map((warning, index) => <p className={styles.helper} key={index}>{warning}</p>)}
        <div className={styles.actions}><button type="button" onClick={copyPayload}><Clipboard size={14}/>{copied ? "已複製" : "複製辨識資料"}</button><button type="button" className={styles.send} onClick={sendToBot} disabled={!file || sending || recognizing}><Send size={14}/>{sending ? "傳送中…" : "送出截圖與文字"}</button></div>
      </div>
    </div>
    <section className={styles.characterPanel} aria-labelledby="character-title"><h3 id="character-title">角色資料 · 等待你確認</h3><p className={styles.helper}>僅解析「角色名稱、UID、等級、伺服器」等明確標籤。沒有標籤或辨識不清楚時，請依原圖填入；不會拿公開帳號資料代替。</p><div className={styles.characterFields}>
      <label>角色名稱<input disabled={recognizing} aria-label="確認角色名稱" maxLength={80} value={character.name ?? ""} onChange={event => { setConfirmedCharacter(undefined); setCharacter(value => ({ ...value, name: event.target.value })); }}/></label>
      <label>角色 UID<input disabled={recognizing} aria-label="確認角色 UID" maxLength={80} inputMode="numeric" value={character.uid ?? ""} onChange={event => { setConfirmedCharacter(undefined); setCharacter(value => ({ ...value, uid: event.target.value })); }}/></label>
      <label>等級<input disabled={recognizing} aria-label="確認角色等級" type="number" min="0" max="999999" value={character.level ?? ""} onChange={event => { setConfirmedCharacter(undefined); setCharacter(value => ({ ...value, level: event.target.value ? Number(event.target.value) : undefined })); }}/></label>
      <label>伺服器<input disabled={recognizing} aria-label="確認伺服器" maxLength={80} value={character.server ?? ""} onChange={event => { setConfirmedCharacter(undefined); setCharacter(value => ({ ...value, server: event.target.value })); }}/></label>
    </div><button type="button" onClick={saveCharacter} disabled={recognizing}>確認並儲存角色資訊</button>{savedCharacter && <p className={styles.helper}>上次確認：{savedCharacter.name} · UID {savedCharacter.uid} · 台港澳服（本機記錄，非遊戲登入狀態）</p>}</section>
    {notice && <p className={styles.notice} role="status"><Check size={15}/>{notice}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {response && <details className={styles.response}><summary>截圖接收結果</summary><pre>{JSON.stringify(response, null, 2)}</pre></details>}
  </section>;
}
