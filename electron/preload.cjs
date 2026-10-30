const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("darklordDesktop", {
  appName: "DarkLord Bot",
  platform: process.platform,
  listCaptureSources: () => ipcRenderer.invoke("darklord:list-capture-sources"),
  captureSource: id => ipcRenderer.invoke("darklord:capture-source", id),
  recognizeImage: dataUrl => ipcRenderer.invoke("darklord:recognize-image", dataUrl),
});
