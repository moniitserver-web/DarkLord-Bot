# DarkLord Bot Windows 桌面版

桌面版會把 Next.js 本機服務放進 Electron 外殼。使用者安裝後直接開啟 `DarkLord Bot.exe`，程式會在本機啟動服務並自動開啟介面，不需要手動開瀏覽器。

## 本機建置

```powershell
npm ci
npm run desktop:win
```

完成後會在 `dist/` 產生兩種檔案：

- `DarkLord-Bot-<版本>-x64.exe`：Windows 安裝程式，可建立桌面捷徑。
- `DarkLord-Bot-Portable-<版本>.exe`：免安裝版，直接執行即可。

Windows 建置需要在 Windows 建置機執行。最簡單的方式是把程式碼放到 GitHub，從 Actions 手動執行「建置 Windows 版」，完成後到該次工作流程的 Artifacts 下載 EXE。

## 發布給其他人下載

1. 建立一個 GitHub repository 並推送程式碼。
2. 在 Actions 執行「建置 Windows 版」。
3. 從 Artifacts 下載 `darklord-bot-windows.zip`，或建立 `v0.1.0` 這類標籤讓工作流程自動建置。
4. 將產生的安裝檔放到 GitHub Release，使用者即可下載。

目前封裝沒有程式碼簽章。Windows 第一次啟動可能會顯示 SmartScreen 提示；正式公開給大量使用者時，應再加上 Windows 程式碼簽章憑證。
