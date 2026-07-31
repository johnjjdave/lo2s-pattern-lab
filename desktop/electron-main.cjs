const { app, BrowserWindow, dialog, ipcMain, protocol, session } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { fileURLToPath } = require("node:url");

const appRoot = __dirname;
const MAX_XML_BYTES = 32 * 1024 * 1024;
let linkedDirectory = null;
let linkedWatcher = null;
let linkedPoller = null;
let linkedDebounce = null;
let lastLinkedSignature = "";

function resolveFileRequest(requestUrl) {
  const parsed = new URL(requestUrl);
  let requestPath = fileURLToPath(parsed);

  if (requestPath.startsWith(`${path.sep}brand${path.sep}`) || requestPath.startsWith(`brand${path.sep}`)) {
    requestPath = requestPath.replace(new RegExp(`^${path.sep}?brand${path.sep}`), "");
    return path.join(appRoot, "dist", "brand", requestPath);
  }

  return requestPath;
}

async function readXmlFile(filePath, linked = false) {
  const stats = await fs.promises.stat(filePath);
  if (!stats.isFile() || path.extname(filePath).toLowerCase() !== ".xml") throw new Error("Please choose a Resolume XML preset.");
  if (stats.size > MAX_XML_BYTES) throw new Error("The XML preset is larger than the 32 MB safety limit.");
  return {
    ok: true,
    linked,
    path: filePath,
    name: path.basename(filePath),
    mtimeMs: stats.mtimeMs,
    content: await fs.promises.readFile(filePath, "utf8"),
  };
}

async function listXmlFiles(directory) {
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listXmlFiles(entryPath));
    else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".xml") files.push(entryPath);
  }
  return files;
}

async function newestResolumeXml(directory) {
  const files = await listXmlFiles(directory);
  const candidates = await Promise.all(files.map(async (filePath) => ({ filePath, stats: await fs.promises.stat(filePath) })));
  candidates.sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);
  return candidates[0]?.filePath || null;
}

function stopResolumeLink() {
  if (linkedWatcher) linkedWatcher.close();
  if (linkedPoller) clearInterval(linkedPoller);
  if (linkedDebounce) clearTimeout(linkedDebounce);
  linkedWatcher = null;
  linkedPoller = null;
  linkedDebounce = null;
  linkedDirectory = null;
  lastLinkedSignature = "";
}

async function refreshResolumeLink(window, force = false) {
  if (!linkedDirectory || window.isDestroyed()) return null;
  const filePath = await newestResolumeXml(linkedDirectory);
  if (!filePath) throw new Error("No Resolume Advanced Output XML presets were found in this folder.");
  const result = await readXmlFile(filePath, true);
  const signature = `${result.path}:${result.mtimeMs}`;
  if (force || signature !== lastLinkedSignature) {
    lastLinkedSignature = signature;
    if (!force) window.webContents.send("resolume:xml-updated", result);
  }
  return result;
}

function scheduleResolumeRefresh(window) {
  if (linkedDebounce) clearTimeout(linkedDebounce);
  linkedDebounce = setTimeout(() => {
    refreshResolumeLink(window).catch((error) => {
      if (!window.isDestroyed()) window.webContents.send("resolume:link-error", { error: error.message });
    });
  }, 250);
}

async function startResolumeLink(window) {
  stopResolumeLink();
  linkedDirectory = path.join(app.getPath("documents"), "Resolume Arena", "Presets", "Advanced Output");
  await fs.promises.access(linkedDirectory, fs.constants.R_OK);
  const initial = await refreshResolumeLink(window, true);
  linkedWatcher = fs.watch(linkedDirectory, { recursive: true }, () => scheduleResolumeRefresh(window));
  linkedPoller = setInterval(() => scheduleResolumeRefresh(window), 1500);
  return initial;
}

function createWindow() {
  const window = new BrowserWindow({
    title: "LO2S Pattern Lab",
    width: 1440,
    height: 940,
    minWidth: 1024,
    minHeight: 680,
    center: true,
    show: false,
    backgroundColor: "#18191B",
    icon: path.join(appRoot, "icons", "icon.ico"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(appRoot, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());
  window.on("closed", stopResolumeLink);
  window.loadFile(path.join(appRoot, "dist", "index.html"));
}

app.whenReady().then(() => {
  protocol.interceptFileProtocol("file", (request, callback) => callback({ path: resolveFileRequest(request.url) }));

  ipcMain.handle("resolume:choose-xml", async () => {
    const result = await dialog.showOpenDialog({
      title: "Choose Resolume Advanced Output XML",
      defaultPath: path.join(app.getPath("documents"), "Resolume Arena", "Presets", "Advanced Output"),
      properties: ["openFile"],
      filters: [{ name: "Resolume Advanced Output XML", extensions: ["xml"] }],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false, cancelled: true };
    stopResolumeLink();
    try { return await readXmlFile(result.filePaths[0]); }
    catch (error) { return { ok: false, error: error.message }; }
  });

  ipcMain.handle("resolume:link-latest", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return { ok: false, error: "The application window is unavailable." };
    try { return await startResolumeLink(window); }
    catch (error) { stopResolumeLink(); return { ok: false, error: `Unable to link Resolume: ${error.message}` }; }
  });

  ipcMain.handle("resolume:unlink", async () => { stopResolumeLink(); return { ok: true }; });

  session.defaultSession.on("will-download", (_event, item) => {
    item.setSaveDialogOptions({ title: "Save LO2S test pattern", defaultPath: item.getFilename(), filters: [{ name: "PNG image", extensions: ["png"] }] });
  });

  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("before-quit", stopResolumeLink);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
