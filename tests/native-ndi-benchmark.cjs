const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = process.argv[2];
const quality = process.argv[3] === "quality" ? "quality" : "latency";
if (!source) { console.error("Usage: native-ndi-benchmark.cjs <source-id> [latency|quality]"); process.exit(2); }
const addon = require(path.join(root, "desktop", "native", "lo2s-shared-frame.node"));
const bridge = spawn(path.join(root, "desktop", "native", "lo2s-source-bridge.exe"), ["--capture", "ndi", "--source", source, "--quality", quality], { windowsHide: true });
let stderr = "", opened = false, target = null, samples = 0, copyMs = 0, lastFrame = null;
const started = Date.now();
const finish = (error) => {
  clearInterval(poll);
  addon.close();
  try { bridge.stdin.write("q"); } catch {}
  if (error) { console.error(error); process.exit(1); }
  const seconds = Math.max(0.001, (Date.now() - started) / 1000);
  console.log(JSON.stringify({ quality, seconds, displayedFps: samples / seconds, captured: lastFrame?.captured || 0, published: lastFrame?.published || 0, overwritten: lastFrame?.overwritten || 0, conversionMs: lastFrame?.published ? lastFrame.conversionMsTotal / lastFrame.published : 0, copyMs: samples ? copyMs / samples : 0 }, null, 2));
  process.exit(0);
};
bridge.stderr.on("data", (chunk) => {
  stderr += chunk.toString("utf8");
  let lineEnd;
  while ((lineEnd = stderr.indexOf("\n")) >= 0) {
    const line = stderr.slice(0, lineEnd).trim();
    stderr = stderr.slice(lineEnd + 1);
    if (!line) continue;
    const status = JSON.parse(line);
    if (status.status === "error") finish(status.name);
    if (status.transport === "shared-memory") {
      const result = addon.open(status.mapping);
      if (!result.ok) finish("Unable to open the NDI shared-memory mapping.");
      target = new Uint8ClampedArray(result.payloadBytes);
      opened = true;
    }
  }
});
bridge.on("exit", (code) => { if (!opened && code) finish(`NDI bridge exited with ${code}.`); });
const poll = setInterval(() => {
  if (!opened) return;
  const frame = addon.readLatest(target);
  lastFrame = frame;
  if (frame.frame) { samples += 1; copyMs += frame.copyMs || 0; }
  if (Date.now() - started >= 8000) finish();
}, 16);
setTimeout(() => { if (!opened) finish("NDI did not create a shared-memory frame buffer within ten seconds."); }, 10000);
