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
- 遊戲截圖上傳／擷取、OCR 文字解析與 Bot webhook 串接。
- 內建 GitHub 公開資料快照：1,371 件模組，可切換回自己的背包。
- Windows 自動化控制台與 PowerShell runner：釣魚、採集、副本、討伐、演奏、原地戰鬥。
- 獨立自動化控制台：自動釣魚、採集、副本、討伐、演奏、原地戰鬥，以及任務啟停、快捷鍵與腳本設定。
- macOS 與 Windows 本機 runner；預設 dry-run，畫面變更才送出一次 Bot 事件。

首次開啟會使用 `fudiyangjin/StarResonanceAutoMod` 的 `modules.vdata` 公開資料快照，共 1,371 件。它不是即時玩家背包，也不是其他工具的原始資料庫；要計算自己的背包，請匯入 JSON 或在背包管理中新增模組。計算分數是自訂權重試算。

JSON 格式、限制與計算邏輯請看 [docs/modules.md](docs/modules.md)。
遊戲截圖串接與 macOS 自動監看請看 [docs/screenshot-bot.md](docs/screenshot-bot.md)。
Windows 執行方式請看 [docs/windows-runner.md](docs/windows-runner.md)。BlackLord 的 Windows 入口是 `scripts/start-blacklord-windows.bat`；舊的 `scripts/start-blacklord-windows.bat` 仍保留相容性。預設 dry-run，只有明確設定 native adapter 才會交給外部程式處理輸入。
自動化控制台與 runner 請看 [docs/automation.md](docs/automation.md)；Windows 啟動方式請看 [docs/windows-runner.md](docs/windows-runner.md)。
