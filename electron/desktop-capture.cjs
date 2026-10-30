const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const runFile = promisify(execFile);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const TRADITIONAL_CHINESE = /^zh-(?:Hant(?:-|$)|TW$|HK$|MO$)/i;
const LANGUAGE_HELP = '找不到 Windows 繁體中文文字辨識功能。請在「設定 → 時間與語言 → 語言與地區」加入中文（繁體，台灣），安裝語言選項中的基本輸入／光學字元辨識後重新開啟；也可先手動貼上辨識文字。';

function decodeImageDataUrl(value) {
  if (typeof value !== 'string') throw new Error('請提供 PNG 或 JPEG 圖片。');
  if (value.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64) throw new Error('圖片不可超過 8 MB。');
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) throw new Error('圖片格式不正確，只接受 PNG 或 JPEG。');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('圖片不可超過 8 MB。');
  if (!bytes.length || bytes.toString('base64') !== match[2]) throw new Error('圖片編碼格式不正確。');
  const isPng = bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if ((match[1] === 'png' && !isPng) || (match[1] === 'jpeg' && !isJpeg)) throw new Error('圖片內容與 PNG／JPEG 格式不符。');
  return bytes;
}

function assertTrustedCaptureCaller(event, window, expectedOrigin) {
  if (!window || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
    throw new Error('拒絕非主視窗的擷取來源。');
  }
  try {
    const url = new URL(event.senderFrame.url);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.origin !== expectedOrigin) throw new Error();
  } catch { throw new Error('拒絕非本機頁面的擷取來源。'); }
}

async function withTimeout(operation, milliseconds, message) {
  let timer;
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

function createDesktopCaptureService({ desktopCapturer, screen, nativeImage, platform = process.platform, recognize = recognizeWindowsImage }) {
  let recognizing = false;
  return {
    async listCaptureSources() {
      const sources = await withTimeout(desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: false }), 15_000, '列出遊戲視窗逾時，請確認螢幕擷取權限後重試。');
      return sources.map(source => ({ id: source.id, name: source.name, thumbnail: source.thumbnail.isEmpty() ? '' : source.thumbnail.toDataURL() }));
    },
    async captureSource(id) {
      if (typeof id !== 'string' || id.length > 120 || !/^(?:window|screen):\d+:\d+$/.test(id)) throw new Error('請重新選擇有效的擷取來源。');
      const edge = Math.min(8192, Math.max(1920, ...screen.getAllDisplays().flatMap(display => [display.size.width * display.scaleFactor, display.size.height * display.scaleFactor])));
      const sources = await withTimeout(desktopCapturer.getSources({ types: [id.startsWith('window:') ? 'window' : 'screen'], thumbnailSize: { width: Math.ceil(edge), height: Math.ceil(edge) }, fetchWindowIcons: false }), 15_000, '擷取畫面逾時，請確認遊戲視窗可見後重試。');
      const source = sources.find(entry => entry.id === id);
      if (!source) throw new Error('找不到選取的遊戲視窗，視窗可能已關閉；請重新選擇。');
      if (source.thumbnail.isEmpty()) throw new Error('無法擷取此視窗。請還原遊戲視窗，或改選遊戲所在的螢幕。');
      const dataUrl = source.thumbnail.toDataURL();
      decodeImageDataUrl(dataUrl);
      return { dataUrl, capturedAt: new Date().toISOString() };
    },
    async recognizeImage(dataUrl) {
      if (platform !== 'win32') throw new Error('本機繁體中文辨識目前僅支援 Windows 10／11；可先手動貼上辨識文字。');
      if (recognizing) throw new Error('上一張圖片仍在辨識，請稍候再試。');
      const bytes = decodeImageDataUrl(dataUrl);
      const image = nativeImage.createFromBuffer(bytes);
      const size = image.getSize();
      if (image.isEmpty() || !size.width || !size.height || size.width * size.height > 40_000_000) throw new Error('圖片無法解碼或尺寸過大，請裁切需要辨識的遊戲區域後重試。');
      recognizing = true;
      try { return await recognize(bytes); }
      finally { recognizing = false; }
    },
  };
}

async function recognizeWindowsImage(bytes, { platform = process.platform, tempRoot = os.tmpdir(), run = runFile } = {}) {
  if (platform !== 'win32') throw new Error('本機文字辨識需要 Windows 10／11。');
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw new Error('圖片大小必須介於 1 byte 與 8 MB。');
  const directory = await fs.mkdtemp(path.join(tempRoot, 'darklord-ocr-'));
  try {
    const scriptPath = path.join(directory, 'recognize.ps1');
    const imagePath = path.join(directory, 'image');
    // PowerShell 5.1 needs a BOM to read Traditional Chinese source reliably.
    const script = await fs.readFile(path.join(__dirname, 'windows-ocr.ps1'), 'utf8');
    await fs.writeFile(scriptPath, '\ufeff' + script.replace(/^\ufeff/, ''), { mode: 0o600 });
    await fs.writeFile(imagePath, bytes, { mode: 0o600 });
    const windowsRoot = process.env.SystemRoot || 'C:\\Windows';
    const command = path.join(windowsRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    let stdout;
    try {
      ({ stdout } = await run(command, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-ImagePath', imagePath], { windowsHide: true, timeout: 45_000, maxBuffer: 1024 * 1024, encoding: 'utf8' }));
    } catch (error) {
      if (error.killed || error.code === 'ETIMEDOUT') throw new Error('Windows 文字辨識逾時，請縮小圖片範圍後重試。');
      const details = String(error.stderr || error.message || error).trim().slice(0, 1200);
      if (/OCR_LANGUAGE_MISSING/.test(details)) throw new Error(LANGUAGE_HELP);
      throw new Error(`Windows 文字辨識失敗：${details}`);
    }
    let result;
    try { result = JSON.parse(stdout.replace(/^\ufeff/, '').trim()); }
    catch { throw new Error('Windows 文字辨識回傳格式不正確，請重試。'); }
    if (!TRADITIONAL_CHINESE.test(result?.language || '')) throw new Error(LANGUAGE_HELP);
    if (typeof result.text !== 'string') throw new Error('Windows 沒有回傳可讀取的辨識文字。');
    return { text: result.text.slice(0, 20_000), language: result.language };
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

module.exports = { createDesktopCaptureService, assertTrustedCaptureCaller, decodeImageDataUrl, recognizeWindowsImage };
