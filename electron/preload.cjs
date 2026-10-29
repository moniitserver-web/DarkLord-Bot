const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("darklordDesktop", {
  appName: "DarkLord Bot",
});
