const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Platform info
  platform: process.platform,
  isElectron: true,

  // Window controls
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  toggleFullscreen: () => ipcRenderer.send("window:toggle-fullscreen"),

  // Notifications
  showNotification: (title, body) =>
    ipcRenderer.send("notification:show", { title, body }),

  // Config access
  getConfig: () => ipcRenderer.invoke("config:get"),
});
