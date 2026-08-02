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
  assert.match(page, /function logoDimensions/);
  assert.match(page, /const logoCenter = drawSliceInformation/);
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
  assert.match(page, /8 \/ baseScale/);
  assert.match(page, /zoomRef\.current/);
  assert.match(page, /requestAnimationFrame/);
  assert.match(page, /selectionMarquee/);
  assert.match(page, /const beginInteraction/);
  assert.match(page, /const endInteraction/);
  assert.match(page, /insideCanvas/);
  assert.match(page, /selection\.initialIds/);
  assert.match(page, /const selectedBoolean/);
  assert.match(page, /selectedSlices\.every/);
  assert.match(page, /selectedBoolean\("showLabels"/);
  assert.match(page, /selectedBoolean\("showCheckerboard"/);
  assert.match(page, /selectedBoolean\("logoVisible"/);
  assert.match(css, /selection-marquee/);
  assert.match(page, /canvas\.width = Math\.max\(1, Math\.round\(width\)\)/);
  assert.match(page, /const box = canvas\.getBoundingClientRect\(\)/);
  assert.match(page, /\(clientX - centerX\) \* \(1 - ratio\)/);
  assert.doesNotMatch(page, /maxArea = preview/);
  assert.doesNotMatch(page, /globalAlpha = 0\.(62|78)/);
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

test("keeps the desktop beta hotfix safeguards in source", async () => {
  const [page, geometry, preload, desktop, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/three-simulation.tsx", import.meta.url), "utf8"),
    readFile(new URL("../desktop/preload.cjs", import.meta.url), "utf8"),
    readFile(new URL("../desktop/electron-main.cjs", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /Pattern Lab V\.\{DISPLAY_VERSION\}/);
  assert.match(page, /max="360"/);
  assert.match(page, /invalidCurvedDepthSlices/);
  assert.match(page, /document\.fullscreenElement === host/);
  assert.match(page, /lo2s-update-dismissed/);
  assert.match(geometry, /clamp\(curvature\.horizontal \|\| 0, -360, 360\)/);
  assert.match(geometry, /clamp\(curvature\.vertical \|\| 0, -360, 360\)/);
  assert.match(geometry, /closedHorizontal/);
  assert.match(geometry, /closedVertical/);
  assert.match(page, /Locked by vertical curve/);
  assert.match(page, /Locked by horizontal curve/);
  assert.match(page, /function CurvatureNumberInput/);
  assert.match(page, /evaluateExpression\(draft, true\)/);
  assert.match(page, /onCommit=\{\(value\) => applySimulationCurvature\("horizontal", value\)\}/);
  assert.match(page, /onCommit=\{\(value\) => applySimulationCurvature\("vertical", value\)\}/);
  assert.match(page, /increment = shifted \? 0\.5 : 0\.1/);
  assert.match(page, /className="field-stepper"/);
  assert.match(page, /const PIXEL_PITCH_PRESETS = \[1\.2, 1\.5, 1\.9, 2\.5, 2\.6, 2\.9, 3\.9, 4\.8, 5\.9, 10\]/);
  assert.match(page, /aria-label="Pixel pitch presets"/);
  assert.match(page, /function PreciseNumberInput/);
  assert.match(page, /const lineScale = clamp\(config\.lineWidth, 1, 12\)/);
  assert.match(page, /Math\.max\(2, width \/ 1000\) \* lineScale/);
  assert.match(css, /\.pitch-presets/);
  assert.match(css, /\.range-row\.precise>\.precise-stepper\{grid-column:2!important;grid-row:2/);
  assert.match(page, /lo2s-history-navigation/);
  assert.doesNotMatch(page, /event\.target instanceof HTMLInputElement \|\| event\.target instanceof HTMLTextAreaElement/);
  assert.match(css, /\.precise-stepper/);
  assert.match(page, /onNativeSourceMetrics/);
  assert.match(preload, /app:check-update/);
  assert.match(preload, /lo2s-shared-frame\.node/);
  assert.match(preload, /conversionMs/);
  assert.match(desktop, /releases\/latest/);
  assert.doesNotMatch(preload, /viewer:fullscreen/);
  assert.doesNotMatch(css, /viewer-fullscreen/);
});
