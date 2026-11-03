const { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage } = require("electron");
const path = require("node:path");
let win;
let tray;
function createWindow() {
  win = new BrowserWindow({
    width: 1180, height: 820, minWidth: 760, minHeight: 560,
    title: "JARVIS", backgroundColor: "#080d16", show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  const devUrl = process.env.JARVIS_DEV_URL || "http://127.0.0.1:5173";
  if (!app.isPackaged) win.loadURL(devUrl); else win.loadFile(path.join(__dirname, "../dist/index.html"));
  win.once("ready-to-show", () => win.show());
  win.on("closed", () => { win = null; });
}
function toggleWindow() {
  if (!win) { createWindow(); return; }
  if (win.isVisible()) win.hide(); else { win.show(); win.focus(); }
}
app.whenReady().then(() => {
  createWindow();
  globalShortcut.register("CommandOrControl+Shift+Space", toggleWindow);
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip("JARVIS Personal Intelligence");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open JARVIS", click: toggleWindow },
    { label: "Quit", click: () => app.quit() }
  ]));
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
