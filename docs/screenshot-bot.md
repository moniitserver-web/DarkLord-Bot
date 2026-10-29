# 遊戲截圖 Bot 串接

獨立工具把每次遊戲畫面視為一個 `game_screen` 事件。使用者可以上傳截圖，或在瀏覽器授權後選取遊戲視窗並擷取單張畫面。事件會送到 `/api/bot/screenshot`；設定 `BOT_WEBHOOK_URL` 後，伺服器再把事件與圖片 base64 轉送到 bot。

## 啟用 webhook

在專案根目錄建立 `.env.local`：

```sh
BOT_WEBHOOK_URL=https://your-bot.example.com/game-screen
```

重新啟動 `npm run dev` 後，面板的「傳給 Bot」會把截圖送到該網址。未設定時仍會接收並解析截圖，但回應會標示尚未轉送。

## 事件內容

Webhook 會收到 JSON：

```json
{
  "event": "game_screen",
  "capturedAt": "2026-10-28T12:00:00.000Z",
  "source": "screen",
  "page": "模組背包",
  "ocrText": "模組數量：929\n特攻傷害 +12",
  "parsed": {
    "moduleCount": 929,
    "attributes": [{ "name": "特攻傷害", "value": 12 }]
  },
  "image": {
    "mimeType": "image/png",
    "size": 123456,
    "base64": "..."
  }
}
```

頁面切換時要再次擷取並送出一張畫面，bot 端可用 `capturedAt` 與 `page` 去重或建立遊戲狀態。OCR 服務可以在 bot 端處理；前端的文字框只提供手動貼入與本地快速解析。

## macOS 自動監看

如果遊戲與獨立工具在同一台 Mac，可以用 `screencapture` 輪詢畫面。腳本會以 SHA-256 比對前一張畫面，只有畫面真的變更時才送出一次：

```sh
cd /Users/bomen/Documents/ChatGPT/StarBox-module-calculator
STARBOX_URL=http://127.0.0.1:3001 \
SCREENSHOT_INTERVAL_MS=1500 \
SCREENSHOT_OUTPUT_DIR=.screenshots \
GAME_PAGE="遊戲畫面" \
node scripts/game-screenshot-bot.mjs
```

若只要測試一張畫面，可加 `--once`。指定單一遊戲視窗時設定 `SCREENSHOT_WINDOW_ID`：

```sh
SCREENSHOT_WINDOW_ID=12345 node scripts/game-screenshot-bot.mjs
```

第一次使用需要在「系統設定 → 隱私權與安全性 → 螢幕錄製」允許 Terminal 或 Node 擷取畫面。腳本不會把相同畫面重複送給 bot；不同畫面會保留在 `SCREENSHOT_OUTPUT_DIR` 供除錯。
