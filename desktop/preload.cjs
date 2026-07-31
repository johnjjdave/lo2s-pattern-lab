const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lo2sDesktop", {
  chooseResolumeXml: () => ipcRenderer.invoke("resolume:choose-xml"),
  linkLatestResolumeMap: () => ipcRenderer.invoke("resolume:link-latest"),
  unlinkResolumeMap: () => ipcRenderer.invoke("resolume:unlink"),
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
