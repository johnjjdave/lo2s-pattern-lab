import { spawn } from "node:child_process";

const [bridge, kind, source, quality = "latency", requestedFrames = "60"] = process.argv.slice(2);
if (!bridge || !kind || !source) throw new Error("Usage: node source-bridge-benchmark.mjs <bridge> <ndi|spout> <source> <latency|quality> [frames]");

const targetFrames = Number(requestedFrames);
const child = spawn(bridge, ["--capture", kind, "--source", source, "--quality", quality], { stdio: ["pipe", "pipe", "pipe"] });
let bytes = Buffer.alloc(0), payloadBytes = null, frameCount = 0, firstAt = 0, lastAt = 0, lastSize = "";
child.stderr.on("data", (chunk) => process.stderr.write(chunk));
child.stdout.on("data", (chunk) => {
  bytes = Buffer.concat([bytes, chunk]);
  while (true) {
    if (payloadBytes === null) {
      if (bytes.length < 32) return;
      const header = bytes.subarray(0, 32);
      bytes = bytes.subarray(32);
      if (header.readUInt32LE(0) !== 0x4632534c) throw new Error("Invalid frame header");
      payloadBytes = header.readUInt32LE(28);
      lastSize = `${header.readUInt32LE(8)}x${header.readUInt32LE(12)}`;
    }
    if (bytes.length < payloadBytes) return;
    bytes = bytes.subarray(payloadBytes);
    payloadBytes = null;
    const now = performance.now();
    if (!firstAt) firstAt = now;
    lastAt = now;
    frameCount += 1;
    child.stdin.write("a");
    if (frameCount >= targetFrames) {
      child.stdin.write("q");
      const elapsed = Math.max(1, lastAt - firstAt);
      console.log(JSON.stringify({ kind, quality, frames: frameCount, size: lastSize, fps: (frameCount - 1) * 1000 / elapsed, frameMs: elapsed / Math.max(1, frameCount - 1) }));
      setTimeout(() => child.kill(), 200);
      return;
    }
  }
});
setTimeout(() => { child.kill(); throw new Error("Benchmark timed out"); }, 30000).unref();
