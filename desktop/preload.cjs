const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("jarvis", {
  askLocal: (args) => ipcRenderer.invoke("jarvis:ask-local-model", args)
});
