const { app, BrowserWindow, protocol, session } = require("electron");
const path = require("node:path");
const { fileURLToPath } = require("node:url");

const appRoot = __dirname;

function resolveFileRequest(requestUrl) {
  const parsed = new URL(requestUrl);
  let requestPath = fileURLToPath(parsed);

  if (
    requestPath.startsWith(`${path.sep}brand${path.sep}`) ||
    requestPath.startsWith(`brand${path.sep}`)
  ) {
    requestPath = requestPath.replace(
      new RegExp(`^${path.sep}?brand${path.sep}`),
      "",
    );
    return path.join(appRoot, "dist", "brand", requestPath);
  }

  return requestPath;
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
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());
  window.loadFile(path.join(appRoot, "dist", "index.html"));
}

app.whenReady().then(() => {
  protocol.interceptFileProtocol("file", (request, callback) => {
    callback({ path: resolveFileRequest(request.url) });
  });

  session.defaultSession.on("will-download", (_event, item) => {
    item.setSaveDialogOptions({
      title: "Save LO2S test pattern",
      defaultPath: item.getFilename(),
      filters: [{ name: "PNG image", extensions: ["png"] }],
    });
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
