# 自動化系統

獨立版提供一個任務控制層，先以 `dry-run` 驗證流程與截圖事件，再由桌面 runner 接上原生輸入 adapter。預設不會送出遊戲按鍵。

目前提供下列任務範本，尚未實作各玩法的畫面判斷與鍵鼠操作：

- 自動釣魚
- 自動採集
- 自動副本
- 自動討伐
- 自動演奏
- 原地戰鬥

API：

```sh
curl http://127.0.0.1:3001/api/automation
curl -X POST http://127.0.0.1:3001/api/automation/auto-fishing \
  -H 'content-type: application/json' -d '{"action":"start"}'
curl -X POST http://127.0.0.1:3001/api/automation/auto-fishing \
  -H 'content-type: application/json' -d '{"action":"tick"}'
curl -X POST http://127.0.0.1:3001/api/automation/auto-fishing \
  -H 'content-type: application/json' -d '{"action":"pause"}'
```

Windows 建議使用 PowerShell runner：

```powershell
.\scripts\start-blacklord-windows.bat
```

它會擷取 Windows 桌面畫面、以 SHA-256 去重，並把變更送到截圖 Bot API。需要一次測試時可用 `--once`。Node runner 仍保留給 macOS／開發環境：

```sh
STARBOX_URL=http://127.0.0.1:3001 node scripts/automation-runner.mjs
```

runner 會以畫面 PNG 的 SHA-256 去重；檔案內容完全相同時，不會重複把截圖送給 bot。動畫或游標變化也會造成新的 `game_screen` 事件，這不是過圖判斷。runner 目前只送圖片，不會呼叫桌面版的繁中 OCR；API 會回報 `recognition: "not-run"`。

如果要接原生 adapter，設定 `AUTOMATION_NATIVE_ADAPTER` 指向可執行檔。adapter 會從 stdin 收到 JSON action；未設定時會保留 dry-run 行為，可驗證任務啟停、截圖與 webhook 傳輸。範例 adapter 只驗證輸入，尚無遊戲操作邏輯。控制台的快捷鍵尚未註冊，runner 也尚未採用每個任務的 wait 動作調整節拍；目前以全域輪詢間隔運作。
