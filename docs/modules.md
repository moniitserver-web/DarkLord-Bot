# 使用說明

這個資料夾是獨立版本，不依賴原網站。個人背包只寫入此瀏覽器的 localStorage，換裝置前請匯出 JSON。

首次開啟會顯示空的「我的背包」，不會自動載入他人的資料，也沒有透過遊戲帳號讀取背包。可匯入自己的 JSON 或在「管理背包」新增與校正模組；已有的版本 1 存檔仍可讀取。

「查看示範快照」可主動開啟 GitHub `fudiyangjin/StarResonanceAutoMod` 的 `modules.vdata` 公開資料快照，共 1,371 件（攻擊 1,174、守護 75、輔助 122）。它只供試算，未驗證適用台港澳服，不是你的背包，也不是遊戲完整物品資料庫。切換示範不會覆蓋自己的背包；在示範畫面新增模組只會加入自己的背包。

舊版匯出的示範快照不可重新匯入成個人背包。若舊的本機存檔已含快照記錄，程式會保留內容並顯示警示，供先匯出備份再換入自己的資料，不會自動刪除。

匯入格式：

```json
{
  "version": 1,
  "modules": [
    {
      "id": "support-001",
      "name": "我的輔助模組",
      "type": "輔助",
      "stats": { "特攻治療加持": 8, "攻速專注": 5 },
      "region": "tw-hk-mo"
    }
  ]
}
```

`id` 是本工具的內部記錄識別碼，必須是字串且每件不同；手動新增時由工具建立。它不是遊戲物品代碼，`vdata-5-1953` 之類的示範記錄也不能當成官方種類代碼。

可選欄位如下；不知道的資訊請省略，不會自動猜測：

| 欄位 | 格式與用途 |
| --- | --- |
| `gameConfigId` | 字串，遊戲物品種類代碼，由使用者提供。多件同種模組可以相同。 |
| `gameInstanceId` | 字串，該件物品在遊戲中的實例識別碼，由使用者提供。保留長整數與前置零，不轉換為數值。 |
| `region` | `tw-hk-mo`（台港澳）、`cn`（中國大陸）、`global`（其他國際區服）或 `unknown`；省略為未指定。 |

這些欄位是使用者提供的資料，並不表示官方驗證；選擇區服也不會將其他區服資料自動轉換。`gameConfigId` 與 `gameInstanceId` 可在「管理背包」編輯，但不會拿來呼叫未實作的遊戲 API。此格式仍使用 `version: 1`，舊版沒有這三個欄位的資料照常支援。

同一區服不能重複加入相同 `gameInstanceId`，即使本機 `id` 不同也會拒絕，避免一件物品被計算多次。不同已知區服可以有相同實例字串；如果其中一筆區服未指定或為 `unknown`，則要求先補上區服或移除重複項目。沒有提供實例識別碼的舊資料仍按本機 `id` 查重。種類代碼 `gameConfigId` 可重複，實例識別碼保留完整字串與前置零。

匯入只接受上述 JSON 格式；不直接接受 `.vdata` 二進位檔案或其他工具專用格式。失敗時原背包不會被覆蓋。

詞條使用公開繁中字典中已依相同 `EffectID` 核實的別名，例如「特攻傷害」整理為「特攻傷害加持」、「極-生命汲取」整理為「極·生命吸取」；未知詞條保留原文。同一模組若同時出現新舊名稱而變成重複詞條，會要求使用者確認，避免雙重計算。快照原始 JSON 保持原樣，顯示時套用相同規則。這只修正已證實的名稱差異，不代表台港澳物品代碼、傷害公式或全部詞條已通過實機驗證。

名稱來源與固定提交：

- [Bing-su/bpsr-data 繁中 ModEffectTable](https://github.com/Bing-su/bpsr-data/blob/1a8d8d78623969599f9fdadff85f2d9e827b798a/src/data/traditionalchinese/ZTable/ModEffectTable.json)
- [同版本簡中 ModEffectTable](https://github.com/Bing-su/bpsr-data/blob/1a8d8d78623969599f9fdadff85f2d9e827b798a/src/data/chinese/ZTable/ModEffectTable.json)
- [StarResonanceAutoMod 舊名稱表](https://github.com/fudiyangjin/StarResonanceAutoMod/blob/cb4505fc5439ec0241270d14f47e07eb9b00cc44/module_types.py)
- [上游解析器的 ConfigId 與 Uuid 欄位](https://github.com/fudiyangjin/StarResonanceAutoMod/blob/cb4505fc5439ec0241270d14f47e07eb9b00cc44/module_parser.py)

查核範圍與資料來源內部矛盾另見 [台港澳資料來源查核](tw-hk-mo-data-sources.md)。

計算會在符合門檻的同類型模組中，搜尋五件不同本機識別碼的組合。分數為勾選詞條的五件合計乘上權重之總和；最低需求也是五件合計。搜尋到達節點上限時會標示暫定結果，不保證是全域最佳。

工具容量限制是 2 MiB、2,000 件模組、64 種詞條、每件 1–12 個詞條，詞條數值為 1–1000 的整數。這些是輸入限制，不是遊戲規則。
