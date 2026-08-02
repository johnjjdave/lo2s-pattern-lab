const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lo2sDesktop", {
  chooseResolumeXml: () => ipcRenderer.invoke("resolume:choose-xml"),
  linkLatestResolumeMap: () => ipcRenderer.invoke("resolume:link-latest"),
  unlinkResolumeMap: () => ipcRenderer.invoke("resolume:unlink"),
  saveExport: (filename, mimeType, data, category) => ipcRenderer.invoke("export:save", { filename, mimeType, data, category }),
  listNativeSources: (kind) => ipcRenderer.invoke("source:list", kind),
  connectNativeSource: (kind, sourceId, quality) => ipcRenderer.invoke("source:connect", { kind, sourceId, quality }),
  disconnectNativeSource: () => ipcRenderer.invoke("source:disconnect"),
  setViewerFullscreen: (enabled) => ipcRenderer.invoke("viewer:fullscreen", Boolean(enabled)),
  onViewerFullscreenChanged: (callback) => {
    const listener = (_event, enabled) => callback(Boolean(enabled));
    ipcRenderer.on("viewer:fullscreen-changed", listener);
    return () => ipcRenderer.removeListener("viewer:fullscreen-changed", listener);
  },
  nativeSourceFrameReady: () => ipcRenderer.send("source:frame-ready"),
  onNativeSourceFrame: (callback) => {
    const listener = (_event, frame) => callback(frame);
    ipcRenderer.on("source:frame", listener);
    return () => ipcRenderer.removeListener("source:frame", listener);
  },
  onNativeSourceStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("source:status", listener);
    return () => ipcRenderer.removeListener("source:status", listener);
  },
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
