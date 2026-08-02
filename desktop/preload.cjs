const { contextBridge, ipcRenderer } = require("electron");
const path = require("node:path");

let sharedFrames = null;
try { sharedFrames = require(path.join(__dirname, "native", "lo2s-shared-frame.node")); } catch {}
let sharedCanvas = null;
let sharedImage = null;
let sharedAnimation = 0;
let sharedMetricsAt = 0;
let sharedDisplayed = 0;
let sharedCopyMs = 0;
let sharedCanvasMs = 0;
let sharedLastCounters = { captured: 0, published: 0, overwritten: 0, displayed: 0 };
const sharedMetricListeners = new Set();

function ensureSharedCanvas(width, height) {
  sharedCanvas = document.getElementById("lo2s-native-shared-canvas");
  if (!sharedCanvas) {
    sharedCanvas = document.createElement("canvas");
    sharedCanvas.id = "lo2s-native-shared-canvas";
    sharedCanvas.hidden = true;
    document.documentElement.appendChild(sharedCanvas);
  }
  if (sharedCanvas.width !== width || sharedCanvas.height !== height) {
    sharedCanvas.width = width;
    sharedCanvas.height = height;
    sharedImage = new ImageData(width, height);
  }
  return sharedCanvas;
}

function stopSharedFrames() {
  if (sharedAnimation) cancelAnimationFrame(sharedAnimation);
  sharedAnimation = 0;
  sharedFrames?.close?.();
  sharedImage = null;
  sharedDisplayed = 0;
  sharedCopyMs = 0;
  sharedCanvasMs = 0;
  sharedMetricsAt = 0;
  sharedLastCounters = { captured: 0, published: 0, overwritten: 0, displayed: 0 };
}

function startSharedFrames(status) {
  stopSharedFrames();
  if (!sharedFrames || !status.mapping) return false;
  const opened = sharedFrames.open(status.mapping);
  if (!opened?.ok) return false;
  const canvas = ensureSharedCanvas(opened.width, opened.height);
  const context = canvas.getContext("2d", { alpha: true });
  if (!context || !sharedImage) return false;
  sharedMetricsAt = performance.now();
  const renderLatest = (now) => {
    const frame = sharedFrames.readLatest(sharedImage.data);
    if (frame?.frame) {
      const canvasStarted = performance.now();
      context.putImageData(sharedImage, 0, 0);
      sharedCanvasMs += performance.now() - canvasStarted;
      sharedCopyMs += frame.copyMs || 0;
      sharedDisplayed += 1;
      canvas.dataset.frameVersion = String(frame.sequence || sharedDisplayed);
    }
    if (frame && now - sharedMetricsAt >= 1000) {
      const seconds = Math.max(0.001, (now - sharedMetricsAt) / 1000);
      const displayedDelta = sharedDisplayed - sharedLastCounters.displayed;
      const publishedDelta = (frame.published || 0) - sharedLastCounters.published;
      const metrics = {
        transport: "shared-memory",
        captureFps: ((frame.captured || 0) - sharedLastCounters.captured) / seconds,
        publishedFps: publishedDelta / seconds,
        displayedFps: displayedDelta / seconds,
        conversionMs: frame.published ? (frame.conversionMsTotal || 0) / frame.published : 0,
        copyMs: displayedDelta ? sharedCopyMs / displayedDelta : 0,
        canvasMs: displayedDelta ? sharedCanvasMs / displayedDelta : 0,
        overwritten: (frame.overwritten || 0) - sharedLastCounters.overwritten,
      };
      sharedMetricListeners.forEach((listener) => listener(metrics));
      sharedLastCounters = { captured: frame.captured || 0, published: frame.published || 0, overwritten: frame.overwritten || 0, displayed: sharedDisplayed };
      sharedCopyMs = 0;
      sharedCanvasMs = 0;
      sharedMetricsAt = now;
    }
    sharedAnimation = requestAnimationFrame(renderLatest);
  };
  sharedAnimation = requestAnimationFrame(renderLatest);
  return true;
}

contextBridge.exposeInMainWorld("lo2sDesktop", {
  chooseResolumeXml: () => ipcRenderer.invoke("resolume:choose-xml"),
  linkLatestResolumeMap: () => ipcRenderer.invoke("resolume:link-latest"),
  unlinkResolumeMap: () => ipcRenderer.invoke("resolume:unlink"),
  saveExport: (filename, mimeType, data, category) => ipcRenderer.invoke("export:save", { filename, mimeType, data, category }),
  listNativeSources: (kind) => ipcRenderer.invoke("source:list", kind),
  connectNativeSource: (kind, sourceId, quality) => { stopSharedFrames(); return ipcRenderer.invoke("source:connect", { kind, sourceId, quality }); },
  disconnectNativeSource: () => { stopSharedFrames(); return ipcRenderer.invoke("source:disconnect"); },
  checkForUpdates: () => ipcRenderer.invoke("app:check-update"),
  openExternal: (url) => ipcRenderer.invoke("app:open-external", url),
  nativeSourceFrameReady: () => ipcRenderer.send("source:frame-ready"),
  onNativeSourceFrame: (callback) => {
    const listener = (_event, frame) => callback(frame);
    ipcRenderer.on("source:frame", listener);
    return () => ipcRenderer.removeListener("source:frame", listener);
  },
  onNativeSourceStatus: (callback) => {
    const listener = (_event, status) => {
      if (status?.transport === "shared-memory" && !startSharedFrames(status)) callback({ status: "error", name: "The NDI shared-memory transport could not open." });
      else callback(status);
    };
    ipcRenderer.on("source:status", listener);
    return () => ipcRenderer.removeListener("source:status", listener);
  },
  onNativeSourceMetrics: (callback) => { sharedMetricListeners.add(callback); return () => sharedMetricListeners.delete(callback); },
  onResolumeXmlUpdated: (callback) => {
    const listener = (_event, result) => callback(result);
    ipcRenderer.on("resolume:xml-updated", listener);
    return () => ipcRenderer.removeListener("resolume:xml-updated", listener);
  },
  onResolumeLinkError: (callback) => {
    const listener = (_event, result) => callback(result);
    ipcRenderer.on("resolume:link-error", listener);
    return () => ipcRenderer.removeListener("resolume:link-error", listener);
  },
});
