import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the LO2S Pattern Lab workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>LO2S Pattern Lab/);
  assert.match(html, /Resolume Pixel Map/);
  assert.match(html, /Linked wall calculator/);
  assert.match(html, /Fit Canvas/);
  assert.match(html, /Actual 1:1/);
  assert.match(html, /Export Current PNG/);
  assert.match(html, /Pixel pitch/);
  assert.match(html, /mm/);
  assert.doesNotMatch(html, /codex-preview|Building your site/);
});

test("keeps pixel-map and arithmetic features in the product source", async () => {
  const [page, css, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /function evaluateExpression/);
  assert.match(page, /function parseResolumeXml/);
  assert.match(page, /function automaticSliceColors/);
  assert.match(page, /function drawSliceInformation/);
  assert.match(page, /coordinatesPosition/);
  assert.match(page, /physicalSizePosition/);
  assert.match(page, /infoOrientation/);
  assert.match(page, /ResizeObserver/);
  assert.match(page, /showPatternCheckerboard: false/);
  assert.match(page, /Cabinet Checker/);
  assert.match(page, /Metric Grid/);
  assert.match(page, /Cabinet IDs/);
  assert.match(page, /Color Bars/);
  assert.match(page, /Grayscale/);
  assert.match(page, /Pixel Check/);
  assert.match(page, /Per slice/);
  assert.match(page, /Across map/);
  assert.match(page, /Apply global to all slices/);
  assert.match(page, /customLogoPosition/);
  assert.match(page, /event\.clientX, event\.clientY/);
  assert.match(page, /Export Output Maps/);
  assert.match(page, /Export Selected Slice/);
  assert.match(page, /Transparent/);
  assert.match(page, /middle mouse|Middle mouse|event\.button === 1/);
  assert.doesNotMatch(page, /Checker size/);
  assert.match(page, /showDirectoryPicker/);
  assert.match(page, /requestFullscreen/);
  assert.match(css, /overflow:hidden/);
  assert.match(css, /data-fullscreen-mode=fit/);
  assert.match(css, /data-fullscreen-mode=actual/);
  assert.match(layout, /Resolume pixel maps/);
});
