const { spawn } = require("node:child_process");
const path = require("node:path");

(() => {
  const root = path.resolve(__dirname, "..");
  const nativeDirectory = process.env.LO2S_PACKAGED_NATIVE || path.join(root, "desktop", "native");
  const addon = require(path.join(nativeDirectory, "lo2s-shared-frame.node"));
  const bridge = spawn(path.join(nativeDirectory, "lo2s-source-bridge.exe"), ["--self-test-shared"], { windowsHide: true });
  let stderr = "", opened = false, copied = false;
  const target = new Uint8ClampedArray(4 * 2 * 4);
  const finish = (error) => {
    clearInterval(poll);
    addon.close();
    try { bridge.kill(); } catch {}
    if (error) { console.error(error); process.exit(1); } else { console.log("shared-memory-smoke: ok"); process.exit(0); }
  };
  bridge.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
    const lineEnd = stderr.indexOf("\n");
    if (lineEnd < 0 || opened) return;
    const status = JSON.parse(stderr.slice(0, lineEnd));
    const result = addon.open(status.mapping);
    if (!result.ok || result.width !== 4 || result.height !== 2) finish("Unable to open the native shared-memory test mapping.");
    else opened = true;
  });
  const poll = setInterval(() => {
    if (!opened) return;
    const frame = addon.readLatest(target);
    if (frame.frame && target[3] === 255 && target[1] === 80 && target[2] === 160) { copied = true; finish(); }
  }, 5);
  setTimeout(() => { if (!copied) finish("No valid shared-memory frame arrived within two seconds."); }, 2000);
})();
