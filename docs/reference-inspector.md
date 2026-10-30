# 參考檔案靜態檢查

`tools/reference-inspector` 用 Python 標準庫讀取 Windows PE 與 ZIP，輸出 JSON 報告。適合核對使用者提供的 StarBox 檔案有哪些可直接讀取的資料；不會啟動 EXE、匯入檔案內的程式碼、解壓到磁碟或解除保護封裝。

報告包含 SHA-256、檔案大小、PE 架構／區段／版本／資源類型，以及固定模組名稱和 ID 字串的出現次數。ZIP 會列出檔案目錄，且只讀取名稱符合 `ItemTable.json`、`ModEffectTable.json`、`ModTable.json`、`ModTypeTable.json`、`module_types.py` 或相應 CSV 的小型候選字典。它不輸出任意原始字串、字典全文或玩家背包。

## 建置並執行 Docker

在獨立的 DarkLord Bot 專案根目錄執行：

```sh
~/.local/bin/docker --context colima-darklord build --pull -t darklord-reference-inspector:local tools/reference-inspector
```

映像以官方 `python:3.13-slim-bookworm` 建置，沒有第三方 Python 套件。建置過程會先執行合成 PE／ZIP 測試；下載基礎映像需要網路，實際檢查容器則完全關閉網路。

以下範例對 macOS／Linux 終端機適用。只掛入指定檔案，輸出資料夾須能由目前使用者寫入：

```sh
mkdir -p "$HOME/.local/share/darklord-docker-exchange/input" "$HOME/.local/share/darklord-docker-exchange/output"
cp "$HOME/Downloads/StarBox-beta.exe" "$HOME/Downloads/StarBox-rm.zip" "$HOME/.local/share/darklord-docker-exchange/input/"
~/.local/bin/docker --context colima-darklord run --rm \
  --network none \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges=true \
  --user "$(id -u):$(id -g)" \
  --cpus 1 \
  --memory 512m \
  --memory-swap 512m \
  --pids-limit 64 \
  --mount "type=bind,source=$HOME/.local/share/darklord-docker-exchange/input,target=/input,readonly" \
  --mount "type=bind,source=$HOME/.local/share/darklord-docker-exchange/output,target=/output" \
  darklord-reference-inspector:local
```

結果為 `~/.local/share/darklord-docker-exchange/output/report.json`。此 Colima 環境只共享交換資料夾，因此先複製指定參考檔到 input；原檔不改動。其他 Docker 環境可更換掛載的 `source`；請保留 `readonly`，並把輸出放在不同資料夾。需要分析其他資料時，不必掛入整個 Downloads 或家目錄。

Docker 的 CPU、記憶體、使用者、網路與掛載選項參考 [Docker 官方執行文件](https://docs.docker.com/engine/containers/run/)；Python 基礎映像參考 [官方映像說明](https://hub.docker.com/_/python)。此容器不包含 Windows 或 Wine，因此用途是讀取檔案，不是執行 Windows 應用程式或測試遊戲。

## 不使用 Docker 的開發驗證

本機已有 Python 3.10 以上時，可以執行相同檢查程式。輸入仍僅以資料方式讀取，但此方式沒有容器隔離：

```sh
python3 -m unittest discover -s tools/reference-inspector -p 'test_*.py' -v
python3 tools/reference-inspector/inspect_reference.py \
  --input /Users/bomen/Downloads/StarBox-beta.exe \
  --output /tmp/darklord-reference-report/local-report.json
```

## 如何閱讀結果

- `status` 為 `ok` 只代表能完成靜態讀取，不代表程式可用、安全、未加保護或支援台港澳。
- `pe.protection_indicators` 只根據已知區段名稱記錄線索。沒有線索不等於沒有保護；出現 Themida 線索也不會觸發解封裝。
- `dictionary_terms` 只統計固定文字的 UTF-8／UTF-16LE 編碼。文字命中不證明它就是有效物品對照，零命中也不證明內部沒有字典。
- `zip.entries[].dictionary_candidate` 依檔名標記候選來源；可能跳過不安全路徑、敏感資料夾、加密項目或過大的壓縮資料。候選名稱不能當成已核實資料來源。
- PE 自訂資源名稱不輸出；版本資源只允許產品名稱、產品版本、檔案版本與檔案描述四個欄位。檔案中的程式、文件或註解都不會作為操作指令執行。
- 上限為 32 個頂層輸入、每檔 256 MiB、每 ZIP 10,000 項；單一候選字典 2 MiB、全部候選合計 8 MiB、壓縮比最多 100 倍。目錄不遞迴，輸入符號連結不跟隨。
- 輸出錯誤會記錄在該檔案的 `error`，批次繼續處理其他檔案；至少一項錯誤時程序結束碼為 1。格式不支援或超出限制會標記 `skipped`。

人工核對的 StarBox 結果及公開詞條來源另見 [台港澳資料來源查核](tw-hk-mo-data-sources.md)。
