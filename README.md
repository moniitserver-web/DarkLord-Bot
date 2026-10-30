# DarkLord Bot

這是一個獨立的本機遊戲自動化與模組分析工作區，和原本的「黑帝的星痕共鳴」網站分開，沒有共用登入、資料庫、導覽或 API。

## 啟動

```sh
npm install
npm run dev
```

開啟 `http://127.0.0.1:3001`。這個埠號和原本網站的 `3000` 分開，兩個專案可以同時執行。首頁品牌為 DarkLord Bot。

要製作 Windows 可下載版本，請看 [docs/windows-desktop.md](docs/windows-desktop.md)。執行 `npm run desktop:win` 會產生安裝版與免安裝版 `.exe`；也可以直接從 GitHub Actions 建置 Windows 版本。

如果 `3001` 已經有舊的獨立版程序在執行，直接開啟上面的網址即可；要重啟它，先停止舊程序再執行 `npm run dev`。

## 功能

- 攻擊、守護、輔助三種模組類型。
- 每組選五件不同 ID 的模組。
- 設定詞條權重與五件合計最低值。
- 單件總屬性排除門檻。
- 展開查看每組的五件模組。
- JSON 背包匯入、匯出、手動新增、編輯、刪除與復原。
- 使用瀏覽器 Web Worker 執行搜尋，可取消計算。
- 背包只保存在目前瀏覽器的 localStorage。
- Windows 遊戲視窗擷取、本機繁中 OCR、角色資料核對與 Bot webhook 串接（不提供遊戲帳號登入）。
- 內建 GitHub 公開資料快照：1,371 件模組，可切換回自己的背包。
- 自動化任務控制台與 PowerShell runner：提供釣魚、採集、副本、討伐、演奏、原地戰鬥的任務範本、啟停與截圖事件；遊戲畫面判斷、鍵鼠操作及全域快捷鍵尚未完成。
- macOS 與 Windows 本機 runner；預設 dry-run，畫面變更才送出一次 Bot 事件。

首次開啟是空的個人背包。可手動開啟 `fudiyangjin/StarResonanceAutoMod` 的 1,371 件公開快照試算；它不是你的背包或台港澳完整物品表。請匯入自己的 JSON 或手動新增模組，遊戲代碼與本機識別碼分開保存。計算分數是自訂權重試算。資料來源及版本限制見 [docs/tw-hk-mo-data-sources.md](docs/tw-hk-mo-data-sources.md)。

JSON 格式、限制與計算邏輯請看 [docs/modules.md](docs/modules.md)。
遊戲截圖辨識與角色核對請看 [docs/screenshot-bot.md](docs/screenshot-bot.md)。
Windows 執行方式請看 [docs/windows-runner.md](docs/windows-runner.md)。DarkLord Bot 的 Windows 入口是 `scripts/start-blacklord-windows.bat`；舊的 `scripts/start-starbox-windows.bat` 仍保留相容性。預設 dry-run，只有明確設定 native adapter 才會交給外部程式處理輸入。
自動化控制台與 runner 請看 [docs/automation.md](docs/automation.md)；Windows 啟動方式請看 [docs/windows-runner.md](docs/windows-runner.md)。

Docker 建置、測試與本機預覽見 [docs/docker.md](docs/docker.md)；參考 EXE/ZIP 靜態分析見 [docs/reference-inspector.md](docs/reference-inspector.md)。
