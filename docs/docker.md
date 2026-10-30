# Docker 本機環境

Docker 用於隔離靜態資料檢查，以及建置／測試 DarkLord 的網頁與本機 API。macOS 上的 Linux 容器不能直接提供 Windows EXE、WinRT OCR 或完整 Windows 桌面；這些仍由 GitHub Actions 的 Windows 安裝測試驗證。

## 本機已設定的環境

這台 Mac 使用 Colima 的 `darklord` 環境（4 核心、4 GB 記憶體、30 GB 磁碟），Docker context 為 `colima-darklord`，未變更其他 Docker 預設 context。CLI 位於 `~/.local/bin/docker`；下列指令明確選擇這個環境。

```sh
~/.local/bin/colima start --profile darklord
~/.local/bin/docker --context colima-darklord version
```

只有 `~/.local/share/darklord-docker-exchange` 供虛擬機共享；不共享整個家目錄或 Downloads。專案建置由 CLI 傳送 build context。

## 建置與開啟

```sh
~/.local/bin/docker --context colima-darklord compose build
~/.local/bin/docker --context colima-darklord compose up -d
```

瀏覽器開啟 `http://127.0.0.1:3002`。只綁定本機，容器以一般使用者、唯讀檔案系統執行。

建置會執行單元測試、型別檢查、正式編譯，以及 standalone HTTP／靜態資源／角色資料 API 測試。桌面 Windows OCR 在此網頁版會顯示不支援，可手動貼入文字。容器不會自動抓取主機遊戲視窗，也沒有遊戲帳號登入。

```sh
~/.local/bin/docker --context colima-darklord compose logs --tail 80
~/.local/bin/docker --context colima-darklord compose down
```

背包與確認的角色資料保存在瀏覽器 localStorage；與 Windows EXE 的瀏覽器儲存區不同。請透過 JSON 匯出／匯入轉移背包。

StarBox 檔案靜態檢查見 [reference-inspector.md](reference-inspector.md)。來源檔只讀掛載，執行期間不使用網路、不執行 EXE。

停止整個虛擬機可執行 `~/.local/bin/colima stop --profile darklord`；此操作會停止該環境的所有容器。下次用同一 profile 啟動即可保留映像。
