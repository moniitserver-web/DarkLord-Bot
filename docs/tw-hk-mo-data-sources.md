# 台港澳資料來源查核

查核日期：2026-10-30（Asia/Taipei）。本文件記錄本次實際讀取的來源與適用範圍，供資料修正與後續遊戲畫面核對使用。

## 官方資訊與查核限制

- [台港澳官方網站](https://bpsr.pde.tw/) 的頁腳標示「沛羽數位娛樂有限公司為本遊戲在台港澳地區的代理商」。[HAOPLAY 入口](https://bpsr.haoplay.com/) 的頁面轉址規則將 TW、HK、MO 導向前述網站。
- 官網連結包含客戶端、官方社群、儲值與客服。本次檢查這些公開入口，**尚未找到可供第三方讀取玩家角色／背包的公開 API 文件，或官方物品 ID 對照表**。這不代表官方沒有內部介面。
- 官網與社群資料都不能提供使用者目前的私人背包內容。公開名稱表不能取代使用者自己的截圖或資料匯入，也不能把來源不明的數字推定為台港澳物品代碼。
- 下列開源資料庫包含繁中字串，但沒有證據證明它與使用者目前的台港澳客戶端版本完全相同。**繁中字典不等於已驗證的台港澳資料表。**

## 現有快照的來源與識別碼

目前專案的 `src/data/full-modules.json` 是公開背包快照，包含 1,371 件模組、18 種實際出現的詞條；不是遊戲的全部物品清單，也不是目前使用者的背包。

範例資料：

```json
{"id":"vdata-5-1953","name":"高性能守護 · 1953","type":"守護","stats":{"幸運專注":5,"施法專注":8}}
```

`vdata-5-1953` 是此應用的記錄識別字串，**不是官方物品種類代碼**。名稱後的 `1953` 也不應作為台港澳物品名稱或全域種類代碼呈現。

[StarResonanceAutoMod 說明](https://github.com/fudiyangjin/StarResonanceAutoMod/blob/cb4505fc5439ec0241270d14f47e07eb9b00cc44/README.md) 說明其以網路封包分析取得模組、儲存 `modules.vdata`，不是透過官方帳號 API，也不是從截圖辨識取得。該說明不證明 DarkLord Bot 已具有同樣的取得能力。

上游 [module_types.py](https://github.com/fudiyangjin/StarResonanceAutoMod/blob/cb4505fc5439ec0241270d14f47e07eb9b00cc44/module_types.py) 的固定版本是 `cb4505fc5439ec0241270d14f47e07eb9b00cc44`（該檔案最後修改日期 2025-11-05）。其名稱以簡中／英文為主，部分名稱與下列較新繁中字典不同。此版本只用於核對名稱來源；本次未取得原快照的生成紀錄，不能據此宣稱所有快照內容均由此提交產生。

## 公開繁中字典

來源：[Bing-su/bpsr-data](https://github.com/Bing-su/bpsr-data)，MIT 授權；固定資料提交 `1a8d8d78623969599f9fdadff85f2d9e827b798a`，日期 2026-10-28。

精確檔案：

- [簡中 ModEffectTable](https://github.com/Bing-su/bpsr-data/blob/1a8d8d78623969599f9fdadff85f2d9e827b798a/src/data/chinese/ZTable/ModEffectTable.json)
- [繁中 ModEffectTable](https://github.com/Bing-su/bpsr-data/blob/1a8d8d78623969599f9fdadff85f2d9e827b798a/src/data/traditionalchinese/ZTable/ModEffectTable.json)
- [繁中 ItemTable](https://github.com/Bing-su/bpsr-data/blob/1a8d8d78623969599f9fdadff85f2d9e827b798a/src/data/traditionalchinese/ZTable/ItemTable.json)
- [繁中 ModTable](https://github.com/Bing-su/bpsr-data/blob/1a8d8d78623969599f9fdadff85f2d9e827b798a/src/data/traditionalchinese/ZTable/ModTable.json)

以下對照是按兩個語言檔案的同一個 `EffectID` 比對 `EffectName`，不是依文字相似度猜測。共有 21 組（13 個一般詞條、8 個極系列）；現有快照出現其中 18 個。`EffectID` 是該來源的效果種類識別碼，不是玩家每件模組的記錄 ID。

| EffectID | 簡中原文 | 繁中原文 | 現有快照名稱／狀態 |
| --- | --- | --- | --- |
| 1110 | 力量加持 | 力量加持 | 力量加持 |
| 1111 | 敏捷加持 | 敏捷加持 | 敏捷加持 |
| 1112 | 智力加持 | 智力加持 | 智力加持 |
| 1113 | 特攻伤害加持 | 特攻傷害加持 | 特攻傷害 |
| 1114 | 精英打击 | 精英打擊 | 精英打擊 |
| 1205 | 特攻治疗加持 | 特攻治療加持 | 特攻治療加持 |
| 1206 | 专精治疗加持 | 專精治療加持 | 專精治療加持 |
| 1307 | 抵御魔法 | 抵禦魔法 | 抵禦魔法 |
| 1308 | 抵御物理 | 抵禦物理 | 抵禦物理 |
| 1407 | 施法专注 | 施法專注 | 施法專注 |
| 1408 | 攻速专注 | 攻速專注 | 攻速專注 |
| 1409 | 暴击专注 | 暴擊專注 | 暴擊專注 |
| 1410 | 幸运专注 | 幸運專注 | 幸運專注 |
| 2104 | 极·伤害叠加 | 極·傷害疊加 | 極-傷害疊加 |
| 2105 | 极·灵活身法 | 極·靈活身法 | 極-靈活身法 |
| 2204 | 极·生命凝聚 | 極·生命凝聚 | 未出現在快照 |
| 2205 | 极·急救措施 | 極·急救措施 | 極-急救措施 |
| 2304 | 极·绝境守护 | 極·絕境守護 | 未出現在快照 |
| 2404 | 极·生命波动 | 極·生命波動 | 極-生命波動 |
| 2405 | 极·生命吸取 | 極·生命吸取 | 極-生命汲取 |
| 2406 | 极·全队幸暴 | 極·全隊幸暴 | 未出現在快照 |

已證實的上游舊別名：`module_types.py` 將 1113 稱為 `特攻伤害`，2405 稱為 `极-生命汲取`。若匯入時接受它們，可依明確對照整理為同一效果；未知詞條仍應保留原文或提示使用者確認，不能強行猜測。修正詞條名稱不代表已驗證台服的傷害公式、數值、賽季規則或整個物品資料庫。

## 物品名稱與來源內部矛盾

同一版本的 `ItemTable` 記錄以下名稱：

| 種類代碼 | 名稱 |
| --- | --- |
| 5500101 | 基礎的攻擊型模組 |
| 5500102 | 高性能的攻擊型模組 |
| 5500103 | 卓越的攻擊型模組 |
| 5500104 | 卓越的攻擊型模組·優選 |
| 5500201 | 基礎的輔助型模組 |
| 5500202 | 高性能的輔助型模組 |
| 5500203 | 卓越的輔助型模組 |
| 5500204 | 卓越的輔助型模組·優選 |
| 5500301 | 基礎的守護型模組 |
| 5500302 | 高性能的守護型模組 |
| 5500303 | 卓越的守護型模組 |
| 5500304 | 卓越的守護型模組·優選 |

但該版本 `ModTable.Name` 把 5500104、5500204、5500304 都記成 `極·卓越的守護型模組`，與 `ItemTable` 的名稱及物品描述不一致。因此不能直接把所有資料表名稱不加區分地合併；涉及物品顯示名稱時，先使用有完整物品描述的 `ItemTable` 作查核參考，再以台港澳實際畫面確認。此表仍是公開繁中資料，不應標成官方台港澳代碼表。

## 其他查核線索

[ok-star-resonance README 固定版本](https://github.com/Sanheiii/ok-star-resonance/blob/012ae82dc9b7fbb8477733b6e2fc343aa8dd3054/README.md) 對簡中、繁中、英文、日文分別列出功能支援，並要求依客戶端語言設定。這說明文字辨識必須考慮語言，但不證明 DarkLord Bot 的帳號讀取或辨識已實作完成。

另有 [2026 年 10 月模組封包變更的社群研究](https://github.com/foihu44-BPSR/BPSR_Module_Packet_spec_update_20261021)，作者報告連結數資料的欄位位置有變動。本次未證實該研究適用台港澳，也未將它認定為本次故障原因。使用者指定的畫面擷取串接方式與封包解析是不同資料來源，不能將封包工具說明直接套到截圖功能。

本次 `web.run` 搜尋回傳空內容；上述資料以 `curl` 實際讀取官方 HTML、GitHub API 與固定提交原始檔核對。未讀取或請求任何玩家登入憑證。

## 使用者提供的 StarBox-beta.exe

2026-10-30 對使用者提供的 `/Users/bomen/Downloads/StarBox-beta.exe` 進行靜態檢查，未執行程式，也未嘗試繞過保護。

- 檔案長度：114,148,884 bytes。
- SHA-256：`51d24685d8f52b569c532a62ec74c996511390d8ac52d9342e81937dd7e5330a`。
- 格式：Windows x64 PE；版本資源中的產品名稱 `StarBox`，版本 `0.9.0.18`。
- PE 區段包含 `.themida` 與 `.boot`，前七個區段名稱為空白；這是存在保護封裝的證據，不能視為可直接讀取的程式來源。
- 可直接讀取的 PE 資源只有圖示、圖示群組、版本資訊與 manifest；沒有文字表或可直接提取的物品字典資源。
- 對 UTF-8／UTF-16LE 進行限定字串檢查，沒有找到 `ModEffectTable`、`5500101`、`力量加持`、`特攻傷害`、`特攻伤害`、`模組`、`模组` 等明文。
- 未找到可直接讀取的獨立附加資料區。這些結果只代表本次靜態檢查無法取得字典，不代表程式內部一定沒有相關資料。

因此，本次沒有從此 EXE 複製任何模組 ID、詞條表或帳號快照。可用的名稱修正依據仍是前述固定版本公開資料，未以保護封裝內的未知內容作推定。

## 原始 ZIP、作者倉庫與公開說明的補查

- 使用者提供的 `/Users/bomen/Downloads/StarBox-rm.zip` 存在，大小僅 178 bytes；ZIP 唯一項目是空目錄 `StarBox-rm/`，沒有原始碼、物品資料、區服設定或 OCR 模板。只讀取 ZIP 目錄，未解壓或執行任何內容。
- 原作者 [balrogsxt/StarBox](https://github.com/balrogsxt/StarBox) 的預設 `rm` 分支固定提交 `fc111a59fd18a6142e7883efa3f71a27b6e13105` 是空樹。其 `main` 分支固定提交 `88a64eeefe61a141e39c0dadbca8fe76ed100e09` 只有 [README.md](https://github.com/balrogsxt/StarBox/blob/88a64eeefe61a141e39c0dadbca8fe76ed100e09/README.md) 與 `Assets/client.png`，沒有可供直接使用的字典或辨識程式碼。
- 舊 README 指向作者說明站；本次讀取 [快速開始](https://docs.starbox.icu/zh-CN/guide/getting-started)、[模組計算器](https://docs.starbox.icu/zh-CN/modules/mod_calculator)、[遊戲工具](https://docs.starbox.icu/zh-CN/modules/game-tools) 及 [腳本引擎](https://docs.starbox.icu/zh-CN/modules/script-engine)。快速開始頁明示自動化依賴簡中辨識，並將台服進程捕捉列為尚未支援。這些是作者對 StarBox 的說明，不是 DarkLord Bot 的能力或操作要求。
- 模組計算器說明過圖／切線後載入並快取模組，但未提供獨立物品字典下載。腳本引擎頁只說明本地腳本設定檔位置，沒有公開台港澳詞條表或 OCR 模板。
- 為避免把舊 README 當成現況，亦檢查目前公開 [v0.8.35 Release](https://github.com/balrogsxt/StarBox/releases/tag/v0.8.35)（2026-10-14 發布）。其 ZIP `StarBox-v0.8.35_20261014212026.zip` 為 91,134,550 bytes；只讀取 ZIP 目錄，11 個檔案均為 EXE／DLL，沒有獨立 JSON、CSV、原始碼或圖片模板。沒有執行其中程式。

結論：這份 ZIP 與作者目前公開倉庫、Release 沒有提供比已核對的公開繁中字典更直接的可用資料。作者文件反而證實原工具存在語言／區服適配限制，不能將它視為已完成台港澳串接的依據。
