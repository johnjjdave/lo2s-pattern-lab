const { app, BrowserWindow, dialog, ipcMain, net, protocol, session, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { execFile, spawn } = require("node:child_process");
const { fileURLToPath } = require("node:url");
const { promisify } = require("node:util");

const appRoot = __dirname;
const MAX_XML_BYTES = 32 * 1024 * 1024;
let linkedDirectory = null;
let linkedWatcher = null;
let linkedPoller = null;
let linkedDebounce = null;
let lastLinkedSignature = "";
let nativeSourceProcess = null;
let nativeSourceOwner = null;
let nativeFramePending = false;
let exportDirectories = null;
const execFileAsync = promisify(execFile);
let nativeBridgePath = path.join(appRoot, "native", "lo2s-source-bridge.exe");

function numericVersion(value) {
  return String(value || "").replace(/^v/i, "").split("-")[0].split(".").map((part) => Number.parseInt(part, 10) || 0);
}

function isNewerVersion(candidate, current) {
  const left = numericVersion(candidate), right = numericVersion(current);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] || 0) !== (right[index] || 0)) return (left[index] || 0) > (right[index] || 0);
  }
  return false;
}

async function checkForUpdate() {
  try {
    const response = await net.fetch("https://api.github.com/repos/johnjjdave/lo2s-pattern-lab/releases/latest", {
      headers: { Accept: "application/vnd.github+json", "User-Agent": `LO2S-Pattern-Lab/${app.getVersion()}` },
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    const release = await response.json();
    const latestVersion = String(release.tag_name || "").replace(/^v/i, "");
    return { ok: true, available: isNewerVersion(latestVersion, app.getVersion()), currentVersion: app.getVersion(), latestVersion, name: release.name || release.tag_name, url: release.html_url };
  } catch (error) {
    return { ok: false, available: false, currentVersion: app.getVersion(), error: error.message || "Unable to check for updates." };
  }
}

async function loadExportDirectories() {
  if (exportDirectories) return exportDirectories;
  try { exportDirectories = JSON.parse(await fs.promises.readFile(path.join(app.getPath("userData"), "export-locations.json"), "utf8")); }
  catch { exportDirectories = {}; }
  return exportDirectories;
}

async function rememberExportDirectory(category, filePath) {
  const directories = await loadExportDirectories();
  directories[category] = path.dirname(filePath);
  await fs.promises.mkdir(app.getPath("userData"), { recursive: true });
  await fs.promises.writeFile(path.join(app.getPath("userData"), "export-locations.json"), JSON.stringify(directories));
}

async function prepareNativeBridge() {
  if (!app.isPackaged) return;
  const bundledDirectory = path.join(process.resourcesPath, "app.asar.unpacked", "native");
  const installedDirectory = path.join(app.getPath("userData"), "native", app.getVersion());
  await fs.promises.mkdir(installedDirectory, { recursive: true });
  for (const filename of ["lo2s-source-bridge.exe", "SpoutLibrary.dll"]) {
    await fs.promises.copyFile(path.join(bundledDirectory, filename), path.join(installedDirectory, filename));
  }
  nativeBridgePath = path.join(installedDirectory, "lo2s-source-bridge.exe");
}

class NativeFrameParser {
  constructor(onFrame) {
    this.chunks = [];
    this.byteLength = 0;
    this.expectedPayload = null;
    this.header = null;
    this.onFrame = onFrame;
  }

  push(chunk) {
    this.chunks.push(chunk);
    this.byteLength += chunk.length;
    while (true) {
      if (!this.header) {
        if (this.byteLength < 32) return;
        const header = this.consume(32);
        if (header.readUInt32LE(0) !== 0x4632534c || header.readUInt32LE(4) !== 1) throw new Error("The native source bridge returned an invalid frame.");
        this.header = {
          width: header.readUInt32LE(8), height: header.readUInt32LE(12), stride: header.readUInt32LE(16),
          fpsN: header.readUInt32LE(20), fpsD: header.readUInt32LE(24),
        };
        this.expectedPayload = header.readUInt32LE(28);
        if (!this.expectedPayload || this.expectedPayload > 256 * 1024 * 1024) throw new Error("The native source frame is outside the supported size.");
      }
      if (this.byteLength < this.expectedPayload) return;
      const data = this.consume(this.expectedPayload);
      const frame = { ...this.header, data };
      this.header = null;
      this.expectedPayload = null;
      this.onFrame(frame);
    }
  }

  consume(size) {
    const result = Buffer.allocUnsafe(size);
    let offset = 0;
    while (offset < size) {
      const chunk = this.chunks[0];
      const count = Math.min(chunk.length, size - offset);
      chunk.copy(result, offset, 0, count);
      offset += count;
      this.byteLength -= count;
      if (count === chunk.length) this.chunks.shift(); else this.chunks[0] = chunk.subarray(count);
    }
    return result;
  }
}

async function stopNativeSource() {
  const child = nativeSourceProcess;
  nativeSourceProcess = null;
  nativeSourceOwner = null;
  nativeFramePending = false;
  if (!child || child.killed) return;
  try { child.stdin?.write("q"); } catch {}
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => { if (settled) return; settled = true; clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => { try { child.kill(); } catch {} finish(); }, 900);
    child.once("exit", finish);
  });
}

async function listNativeSources(kind) {
  if (!fs.existsSync(nativeBridgePath)) return { ok: false, error: "The native source receiver is missing from this beta." };
  try {
    const { stdout } = await execFileAsync(nativeBridgePath, ["--list", kind], { windowsHide: true, timeout: 11000, maxBuffer: 1024 * 1024 });
    return JSON.parse(stdout.trim());
  } catch (error) {
    return { ok: false, error: error.message || "Unable to scan native sources." };
  }
}

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
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  window.once("ready-to-show", () => window.show());
  window.on("closed", () => { stopResolumeLink(); void stopNativeSource(); });
  window.loadFile(path.join(appRoot, "dist", "index.html"));
}

app.whenReady().then(async () => {
  try { await prepareNativeBridge(); }
  catch (error) { console.error("Unable to prepare native source bridge:", error); }
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

  ipcMain.handle("source:list", async (_event, kind) => {
    if (kind !== "ndi" && kind !== "spout") return { ok: false, error: "Choose NDI or Spout before scanning." };
    return listNativeSources(kind);
  });

  ipcMain.handle("source:connect", async (event, payload) => {
    const kind = payload?.kind;
    if (kind !== "ndi" && kind !== "spout") return { ok: false, error: "Choose NDI or Spout before connecting." };
    if (!fs.existsSync(nativeBridgePath)) return { ok: false, error: "The native source receiver is missing from this beta." };
    await stopNativeSource();
    const args = ["--capture", kind, "--source", String(payload?.sourceId || ""), "--quality", payload?.quality === "quality" ? "quality" : "latency"];
    const child = spawn(nativeBridgePath, args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    nativeSourceProcess = child;
    nativeSourceOwner = event.sender;
    const parser = new NativeFrameParser((frame) => {
      if (!nativeSourceOwner || nativeSourceOwner.isDestroyed() || nativeFramePending) return;
      nativeFramePending = true;
      nativeSourceOwner.send("source:frame", frame);
    });
    child.stdout.on("data", (chunk) => {
      try { parser.push(chunk); }
      catch (error) { if (nativeSourceOwner && !nativeSourceOwner.isDestroyed()) nativeSourceOwner.send("source:status", { status: "error", name: error.message }); void stopNativeSource(); }
    });
    let stderrBuffer = "";
    child.stderr.on("data", (chunk) => {
      stderrBuffer += chunk.toString("utf8");
      const lines = stderrBuffer.split(/\r?\n/);
      stderrBuffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim() || !nativeSourceOwner || nativeSourceOwner.isDestroyed()) continue;
        try { nativeSourceOwner.send("source:status", JSON.parse(line)); }
        catch { nativeSourceOwner.send("source:status", { status: "message", name: line.trim() }); }
      }
    });
    child.once("error", (error) => {
      if (nativeSourceOwner && !nativeSourceOwner.isDestroyed()) nativeSourceOwner.send("source:status", { status: "error", name: error.message });
      void stopNativeSource();
    });
    child.once("exit", (code) => {
      if (nativeSourceProcess !== child) return;
      if (nativeSourceOwner && !nativeSourceOwner.isDestroyed()) nativeSourceOwner.send("source:status", { status: code === 0 ? "disconnected" : "error", name: code === 0 ? "Source disconnected" : `Native receiver stopped (${code})` });
      nativeSourceProcess = null;
      nativeSourceOwner = null;
      nativeFramePending = false;
    });
    return { ok: true };
  });

  ipcMain.handle("source:disconnect", async () => { await stopNativeSource(); return { ok: true }; });
  ipcMain.handle("app:check-update", checkForUpdate);
  ipcMain.handle("app:open-external", async (_event, requestedUrl) => {
    const url = new URL(String(requestedUrl || ""));
    if (url.protocol !== "https:" || url.hostname !== "github.com") return { ok: false };
    await shell.openExternal(url.href);
    return { ok: true };
  });
  ipcMain.on("source:frame-ready", (event) => {
    if (event.sender !== nativeSourceOwner) return;
    nativeFramePending = false;
    try { nativeSourceProcess?.stdin?.write("a"); } catch {}
  });

  ipcMain.handle("export:save", async (_event, payload) => {
    const filename = path.basename(String(payload?.filename || "lo2s-scene.glb"));
    const category = payload?.category === "png" ? "png" : "scene3d";
    const extension = path.extname(filename).slice(1).toLowerCase();
    const labels = { png: "PNG image", glb: "glTF Binary", zip: "ZIP package", mvr: "MVR 1.5 scene meshes", obj: "Wavefront OBJ", gltf: "glTF scene" };
    const directories = await loadExportDirectories();
    const result = await dialog.showSaveDialog({
      title: category === "png" ? "Export LO2S PNG" : "Export LO2S 3D scene",
      defaultPath: path.join(directories[category] || app.getPath("documents"), filename),
      filters: [{ name: labels[extension] || "3D scene", extensions: [extension || "glb"] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, cancelled: true };
    try {
      await fs.promises.writeFile(result.filePath, Buffer.from(payload.data));
      await rememberExportDirectory(category, result.filePath);
      return { ok: true, path: result.filePath };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => permission === "media" || permission === "fullscreen");
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => callback(permission === "media" || permission === "fullscreen"));

  session.defaultSession.on("will-download", (_event, item) => {
    const extension = path.extname(item.getFilename()).slice(1).toLowerCase() || "png";
    item.setSaveDialogOptions({ title: "Save LO2S file", defaultPath: item.getFilename(), filters: [{ name: extension === "png" ? "PNG image" : "LO2S export", extensions: [extension] }] });
  });

  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("before-quit", () => { stopResolumeLink(); void stopNativeSource(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
