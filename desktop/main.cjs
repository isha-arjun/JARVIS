const { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, ipcMain, session } = require("electron");
const path = require("node:path");
let win;
let tray;
let isQuitting = false;
function createWindow() {
  win = new BrowserWindow({
    width: 1180, height: 820, minWidth: 760, minHeight: 560,
    title: "JARVIS", backgroundColor: "#080d16", show: false,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  const devUrl = process.env.JARVIS_DEV_URL || "http://127.0.0.1:5173";
  if (!app.isPackaged) win.loadURL(devUrl); else win.loadFile(path.join(__dirname, "../dist/index.html"));
  win.once("ready-to-show", () => win.show());
  win.on("close", (event) => { if (!isQuitting) { event.preventDefault(); win.hide(); } });
  win.on("closed", () => { win = null; });
}
function toggleWindow() {
  if (!win) { createWindow(); return; }
  if (win.isVisible()) win.hide(); else { win.show(); win.focus(); }
}
ipcMain.handle("jarvis:ask-local-model", async (_event, args) => {
  const prompt = String(args?.prompt || "").slice(0, 8000);
  const model = String(args?.model || "qwen2.5:3b");
  if (!/^[a-zA-Z0-9._:-]{1,100}$/.test(model)) throw new Error("Invalid local model name.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
      body: JSON.stringify({ model, stream: false, format: "json", options: { temperature: 0.2 }, messages: [
        { role: "system", content: "You are JARVIS, a precise personal assistant. Return ONLY JSON. For simulations use {type:simulation,reply,model:{name,formula,trials,variables}}. For questions use {type:answer,reply}. If key inputs are missing use {type:clarify,reply}. Formula supports arithmetic only and variables with fixed,uniform,normal,triangular,bernoulli distributions. Never claim certainty or execute external actions." },
        { role: "user", content: prompt }
      ] })
    });
    if (!response.ok) throw new Error("Ollama returned HTTP " + response.status + ".");
    const data = await response.json(); return String(data.message?.content || "");
  } finally { clearTimeout(timer); }
});
app.whenReady().then(() => {\n  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {\n    const ownApp = webContents.getURL().startsWith("http://127.0.0.1:5173") || webContents.getURL().startsWith("file://");\n    callback(ownApp && permission === "media" && (details.mediaTypes || []).includes("audio"));\n  });
  createWindow();
  globalShortcut.register("CommandOrControl+Shift+Space", toggleWindow);
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip("JARVIS Personal Intelligence");
  tray.on("click", toggleWindow);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open JARVIS", click: toggleWindow },
    { label: "Quit", click: () => app.quit() }
  ]));
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("before-quit", () => { isQuitting = true; });
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
