# 自動化系統

獨立版提供一個任務控制層，先以 `dry-run` 驗證流程與截圖事件，再由桌面 runner 接上原生輸入 adapter。預設不會送出遊戲按鍵。

目前任務：

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

runner 會以畫面 PNG 的 SHA-256 去重；同一個任務頁面沒有畫面變化時，不會重複把截圖送給 bot。切換到新頁面或畫面真的變更時，才會建立新的 `game_screen` 事件。

如果要接原生 adapter，設定 `AUTOMATION_NATIVE_ADAPTER` 指向可執行檔。adapter 會從 stdin 收到 JSON action；未設定時會保留 dry-run 行為，方便先確認畫面辨識、節拍與 webhook 流程。
