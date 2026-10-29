# Windows Runner

BlackLord 提供 Windows PowerShell runner，負責輪詢自動化任務、擷取桌面畫面、用 SHA-256 避免同一畫面重複送出，再把變更送到 `/api/bot/screenshot`。預設是 dry-run，不會送出遊戲鍵鼠輸入。

## 啟動

在專案資料夾開啟 PowerShell：

```powershell
.\scripts\start-blacklord-windows.bat
```

只執行一次輪詢可使用：

```powershell
.\scripts\start-blacklord-windows.bat --once
```

可設定：

```powershell
$env:BLACKLORD_URL = "http://127.0.0.1:3001"
$env:STARBOX_URL = $env:BLACKLORD_URL
$env:AUTOMATION_POLL_MS = "1000"
$env:SCREENSHOT_OUTPUT_DIR = ".screenshots-windows"
$env:AUTOMATION_DRY_RUN = "true"
.\scripts\start-blacklord-windows.bat
```

PowerShell 5.1 與 PowerShell 7 都可使用。第一次執行需要允許 Windows 的螢幕擷取相關權限；如果桌面擷取失敗，runner 會保留任務狀態並記錄警告。

## Native adapter

只有在你明確提供 adapter 後，runner 才會呼叫外部執行檔：

```powershell
$env:AUTOMATION_DRY_RUN = "false"
$env:AUTOMATION_NATIVE_ADAPTER = "$PWD\scripts\windows-native-adapter-example.ps1"
.\scripts\start-blacklord-windows.bat
```

範例 adapter 只做 allowlist 驗證，不會控制鍵盤或滑鼠。真正的遊戲輸入應由你自行提供、測試與授權；未知任務與未知動作會被拒絕。停止自動化時，先在控制台按「停止全部」，再關閉 runner。
