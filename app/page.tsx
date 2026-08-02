"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ThreeSimulation, { type CameraState, type SimulationSource, type SliceCurvature, type SlicePivot, type SliceTransform, type TransformMode } from "./three-simulation";
import { exportSimulationScene, type SceneExportFormat } from "./scene-export";

type PatternType = "metric" | "cabinet" | "color" | "gray" | "pixel";
type WorkspaceMode = "patterns" | "resolume" | "simulation";
type MapView = "input" | "output";
type ControlTab = "setup" | "overlays" | "info" | "deco" | "logo" | "scene" | "sources";
type FullscreenMode = "fit" | "actual";
type CalculatorGroup = "physical" | "raster" | "pitch";
type BackgroundMode = "black" | "transparent";
type MapFill = "checker" | PatternType;
type PatternScope = "slice" | "map";
type LogoPosition = "top-left" | "top-center" | "top-right" | "center-left" | "center" | "center-right" | "bottom-left" | "bottom-center" | "bottom-right";
type InfoPosition = LogoPosition | "hidden";
type InfoOrientation = "normal" | "rotate-90" | "rotate-180" | "rotate-270";
type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number; points: Point[] };

type PatternConfig = {
  project: string;
  wallWidth: number;
  wallHeight: number;
  resolutionWidth: number;
  resolutionHeight: number;
  pixelPitchMm: number;
  cabinetWidth: number;
  cabinetHeight: number;
  pattern: PatternType;
  showPatternCheckerboard: boolean;
  showCheckerboard: boolean;
  showLabels: boolean;
  showDiagonals: boolean;
  showCircles: boolean;
  showSafeArea: boolean;
  labelColor: string;
  diagonalColor: string;
  circleColor: string;
  safeAreaColor: string;
  metricGridColor: string;
  checkerColorA: string;
  checkerColorB: string;
  lineWidth: number;
  customLogoScale: number;
  customLogoOpacity: number;
  customLogoPosition: LogoPosition;
  showLogo: boolean;
  labelPosition: "top" | "center" | "bottom";
  labelNameScale: number;
  labelDataScale: number;
  infoOrientation: InfoOrientation;
  namePosition: InfoPosition;
  coordinatesPosition: InfoPosition;
  resolutionPosition: InfoPosition;
  aspectPosition: InfoPosition;
  physicalSizePosition: InfoPosition;
  showCenterDot: boolean;
  centerDotColor: string;
  centerDotSize: number;
  mapFill: MapFill;
  mapPatternScope: PatternScope;
  backgroundMode: BackgroundMode;
};

type ResolumeSlice = { id: string; name: string; screenName: string; input: Rect; output: Rect; warped: boolean; paletteIndex: number };
type ResolumeScreen = { name: string; width: number; height: number; slices: ResolumeSlice[] };
type ResolumeMap = { name: string; compositionWidth: number; compositionHeight: number; version: string; screens: ResolumeScreen[] };
type SliceOverride = Partial<Pick<PatternConfig, "cabinetWidth" | "cabinetHeight" | "pixelPitchMm" | "checkerColorA" | "checkerColorB" | "metricGridColor" | "diagonalColor" | "circleColor" | "safeAreaColor" | "lineWidth" | "showCheckerboard" | "showLabels" | "showDiagonals" | "showCircles" | "showSafeArea" | "labelNameScale" | "labelDataScale" | "infoOrientation" | "namePosition" | "coordinatesPosition" | "resolutionPosition" | "aspectPosition" | "physicalSizePosition" | "showCenterDot" | "centerDotColor" | "centerDotSize">> & { logoScale?: number; logoVisible?: boolean; logoPosition?: LogoPosition };
type SimulationSnapshot = { transforms: Record<string, SliceTransform>; depthM: number; curvature: SliceCurvature; curvatureOverrides: Record<string, SliceCurvature>; source: SimulationSource; quality: "latency" | "quality"; sourceOverrides: Record<string, "inherit" | SimulationSource>; transformSpace: "local" | "world"; pivot: SlicePivot; pivotOverrides: Record<string, SlicePivot>; gridVisible: boolean; floorVisible: boolean; backgroundLevel: number };
type HistoryEntry = { label: string; state: SimulationSnapshot };
type FileHandle = { createWritable: () => Promise<{ write: (data: Blob | string) => Promise<void>; close: () => Promise<void> }> };
type DirectoryHandle = { getFileHandle: (name: string, options: { create: boolean }) => Promise<FileHandle> };
type DesktopXmlResult = { ok: boolean; cancelled?: boolean; linked?: boolean; path?: string; name?: string; mtimeMs?: number; content?: string; error?: string };
type NativeSourceInfo = { id: string; name: string };
type NativeSourceFrame = { width: number; height: number; stride: number; fpsN: number; fpsD: number; data: Uint8Array };
type NativeSourceStatus = { status: "connecting" | "connected" | "disconnected" | "error" | "message"; name: string; width?: number; height?: number; fps?: number };
type DesktopBridge = {
  chooseResolumeXml: () => Promise<DesktopXmlResult>;
  linkLatestResolumeMap: () => Promise<DesktopXmlResult>;
  unlinkResolumeMap: () => Promise<{ ok: boolean }>;
  onResolumeXmlUpdated: (callback: (result: DesktopXmlResult) => void) => () => void;
  onResolumeLinkError: (callback: (result: { error?: string }) => void) => () => void;
  saveExport: (filename: string, mimeType: string, data: ArrayBuffer, category?: "png" | "scene3d") => Promise<{ ok: boolean; cancelled?: boolean; path?: string; error?: string }>;
  listNativeSources: (kind: "ndi" | "spout") => Promise<{ ok: boolean; sources?: NativeSourceInfo[]; error?: string }>;
  connectNativeSource: (kind: "ndi" | "spout", sourceId: string, quality: "latency" | "quality") => Promise<{ ok: boolean; error?: string }>;
  disconnectNativeSource: () => Promise<{ ok: boolean }>;
  setViewerFullscreen: (enabled: boolean) => Promise<{ ok: boolean }>;
  onViewerFullscreenChanged: (callback: (enabled: boolean) => void) => () => void;
  nativeSourceFrameReady: () => void;
  onNativeSourceFrame: (callback: (frame: NativeSourceFrame) => void) => () => void;
  onNativeSourceStatus: (callback: (status: NativeSourceStatus) => void) => () => void;
};
type PickerWindow = Window & {
  showSaveFilePicker?: (options: { suggestedName: string; types: Array<{ description: string; accept: Record<string, string[]> }> }) => Promise<FileHandle>;
  showDirectoryPicker?: () => Promise<DirectoryHandle>;
  lo2sDesktop?: DesktopBridge;
};

const DEFAULT_CONFIG: PatternConfig = {
  project: "LO2S — Main LED", wallWidth: 8, wallHeight: 4.5, resolutionWidth: 3840, resolutionHeight: 2160, pixelPitchMm: 2.0833,
  cabinetWidth: 500, cabinetHeight: 500, pattern: "metric", showPatternCheckerboard: false, showCheckerboard: true, showLabels: true, showDiagonals: true,
  showCircles: true, showSafeArea: true, labelColor: "#ff5a50", diagonalColor: "#ffffff", circleColor: "#ffffff",
  safeAreaColor: "#ffdd2d", metricGridColor: "#ff3b30", checkerColorA: "#00e6a8", checkerColorB: "#006b55",
  lineWidth: 1, customLogoScale: 100, customLogoOpacity: 100, customLogoPosition: "center", showLogo: true,
  labelPosition: "bottom", labelNameScale: 100, labelDataScale: 100, infoOrientation: "normal", namePosition: "center", coordinatesPosition: "center", resolutionPosition: "center", aspectPosition: "hidden", physicalSizePosition: "hidden", showCenterDot: false, centerDotColor: "#ff3b30", centerDotSize: 10,
  mapFill: "checker", mapPatternScope: "slice", backgroundMode: "black",
};

const PATTERNS: Array<{ id: PatternType; name: string; code: string }> = [
  { id: "metric", name: "Metric Grid", code: "M" }, { id: "cabinet", name: "Cabinet IDs", code: "ID" },
  { id: "color", name: "Color Bars", code: "RGB" }, { id: "gray", name: "Grayscale", code: "G" }, { id: "pixel", name: "Pixel Check", code: "1" },
];

const MAP_FILLS: Array<{ id: MapFill; name: string; code: string }> = [
  { id: "checker", name: "Cabinet Checker", code: "CHK" }, { id: "metric", name: "Metric Grid", code: "M" },
  { id: "cabinet", name: "Cabinet IDs", code: "ID" }, { id: "color", name: "Color Bars", code: "RGB" },
  { id: "gray", name: "Grayscale", code: "G" }, { id: "pixel", name: "Pixel Check", code: "1" },
];

const INFO_POSITIONS: Array<{ id: InfoPosition; label: string }> = [
  { id: "top-left", label: "Top Left" }, { id: "top-center", label: "Top" }, { id: "top-right", label: "Top Right" },
  { id: "center-right", label: "Right" }, { id: "bottom-right", label: "Bottom Right" }, { id: "bottom-center", label: "Bottom" },
  { id: "bottom-left", label: "Bottom Left" }, { id: "center-left", label: "Left" }, { id: "center", label: "Center" }, { id: "hidden", label: "Don't Show" },
];

const CABINET_PALETTE = ["#ef3340", "#00c878", "#7957d5", "#f4d000", "#149fd3", "#e72c9f", "#86d92f", "#f47b20", "#2454d8", "#24c8ba", "#cf3ee8", "#f2505f"];
const DEMO_RESOLUME_XML = `<?xml version="1.0" encoding="UTF-8"?>
<XmlState name="LO2S 3D Beta Demo"><versionInfo majorVersion="7" minorVersion="22" microVersion="0"/><ScreenSetup><CurrentCompositionTextureSize width="3840" height="2160"/><screens>
<Screen><Param name="Name" value="Main Stage"/><OutputDeviceVirtual width="3840" height="2160"/><layers>
<Slice uniqueId="demo-left"><Param name="Name" value="Left Tower"/><InputRect><v x="160" y="340"/><v x="960" y="340"/><v x="960" y="1900"/><v x="160" y="1900"/></InputRect><OutputRect><v x="160" y="340"/><v x="960" y="340"/><v x="960" y="1900"/><v x="160" y="1900"/></OutputRect></Slice>
<Slice uniqueId="demo-centre"><Param name="Name" value="Centre Wall"/><InputRect><v x="1040" y="580"/><v x="2800" y="580"/><v x="2800" y="1900"/><v x="1040" y="1900"/></InputRect><OutputRect><v x="1040" y="580"/><v x="2800" y="580"/><v x="2800" y="1900"/><v x="1040" y="1900"/></OutputRect></Slice>
<Slice uniqueId="demo-right"><Param name="Name" value="Right Tower"/><InputRect><v x="2880" y="340"/><v x="3680" y="340"/><v x="3680" y="1900"/><v x="2880" y="1900"/></InputRect><OutputRect><v x="2880" y="340"/><v x="3680" y="340"/><v x="3680" y="1900"/><v x="2880" y="1900"/></OutputRect></Slice>
</layers></Screen><Screen><Param name="Name" value="Header &amp; Floor"/><OutputDeviceVirtual width="3840" height="2160"/><layers>
<Slice uniqueId="demo-header"><Param name="Name" value="Header Ribbon"/><InputRect><v x="1040" y="180"/><v x="2800" y="180"/><v x="2800" y="500"/><v x="1040" y="500"/></InputRect><OutputRect><v x="1040" y="180"/><v x="2800" y="180"/><v x="2800" y="500"/><v x="1040" y="500"/></OutputRect></Slice>
<Slice uniqueId="demo-floor-left"><Param name="Name" value="Floor Left"/><InputRect><v x="1040" y="1940"/><v x="1880" y="1940"/><v x="1880" y="2100"/><v x="1040" y="2100"/></InputRect><OutputRect><v x="1040" y="1940"/><v x="1880" y="1940"/><v x="1880" y="2100"/><v x="1040" y="2100"/></OutputRect></Slice>
<Slice uniqueId="demo-floor-right"><Param name="Name" value="Floor Right"/><InputRect><v x="1960" y="1940"/><v x="2800" y="1940"/><v x="2800" y="2100"/><v x="1960" y="2100"/></InputRect><OutputRect><v x="1960" y="1940"/><v x="2800" y="1940"/><v x="2800" y="2100"/><v x="1960" y="2100"/></OutputRect></Slice>
</layers></Screen></screens></ScreenSetup></XmlState>`;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const round = (value: number, digits = 4) => Number(value.toFixed(digits));
const PIVOT_LABELS: Record<SlicePivot, string> = { "bottom-left": "Bottom left", "bottom-center": "Bottom centre", "bottom-right": "Bottom right" };
function pivotInputX(slice: ResolumeSlice, pivot: SlicePivot) { return pivot === "bottom-left" ? slice.input.x : pivot === "bottom-right" ? slice.input.x + slice.input.width : slice.input.x + slice.input.width / 2; }
function rotateLocalX(distance: number, rotation: [number, number, number]): [number, number, number] { const [, y, z] = rotation, cosY = Math.cos(y), sinY = Math.sin(y), cosZ = Math.cos(z), sinZ = Math.sin(z); return [distance * cosY * cosZ, distance * cosY * sinZ, -distance * sinY]; }
const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "lo2s-pattern";
function normalizeSimulationSource(value: unknown): SimulationSource {
  if (value === "shared") return "spout";
  return value === "video" || value === "ndi" || value === "spout" || value === "pattern" ? value : "pattern";
}
function normalizeSourceOverrides(value: unknown): Record<string, "inherit" | SimulationSource> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([id, source]) => [id, source === "inherit" ? "inherit" : normalizeSimulationSource(source)]));
}

function evaluateExpression(source: string, allowSigned = false): number | null {
  const text = source.replace(/[×x]/gi, "*").replace(/÷/g, "/").replace(/,/g, "").trim();
  if (!text || !/^[\d.+\-*/()\s]+$/.test(text)) return null;
  let index = 0;
  const skip = () => { while (/\s/.test(text[index] ?? "")) index += 1; };
  const expression = (): number => { let value = term(); while (true) { skip(); const op = text[index]; if (op !== "+" && op !== "-") break; index += 1; const next = term(); value = op === "+" ? value + next : value - next; } return value; };
  const term = (): number => { let value = factor(); while (true) { skip(); const op = text[index]; if (op !== "*" && op !== "/") break; index += 1; const next = factor(); value = op === "*" ? value * next : value / next; } return value; };
  const factor = (): number => { skip(); if (text[index] === "+" || text[index] === "-") { const sign = text[index++] === "-" ? -1 : 1; return sign * factor(); } if (text[index] === "(") { index += 1; const value = expression(); skip(); if (text[index] !== ")") throw new Error("Missing parenthesis"); index += 1; return value; } const match = text.slice(index).match(/^(?:\d+\.?\d*|\.\d+)/); if (!match) throw new Error("Expected number"); index += match[0].length; return Number(match[0]); };
  try { const result = expression(); skip(); return index === text.length && Number.isFinite(result) && (allowSigned || result > 0) ? result : null; } catch { return null; }
}

function ExpressionField({ label, value, suffix, onCommit, integer = false }: { label: string; value: number; suffix: string; onCommit: (value: number) => void; integer?: boolean }) {
  const [draft, setDraft] = useState(String(value)); const [invalid, setInvalid] = useState(false); const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(String(value)); }, [value]);
  const commit = () => { focused.current = false; const result = evaluateExpression(draft); if (result === null) { setInvalid(true); setDraft(String(value)); return; } const finalValue = integer ? Math.max(1, Math.round(result)) : round(result); setInvalid(false); setDraft(String(finalValue)); onCommit(finalValue); };
  return <label className={`number-field ${invalid ? "invalid" : ""}`}><span>{label}</span><span className="number-control"><input inputMode="decimal" value={draft} onFocus={() => { focused.current = true; }} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} aria-label={`${label}, arithmetic expressions supported`} /><em>{suffix}</em></span></label>;
}

function SignedNumberField({ label, value, suffix, onCommit, step = 0.001, disabled = false }: { label: string; value: number | null; suffix: string; onCommit: (value: number) => void; step?: number; disabled?: boolean }) {
  const [draft, setDraft] = useState(value === null ? "" : String(round(value, 3)));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(value === null ? "" : String(round(value, 3))); }, [value]);
  const commit = () => { focused.current = false; const parsed = evaluateExpression(draft, true); if (parsed === null) { setDraft(value === null ? "" : String(round(value, 3))); return; } const next = round(parsed, 4); setDraft(String(next)); onCommit(next); };
  return <label className="number-field"><span>{label}</span><span className="number-control"><input disabled={disabled} inputMode="decimal" placeholder="—" title={`Arithmetic expressions supported · scroll by ${step}${suffix}`} value={draft} onFocus={() => { focused.current = true; }} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onWheel={(event) => { if (disabled) return; event.preventDefault(); const parsed = evaluateExpression(draft, true), base = parsed ?? value ?? 0, multiplier = event.shiftKey ? 10 : event.altKey ? 0.1 : 1, next = round(base + (event.deltaY < 0 ? step : -step) * multiplier, 4); setDraft(String(next)); onCommit(next); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /><em>{suffix}</em></span></label>;
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width: number, opacity = 1) {
  ctx.save(); ctx.globalAlpha = opacity; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); ctx.restore();
}

function logoDimensions(logo: HTMLImageElement | null, width: number, height: number, scalePercent: number) {
  if (!logo?.complete || !logo.naturalWidth) return null;
  const scale = Math.min((width * 0.28) / logo.naturalWidth, (height * 0.16) / logo.naturalHeight) * (scalePercent / 100);
  return { width: logo.naturalWidth * scale, height: logo.naturalHeight * scale };
}

function drawLogoAt(ctx: CanvasRenderingContext2D, logo: HTMLImageElement, centerX: number, centerY: number, width: number, height: number, opacity: number) {
  ctx.save(); ctx.globalAlpha = opacity / 100; ctx.drawImage(logo, centerX - width / 2, centerY - height / 2, width, height); ctx.restore();
}

function drawLogo(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null, x: number, y: number, width: number, height: number, scalePercent: number, opacity: number, position: LogoPosition = "center") {
  const dimensions = logoDimensions(logo, width, height, scalePercent);
  if (!logo || !dimensions) return;
  const anchor = positionAnchor({ x, y, width, height, points: [] }, position, dimensions.width, dimensions.height);
  drawLogoAt(ctx, logo, anchor.x, anchor.y, dimensions.width, dimensions.height, opacity);
}

function cabinetPixels(config: PatternConfig) {
  return { width: Math.max(1, Math.round(config.cabinetWidth / config.pixelPitchMm)), height: Math.max(1, Math.round(config.cabinetHeight / config.pixelPitchMm)) };
}

function exactPhysicalPitchMm(cabinetWidthMm: number, nominalPitchMm: number) {
  const cabinetPixelsWide = Math.max(1, Math.round(cabinetWidthMm / nominalPitchMm));
  return cabinetWidthMm / cabinetPixelsWide;
}

function drawChecker(ctx: CanvasRenderingContext2D, rect: Rect, config: PatternConfig, colorA: string, colorB: string) {
  const panel = cabinetPixels(config);
  for (let y = rect.y, row = 0; y < rect.y + rect.height; y += panel.height, row += 1) for (let x = rect.x, col = 0; x < rect.x + rect.width; x += panel.width, col += 1) {
    ctx.fillStyle = (row + col) % 2 ? colorA : colorB; ctx.fillRect(x, y, Math.min(panel.width, rect.x + rect.width - x), Math.min(panel.height, rect.y + rect.height - y));
  }
}

function drawMetric(ctx: CanvasRenderingContext2D, width: number, height: number, config: PatternConfig, logo: HTMLImageElement | null) {
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, width, height);
  if (config.showPatternCheckerboard) drawChecker(ctx, { x: 0, y: 0, width, height, points: [] }, config, config.checkerColorA, config.checkerColorB);
  const sx = width / config.wallWidth, sy = height / config.wallHeight;
  const cols = Math.max(1, Math.round((config.wallWidth * 1000) / config.cabinetWidth)), rows = Math.max(1, Math.round((config.wallHeight * 1000) / config.cabinetHeight));
  const fine = Math.max(1, width / 2600), major = Math.max(2, width / 1500);
  for (let col = 0; col <= cols; col += 1) line(ctx, col * width / cols, 0, col * width / cols, height, "#ffffff", fine, 0.24);
  for (let row = 0; row <= rows; row += 1) line(ctx, 0, row * height / rows, width, row * height / rows, "#ffffff", fine, 0.24);
  for (let metre = 0; metre <= config.wallWidth + 0.001; metre += 0.5) { const whole = Math.abs(metre - Math.round(metre)) < 0.01; line(ctx, metre * sx, 0, metre * sx, height, config.metricGridColor, whole ? major : fine, whole ? 0.95 : 0.42); }
  for (let metre = 0; metre <= config.wallHeight + 0.001; metre += 0.5) { const whole = Math.abs(metre - Math.round(metre)) < 0.01; line(ctx, 0, metre * sy, width, metre * sy, config.metricGridColor, whole ? major : fine, whole ? 0.95 : 0.42); }
  if (config.showDiagonals) { line(ctx, 0, 0, width, height, config.diagonalColor, major); line(ctx, width, 0, 0, height, config.diagonalColor, major); }
  if (config.showCircles) { ctx.save(); ctx.strokeStyle = config.circleColor; ctx.lineWidth = major; [0.12, 0.23, 0.34, 0.45].forEach((radius) => { ctx.beginPath(); ctx.arc(width / 2, height / 2, Math.min(width, height) * radius, 0, Math.PI * 2); ctx.stroke(); }); ctx.restore(); }
  line(ctx, width / 2, 0, width / 2, height, config.metricGridColor, major * 1.5); line(ctx, 0, height / 2, width, height / 2, config.metricGridColor, major * 1.5);
  if (config.showSafeArea) { ctx.save(); ctx.strokeStyle = config.safeAreaColor; ctx.lineWidth = major; ctx.setLineDash([width / 80, width / 150]); ctx.strokeRect(width * 0.05, height * 0.05, width * 0.9, height * 0.9); ctx.restore(); }
  if (config.showLabels) {
    const labelSize = clamp(Math.round(width / 85), 14, 54); ctx.font = `700 ${labelSize}px Geist, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillStyle = config.labelColor;
    for (let metre = 1; metre < config.wallWidth; metre += 1) ctx.fillText(`${metre}m`, metre * sx, labelSize * 0.45);
    ctx.textAlign = "left"; ctx.textBaseline = "middle"; for (let metre = 1; metre < config.wallHeight; metre += 1) ctx.fillText(`${metre}m`, labelSize * 0.45, metre * sy);
    ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.font = `800 ${clamp(width / 42, 22, 92)}px Geist, sans-serif`; ctx.fillText(config.project.toUpperCase(), width / 2, height * 0.16);
    ctx.fillStyle = config.labelColor; ctx.font = `700 ${Math.max(12, width / 105)}px Geist, sans-serif`; ctx.fillText(`${config.wallWidth} × ${config.wallHeight} M  /  ${config.resolutionWidth} × ${config.resolutionHeight} PX  /  ${config.pixelPitchMm.toFixed(4)} MM`, width / 2, height * 0.84);
  }
  if (config.showLogo) drawLogo(ctx, logo, 0, 0, width, height, config.customLogoScale, config.customLogoOpacity, config.customLogoPosition);
  ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(2, width / 1000); ctx.strokeRect(1, 1, width - 2, height - 2);
}

function readableText(hex: string) { const color = hex.replace("#", ""); const r = parseInt(color.slice(0, 2), 16), g = parseInt(color.slice(2, 4), 16), b = parseInt(color.slice(4, 6), 16); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.56 ? "#090909" : "#ffffff"; }

function rowLetters(index: number) { let value = ""; for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) value = String.fromCharCode(65 + ((n - 1) % 26)) + value; return value; }

function drawCabinets(ctx: CanvasRenderingContext2D, width: number, height: number, config: PatternConfig) {
  const cols = Math.max(1, Math.round((config.wallWidth * 1000) / config.cabinetWidth)), rows = Math.max(1, Math.round((config.wallHeight * 1000) / config.cabinetHeight));
  const cellW = width / cols, cellH = height / rows; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (let row = 0; row < rows; row += 1) for (let col = 0; col < cols; col += 1) {
    const x = col * cellW, y = row * cellH; const color = CABINET_PALETTE[(col * 5 + row * 7) % CABINET_PALETTE.length]; ctx.fillStyle = color; ctx.fillRect(x, y, cellW + 1, cellH + 1);
    ctx.strokeStyle = "rgba(0,0,0,.72)"; ctx.lineWidth = Math.max(1, width / 1800); ctx.strokeRect(x, y, cellW, cellH);
    const fontSize = clamp(Math.min(cellW, cellH) * 0.32, 9, 72); ctx.fillStyle = readableText(color); ctx.font = `800 ${fontSize}px Geist, sans-serif`; ctx.fillText(`${rowLetters(row)}${col + 1}`, x + cellW / 2, y + cellH / 2);
  }
}

function drawBasicPattern(ctx: CanvasRenderingContext2D, width: number, height: number, type: PatternType) {
  if (type === "color") { const colors = ["#fff", "#ff0", "#0ff", "#0f0", "#f0f", "#f00", "#00f", "#000"]; colors.forEach((color, i) => { ctx.fillStyle = color; ctx.fillRect(i * width / colors.length, 0, width / colors.length + 1, height); }); }
  else if (type === "gray") { for (let i = 0; i < 16; i += 1) { const v = Math.round(i / 15 * 255); ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(i * width / 16, 0, width / 16 + 1, height * 0.62); } const gradient = ctx.createLinearGradient(0, 0, width, 0); gradient.addColorStop(0, "#000"); gradient.addColorStop(1, "#fff"); ctx.fillStyle = gradient; ctx.fillRect(0, height * 0.62, width, height * 0.38); }
  else { const tile = document.createElement("canvas"); tile.width = 2; tile.height = 2; const tileContext = tile.getContext("2d"); if (!tileContext) return; tileContext.fillStyle = "#fff"; tileContext.fillRect(0, 0, 2, 2); tileContext.fillStyle = "#000"; tileContext.fillRect(1, 0, 1, 1); tileContext.fillRect(0, 1, 1, 1); const pattern = ctx.createPattern(tile, "repeat"); if (pattern) { ctx.fillStyle = pattern; ctx.fillRect(0, 0, width, height); } }
}

function bounds(points: Point[]): Rect { const xs = points.map((point) => point.x), ys = points.map((point) => point.y); const x = Math.min(...xs), y = Math.min(...ys); return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y, points }; }
function parsePoints(node: Element | null): Point[] { if (!node) return []; return Array.from(node.children).filter((child) => child.tagName === "v").map((child) => ({ x: Number(child.getAttribute("x")), y: Number(child.getAttribute("y")) })); }

function parseResolumeXml(xml: string): ResolumeMap {
  const doc = new DOMParser().parseFromString(xml, "application/xml"); if (doc.querySelector("parsererror")) throw new Error("This file is not valid Resolume XML.");
  const setup = doc.querySelector("ScreenSetup"), composition = setup?.querySelector("CurrentCompositionTextureSize"); if (!setup || !composition) throw new Error("No Advanced Output setup was found in this XML file.");
  const screenContainer = Array.from(setup.children).find((child) => child.tagName === "screens"), screenNodes = screenContainer ? Array.from(screenContainer.children).filter((child) => child.tagName === "Screen") : [];
  const screens = screenNodes.map((screenNode, screenIndex): ResolumeScreen => {
    const params = Array.from(screenNode.querySelectorAll("Param")).find((param) => param.getAttribute("name") === "Name"), screenName = params?.getAttribute("value") || screenNode.getAttribute("name") || `Screen ${screenIndex + 1}`;
    const device = screenNode.querySelector("OutputDeviceVirtual, OutputDevice"), layers = Array.from(screenNode.children).find((child) => child.tagName === "layers"), sliceNodes = layers ? Array.from(layers.children).filter((child) => child.tagName === "Slice") : [];
    const slices = sliceNodes.map((sliceNode, sliceIndex): ResolumeSlice => {
      const nameParam = Array.from(sliceNode.querySelectorAll("Param")).find((param) => param.getAttribute("name") === "Name"), inputPoints = parsePoints(sliceNode.querySelector("InputRect")), outputPoints = parsePoints(sliceNode.querySelector("OutputRect"));
      if (inputPoints.length < 4 || outputPoints.length < 4) throw new Error(`Slice ${sliceIndex + 1} has incomplete geometry.`);
      const bezier = Array.from(sliceNode.querySelectorAll("BezierWarper > vertices > v")).map((point) => ({ x: Number(point.getAttribute("x")), y: Number(point.getAttribute("y")) })), corners = bezier.length === 16 ? [bezier[0], bezier[3], bezier[15], bezier[12]] : [], warped = corners.length === 4 && corners.some((point, i) => Math.abs(point.x - outputPoints[i].x) > 0.01 || Math.abs(point.y - outputPoints[i].y) > 0.01);
      return { id: sliceNode.getAttribute("uniqueId") || `${screenIndex}-${sliceIndex}`, name: nameParam?.getAttribute("value") || `Slice ${sliceIndex + 1}`, screenName, input: bounds(inputPoints), output: bounds(outputPoints), warped, paletteIndex: screenIndex * 17 + sliceIndex };
    });
    return { name: screenName, width: Number(device?.getAttribute("width")) || Math.ceil(Math.max(1, ...slices.map((slice) => slice.output.x + slice.output.width))), height: Number(device?.getAttribute("height")) || Math.ceil(Math.max(1, ...slices.map((slice) => slice.output.y + slice.output.height))), slices };
  });
  const version = doc.querySelector("versionInfo"); return { name: doc.documentElement.getAttribute("name") || "Resolume Map", compositionWidth: Number(composition.getAttribute("width")), compositionHeight: Number(composition.getAttribute("height")), version: version ? `${version.getAttribute("majorVersion")}.${version.getAttribute("minorVersion")}.${version.getAttribute("microVersion")}` : "Unknown", screens };
}

function hexHue(hex: string) {
  const value = hex.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16) / 255, green = parseInt(value.slice(2, 4), 16) / 255, blue = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(red, green, blue), min = Math.min(red, green, blue), delta = max - min;
  if (!delta) return 0;
  const raw = max === red ? ((green - blue) / delta) % 6 : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4;
  return (raw * 60 + 360) % 360;
}

function automaticSliceColors(slice: ResolumeSlice, config: PatternConfig) {
  const hue = (hexHue(config.checkerColorA) + slice.paletteIndex * 47) % 360;
  const toHex = (saturation: number, lightness: number) => {
    const s = saturation / 100, l = lightness / 100, chroma = (1 - Math.abs(2 * l - 1)) * s, part = chroma * (1 - Math.abs((hue / 60) % 2 - 1)), match = l - chroma / 2;
    const [red, green, blue] = hue < 60 ? [chroma, part, 0] : hue < 120 ? [part, chroma, 0] : hue < 180 ? [0, chroma, part] : hue < 240 ? [0, part, chroma] : hue < 300 ? [part, 0, chroma] : [chroma, 0, part];
    return `#${[red, green, blue].map((value) => Math.round((value + match) * 255).toString(16).padStart(2, "0")).join("")}`;
  };
  return { colorA: toHex(92, 52), colorB: toHex(88, 25) };
}

function drawCabinetIdsRect(ctx: CanvasRenderingContext2D, rect: Rect, config: PatternConfig, originX: number, originY: number) {
  const panel = cabinetPixels(config), startCol = Math.floor((rect.x - originX) / panel.width), startRow = Math.floor((rect.y - originY) / panel.height);
  for (let row = startRow; originY + row * panel.height < rect.y + rect.height; row += 1) for (let col = startCol; originX + col * panel.width < rect.x + rect.width; col += 1) {
    const x = originX + col * panel.width, y = originY + row * panel.height, color = CABINET_PALETTE[(col * 5 + row * 7 + 1200) % CABINET_PALETTE.length];
    ctx.fillStyle = color; ctx.fillRect(x, y, panel.width, panel.height); ctx.strokeStyle = "rgba(0,0,0,.75)"; ctx.lineWidth = 1; ctx.strokeRect(x, y, panel.width, panel.height);
    const fontSize = clamp(Math.min(panel.width, panel.height) * 0.26, 8, 48); ctx.fillStyle = readableText(color); ctx.font = `800 ${fontSize}px Geist, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(`${rowLetters(Math.max(0, row))}${Math.max(0, col) + 1}`, x + panel.width / 2, y + panel.height / 2);
  }
}

function drawMapFill(ctx: CanvasRenderingContext2D, rect: Rect, width: number, height: number, config: PatternConfig, settings: PatternConfig & SliceOverride) {
  const local = config.mapPatternScope === "slice", fillConfig = local ? settings : config, originX = local ? rect.x : 0, originY = local ? rect.y : 0, patternWidth = local ? rect.width : width, patternHeight = local ? rect.height : height;
  if (config.mapFill === "checker") {
    if (settings.showCheckerboard) drawChecker(ctx, rect, fillConfig, settings.checkerColorA, settings.checkerColorB);
  } else if (config.mapFill === "cabinet") drawCabinetIdsRect(ctx, rect, fillConfig, originX, originY);
  else if (config.mapFill === "color") {
    ["#fff", "#ff0", "#0ff", "#0f0", "#f0f", "#f00", "#00f", "#000"].forEach((color, index, colors) => { ctx.fillStyle = color; ctx.fillRect(originX + index * patternWidth / colors.length, originY, patternWidth / colors.length + 1, patternHeight); });
  } else if (config.mapFill === "gray") {
    for (let index = 0; index < 16; index += 1) { const value = Math.round(index / 15 * 255); ctx.fillStyle = `rgb(${value},${value},${value})`; ctx.fillRect(originX + index * patternWidth / 16, originY, patternWidth / 16 + 1, patternHeight); }
  } else if (config.mapFill === "pixel") {
    const tile = document.createElement("canvas"); tile.width = 2; tile.height = 2; const tileContext = tile.getContext("2d");
    if (tileContext) { tileContext.fillStyle = "#fff"; tileContext.fillRect(0, 0, 2, 2); tileContext.fillStyle = "#000"; tileContext.fillRect(1, 0, 1, 1); tileContext.fillRect(0, 1, 1, 1); const pattern = ctx.createPattern(tile, "repeat"); if (pattern) { ctx.fillStyle = pattern; ctx.fillRect(rect.x, rect.y, rect.width, rect.height); } }
  } else {
    ctx.fillStyle = "#050505"; ctx.fillRect(rect.x, rect.y, rect.width, rect.height); const panel = cabinetPixels(fillConfig);
    for (let x = originX; x <= originX + patternWidth; x += panel.width) line(ctx, x, originY, x, originY + patternHeight, settings.metricGridColor, Math.max(1, settings.lineWidth), 0.9);
    for (let y = originY; y <= originY + patternHeight; y += panel.height) line(ctx, originX, y, originX + patternWidth, y, settings.metricGridColor, Math.max(1, settings.lineWidth), 0.9);
    line(ctx, originX, originY + patternHeight / 2, originX + patternWidth, originY + patternHeight / 2, settings.metricGridColor, Math.max(2, settings.lineWidth * 2)); line(ctx, originX + patternWidth / 2, originY, originX + patternWidth / 2, originY + patternHeight, settings.metricGridColor, Math.max(2, settings.lineWidth * 2));
  }
}

function greatestCommonDivisor(a: number, b: number) { let x = Math.max(1, Math.round(a)), y = Math.max(1, Math.round(b)); while (y) [x, y] = [y, x % y]; return x; }

function positionAnchor(rect: Rect, position: Exclude<InfoPosition, "hidden">, boxWidth: number, boxHeight: number) {
  const pad = Math.max(5, Math.min(rect.width, rect.height) * 0.035), left = rect.x + pad, right = rect.x + rect.width - pad, top = rect.y + pad, bottom = rect.y + rect.height - pad;
  const horizontal = position.endsWith("left") ? "left" : position.endsWith("right") ? "right" : "center";
  const vertical = position.startsWith("top") ? "top" : position.startsWith("bottom") ? "bottom" : "center";
  return {
    x: horizontal === "left" ? left + boxWidth / 2 : horizontal === "right" ? right - boxWidth / 2 : rect.x + rect.width / 2,
    y: vertical === "top" ? top + boxHeight / 2 : vertical === "bottom" ? bottom - boxHeight / 2 : rect.y + rect.height / 2,
    horizontal,
  };
}

function drawSliceInformation(ctx: CanvasRenderingContext2D, slice: ResolumeSlice, rect: Rect, settings: PatternConfig & SliceOverride, logoLayout?: { width: number; height: number; position: LogoPosition }): Point | null {
  const divisor = greatestCommonDivisor(rect.width, rect.height), physicalW = rect.width * settings.pixelPitchMm / 1000, physicalH = rect.height * settings.pixelPitchMm / 1000;
  const allItems: Array<{ kind: "name" | "data"; text: string; position: InfoPosition; order: number }> = [
    { kind: "name", text: slice.name, position: settings.namePosition, order: 0 },
    { kind: "data", text: `${Math.round(rect.x)}, ${Math.round(rect.y)}`, position: settings.coordinatesPosition, order: 1 },
    { kind: "data", text: `${Math.round(rect.width)} × ${Math.round(rect.height)}`, position: settings.resolutionPosition, order: 2 },
    { kind: "data", text: `${Math.round(rect.width / divisor)}:${Math.round(rect.height / divisor)}`, position: settings.aspectPosition, order: 3 },
    { kind: "data", text: `${physicalW.toFixed(1)}m × ${physicalH.toFixed(1)}m`, position: settings.physicalSizePosition, order: 4 },
  ];
  const rawItems = settings.showLabels ? allItems.filter((item) => item.position !== "hidden") : [];
  const positions = Array.from(new Set([...rawItems.map((item) => item.position), ...(logoLayout ? [logoLayout.position] : [])])) as Array<Exclude<InfoPosition, "hidden">>;
  let logoCenter: Point | null = null;
  positions.forEach((position) => {
    const source = rawItems.filter((item) => item.position === position).sort((a, b) => a.order - b.order), items: Array<{ kind: "name" | "data"; text: string }> = [];
    source.forEach((item) => { const last = items.at(-1); if (item.order === 2 && last?.kind === "data" && settings.coordinatesPosition === settings.resolutionPosition) last.text += `  //  ${item.text}`; else items.push({ kind: item.kind, text: item.text }); });
    const base = clamp(Math.min(rect.width / 10, rect.height / 4), 12, 52), measured = items.map((item) => {
      const fontSize = item.kind === "name" ? base * settings.labelNameScale / 100 : Math.max(9, base * 0.52 * settings.labelDataScale / 100), family = item.kind === "name" ? "Geist, sans-serif" : 'Geist, sans-serif', weight = item.kind === "name" ? 800 : 700;
      ctx.font = `${weight} ${fontSize}px ${family}`; return { ...item, fontSize, family, weight, width: ctx.measureText(item.text).width + fontSize * 0.9, height: fontSize * 1.45 };
    });
    const groupWidth = measured.length ? Math.max(...measured.map((item) => item.width)) : 0, groupHeight = measured.reduce((sum, item) => sum + item.height, 0), angle = settings.infoOrientation === "rotate-90" ? Math.PI / 2 : settings.infoOrientation === "rotate-180" ? Math.PI : settings.infoOrientation === "rotate-270" ? -Math.PI / 2 : 0, quarterTurn = Math.abs(angle) === Math.PI / 2, infoWidth = quarterTurn ? groupHeight : groupWidth, infoHeight = quarterTurn ? groupWidth : groupHeight;
    const includesLogo = logoLayout?.position === position, logoWidth = includesLogo ? logoLayout.width : 0, logoHeight = includesLogo ? logoLayout.height : 0, gap = includesLogo && measured.length ? clamp(Math.min(rect.width, rect.height) * 0.025, 4, 18) : 0;
    const combinedWidth = Math.max(infoWidth, logoWidth), combinedHeight = infoHeight + gap + logoHeight, anchor = positionAnchor(rect, position, combinedWidth, combinedHeight), horizontal = anchor.horizontal;
    const alignedX = (childWidth: number) => horizontal === "left" ? anchor.x - combinedWidth / 2 + childWidth / 2 : horizontal === "right" ? anchor.x + combinedWidth / 2 - childWidth / 2 : anchor.x;
    const top = anchor.y - combinedHeight / 2;
    if (includesLogo) logoCenter = { x: alignedX(logoWidth), y: top + logoHeight / 2 };
    if (measured.length) {
      const infoCenterX = alignedX(infoWidth), infoCenterY = top + logoHeight + gap + infoHeight / 2;
      ctx.save(); ctx.globalAlpha = 1; ctx.translate(infoCenterX, infoCenterY); ctx.rotate(angle); let cursorY = -groupHeight / 2;
      measured.forEach((item, index) => { const left = horizontal === "left" ? -groupWidth / 2 : horizontal === "right" ? groupWidth / 2 - item.width : -item.width / 2, dark = index % 2 === 0; ctx.fillStyle = dark ? "#050505" : "#ffffff"; ctx.fillRect(left, cursorY, item.width, item.height); ctx.fillStyle = dark ? "#ffffff" : "#050505"; ctx.font = `${item.weight} ${item.fontSize}px ${item.family}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(item.text, left + item.width / 2, cursorY + item.height / 2); cursorY += item.height; });
      ctx.restore();
    }
  });
  return logoCenter;
}

function drawPixelMap(ctx: CanvasRenderingContext2D, width: number, height: number, slices: ResolumeSlice[], view: MapView, config: PatternConfig, logo: HTMLImageElement | null, overrides: Record<string, SliceOverride>, selectedIds: string[] = [], showSelection = false) {
  ctx.save(); ctx.globalAlpha = 1; ctx.setLineDash([]); if (config.backgroundMode === "black") { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, width, height); } else ctx.clearRect(0, 0, width, height); ctx.restore();
  slices.forEach((slice) => {
    const rect = view === "input" ? slice.input : slice.output, override = overrides[slice.id] || {}, automatic = automaticSliceColors(slice, config);
    const settings = { ...config, ...override, checkerColorA: override.checkerColorA ?? automatic.colorA, checkerColorB: override.checkerColorB ?? automatic.colorB };
    ctx.save(); ctx.beginPath(); rect.points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)); ctx.closePath(); ctx.clip();
    drawMapFill(ctx, rect, width, height, config, settings);
    const stroke = Math.max(1, settings.lineWidth * Math.max(width / 5760, 0.75));
    if (settings.showDiagonals) { line(ctx, rect.x, rect.y, rect.x + rect.width, rect.y + rect.height, settings.diagonalColor, stroke); line(ctx, rect.x + rect.width, rect.y, rect.x, rect.y + rect.height, settings.diagonalColor, stroke); }
    if (settings.showCircles) { ctx.save(); ctx.globalAlpha = 1; ctx.strokeStyle = settings.circleColor; ctx.lineWidth = stroke; ctx.beginPath(); ctx.ellipse(rect.x + rect.width / 2, rect.y + rect.height / 2, Math.min(rect.width * 0.34, rect.height * 0.44), Math.min(rect.width * 0.34, rect.height * 0.44), 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    if (settings.showSafeArea) { ctx.save(); ctx.globalAlpha = 1; ctx.strokeStyle = settings.safeAreaColor; ctx.lineWidth = stroke; ctx.setLineDash([stroke * 8, stroke * 6]); ctx.strokeRect(rect.x + rect.width * 0.05, rect.y + rect.height * 0.05, rect.width * 0.9, rect.height * 0.9); ctx.restore(); }
    if (settings.showCenterDot) { ctx.save(); ctx.globalAlpha = 1; ctx.fillStyle = settings.centerDotColor; ctx.beginPath(); ctx.arc(rect.x + rect.width / 2, rect.y + rect.height / 2, Math.max(2, settings.centerDotSize / 2), 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    ctx.save(); ctx.globalAlpha = 1; ctx.strokeStyle = settings.metricGridColor; ctx.lineWidth = Math.max(1, settings.lineWidth * width / 5760); ctx.beginPath(); rect.points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)); ctx.closePath(); ctx.stroke(); ctx.restore();
    const logoVisible = Boolean(override.logoVisible ?? config.showLogo), logoScale = override.logoScale ?? config.customLogoScale, logoPosition = override.logoPosition ?? config.customLogoPosition, dimensions = logoVisible ? logoDimensions(logo, rect.width, rect.height, logoScale) : null;
    const logoCenter = drawSliceInformation(ctx, slice, rect, settings, dimensions ? { ...dimensions, position: logoPosition } : undefined);
    if (logo && dimensions && logoCenter) drawLogoAt(ctx, logo, logoCenter.x, logoCenter.y, dimensions.width, dimensions.height, config.customLogoOpacity);
    ctx.restore();
    if (showSelection && selectedIds.includes(slice.id)) { ctx.save(); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(3, width / 1800); ctx.setLineDash([Math.max(8, width / 350), Math.max(6, width / 500)]); ctx.strokeRect(rect.x + 2, rect.y + 2, Math.max(0, rect.width - 4), Math.max(0, rect.height - 4)); ctx.restore(); }
  });
}

function canvasBlob(canvas: HTMLCanvasElement) { return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png")); }

export default function Home() {
  const [config, setConfig] = useState(DEFAULT_CONFIG), [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("patterns"), [controlTab, setControlTab] = useState<ControlTab>("setup"), [mapView, setMapView] = useState<MapView>("input");
  const [resolumeMap, setResolumeMap] = useState<ResolumeMap | null>(null), [rawXml, setRawXml] = useState(""), [xmlName, setXmlName] = useState(""), [xmlError, setXmlError] = useState(""), [selectedScreen, setSelectedScreen] = useState(0), [xmlLinkState, setXmlLinkState] = useState<"unlinked" | "linking" | "linked">("unlinked"), [xmlPath, setXmlPath] = useState(""), [xmlUpdatedAt, setXmlUpdatedAt] = useState<number | null>(null);
  const [selectedSliceIds, setSelectedSliceIds] = useState<string[]>([]), [logoData, setLogoData] = useState(""), [logoName, setLogoName] = useState(""), [logoImage, setLogoImage] = useState<HTMLImageElement | null>(null), [sliceOverrides, setSliceOverrides] = useState<Record<string, SliceOverride>>({});
  const [simulationTransforms, setSimulationTransforms] = useState<Record<string, SliceTransform>>({}), [simulationDepthM, setSimulationDepthM] = useState(0.1), [simulationCurvature, setSimulationCurvature] = useState<SliceCurvature>({ horizontal: 0, vertical: 0 }), [simulationCurvatureOverrides, setSimulationCurvatureOverrides] = useState<Record<string, SliceCurvature>>({}), [simulationTool, setSimulationTool] = useState<TransformMode>("translate"), [simulationSource, setSimulationSource] = useState<SimulationSource>("pattern"), [simulationQuality, setSimulationQuality] = useState<"latency" | "quality">("latency"), [simulationSourceOverrides, setSimulationSourceOverrides] = useState<Record<string, "inherit" | SimulationSource>>({}), [simulationCamera, setSimulationCamera] = useState<CameraState | undefined>(), [simulationFitSignal, setSimulationFitSignal] = useState(0), [simulationTransformSpace, setSimulationTransformSpace] = useState<"local" | "world">("local"), [simulationPivot, setSimulationPivot] = useState<SlicePivot>("bottom-center"), [simulationPivotOverrides, setSimulationPivotOverrides] = useState<Record<string, SlicePivot>>({}), [simulationGridVisible, setSimulationGridVisible] = useState(true), [simulationFloorVisible, setSimulationFloorVisible] = useState(true), [simulationBackgroundLevel, setSimulationBackgroundLevel] = useState(100);
  const [simulationTransformPreview, setSimulationTransformPreview] = useState<Record<string, SliceTransform> | null>(null);
  const [simulationInputDevices, setSimulationInputDevices] = useState<MediaDeviceInfo[]>([]), [simulationInputDeviceId, setSimulationInputDeviceId] = useState(""), [simulationSourceVideo, setSimulationSourceVideo] = useState<HTMLVideoElement | null>(null), [simulationNativeCanvas, setSimulationNativeCanvas] = useState<HTMLCanvasElement | null>(null), [simulationSourceStatus, setSimulationSourceStatus] = useState("Not connected");
  const [simulationNativeSources, setSimulationNativeSources] = useState<NativeSourceInfo[]>([]), [simulationNdiSourceId, setSimulationNdiSourceId] = useState(""), [simulationSpoutSourceId, setSimulationSpoutSourceId] = useState(""), [simulationNativeConnected, setSimulationNativeConnected] = useState(false), [simulationNativeScanning, setSimulationNativeScanning] = useState(false), [simulationNativeKind, setSimulationNativeKind] = useState<"ndi" | "spout" | null>(null);
  const [simulationExportFormat, setSimulationExportFormat] = useState<SceneExportFormat>("glb"), [simulationExporting, setSimulationExporting] = useState(false);
  const [fullscreenMode, setFullscreenMode] = useState<FullscreenMode>("fit"), [sequenceActive, setSequenceActive] = useState(false), [notice, setNotice] = useState(""), [calculatorSources, setCalculatorSources] = useState<[CalculatorGroup, CalculatorGroup]>(["physical", "raster"]);
  const [zoom, setZoom] = useState(1), [pan, setPan] = useState({ x: 0, y: 0 }), [spaceDown, setSpaceDown] = useState(false), [stageBounds, setStageBounds] = useState({ width: 1, height: 1 }), [selectionMarquee, setSelectionMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null); const dragRef = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null), canvasStageRef = useRef<HTMLDivElement>(null), fullscreenHostRef = useRef<HTMLDivElement>(null), xmlInputRef = useRef<HTMLInputElement>(null), logoInputRef = useRef<HTMLInputElement>(null), projectInputRef = useRef<HTMLInputElement>(null), previewFrameRef = useRef<number | null>(null), zoomRef = useRef(1), panRef = useRef({ x: 0, y: 0 }), selectionDragRef = useRef<{ startX: number; startY: number; currentX: number; currentY: number; moved: boolean; additive: boolean; initialIds: string[] } | null>(null), simulationInputStreamRef = useRef<MediaStream | null>(null), simulationNativeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const undoHistoryRef = useRef<HistoryEntry[]>([]), redoHistoryRef = useRef<HistoryEntry[]>([]); const [historyState, setHistoryState] = useState<{ undo?: string; redo?: string }>({});

  const allSlices = useMemo(() => resolumeMap?.screens.flatMap((screen) => screen.slices) || [], [resolumeMap]), activeScreen = resolumeMap?.screens[selectedScreen] || null, activeSlices = workspaceMode === "simulation" || mapView === "input" ? allSlices : activeScreen?.slices || [];
  const outputWidth = (workspaceMode === "resolume" || workspaceMode === "simulation") && resolumeMap ? (workspaceMode === "simulation" || mapView === "input" ? resolumeMap.compositionWidth : activeScreen?.width || 1) : config.resolutionWidth, outputHeight = (workspaceMode === "resolume" || workspaceMode === "simulation") && resolumeMap ? (workspaceMode === "simulation" || mapView === "input" ? resolumeMap.compositionHeight : activeScreen?.height || 1) : config.resolutionHeight;
  const fitScale = Math.max(0.001, Math.min(Math.max(1, stageBounds.width - 28) / outputWidth, Math.max(1, stageBounds.height - 28) / outputHeight)), baseScale = fullscreenMode === "actual" ? 1 : fitScale, displayScale = baseScale * zoom;
  const selectedSlices = activeSlices.filter((slice) => selectedSliceIds.includes(slice.id)), selectedOverride = selectedSlices.length === 1 ? sliceOverrides[selectedSlices[0].id] || {} : {};
  const selectedSourceOverride = useMemo<"inherit" | "mixed" | SimulationSource>(() => {
    if (!selectedSliceIds.length) return "inherit";
    const values = selectedSliceIds.map((id) => simulationSourceOverrides[id] || "inherit");
    return values.every((value) => value === values[0]) ? values[0] : "mixed";
  }, [selectedSliceIds, simulationSourceOverrides]);
  const sourcePanelType = selectedSourceOverride !== "inherit" && selectedSourceOverride !== "mixed" ? selectedSourceOverride : simulationSource;
  const simulationSourceMedia = useMemo<Partial<Record<"video" | "ndi" | "spout", HTMLVideoElement | HTMLCanvasElement>>>(() => {
    const media: Partial<Record<"video" | "ndi" | "spout", HTMLVideoElement | HTMLCanvasElement>> = {};
    if (simulationSourceVideo) media.video = simulationSourceVideo;
    if (simulationNativeCanvas && simulationNativeKind) media[simulationNativeKind] = simulationNativeCanvas;
    return media;
  }, [simulationNativeCanvas, simulationNativeKind, simulationSourceVideo]);
  const selectedAutomaticColors = selectedSlices.length === 1 ? automaticSliceColors(selectedSlices[0], config) : { colorA: config.checkerColorA, colorB: config.checkerColorB };
  // XML pivot positions and physical slice geometry must use the same scale.
  // Deriving the exact pitch from the panel's integer raster also avoids
  // rounded values such as 3.9 mm displacing an otherwise exact 500/128 panel.
  const simulationMasterPitchMm = exactPhysicalPitchMm(config.cabinetWidth, config.pixelPitchMm);
  const simulationPitchBySlice = useMemo(() => Object.fromEntries(allSlices.map((slice) => {
    const override = sliceOverrides[slice.id];
    const cabinetWidthMm = override?.cabinetWidth || config.cabinetWidth;
    const nominalPitchMm = override?.pixelPitchMm || config.pixelPitchMm;
    return [slice.id, exactPhysicalPitchMm(cabinetWidthMm, nominalPitchMm)];
  })), [allSlices, config.cabinetWidth, config.pixelPitchMm, sliceOverrides]);
  const simulationPivotBySlice = useMemo<Record<string, SlicePivot>>(() => Object.fromEntries(allSlices.map((slice) => [slice.id, simulationPivotOverrides[slice.id] || simulationPivot])), [allSlices, simulationPivot, simulationPivotOverrides]);
  const simulationCurvatureBySlice = useMemo<Record<string, SliceCurvature>>(() => Object.fromEntries(allSlices.map((slice) => [slice.id, simulationCurvatureOverrides[slice.id] || simulationCurvature])), [allSlices, simulationCurvature, simulationCurvatureOverrides]);
  const simulationDepthBySlice = useMemo<Record<string, number>>(() => Object.fromEntries(allSlices.map((slice) => [slice.id, simulationDepthM])), [allSlices, simulationDepthM]);
  const simulationTextureVersion = useMemo(() => JSON.stringify({ map: resolumeMap?.name, xml: xmlUpdatedAt, fill: config.mapFill, scope: config.mapPatternScope, config, sliceOverrides, logoData, quality: simulationQuality }), [config, logoData, resolumeMap?.name, simulationQuality, sliceOverrides, xmlUpdatedAt]);
  const selectedBoolean = useCallback((key: keyof SliceOverride, globalValue: boolean) => selectedSlices.length ? selectedSlices.every((slice) => Boolean(sliceOverrides[slice.id]?.[key] ?? globalValue)) : globalValue, [selectedSlices, sliceOverrides]);
  const initialSimulationTransformForPivot = useCallback((slice: ResolumeSlice, pivot: SlicePivot): SliceTransform => { const pitchM = simulationMasterPitchMm / 1000; return { position: [(pivotInputX(slice, pivot) - (resolumeMap?.compositionWidth || config.resolutionWidth) / 2) * pitchM, ((resolumeMap?.compositionHeight || config.resolutionHeight) - slice.input.y - slice.input.height) * pitchM, 0], rotation: [0, 0, 0] }; }, [config.resolutionHeight, config.resolutionWidth, resolumeMap?.compositionHeight, resolumeMap?.compositionWidth, simulationMasterPitchMm]);
  const initialSimulationTransform = useCallback((slice: ResolumeSlice): SliceTransform => initialSimulationTransformForPivot(slice, simulationPivotBySlice[slice.id] || simulationPivot), [initialSimulationTransformForPivot, simulationPivot, simulationPivotBySlice]);
  const effectiveSimulationTransform = useCallback((slice: ResolumeSlice) => simulationTransformPreview?.[slice.id] || simulationTransforms[slice.id] || initialSimulationTransform(slice), [initialSimulationTransform, simulationTransformPreview, simulationTransforms]);
  const selectedTransformPosition = useMemo<[number | null, number | null, number | null] | null>(() => { if (!selectedSlices.length) return null; const transforms = selectedSlices.map(effectiveSimulationTransform); return [0, 1, 2].map((axis) => { const first = transforms[0].position[axis]; return transforms.every((transform) => Math.abs(transform.position[axis] - first) < 0.00001) ? first : null; }) as [number | null, number | null, number | null]; }, [effectiveSimulationTransform, selectedSlices]);
  const selectedTransformRotation = useMemo<[number | null, number | null, number | null] | null>(() => { if (!selectedSlices.length) return null; const transforms = selectedSlices.map(effectiveSimulationTransform); return [0, 1, 2].map((axis) => { const first = transforms[0].rotation[axis] * 180 / Math.PI; return transforms.every((transform) => Math.abs(transform.rotation[axis] * 180 / Math.PI - first) < 0.001) ? first : null; }) as [number | null, number | null, number | null]; }, [effectiveSimulationTransform, selectedSlices]);
  const selectedSimulationPivot = useMemo<SlicePivot | "mixed">(() => { if (!selectedSlices.length) return simulationPivot; const pivots = new Set(selectedSlices.map((slice) => simulationPivotBySlice[slice.id] || simulationPivot)); return pivots.size === 1 ? Array.from(pivots)[0] : "mixed"; }, [selectedSlices, simulationPivot, simulationPivotBySlice]);
  const selectedCurvature = useMemo<{ horizontal: number | null; vertical: number | null }>(() => { if (!selectedSlices.length) return simulationCurvature; const curves = selectedSlices.map((slice) => simulationCurvatureBySlice[slice.id] || simulationCurvature); const common = (axis: keyof SliceCurvature) => curves.every((curve) => Math.abs(curve[axis] - curves[0][axis]) < 0.001) ? curves[0][axis] : null; return { horizontal: common("horizontal"), vertical: common("vertical") }; }, [selectedSlices, simulationCurvature, simulationCurvatureBySlice]);
  const selectedCurvatureRadius = useMemo(() => { if (selectedSlices.length !== 1) return { horizontal: null, vertical: null }; const slice = selectedSlices[0], pitchM = (simulationPitchBySlice[slice.id] || config.pixelPitchMm) / 1000; const radius = (lengthM: number, degrees: number | null) => !degrees ? null : Math.abs(lengthM / (degrees * Math.PI / 180)); return { horizontal: radius(slice.input.width * pitchM, selectedCurvature.horizontal), vertical: radius(slice.input.height * pitchM, selectedCurvature.vertical) }; }, [config.pixelPitchMm, selectedCurvature, selectedSlices, simulationPitchBySlice]);

  const captureSimulationSnapshot = useCallback((): SimulationSnapshot => ({ transforms: structuredClone(simulationTransforms), depthM: simulationDepthM, curvature: { ...simulationCurvature }, curvatureOverrides: structuredClone(simulationCurvatureOverrides), source: simulationSource, quality: simulationQuality, sourceOverrides: structuredClone(simulationSourceOverrides), transformSpace: simulationTransformSpace, pivot: simulationPivot, pivotOverrides: structuredClone(simulationPivotOverrides), gridVisible: simulationGridVisible, floorVisible: simulationFloorVisible, backgroundLevel: simulationBackgroundLevel }), [simulationBackgroundLevel, simulationCurvature, simulationCurvatureOverrides, simulationDepthM, simulationFloorVisible, simulationGridVisible, simulationPivot, simulationPivotOverrides, simulationQuality, simulationSource, simulationSourceOverrides, simulationTransformSpace, simulationTransforms]);
  const restoreSimulationSnapshot = useCallback((snapshot: SimulationSnapshot) => { setSimulationTransformPreview(null); setSimulationTransforms(structuredClone(snapshot.transforms)); setSimulationDepthM(clamp(snapshot.depthM, 0.01, 0.5)); setSimulationCurvature(snapshot.curvature || { horizontal: 0, vertical: 0 }); setSimulationCurvatureOverrides(structuredClone(snapshot.curvatureOverrides || {})); setSimulationSource(normalizeSimulationSource(snapshot.source)); setSimulationQuality(snapshot.quality); setSimulationSourceOverrides(normalizeSourceOverrides(snapshot.sourceOverrides)); setSimulationTransformSpace(snapshot.transformSpace); setSimulationPivot(snapshot.pivot || "bottom-center"); setSimulationPivotOverrides(structuredClone(snapshot.pivotOverrides || {})); setSimulationGridVisible(snapshot.gridVisible); setSimulationFloorVisible(snapshot.floorVisible ?? true); setSimulationBackgroundLevel(snapshot.backgroundLevel); }, []);
  const refreshHistoryState = useCallback(() => setHistoryState({ undo: undoHistoryRef.current.at(-1)?.label, redo: redoHistoryRef.current.at(-1)?.label }), []);
  const recordSimulationHistory = useCallback((label: string) => { undoHistoryRef.current.push({ label, state: captureSimulationSnapshot() }); if (undoHistoryRef.current.length > 100) undoHistoryRef.current.shift(); redoHistoryRef.current = []; refreshHistoryState(); }, [captureSimulationSnapshot, refreshHistoryState]);
  const undoSimulation = useCallback(() => { const entry = undoHistoryRef.current.pop(); if (!entry) return; redoHistoryRef.current.push({ label: entry.label, state: captureSimulationSnapshot() }); restoreSimulationSnapshot(entry.state); refreshHistoryState(); setNotice(`Undid ${entry.label}`); }, [captureSimulationSnapshot, refreshHistoryState, restoreSimulationSnapshot]);
  const redoSimulation = useCallback(() => { const entry = redoHistoryRef.current.pop(); if (!entry) return; undoHistoryRef.current.push({ label: entry.label, state: captureSimulationSnapshot() }); restoreSimulationSnapshot(entry.state); refreshHistoryState(); setNotice(`Redid ${entry.label}`); }, [captureSimulationSnapshot, refreshHistoryState, restoreSimulationSnapshot]);
  const changeSimulationPivot = useCallback((nextPivot: SlicePivot) => {
    const targets = selectedSlices.length ? selectedSlices : allSlices.filter((slice) => !simulationPivotOverrides[slice.id]);
    if (targets.length && targets.every((slice) => (simulationPivotBySlice[slice.id] || simulationPivot) === nextPivot)) return;
    recordSimulationHistory(selectedSlices.length ? `Change pivot for ${selectedSlices.length} slice${selectedSlices.length > 1 ? "s" : ""}` : "Change global pivot");
    setSimulationTransforms((current) => {
      const next = { ...current };
      targets.forEach((slice) => {
        const oldPivot = simulationPivotBySlice[slice.id] || simulationPivot, base = current[slice.id] || initialSimulationTransformForPivot(slice, oldPivot);
        const localPitchM = (simulationPitchBySlice[slice.id] || config.pixelPitchMm) / 1000;
        const shift = rotateLocalX((pivotInputX(slice, nextPivot) - pivotInputX(slice, oldPivot)) * localPitchM, base.rotation);
        next[slice.id] = { position: [base.position[0] + shift[0], base.position[1] + shift[1], base.position[2] + shift[2]], rotation: [...base.rotation] as [number, number, number] };
      });
      return next;
    });
    if (selectedSlices.length) setSimulationPivotOverrides((current) => { const next = { ...current }; selectedSlices.forEach((slice) => { if (nextPivot === simulationPivot) delete next[slice.id]; else next[slice.id] = nextPivot; }); return next; });
    else setSimulationPivot(nextPivot);
  }, [allSlices, config.pixelPitchMm, initialSimulationTransformForPivot, recordSimulationHistory, selectedSlices, simulationPitchBySlice, simulationPivot, simulationPivotBySlice, simulationPivotOverrides]);
  const applySimulationCurvature = useCallback((axis: keyof SliceCurvature, value: number) => {
    const nextValue = clamp(value, -180, 180);
    if (!selectedSlices.length) { setSimulationCurvature((current) => ({ ...current, [axis]: nextValue })); return; }
    setSimulationCurvatureOverrides((current) => {
      const next = { ...current };
      selectedSlices.forEach((slice) => {
        const resolved = simulationCurvatureBySlice[slice.id] || simulationCurvature, updated = { ...resolved, [axis]: nextValue };
        if (Math.abs(updated.horizontal - simulationCurvature.horizontal) < 0.001 && Math.abs(updated.vertical - simulationCurvature.vertical) < 0.001) delete next[slice.id]; else next[slice.id] = updated;
      });
      return next;
    });
  }, [selectedSlices, simulationCurvature, simulationCurvatureBySlice]);
  const updateManualPosition = useCallback((axis: 0 | 1 | 2, value: number) => { if (!selectedSlices.length) return; recordSimulationHistory(`Set position for ${selectedSlices.length} slice${selectedSlices.length > 1 ? "s" : ""}`); setSimulationTransformPreview(null); setSimulationTransforms((current) => { const next = { ...current }; selectedSlices.forEach((slice) => { const base = current[slice.id] || initialSimulationTransform(slice), position = [...base.position] as [number, number, number]; position[axis] = value; next[slice.id] = { position, rotation: [...base.rotation] as [number, number, number] }; }); return next; }); }, [initialSimulationTransform, recordSimulationHistory, selectedSlices]);
  const updateManualRotation = useCallback((axis: 0 | 1 | 2, degrees: number) => { if (!selectedSlices.length) return; recordSimulationHistory(`Set rotation for ${selectedSlices.length} slice${selectedSlices.length > 1 ? "s" : ""}`); setSimulationTransformPreview(null); setSimulationTransforms((current) => { const next = { ...current }; selectedSlices.forEach((slice) => { const base = current[slice.id] || initialSimulationTransform(slice), rotation = [...base.rotation] as [number, number, number]; rotation[axis] = degrees * Math.PI / 180; next[slice.id] = { position: [...base.position] as [number, number, number], rotation }; }); return next; }); }, [initialSimulationTransform, recordSimulationHistory, selectedSlices]);
  const resetSelectedTransforms = useCallback(() => { if (!selectedSliceIds.length) return; recordSimulationHistory(`Reset ${selectedSliceIds.length} slice${selectedSliceIds.length > 1 ? "s" : ""}`); setSimulationTransformPreview(null); setSimulationTransforms((current) => { const next = { ...current }; selectedSliceIds.forEach((id) => delete next[id]); return next; }); }, [recordSimulationHistory, selectedSliceIds]);

  const stats = useMemo(() => { const pitchX = config.wallWidth * 1000 / config.resolutionWidth, pitchY = config.wallHeight * 1000 / config.resolutionHeight, cols = config.wallWidth * 1000 / config.cabinetWidth, rows = config.wallHeight * 1000 / config.cabinetHeight; return { pitchX, pitchY, cols, rows, area: config.wallWidth * config.wallHeight, mismatch: Math.abs(pitchX - pitchY) > 0.001, cabinetRemainder: Math.abs(cols - Math.round(cols)) > 0.01 || Math.abs(rows - Math.round(rows)) > 0.01 }; }, [config]);
  const validations = useMemo(() => { if (!resolumeMap) return [] as Array<{ level: "warn" | "info"; text: string }>; const messages: Array<{ level: "warn" | "info"; text: string }> = [], names = new Map<string, number>(); allSlices.forEach((slice) => names.set(slice.name, (names.get(slice.name) || 0) + 1)); const duplicates = Array.from(names.values()).filter((count) => count > 1).length, warped = allSlices.filter((slice) => slice.warped).length; if (duplicates) messages.push({ level: "warn", text: `${duplicates} duplicate slice name${duplicates > 1 ? "s" : ""}` }); if (warped) messages.push({ level: "warn", text: `${warped} warped slice${warped > 1 ? "s" : ""} need advanced geometry` }); resolumeMap.screens.forEach((screen) => { const outside = screen.slices.filter((slice) => slice.output.x < 0 || slice.output.y < 0 || slice.output.x + slice.output.width > screen.width + 0.1 || slice.output.y + slice.output.height > screen.height + 0.1).length; if (outside) messages.push({ level: "warn", text: `${screen.name}: ${outside} slice outside canvas` }); }); if (!messages.length) messages.push({ level: "info", text: "Geometry checks passed" }); return messages; }, [allSlices, resolumeMap]);

  const renderToCanvas = useCallback((canvas: HTMLCanvasElement, mode = workspaceMode, view = mapView, screen = activeScreen, slices?: ResolumeSlice[], selection = true) => {
    const width = mode === "resolume" && resolumeMap ? (view === "input" ? resolumeMap.compositionWidth : screen?.width || 1) : config.resolutionWidth, height = mode === "resolume" && resolumeMap ? (view === "input" ? resolumeMap.compositionHeight : screen?.height || 1) : config.resolutionHeight;
    canvas.width = Math.max(1, Math.round(width)); canvas.height = Math.max(1, Math.round(height)); const ctx = canvas.getContext("2d", { alpha: true }); if (!ctx) return; ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (mode === "resolume" && resolumeMap) drawPixelMap(ctx, width, height, slices || (view === "input" ? allSlices : screen?.slices || []), view, config, logoImage, sliceOverrides, selectedSliceIds, selection);
    else if (config.pattern === "metric") drawMetric(ctx, width, height, config, logoImage); else if (config.pattern === "cabinet") drawCabinets(ctx, width, height, config); else drawBasicPattern(ctx, width, height, config.pattern);
  }, [activeScreen, allSlices, config, logoImage, mapView, resolumeMap, selectedSliceIds, sliceOverrides, workspaceMode]);
  const drawSimulationTexture = useCallback((canvas: HTMLCanvasElement) => {
    if (!resolumeMap) { canvas.width = 2; canvas.height = 2; return; }
    const drawFull = (target: HTMLCanvasElement) => { target.width = Math.max(1, Math.round(resolumeMap.compositionWidth)); target.height = Math.max(1, Math.round(resolumeMap.compositionHeight)); const context = target.getContext("2d", { alpha: true }); if (context) drawPixelMap(context, target.width, target.height, allSlices, "input", config, logoImage, sliceOverrides, [], false); };
    if (simulationSource === "pattern" || simulationQuality === "quality") { drawFull(canvas); return; }
    const full = document.createElement("canvas");
    drawFull(full);
    const scale = Math.min(1, 2048 / Math.max(full.width, full.height));
    canvas.width = Math.max(1, Math.round(full.width * scale)); canvas.height = Math.max(1, Math.round(full.height * scale));
    canvas.getContext("2d")?.drawImage(full, 0, 0, canvas.width, canvas.height);
  }, [allSlices, config, logoImage, resolumeMap, simulationQuality, simulationSource, sliceOverrides]);
  useEffect(() => { if (previewFrameRef.current !== null) cancelAnimationFrame(previewFrameRef.current); previewFrameRef.current = requestAnimationFrame(() => { previewFrameRef.current = null; if (canvasRef.current) renderToCanvas(canvasRef.current, workspaceMode, mapView, activeScreen, undefined, true); }); return () => { if (previewFrameRef.current !== null) cancelAnimationFrame(previewFrameRef.current); }; }, [activeScreen, mapView, renderToCanvas, workspaceMode]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current = pan; }, [pan]);
  useEffect(() => { if (workspaceMode === "simulation") return; const stage = canvasStageRef.current; if (!stage) return; const updateBounds = () => { const width = stage.clientWidth, height = stage.clientHeight; if (width > 1 && height > 1) setStageBounds({ width, height }); }; updateBounds(); const frame = requestAnimationFrame(updateBounds), observer = new ResizeObserver(updateBounds); observer.observe(stage); return () => { cancelAnimationFrame(frame); observer.disconnect(); }; }, [workspaceMode, outputWidth, outputHeight]);
  useEffect(() => { if (!sequenceActive || workspaceMode !== "patterns") return; const timer = window.setInterval(() => setConfig((current) => ({ ...current, pattern: PATTERNS[(PATTERNS.findIndex((item) => item.id === current.pattern) + 1) % PATTERNS.length].id })), 3000); return () => window.clearInterval(timer); }, [sequenceActive, workspaceMode]);
  useEffect(() => { const down = (event: KeyboardEvent) => { if (event.code === "Space" && !(event.target instanceof HTMLInputElement)) { event.preventDefault(); setSpaceDown(true); } }; const up = (event: KeyboardEvent) => { if (event.code === "Space") setSpaceDown(false); }; window.addEventListener("keydown", down); window.addEventListener("keyup", up); return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); }; }, []);
  useEffect(() => { const handleHistory = (event: KeyboardEvent) => { if (workspaceMode !== "simulation" || !(event.ctrlKey || event.metaKey) || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return; if (event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redoSimulation(); else undoSimulation(); } else if (event.key.toLowerCase() === "y") { event.preventDefault(); redoSimulation(); } }; window.addEventListener("keydown", handleHistory); return () => window.removeEventListener("keydown", handleHistory); }, [redoSimulation, undoSimulation, workspaceMode]);

  const update = useCallback(<K extends keyof PatternConfig>(key: K, value: PatternConfig[K]) => setConfig((current) => ({ ...current, [key]: value })), []);
  const updateGlobal = useCallback(<K extends keyof PatternConfig>(key: K, value: PatternConfig[K]) => {
    setConfig((current) => ({ ...current, [key]: value }));
    const mapped = key === "customLogoScale" ? "logoScale" : key === "customLogoPosition" ? "logoPosition" : key === "showLogo" ? "logoVisible" : key;
    setSliceOverrides((current) => {
      const next: Record<string, SliceOverride> = {};
      Object.entries(current).forEach(([id, override]) => { const cleaned = { ...override }; delete cleaned[mapped as keyof SliceOverride]; if (Object.keys(cleaned).length) next[id] = cleaned; });
      return next;
    });
  }, []);
  const snapPhysical = useCallback((value: number, cabinetMm: number) => round(Math.round(value / (cabinetMm / 1000)) * (cabinetMm / 1000), 3), []);
  const editCalculator = useCallback((group: CalculatorGroup, key: keyof PatternConfig, value: number) => { const other = calculatorSources.find((source) => source !== group), nextSources: [CalculatorGroup, CalculatorGroup] = calculatorSources.includes(group) ? [other || calculatorSources[0], group] : [calculatorSources[1], group]; setCalculatorSources(nextSources); setConfig((current) => { const next = { ...current, [key]: value } as PatternConfig, hasPhysical = nextSources.includes("physical"), hasRaster = nextSources.includes("raster"), hasPitch = nextSources.includes("pitch"); if (hasPhysical && hasRaster) next.pixelPitchMm = round(next.wallWidth * 1000 / next.resolutionWidth); else if (hasPhysical && hasPitch) { next.resolutionWidth = Math.max(1, Math.round(next.wallWidth * 1000 / next.pixelPitchMm)); next.resolutionHeight = Math.max(1, Math.round(next.wallHeight * 1000 / next.pixelPitchMm)); } else if (hasRaster && hasPitch) { next.wallWidth = snapPhysical(next.resolutionWidth * next.pixelPitchMm / 1000, next.cabinetWidth); next.wallHeight = snapPhysical(next.resolutionHeight * next.pixelPitchMm / 1000, next.cabinetHeight); } return next; }); }, [calculatorSources, snapPhysical]);
  const updateSelected = useCallback((patch: SliceOverride) => { if (!selectedSliceIds.length) return; setSliceOverrides((current) => { const next = { ...current }; selectedSliceIds.forEach((id) => { next[id] = { ...(next[id] || {}), ...patch }; }); return next; }); }, [selectedSliceIds]);

  const loadLogo = useCallback((file?: File) => { if (!file) return; const reader = new FileReader(); reader.onload = () => { if (typeof reader.result !== "string") return; setLogoData(reader.result); setLogoName(file.name); const image = new Image(); image.onload = () => setLogoImage(image); image.src = reader.result; }; reader.readAsDataURL(file); }, []);
  const applyXmlText = useCallback((xml: string, name: string, options: { linked?: boolean; path?: string; mtimeMs?: number; resetView?: boolean } = {}) => {
    try {
      const map = parseResolumeXml(xml), validIds = new Set(map.screens.flatMap((screen) => screen.slices.map((slice) => slice.id)));
      setResolumeMap(map); setRawXml(xml); setXmlName(name); setXmlPath(options.path || ""); setXmlUpdatedAt(options.mtimeMs || Date.now()); setXmlError(""); setSimulationFitSignal((value) => value + 1);
      setSelectedScreen((current) => Math.min(current, Math.max(0, map.screens.length - 1))); setSelectedSliceIds((current) => current.filter((id) => validIds.has(id))); setWorkspaceMode((current) => current === "simulation" ? "simulation" : "resolume");
      if (options.resetView) { setSelectedScreen(0); setSelectedSliceIds([]); zoomRef.current = 1; panRef.current = { x: 0, y: 0 }; setZoom(1); setPan({ x: 0, y: 0 }); }
      setXmlLinkState(options.linked ? "linked" : "unlinked");
      setNotice(options.linked ? `Resolume link updated: ${name}` : `Loaded ${map.screens.length} screens and ${map.screens.flatMap((screen) => screen.slices).length} slices`);
      return true;
    } catch (error) { setXmlError(error instanceof Error ? error.message : "Unable to read this XML file."); return false; }
  }, []);
  const loadXml = useCallback((file?: File) => { if (!file) return; const reader = new FileReader(); reader.onload = () => { if (applyXmlText(String(reader.result), file.name, { resetView: true })) { setXmlLinkState("unlinked"); setXmlPath(""); } }; reader.readAsText(file); }, [applyXmlText]);
  const loadDemoScene = useCallback(() => { applyXmlText(DEMO_RESOLUME_XML, "LO2S 3D Beta Demo.xml", { resetView: true }); setWorkspaceMode("simulation"); setControlTab("scene"); }, [applyXmlText]);
  const chooseXml = useCallback(async () => {
    const desktop = (window as PickerWindow).lo2sDesktop;
    if (!desktop) { xmlInputRef.current?.click(); return; }
    const result = await desktop.chooseResolumeXml();
    if (result.cancelled) return;
    if (!result.ok || !result.content || !result.name) { setXmlError(result.error || "Unable to open this XML preset."); return; }
    applyXmlText(result.content, result.name, { path: result.path, mtimeMs: result.mtimeMs, resetView: true });
  }, [applyXmlText]);
  const linkResolume = useCallback(async () => {
    const desktop = (window as PickerWindow).lo2sDesktop;
    if (!desktop) { setNotice("Live Resolume linking is available in the Windows app"); return; }
    setXmlLinkState("linking"); setXmlError("");
    const result = await desktop.linkLatestResolumeMap();
    if (!result.ok || !result.content || !result.name) { setXmlLinkState("unlinked"); setXmlError(result.error || "Unable to link the Resolume Advanced Output folder."); return; }
    applyXmlText(result.content, result.name, { linked: true, path: result.path, mtimeMs: result.mtimeMs, resetView: true });
  }, [applyXmlText]);
  const unlinkResolume = useCallback(async () => { await (window as PickerWindow).lo2sDesktop?.unlinkResolumeMap(); setXmlLinkState("unlinked"); setNotice("Resolume map unlinked"); }, []);
  useEffect(() => {
    const desktop = (window as PickerWindow).lo2sDesktop; if (!desktop) return;
    const removeUpdate = desktop.onResolumeXmlUpdated((result) => { if (result.ok && result.content && result.name) applyXmlText(result.content, result.name, { linked: true, path: result.path, mtimeMs: result.mtimeMs }); });
    const removeError = desktop.onResolumeLinkError((result) => { setXmlError(result.error || "The linked Resolume map could not be refreshed."); });
    return () => { removeUpdate(); removeError(); };
  }, [applyXmlText]);
  const stopSimulationInput = useCallback(() => {
    simulationInputStreamRef.current?.getTracks().forEach((track) => track.stop());
    simulationInputStreamRef.current = null;
    setSimulationSourceVideo(null);
    setSimulationSourceStatus("Not connected");
  }, []);
  const scanNativeSources = useCallback(async (kind: "ndi" | "spout") => {
    const desktop = (window as PickerWindow).lo2sDesktop;
    if (!desktop?.listNativeSources) { setSimulationNativeSources([]); setSimulationSourceStatus("Use the Windows beta for native sources"); return; }
    setSimulationNativeScanning(true);
    setSimulationSourceStatus(kind === "ndi" ? "Scanning the NDI network…" : "Scanning for Spout senders…");
    try {
      const result = await desktop.listNativeSources(kind);
      if (!result.ok) throw new Error(result.error || "Source scan failed.");
      const sources = result.sources || [];
      setSimulationNativeSources(sources);
      if (kind === "ndi") setSimulationNdiSourceId((current) => sources.some((source) => source.id === current) ? current : sources[0]?.id || "");
      else setSimulationSpoutSourceId((current) => sources.some((source) => source.id === current) ? current : sources[0]?.id || "");
      setSimulationSourceStatus(sources.length ? `${sources.length} ${kind === "ndi" ? "NDI source" : "Spout sender"}${sources.length === 1 ? "" : "s"} found` : `No ${kind === "ndi" ? "NDI sources" : "Spout senders"} found`);
    } catch (error) {
      setSimulationNativeSources([]);
      setSimulationSourceStatus(error instanceof Error ? error.message : "Unable to scan native sources.");
    } finally {
      setSimulationNativeScanning(false);
    }
  }, []);
  const disconnectNativeInput = useCallback(async () => {
    await (window as PickerWindow).lo2sDesktop?.disconnectNativeSource?.();
    setSimulationNativeConnected(false);
    setSimulationNativeKind(null);
    simulationNativeCanvasRef.current = null;
    setSimulationNativeCanvas(null);
    setSimulationSourceStatus("Not connected");
  }, []);
  const connectNativeInput = useCallback(async (qualityOverride?: "latency" | "quality", kindOverride?: "ndi" | "spout", sourceOverride?: string) => {
    const kind = kindOverride || (sourcePanelType === "ndi" || sourcePanelType === "spout" ? sourcePanelType : null);
    if (!kind) return;
    const desktop = (window as PickerWindow).lo2sDesktop;
    if (!desktop?.connectNativeSource) { setSimulationSourceStatus("Native sources require the Windows beta"); return; }
    const sourceId = sourceOverride || (kind === "ndi" ? simulationNdiSourceId : simulationSpoutSourceId);
    if (!sourceId) { setSimulationSourceStatus(`Choose a ${kind === "ndi" ? "NDI source" : "Spout sender"} first`); return; }
    await desktop.disconnectNativeSource();
    simulationNativeCanvasRef.current = null;
    setSimulationNativeCanvas(null);
    setSimulationNativeConnected(false);
    setSimulationNativeKind(kind);
    setSimulationSourceStatus("Connecting…");
    const result = await desktop.connectNativeSource(kind, sourceId, qualityOverride || simulationQuality);
    if (!result.ok) setSimulationSourceStatus(result.error || "The native source could not connect.");
  }, [simulationNdiSourceId, simulationQuality, simulationSpoutSourceId, sourcePanelType]);
  useEffect(() => {
    const desktop = (window as PickerWindow).lo2sDesktop;
    if (!desktop?.onNativeSourceFrame || !desktop.onNativeSourceStatus) return;
    const removeFrame = desktop.onNativeSourceFrame((frame) => {
      try {
        let canvas = simulationNativeCanvasRef.current;
        if (!canvas) {
          canvas = document.createElement("canvas");
          simulationNativeCanvasRef.current = canvas;
          setSimulationNativeCanvas(canvas);
        }
        if (canvas.width !== frame.width || canvas.height !== frame.height) { canvas.width = frame.width; canvas.height = frame.height; }
        const bytes = frame.data instanceof Uint8Array ? frame.data : new Uint8Array(frame.data);
        const expectedLength = frame.width * frame.height * 4;
        const rgba = bytes.byteLength >= expectedLength ? new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, expectedLength) : new Uint8ClampedArray(expectedLength);
        if (bytes.byteLength < expectedLength) rgba.set(bytes);
        canvas.getContext("2d", { alpha: true })?.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, frame.width, frame.height), 0, 0);
        canvas.dataset.frameVersion = String(Number(canvas.dataset.frameVersion || "0") + 1);
      } finally {
        desktop.nativeSourceFrameReady();
      }
    });
    const removeStatus = desktop.onNativeSourceStatus((status) => {
      setSimulationNativeConnected(status.status === "connected");
      if (status.status === "connected") setSimulationSourceStatus(`${status.name} · ${status.width || 0} × ${status.height || 0}${status.fps ? ` · ${status.fps.toFixed(2)} fps` : ""}`);
      else setSimulationSourceStatus(status.name || (status.status === "connecting" ? "Connecting…" : "Not connected"));
    });
    return () => { removeFrame(); removeStatus(); void desktop.disconnectNativeSource(); };
  }, []);
  useEffect(() => {
    if (sourcePanelType !== "ndi" && sourcePanelType !== "spout") return;
    const timer = window.setTimeout(() => void scanNativeSources(sourcePanelType), 0);
    return () => window.clearTimeout(timer);
  }, [scanNativeSources, sourcePanelType]);
  const connectSimulationInput = useCallback(async (qualityOverride?: "latency" | "quality", deviceOverride?: string) => {
    if (sourcePanelType !== "video") { setSimulationSourceStatus("Choose a native source below"); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setSimulationSourceStatus("Use the Windows beta for live video inputs"); return; }
    setSimulationSourceStatus("Connecting…");
    try {
      let devices = await navigator.mediaDevices.enumerateDevices();
      if (!devices.some((device) => device.kind === "videoinput" && device.label)) {
        const permissionStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        permissionStream.getTracks().forEach((track) => track.stop());
        devices = await navigator.mediaDevices.enumerateDevices();
      }
      const videoDevices = devices.filter((device) => device.kind === "videoinput");
      setSimulationInputDevices(videoDevices);
      const selected = videoDevices.find((device) => device.deviceId === (deviceOverride || simulationInputDeviceId)) || videoDevices[0];
      if (!selected) throw new Error("No video device was found.");
      setSimulationInputDeviceId(selected.deviceId);
      simulationInputStreamRef.current?.getTracks().forEach((track) => track.stop());
      const quality = qualityOverride || simulationQuality;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          deviceId: { exact: selected.deviceId },
          width: { ideal: quality === "quality" ? 3840 : 1280 },
          height: { ideal: quality === "quality" ? 2160 : 720 },
          frameRate: { ideal: quality === "quality" ? 60 : 30, max: 60 },
        },
      });
      const video = document.createElement("video");
      video.muted = true;
      video.autoplay = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      simulationInputStreamRef.current = stream;
      setSimulationSourceVideo(video);
      const settings = stream.getVideoTracks()[0]?.getSettings();
      setSimulationSourceStatus((selected.label || "Video input") + " · " + (settings?.width || video.videoWidth) + " × " + (settings?.height || video.videoHeight));
    } catch (error) {
      stopSimulationInput();
      setSimulationSourceStatus(error instanceof Error ? error.message : "Unable to connect this video source.");
    }
  }, [simulationInputDeviceId, simulationQuality, sourcePanelType, stopSimulationInput]);
  useEffect(() => () => { simulationInputStreamRef.current?.getTracks().forEach((track) => track.stop()); }, []);
  const saveBlob = useCallback(async (blob: Blob, filename: string) => { const desktop = (window as PickerWindow).lo2sDesktop; if (desktop?.saveExport) { const result = await desktop.saveExport(filename, "image/png", await blob.arrayBuffer(), "png"); if (!result.ok && !result.cancelled) throw new Error(result.error || "Unable to save the PNG."); return; } const picker = (window as PickerWindow).showSaveFilePicker; if (picker) try { const handle = await picker.call(window, { suggestedName: filename, types: [{ description: "PNG image", accept: { "image/png": [".png"] } }] }); const writable = await handle.createWritable(); await writable.write(blob); await writable.close(); return; } catch (error) { if (error instanceof DOMException && error.name === "AbortError") return; } const url = URL.createObjectURL(blob), anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }, []);
  const saveExportBlob = useCallback(async (blob: Blob, filename: string, mimeType: string) => {
    const desktop = (window as PickerWindow).lo2sDesktop;
    if (desktop?.saveExport) {
      const result = await desktop.saveExport(filename, mimeType, await blob.arrayBuffer(), "scene3d");
      if (result.cancelled) return false;
      if (!result.ok) throw new Error(result.error || "Unable to save the exported scene.");
      return true;
    }
    const url = URL.createObjectURL(blob), anchor = document.createElement("a");
    anchor.href = url; anchor.download = filename; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }, []);
  const export3DScene = useCallback(async () => {
    if (!resolumeMap || !allSlices.length || simulationExporting) { setNotice("Import a Resolume XML map before exporting the 3D scene"); return; }
    setSimulationExporting(true);
    setNotice("Building " + simulationExportFormat.toUpperCase() + " scene…");
    try {
      const result = await exportSimulationScene(simulationExportFormat, {
        projectName: resolumeMap.name || config.project,
        slices: allSlices,
        compositionWidth: resolumeMap.compositionWidth,
        compositionHeight: resolumeMap.compositionHeight,
        masterPitchMm: simulationMasterPitchMm,
        pitchBySlice: simulationPitchBySlice,
        depthBySlice: simulationDepthBySlice,
        curvatureBySlice: simulationCurvatureBySlice,
        pivotBySlice: simulationPivotBySlice,
        transforms: simulationTransforms,
        drawPatternTexture: drawSimulationTexture,
      });
      if (await saveExportBlob(result.blob, result.filename, result.mimeType)) setNotice("Exported " + result.filename + " · " + result.sliceCount + " screens · " + Math.round(result.triangleCount).toLocaleString() + " triangles");
    } catch (error) {
      setNotice(error instanceof Error ? "Export failed: " + error.message : "The 3D scene could not be exported.");
    } finally {
      setSimulationExporting(false);
    }
  }, [allSlices, config.project, drawSimulationTexture, resolumeMap, saveExportBlob, simulationCurvatureBySlice, simulationDepthBySlice, simulationExportFormat, simulationExporting, simulationMasterPitchMm, simulationPitchBySlice, simulationPivotBySlice, simulationTransforms]);
  const exportCurrent = useCallback(async () => { const canvas = document.createElement("canvas"); renderToCanvas(canvas, workspaceMode, mapView, activeScreen, undefined, false); const blob = await canvasBlob(canvas); if (!blob) return; const name = workspaceMode === "resolume" && resolumeMap ? `${slugify(mapView === "input" ? resolumeMap.name : activeScreen?.name || "output")}-${mapView}-${canvas.width}x${canvas.height}.png` : `${slugify(config.project)}-${config.pattern}-${canvas.width}x${canvas.height}.png`; await saveBlob(blob, name); setNotice(`Exported ${name}`); }, [activeScreen, config.pattern, config.project, mapView, renderToCanvas, resolumeMap, saveBlob, workspaceMode]);
  const exportOutputs = useCallback(async () => { if (!resolumeMap) return; const directoryPicker = (window as PickerWindow).showDirectoryPicker; let directory: DirectoryHandle | null = null; if (directoryPicker) try { directory = await directoryPicker.call(window); } catch (error) { if (error instanceof DOMException && error.name === "AbortError") return; } for (const screen of resolumeMap.screens) { const canvas = document.createElement("canvas"); renderToCanvas(canvas, "resolume", "output", screen, undefined, false); const blob = await canvasBlob(canvas); if (!blob) continue; const filename = `${slugify(screen.name)}-output-${canvas.width}x${canvas.height}.png`; if (directory) { const handle = await directory.getFileHandle(filename, { create: true }), writable = await handle.createWritable(); await writable.write(blob); await writable.close(); } else { const url = URL.createObjectURL(blob), anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); } } setNotice(`Exported ${resolumeMap.screens.length} output maps`); }, [renderToCanvas, resolumeMap]);
  const exportSelected = useCallback(async () => { if (!selectedSlices.length) return; for (const slice of selectedSlices) { const rect = mapView === "input" ? slice.input : slice.output, shifted = { ...slice, input: { ...slice.input, x: 0, y: 0, points: slice.input.points.map((p) => ({ x: p.x - rect.x, y: p.y - rect.y })) }, output: { ...slice.output, x: 0, y: 0, points: slice.output.points.map((p) => ({ x: p.x - rect.x, y: p.y - rect.y })) } }; const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(rect.width)); canvas.height = Math.max(1, Math.round(rect.height)); const ctx = canvas.getContext("2d", { alpha: true }); if (!ctx) continue; drawPixelMap(ctx, canvas.width, canvas.height, [shifted], mapView, config, logoImage, sliceOverrides, [], false); const blob = await canvasBlob(canvas); if (blob) await saveBlob(blob, `${slugify(slice.screenName)}-${slugify(slice.name)}-${mapView}-${canvas.width}x${canvas.height}.png`); } setNotice(`Exported ${selectedSlices.length} selected slice${selectedSlices.length > 1 ? "s" : ""}`); }, [config, logoImage, mapView, saveBlob, selectedSlices, sliceOverrides]);

  const saveProject = useCallback(async () => { const data = JSON.stringify({ version: 10, config, calculatorSources, workspaceMode, mapView, logoData, logoName, sliceOverrides, rawXml, xmlName, simulation: { transforms: simulationTransforms, depthM: simulationDepthM, curvature: simulationCurvature, curvatureOverrides: simulationCurvatureOverrides, tool: simulationTool, source: simulationSource, quality: simulationQuality, sourceOverrides: simulationSourceOverrides, camera: simulationCamera, transformSpace: simulationTransformSpace, pivot: simulationPivot, pivotOverrides: simulationPivotOverrides, gridVisible: simulationGridVisible, floorVisible: simulationFloorVisible, backgroundLevel: simulationBackgroundLevel } }, null, 2), blob = new Blob([data], { type: "application/json" }), picker = (window as PickerWindow).showSaveFilePicker, filename = `${slugify(config.project)}.lo2s-pattern.json`; if (picker) try { const handle = await picker.call(window, { suggestedName: filename, types: [{ description: "LO2S Pattern Lab project", accept: { "application/json": [".json"] } }] }); const writable = await handle.createWritable(); await writable.write(blob); await writable.close(); setNotice("Project saved"); return; } catch (error) { if (error instanceof DOMException && error.name === "AbortError") return; } const url = URL.createObjectURL(blob), anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }, [calculatorSources, config, logoData, logoName, mapView, rawXml, simulationBackgroundLevel, simulationCamera, simulationCurvature, simulationCurvatureOverrides, simulationDepthM, simulationFloorVisible, simulationGridVisible, simulationPivot, simulationPivotOverrides, simulationQuality, simulationSource, simulationSourceOverrides, simulationTool, simulationTransformSpace, simulationTransforms, sliceOverrides, workspaceMode, xmlName]);
  const loadProject = useCallback((file?: File) => { if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const data = JSON.parse(String(reader.result)), migrated = { ...DEFAULT_CONFIG, ...data.config } as PatternConfig & { pixelPitchCm?: number; checkerColor?: string }; if (!data.config?.pixelPitchMm && data.config?.pixelPitchCm) migrated.pixelPitchMm = data.config.pixelPitchCm * 10; if (data.config?.checkerColor && !data.config?.checkerColorA) { migrated.checkerColorA = data.config.checkerColor; migrated.checkerColorB = "#004d3d"; } setConfig(migrated); if (Array.isArray(data.calculatorSources) && data.calculatorSources.length === 2) setCalculatorSources(data.calculatorSources); if (data.workspaceMode) setWorkspaceMode(data.workspaceMode); if (data.mapView) setMapView(data.mapView); if (data.sliceOverrides) setSliceOverrides(data.sliceOverrides); if (data.rawXml) { setRawXml(data.rawXml); setResolumeMap(parseResolumeXml(data.rawXml)); setXmlName(data.xmlName || "Project XML"); } if (data.logoData) { setLogoData(data.logoData); setLogoName(data.logoName || "Project logo"); const image = new Image(); image.onload = () => setLogoImage(image); image.src = data.logoData; } if (data.simulation) { setSimulationTransforms(data.simulation.transforms || {}); setSimulationDepthM(clamp(data.simulation.depthM ?? 0.1, 0.01, 0.5)); setSimulationCurvature(data.simulation.curvature || { horizontal: 0, vertical: 0 }); setSimulationCurvatureOverrides(data.simulation.curvatureOverrides || {}); setSimulationTool(data.simulation.tool || "translate"); setSimulationSource(normalizeSimulationSource(data.simulation.source)); setSimulationQuality(data.simulation.quality || "latency"); setSimulationSourceOverrides(normalizeSourceOverrides(data.simulation.sourceOverrides)); setSimulationCamera(data.simulation.camera); setSimulationTransformSpace(data.simulation.transformSpace || "local"); setSimulationPivot(data.simulation.pivot || "bottom-center"); setSimulationPivotOverrides(data.simulation.pivotOverrides || {}); setSimulationGridVisible(data.simulation.gridVisible ?? true); setSimulationFloorVisible(data.simulation.floorVisible ?? true); setSimulationBackgroundLevel(data.simulation.backgroundLevel ?? 100); } undoHistoryRef.current = []; redoHistoryRef.current = []; setHistoryState({}); setNotice("Project loaded"); } catch { setNotice("That project file could not be read"); } }; reader.readAsText(file); }, []);

  const beginInteraction = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button === 1 || (event.button === 0 && spaceDown)) { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y, moved: false }; return; }
    if (event.button === 0 && workspaceMode === "resolume") { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); selectionDragRef.current = { startX: event.clientX, startY: event.clientY, currentX: event.clientX, currentY: event.clientY, moved: false, additive: event.ctrlKey || event.shiftKey, initialIds: [...selectedSliceIds] }; setSelectionMarquee(null); }
  };
  const moveInteraction = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) { const dx = event.clientX - dragRef.current.x, dy = event.clientY - dragRef.current.y; if (Math.abs(dx) + Math.abs(dy) > 3) dragRef.current.moved = true; const nextPan = { x: dragRef.current.panX + dx, y: dragRef.current.panY + dy }; panRef.current = nextPan; setPan(nextPan); return; }
    const selection = selectionDragRef.current, stage = canvasStageRef.current; if (!selection || !stage) return; selection.currentX = event.clientX; selection.currentY = event.clientY; if (Math.abs(selection.currentX - selection.startX) + Math.abs(selection.currentY - selection.startY) > 4) selection.moved = true; if (!selection.moved) return;
    const stageBox = stage.getBoundingClientRect(), left = Math.min(selection.startX, selection.currentX), top = Math.min(selection.startY, selection.currentY); setSelectionMarquee({ left: left - stageBox.left, top: top - stageBox.top, width: Math.abs(selection.currentX - selection.startX), height: Math.abs(selection.currentY - selection.startY) });
  };
  const endInteraction = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) { dragRef.current = null; return; }
    const selection = selectionDragRef.current, canvas = canvasRef.current; selectionDragRef.current = null; setSelectionMarquee(null); if (!selection || !canvas) return;
    selection.currentX = event.clientX; selection.currentY = event.clientY; if (Math.abs(selection.currentX - selection.startX) + Math.abs(selection.currentY - selection.startY) > 4) selection.moved = true;
    const canvasBox = canvas.getBoundingClientRect();
    if (!selection.moved) {
      const insideCanvas = event.clientX >= canvasBox.left && event.clientX <= canvasBox.right && event.clientY >= canvasBox.top && event.clientY <= canvasBox.bottom;
      const sourceX = insideCanvas ? (event.clientX - canvasBox.left) * outputWidth / canvasBox.width : -1, sourceY = insideCanvas ? (event.clientY - canvasBox.top) * outputHeight / canvasBox.height : -1;
      const hit = insideCanvas ? [...activeSlices].reverse().find((slice) => { const rect = mapView === "input" ? slice.input : slice.output; return sourceX >= rect.x && sourceX <= rect.x + rect.width && sourceY >= rect.y && sourceY <= rect.y + rect.height; }) : undefined;
      if (!hit) { if (!selection.additive) setSelectedSliceIds([]); return; }
      if (selection.additive) setSelectedSliceIds((current) => current.includes(hit.id) ? current.filter((id) => id !== hit.id) : [...current, hit.id]); else setSelectedSliceIds([hit.id]); return;
    }
    const selectionLeft = Math.min(selection.startX, selection.currentX), selectionRight = Math.max(selection.startX, selection.currentX), selectionTop = Math.min(selection.startY, selection.currentY), selectionBottom = Math.max(selection.startY, selection.currentY);
    const hits = activeSlices.filter((slice) => { const rect = mapView === "input" ? slice.input : slice.output, left = canvasBox.left + rect.x * canvasBox.width / outputWidth, right = left + rect.width * canvasBox.width / outputWidth, top = canvasBox.top + rect.y * canvasBox.height / outputHeight, bottom = top + rect.height * canvasBox.height / outputHeight; return right >= selectionLeft && left <= selectionRight && bottom >= selectionTop && top <= selectionBottom; }).map((slice) => slice.id);
    setSelectedSliceIds(selection.additive ? Array.from(new Set([...selection.initialIds, ...hits])) : hits);
  };
  const cancelInteraction = () => { dragRef.current = null; selectionDragRef.current = null; setSelectionMarquee(null); };
  const adjustZoom = (next: number, clientX?: number, clientY?: number) => {
    const currentZoom = zoomRef.current, target = clamp(next, 0.05 / baseScale, 8 / baseScale), canvas = canvasRef.current;
    if (canvas && clientX !== undefined && clientY !== undefined) {
      const box = canvas.getBoundingClientRect(), centerX = box.left + box.width / 2, centerY = box.top + box.height / 2, ratio = target / currentZoom, currentPan = panRef.current;
      const nextPan = { x: currentPan.x + (clientX - centerX) * (1 - ratio), y: currentPan.y + (clientY - centerY) * (1 - ratio) }; panRef.current = nextPan; setPan(nextPan);
    }
    zoomRef.current = target; setZoom(target);
  };
  const resetView = () => { const stage = canvasStageRef.current; if (stage?.clientWidth && stage.clientHeight) setStageBounds({ width: stage.clientWidth, height: stage.clientHeight }); zoomRef.current = 1; panRef.current = { x: 0, y: 0 }; setZoom(1); setPan({ x: 0, y: 0 }); setFullscreenMode("fit"); };
  const actualPixels = () => { zoomRef.current = 1; panRef.current = { x: 0, y: 0 }; setFullscreenMode("actual"); setZoom(1); setPan({ x: 0, y: 0 }); };
  const changeMapView = (view: MapView) => { setMapView(view); setSelectedSliceIds([]); resetView(); };
  const changeWorkspace = (mode: WorkspaceMode) => { setWorkspaceMode(mode); setSelectedSliceIds([]); setControlTab(mode === "simulation" ? "scene" : "setup"); resetView(); };
  const applyGlobalToAll = () => { setSliceOverrides({}); setNotice("Global settings applied to every slice"); };
  const enterFullscreen = useCallback(async () => {
    const host = fullscreenHostRef.current;
    if (!host) return;
    const desktop = (window as PickerWindow).lo2sDesktop;
    if (desktop?.setViewerFullscreen) {
      host.classList.add("viewer-fullscreen");
      await desktop.setViewerFullscreen(true);
      return;
    }
    await host.requestFullscreen?.();
  }, []);
  useEffect(() => {
    const desktop = (window as PickerWindow).lo2sDesktop;
    const leave = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !fullscreenHostRef.current?.classList.contains("viewer-fullscreen")) return;
      fullscreenHostRef.current.classList.remove("viewer-fullscreen");
      void desktop?.setViewerFullscreen(false);
    };
    const detach = desktop?.onViewerFullscreenChanged?.((enabled) => {
      fullscreenHostRef.current?.classList.toggle("viewer-fullscreen", enabled);
    });
    window.addEventListener("keydown", leave);
    return () => { window.removeEventListener("keydown", leave); detach?.(); };
  }, []);
  const selectPattern = (pattern: PatternType) => { setWorkspaceMode("patterns"); update("pattern", pattern); };

  const overlayRows: Array<{ key: "showLabels" | "showDiagonals" | "showCircles" | "showSafeArea"; label: string; color: "labelColor" | "diagonalColor" | "circleColor" | "safeAreaColor" }> = [
    { key: "showLabels", color: "labelColor", label: "Labels" }, { key: "showDiagonals", color: "diagonalColor", label: "Cross" }, { key: "showCircles", color: "circleColor", label: "Circle" }, { key: "showSafeArea", color: "safeAreaColor", label: "Safe area" },
  ];
  const controlTabs: ControlTab[] = workspaceMode === "simulation" ? ["scene", "sources"] : workspaceMode === "resolume" ? ["setup", "info", "deco", "logo"] : ["setup", "overlays", "logo"];
  const infoFields: Array<{ key: "namePosition" | "coordinatesPosition" | "resolutionPosition" | "aspectPosition" | "physicalSizePosition"; label: string }> = [
    { key: "namePosition", label: "Name" }, { key: "coordinatesPosition", label: "Coordinates" }, { key: "resolutionPosition", label: "Resolution" }, { key: "aspectPosition", label: "Aspect ratio" }, { key: "physicalSizePosition", label: "Physical size" },
  ];

  return <main className="app-shell">
    <header className="topbar"><div className="brand-lockup"><img src="brand/lo2s-logo-white.svg" alt="LO2S" className="brand-logo" /><span className="brand-divider" /><span className="brand-product">Pattern Lab <b>Beta</b></span></div><nav className="workspace-tabs" aria-label="Workspace mode"><button className={workspaceMode === "patterns" ? "active" : ""} onClick={() => changeWorkspace("patterns")}>Test Patterns</button><button className={workspaceMode === "resolume" ? "active" : ""} onClick={() => changeWorkspace("resolume")}>Resolume Pixel Map</button><button className={workspaceMode === "simulation" ? "active" : ""} onClick={() => changeWorkspace("simulation")}>3D Simulation <em>Beta</em></button></nav><div className="topbar-actions"><span className="integrity-chip"><i className={workspaceMode === "simulation" || !stats.mismatch ? "green" : "amber"} />{workspaceMode === "simulation" ? "WYSIWYG scene" : stats.mismatch ? "Pitch mismatch" : "Ratio preserved"}</span>{workspaceMode === "simulation" && <><button className="button history-button" disabled={!historyState.undo} title={historyState.undo ? `Undo ${historyState.undo}` : "Nothing to undo"} onClick={undoSimulation}>Undo</button><button className="button history-button" disabled={!historyState.redo} title={historyState.redo ? `Redo ${historyState.redo}` : "Nothing to redo"} onClick={redoSimulation}>Redo</button></>}<button className="button" onClick={enterFullscreen}>Fullscreen</button>{workspaceMode !== "simulation" && <button className="button primary" onClick={exportCurrent}>Export PNG</button>}</div></header>
    <section className="workspace">
      <aside className="left-panel panel"><div className="panel-tabs" data-count={controlTabs.length}>{controlTabs.map((tab) => <button key={tab} className={controlTab === tab ? "active" : ""} onClick={() => setControlTab(tab)}>{workspaceMode === "resolume" && tab === "setup" ? "Source" : tab}</button>)}</div><div className="panel-content">
        {controlTab === "scene" && workspaceMode === "simulation" && <>
          <section className="compact-section"><span className="eyebrow">Resolume scene map</span><button className="drop-button" onClick={chooseXml} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); loadXml(event.dataTransfer.files?.[0]); }}><strong>{xmlName || "Choose XML"}</strong><small>{resolumeMap ? `${allSlices.length} slices across ${resolumeMap.screens.length} screens` : "Import an Advanced Output preset"}</small></button><input ref={xmlInputRef} hidden type="file" accept=".xml,text/xml" onChange={(event) => loadXml(event.target.files?.[0])} />{!resolumeMap && <button className="panel-action demo-action" onClick={loadDemoScene}>Load beta demo scene</button>}{xmlError && <p className="warning">{xmlError}</p>}</section>
          <section className="compact-section control-groups simulation-controls"><div className="section-title"><span>Scene geometry</span><small>physical scale</small></div>
            <div className="control-group"><div className="control-group-title">Extrusion depth</div><div className="slider-control"><input aria-label="Base extrusion depth" type="range" min="1" max="50" step="0.5" value={simulationDepthM * 100} onPointerDown={() => recordSimulationHistory("Change extrusion depth")} onChange={(event) => setSimulationDepthM(clamp(Number(event.target.value), 1, 50) / 100)} /><input aria-label="Base extrusion depth value" className="precise-input" type="number" min="1" max="50" step="0.5" value={round(simulationDepthM * 100, 1)} onFocus={() => recordSimulationHistory("Enter extrusion depth")} onChange={(event) => setSimulationDepthM(clamp(Number(event.target.value), 1, 50) / 100)} /><span>cm</span><button onClick={() => { if (simulationDepthM === 0.1) return; recordSimulationHistory("Reset extrusion depth"); setSimulationDepthM(0.1); }}>Reset</button></div><label className="select-field pivot-select"><span>{selectedSlices.length ? `Pivot · ${selectedSlices.length} selected` : "Global slice pivot"}</span><select value={selectedSimulationPivot === "mixed" ? "" : selectedSimulationPivot} onChange={(event) => changeSimulationPivot(event.target.value as SlicePivot)}>{selectedSimulationPivot === "mixed" && <option value="" disabled>Mixed pivots</option>}<option value="bottom-left">Bottom left</option><option value="bottom-center">Bottom centre</option><option value="bottom-right">Bottom right</option></select></label><small className="micro-note">Depth follows the curved surface · transform values follow the selected pivot.</small></div>
            <div className="control-group"><div className="control-group-title">Screen curvature</div><div className="appearance-control-title curve-title"><span>Horizontal curve</span><small>{selectedCurvature.horizontal === null ? "Mixed" : selectedCurvature.horizontal === 0 ? "Flat" : selectedCurvatureRadius.horizontal ? `${selectedCurvatureRadius.horizontal.toFixed(2)} m radius` : "Per-slice radius"}</small></div><div className="slider-control"><input aria-label="Horizontal curve" type="range" min="-180" max="180" step="1" value={selectedCurvature.horizontal ?? 0} onPointerDown={() => recordSimulationHistory("Change horizontal curve")} onChange={(event) => applySimulationCurvature("horizontal", Number(event.target.value))} /><input aria-label="Horizontal curve value" className="precise-input" type="number" min="-180" max="180" step="1" value={selectedCurvature.horizontal ?? ""} placeholder="—" onFocus={() => recordSimulationHistory("Enter horizontal curve")} onChange={(event) => applySimulationCurvature("horizontal", Number(event.target.value))} /><span>°</span><button onClick={() => { if (selectedCurvature.horizontal === 0) return; recordSimulationHistory("Reset horizontal curve"); applySimulationCurvature("horizontal", 0); }}>Reset</button></div><div className="appearance-control-title curve-title"><span>Vertical curve</span><small>{selectedCurvature.vertical === null ? "Mixed" : selectedCurvature.vertical === 0 ? "Flat" : selectedCurvatureRadius.vertical ? `${selectedCurvatureRadius.vertical.toFixed(2)} m radius` : "Per-slice radius"}</small></div><div className="slider-control"><input aria-label="Vertical curve" type="range" min="-180" max="180" step="1" value={selectedCurvature.vertical ?? 0} onPointerDown={() => recordSimulationHistory("Change vertical curve")} onChange={(event) => applySimulationCurvature("vertical", Number(event.target.value))} /><input aria-label="Vertical curve value" className="precise-input" type="number" min="-180" max="180" step="1" value={selectedCurvature.vertical ?? ""} placeholder="—" onFocus={() => recordSimulationHistory("Enter vertical curve")} onChange={(event) => applySimulationCurvature("vertical", Number(event.target.value))} /><span>°</span><button onClick={() => { if (selectedCurvature.vertical === 0) return; recordSimulationHistory("Reset vertical curve"); applySimulationCurvature("vertical", 0); }}>Reset</button></div><small className="micro-note">Positive bends the edges toward the viewer · negative bends the centre toward the viewer. The selected extrusion depth follows the complete curved surface.</small></div>
            <div className="control-group"><div className="control-group-title">Transform axes</div><div className="segmented"><button className={simulationTransformSpace === "local" ? "active" : ""} onClick={() => { if (simulationTransformSpace === "local") return; recordSimulationHistory("Use local axes"); setSimulationTransformSpace("local"); }}>Local axes</button><button className={simulationTransformSpace === "world" ? "active" : ""} onClick={() => { if (simulationTransformSpace === "world") return; recordSimulationHistory("Use world axes"); setSimulationTransformSpace("world"); }}>World axes</button></div><div className="auto-size"><span>Scale</span><strong>Locked</strong><small>Size follows XML and physical pitch only</small></div></div>
            <div className="control-group"><div className="control-group-title">Transform data</div>{selectedTransformPosition ? <><div className="transform-field-title">Position · world metres</div><div className="transform-grid"><SignedNumberField label="X" value={selectedTransformPosition[0]} suffix="m" onCommit={(value) => updateManualPosition(0, value)} /><SignedNumberField label="Y" value={selectedTransformPosition[1]} suffix="m" onCommit={(value) => updateManualPosition(1, value)} /><SignedNumberField label="Z" value={selectedTransformPosition[2]} suffix="m" onCommit={(value) => updateManualPosition(2, value)} /></div><div className="transform-field-title">Rotation · degrees</div><div className="transform-grid"><SignedNumberField label="X" value={selectedTransformRotation?.[0] ?? null} suffix="°" step={1} onCommit={(value) => updateManualRotation(0, value)} /><SignedNumberField label="Y" value={selectedTransformRotation?.[1] ?? null} suffix="°" step={1} onCommit={(value) => updateManualRotation(1, value)} /><SignedNumberField label="Z" value={selectedTransformRotation?.[2] ?? null} suffix="°" step={1} onCommit={(value) => updateManualRotation(2, value)} /></div><button className="panel-action" onClick={resetSelectedTransforms}>Reset transform</button>{selectedSlices.length > 1 && <small className="micro-note">Mixed values show —. Enter or scroll a value to apply it to every selected slice.</small>}</> : <p className="micro-note">Select a slice to enter exact transform values. Hover a value and scroll to adjust it.</p>}</div>
            <div className="control-group"><div className="control-group-title">Scene appearance</div><div className="visibility-row"><button className={simulationFloorVisible ? "visibility-button active" : "visibility-button"} onClick={() => { recordSimulationHistory(simulationFloorVisible ? "Hide floor" : "Show floor"); setSimulationFloorVisible((value) => !value); }}>{simulationFloorVisible ? "Floor visible" : "Floor hidden"}</button><button className={simulationGridVisible ? "visibility-button active" : "visibility-button"} onClick={() => { recordSimulationHistory(simulationGridVisible ? "Hide floor grid" : "Show floor grid"); setSimulationGridVisible((value) => !value); }}>{simulationGridVisible ? "Grid visible" : "Grid hidden"}</button></div><div className="appearance-control-title"><span>Background brightness</span><small>100% original · 200% maximum</small></div><div className="slider-control"><input aria-label="Background brightness" type="range" min="0" max="200" value={simulationBackgroundLevel} onPointerDown={() => recordSimulationHistory("Change background brightness")} onChange={(event) => setSimulationBackgroundLevel(Number(event.target.value))} /><input aria-label="Background brightness value" className="precise-input" type="number" min="0" max="200" value={simulationBackgroundLevel} onFocus={() => recordSimulationHistory("Enter background brightness")} onChange={(event) => setSimulationBackgroundLevel(clamp(Number(event.target.value), 0, 200))} /><span>%</span><button onClick={() => { if (simulationBackgroundLevel === 100) return; recordSimulationHistory("Reset background brightness"); setSimulationBackgroundLevel(100); }}>Reset</button></div></div>
          </section>
        </>}
        {controlTab === "sources" && workspaceMode === "simulation" && <section className="compact-section control-groups">
          <div className="section-title"><span>Video texture</span><small>one decode per source</small></div>
          <div className="control-group">
            <div className="control-group-title">Global source</div>
            <label className="select-field"><span>Feed</span><select value={simulationSource} onChange={(event) => {
              recordSimulationHistory("Change global source");
              const next = event.target.value as SimulationSource;
              stopSimulationInput();
              void disconnectNativeInput();
              setSimulationSource(next);
              setSimulationSourceStatus(next === "pattern" ? "Native · full quality" : "Select or connect the source below");
            }}>
              <option value="pattern">Pattern Generator</option>
              <option value="video">Video Devices</option>
              <option value="ndi">NDI</option>
              <option value="spout">Spout</option>
            </select></label>
          </div>
          <div className="control-group">
            <div className="control-group-title">Selected slice override</div>
            <label className="select-field"><span>{selectedSliceIds.length ? `${selectedSliceIds.length} selected` : "Select a slice first"}</span><select disabled={!selectedSliceIds.length} value={selectedSourceOverride} onChange={(event) => {
              const value = event.target.value as "inherit" | SimulationSource;
              recordSimulationHistory(`Change source for ${selectedSliceIds.length} slice${selectedSliceIds.length > 1 ? "s" : ""}`);
              stopSimulationInput();
              void disconnectNativeInput();
              setSimulationSourceOverrides((current) => {
                const next = { ...current };
                selectedSliceIds.forEach((id) => { if (value === "inherit") delete next[id]; else next[id] = value; });
                return next;
              });
            }}>
              {selectedSourceOverride === "mixed" && <option value="mixed" disabled>Mixed sources</option>}
              <option value="inherit">Inherit global source</option>
              <option value="pattern">Pattern Generator</option>
              <option value="video">Video Devices · Full Source</option>
              <option value="ndi">NDI · Full Source</option>
              <option value="spout">Spout · Full Source</option>
            </select></label>
            <small className="micro-note">Global feeds use each slice’s XML crop. Overrides default to the full source.</small>
            {selectedSliceIds.length > 0 && <button className="panel-action" disabled={selectedSourceOverride === "inherit"} onClick={() => {
              recordSimulationHistory(`Reset source for ${selectedSliceIds.length} slice${selectedSliceIds.length > 1 ? "s" : ""}`);
              setSimulationSourceOverrides((current) => {
                const next = { ...current };
                selectedSliceIds.forEach((id) => delete next[id]);
                return next;
              });
            }}>Reset selected to global</button>}
          </div>
          {sourcePanelType === "pattern" ? <div className="control-group source-connect">
            <div className="control-group-title">Pattern Generator</div>
            <div className="unit-readout"><span>Render quality</span><strong>Native · full quality</strong></div>
          </div> : <div className="control-group source-connect">
            <div className="control-group-title">{sourcePanelType === "video" ? "Video devices" : sourcePanelType === "ndi" ? "NDI input" : "Spout input"}</div>
            <div className="segmented">
              <button className={simulationQuality === "latency" ? "active" : ""} onClick={() => { if (simulationQuality === "latency") return; recordSimulationHistory("Use low latency source"); setSimulationQuality("latency"); if (sourcePanelType === "video" && simulationSourceVideo) void connectSimulationInput("latency"); else if (simulationNativeConnected && (sourcePanelType === "ndi" || sourcePanelType === "spout")) void connectNativeInput("latency", sourcePanelType); }}>Low latency</button>
              <button className={simulationQuality === "quality" ? "active" : ""} onClick={() => { if (simulationQuality === "quality") return; recordSimulationHistory("Use high quality source"); setSimulationQuality("quality"); if (sourcePanelType === "video" && simulationSourceVideo) void connectSimulationInput("quality"); else if (simulationNativeConnected && (sourcePanelType === "ndi" || sourcePanelType === "spout")) void connectNativeInput("quality", sourcePanelType); }}>High quality</button>
            </div>
            {sourcePanelType === "video" ? <>
              <label className="select-field"><span>Device</span><select value={simulationInputDeviceId} onChange={(event) => setSimulationInputDeviceId(event.target.value)}><option value="">Auto-detect video device</option>{simulationInputDevices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || "Video input " + (index + 1)}</option>)}</select></label>
              <div className="source-actions"><button className="panel-action" onClick={() => void connectSimulationInput()}>{simulationSourceVideo ? "Reconnect device" : "Connect device"}</button>{simulationSourceVideo && <button className="panel-action" onClick={stopSimulationInput}>Disconnect</button>}</div>
              <p className={simulationSourceVideo ? "source-status connected" : "source-status"}>{simulationSourceStatus}</p>
              <small className="micro-note">Webcams and capture cards use the existing tested video-device pipeline.</small>
            </> : <>
              <label className="select-field"><span>Available</span><select value={sourcePanelType === "ndi" ? simulationNdiSourceId : simulationSpoutSourceId} disabled={simulationNativeScanning || !simulationNativeSources.length} onChange={(event) => { const sourceId = event.target.value; if (sourcePanelType === "ndi") setSimulationNdiSourceId(sourceId); else setSimulationSpoutSourceId(sourceId); if (simulationNativeConnected) void connectNativeInput(undefined, sourcePanelType, sourceId); }}>
                {!simulationNativeSources.length && <option value="">{simulationNativeScanning ? "Scanning…" : "No sources found"}</option>}
                {simulationNativeSources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
              </select></label>
              <div className="source-actions"><button className="panel-action" onClick={() => void connectNativeInput()} disabled={!simulationNativeSources.length}>{simulationNativeConnected ? "Reconnect source" : "Connect source"}</button><button className="panel-action" onClick={() => void scanNativeSources(sourcePanelType)}>Refresh list</button>{simulationNativeConnected && <button className="panel-action" onClick={() => void disconnectNativeInput()}>Disconnect</button>}</div>
              <p className={simulationNativeConnected ? "source-status connected" : "source-status"}>{simulationSourceStatus}</p>
              <small className="micro-note">{sourcePanelType === "ndi" ? "Direct full-bandwidth NDI receiver · latest-frame delivery." : "Direct Spout sender receiver · no camera bridge."}</small>
            </>}
          </div>}
        </section>}
        {controlTab === "setup" && workspaceMode === "patterns" && <><section className="compact-section"><span className="eyebrow">Project</span><input className="project-name" value={config.project} onChange={(event) => update("project", event.target.value)} /></section><section className="compact-section"><div className="section-title"><span>Linked wall calculator</span><small>{calculatorSources.join(" + ")} → auto</small></div><div className="field-grid"><ExpressionField label="Width" value={config.wallWidth} suffix="m" onCommit={(value) => editCalculator("physical", "wallWidth", snapPhysical(value, config.cabinetWidth))} /><ExpressionField label="Height" value={config.wallHeight} suffix="m" onCommit={(value) => editCalculator("physical", "wallHeight", snapPhysical(value, config.cabinetHeight))} /></div><div className="field-grid"><ExpressionField label="Raster W" value={config.resolutionWidth} suffix="px" integer onCommit={(value) => editCalculator("raster", "resolutionWidth", value)} /><ExpressionField label="Raster H" value={config.resolutionHeight} suffix="px" integer onCommit={(value) => editCalculator("raster", "resolutionHeight", value)} /></div><ExpressionField label="Pixel pitch" value={config.pixelPitchMm} suffix="mm" onCommit={(value) => editCalculator("pitch", "pixelPitchMm", value)} /><div className="calc-readout"><span>Calculated pitch</span><strong>{stats.pitchX.toFixed(4)} × {stats.pitchY.toFixed(4)} mm</strong></div>{stats.mismatch && <p className="warning">Horizontal and vertical pitch do not match.</p>}</section><section className="compact-section"><div className="section-title"><span>Cabinet calculator</span><small>expressions enabled</small></div><div className="field-grid"><ExpressionField label="Cabinet W" value={config.cabinetWidth} suffix="mm" integer onCommit={(value) => update("cabinetWidth", value)} /><ExpressionField label="Cabinet H" value={config.cabinetHeight} suffix="mm" integer onCommit={(value) => update("cabinetHeight", value)} /></div><div className="cabinet-summary"><span>{stats.cols.toFixed(1)} × {stats.rows.toFixed(1)}</span><strong>{Math.round(stats.cols * stats.rows)} cabinets</strong></div>{stats.cabinetRemainder && <p className="warning">Wall size is not an exact cabinet multiple.</p>}</section></>}
        {controlTab === "setup" && workspaceMode === "resolume" && <>
          <section className="compact-section"><span className="eyebrow">Advanced Output XML</span><div className="xml-actions"><button className="drop-button" onClick={chooseXml} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); loadXml(event.dataTransfer.files?.[0]); }}><strong>Choose XML</strong><small>Select a preset manually</small></button><button className={`drop-button link-button ${xmlLinkState === "linked" ? "active" : ""}`} onClick={xmlLinkState === "linked" ? unlinkResolume : linkResolume}><strong>{xmlLinkState === "linked" ? "Unlink Resolume Map" : xmlLinkState === "linking" ? "Linking…" : "Link Resolume Map"}</strong><small>{xmlLinkState === "linked" ? "Watching for saved changes" : "Follow the latest Advanced Output preset"}</small></button></div><input ref={xmlInputRef} hidden type="file" accept=".xml,text/xml" onChange={(event) => loadXml(event.target.files?.[0])} />{xmlName && <div className={`file-status ${xmlLinkState === "linked" ? "linked" : ""}`} title={xmlPath}><i /><span><strong>{xmlLinkState === "linked" ? "LIVE" : "FILE"}</strong> {xmlName}{xmlUpdatedAt ? ` · ${new Date(xmlUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}</span></div>}{xmlError && <p className="warning">{xmlError}</p>}</section>
          <section className="compact-section"><span className="eyebrow">Map view</span><div className="segmented"><button className={mapView === "input" ? "active" : ""} onClick={() => changeMapView("input")}>Input</button><button className={mapView === "output" ? "active" : ""} onClick={() => changeMapView("output")}>Output</button></div></section>
          {resolumeMap && <section className="compact-section">
            <label className="select-field"><span>Screen</span><select value={mapView === "input" ? "combined" : selectedScreen} disabled={mapView === "input"} onChange={(event) => { setSelectedScreen(Number(event.target.value)); setSelectedSliceIds([]); resetView(); }}><option value="combined">Combined Input</option>{mapView === "output" && resolumeMap.screens.map((screen, index) => <option key={screen.name} value={index}>{screen.name} — {screen.width} × {screen.height}</option>)}</select></label>
            <label className="select-field"><span>Slice selection</span><select value={selectedSliceIds.length === 1 ? selectedSliceIds[0] : selectedSliceIds.length > 1 ? "multiple" : "none"} onChange={(event) => setSelectedSliceIds(event.target.value === "none" ? [] : [event.target.value])}><option value="none">Click map or choose…</option>{selectedSliceIds.length > 1 && <option value="multiple">{selectedSliceIds.length} slices selected</option>}{activeSlices.map((slice) => <option key={slice.id} value={slice.id}>{slice.name}</option>)}</select></label>
            <div className="map-summary"><strong>{outputWidth} × {outputHeight}</strong><span>{activeSlices.length} slices · {resolumeMap.screens.length} screens</span></div>
          </section>}
          <section className="compact-section panel-geometry"><div className="section-title"><span>LED panel geometry</span><small>{selectedSliceIds.length ? "selected slices" : "global master"}</small></div><div className="field-grid"><ExpressionField label="Panel W" value={selectedOverride.cabinetWidth ?? config.cabinetWidth} suffix="mm" integer onCommit={(value) => selectedSliceIds.length ? updateSelected({ cabinetWidth: value }) : updateGlobal("cabinetWidth", value)} /><ExpressionField label="Panel H" value={selectedOverride.cabinetHeight ?? config.cabinetHeight} suffix="mm" integer onCommit={(value) => selectedSliceIds.length ? updateSelected({ cabinetHeight: value }) : updateGlobal("cabinetHeight", value)} /></div><ExpressionField label="Pixel pitch" value={selectedOverride.pixelPitchMm ?? config.pixelPitchMm} suffix="mm" onCommit={(value) => selectedSliceIds.length ? updateSelected({ pixelPitchMm: value }) : updateGlobal("pixelPitchMm", value)} /><div className="auto-size"><span>Checker block</span><strong>{cabinetPixels({ ...config, ...selectedOverride }).width} × {cabinetPixels({ ...config, ...selectedOverride }).height} px</strong><small>Calculated from this panel geometry</small></div></section>
        </>}
        {controlTab === "overlays" && workspaceMode === "patterns" && <section className="compact-section overlay-stack control-groups">
          <div className="section-title"><span>Test pattern overlays</span><small>global</small></div>
          <div className="control-group"><div className="control-group-title">Pattern surface</div><div className="overlay-row"><button className={config.showPatternCheckerboard ? "switch on" : "switch"} onClick={() => update("showPatternCheckerboard", !config.showPatternCheckerboard)}><i /><span>Cabinet checker</span></button></div>{config.showPatternCheckerboard && <><div className="checker-colors"><label><span>Checker A</span><input type="color" value={config.checkerColorA} onChange={(event) => update("checkerColorA", event.target.value)} /></label><label><span>Checker B</span><input type="color" value={config.checkerColorB} onChange={(event) => update("checkerColorB", event.target.value)} /></label></div><div className="auto-size"><span>Checker block</span><strong>{cabinetPixels(config).width} × {cabinetPixels(config).height} px</strong><small>Locked to LED panel size</small></div></>}</div>
          <div className="control-group"><div className="control-group-title">Information & guides</div>{overlayRows.map((row) => { const enabled = config[row.key]; return <div className="overlay-row" key={row.key}><button className={enabled ? "switch on" : "switch"} onClick={() => update(row.key, !enabled)}><i /><span>{row.label}</span></button><input type="color" value={String(config[row.color])} onChange={(event) => update(row.color, event.target.value as never)} aria-label={`${row.label} color`} /></div>; })}<div className="range-row precise aligned-control"><span>Line width</span><input type="range" min="1" max="12" step="0.5" value={config.lineWidth} onChange={(event) => update("lineWidth", Number(event.target.value))} /><input className="precise-input" type="number" min="1" max="12" step="0.5" value={config.lineWidth} onChange={(event) => update("lineWidth", Number(event.target.value))} /></div><label className="color-wide"><span>Grid / border</span><input type="color" value={config.metricGridColor} onChange={(event) => update("metricGridColor", event.target.value)} /></label></div>
        </section>}
        {controlTab === "info" && workspaceMode === "resolume" && <section className="compact-section control-groups">
          <div className="section-title"><span>Slice information</span><small>{selectedSliceIds.length ? `${selectedSliceIds.length} selected` : "global master"}</small></div>
          <div className="control-group"><div className="control-group-title">Typography</div><div className="overlay-row">{(() => { const enabled = selectedBoolean("showLabels", config.showLabels); return <button className={enabled ? "switch on" : "switch"} onClick={() => selectedSliceIds.length ? updateSelected({ showLabels: !enabled }) : updateGlobal("showLabels", !enabled)}><i /><span>Show information</span></button>; })()}</div><label className="select-field"><span>Orientation</span><select value={selectedOverride.infoOrientation ?? config.infoOrientation} onChange={(event) => selectedSliceIds.length ? updateSelected({ infoOrientation: event.target.value as InfoOrientation }) : updateGlobal("infoOrientation", event.target.value as InfoOrientation)}><option value="normal">Normal</option><option value="rotate-90">Rotate 90°</option><option value="rotate-180">Rotate 180°</option><option value="rotate-270">Rotate 270°</option></select></label><div className="field-grid compact-inputs"><label className="number-field"><span>Name size</span><span className="number-control"><input type="number" min="50" max="250" value={selectedOverride.labelNameScale ?? config.labelNameScale} onChange={(event) => selectedSliceIds.length ? updateSelected({ labelNameScale: Number(event.target.value) }) : updateGlobal("labelNameScale", Number(event.target.value))} /><em>%</em></span></label><label className="number-field"><span>Data size</span><span className="number-control"><input type="number" min="50" max="250" value={selectedOverride.labelDataScale ?? config.labelDataScale} onChange={(event) => selectedSliceIds.length ? updateSelected({ labelDataScale: Number(event.target.value) }) : updateGlobal("labelDataScale", Number(event.target.value))} /><em>%</em></span></label></div></div>
          <div className="control-group"><div className="control-group-title">Content positions</div>{infoFields.map((field) => <label className="inline-select" key={field.key}><span>{field.label}</span><select value={selectedOverride[field.key] ?? config[field.key]} onChange={(event) => selectedSliceIds.length ? updateSelected({ [field.key]: event.target.value as InfoPosition }) : updateGlobal(field.key, event.target.value as InfoPosition)}>{INFO_POSITIONS.map((position) => <option key={position.id} value={position.id}>{position.label}</option>)}</select></label>)}<div className="unit-readout"><span>Physical unit</span><strong>Metric · metres</strong></div></div>
          {selectedSliceIds.length > 0 ? <button className="panel-action" onClick={() => setSliceOverrides((current) => { const next = { ...current }; selectedSliceIds.forEach((id) => delete next[id]); return next; })}>Reset selected to global</button> : <button className="panel-action" onClick={applyGlobalToAll}>Apply global to all slices</button>}
        </section>}
        {controlTab === "deco" && workspaceMode === "resolume" && <section className="compact-section control-groups">
          <div className="section-title"><span>Slice decoration</span><small>{selectedSliceIds.length ? `${selectedSliceIds.length} selected` : "global master"}</small></div>
          <div className="control-group"><div className="control-group-title">Cabinet surface</div>{(() => { const enabled = selectedBoolean("showCheckerboard", config.showCheckerboard); return <><div className="overlay-row"><button className={enabled ? "switch on" : "switch"} onClick={() => selectedSliceIds.length ? updateSelected({ showCheckerboard: !enabled }) : updateGlobal("showCheckerboard", !enabled)}><i /><span>Cabinet checker</span></button></div>{enabled && <><div className="checker-colors"><label><span>{selectedSliceIds.length ? "Checker A" : "Palette seed A"}</span><input type="color" value={selectedSliceIds.length ? selectedOverride.checkerColorA ?? selectedAutomaticColors.colorA : config.checkerColorA} onChange={(event) => selectedSliceIds.length ? updateSelected({ checkerColorA: event.target.value }) : updateGlobal("checkerColorA", event.target.value)} /></label><label><span>{selectedSliceIds.length ? "Checker B" : "Palette seed B"}</span><input type="color" value={selectedSliceIds.length ? selectedOverride.checkerColorB ?? selectedAutomaticColors.colorB : config.checkerColorB} onChange={(event) => selectedSliceIds.length ? updateSelected({ checkerColorB: event.target.value }) : updateGlobal("checkerColorB", event.target.value)} /></label></div><div className="auto-size"><span>Checker block</span><strong>{cabinetPixels({ ...config, ...selectedOverride }).width} × {cabinetPixels({ ...config, ...selectedOverride }).height} px</strong><small>Locked to LED panel geometry</small></div></>}</>; })()}</div>
          <div className="control-group"><div className="control-group-title">Lines & guides</div>{overlayRows.filter((row) => row.key !== "showLabels").map((row) => { const enabled = selectedBoolean(row.key, config[row.key]), colorKey = row.color as "diagonalColor" | "circleColor" | "safeAreaColor"; return <div className="overlay-row" key={row.key}><button className={enabled ? "switch on" : "switch"} onClick={() => selectedSliceIds.length ? updateSelected({ [row.key]: !enabled }) : updateGlobal(row.key, !enabled)}><i /><span>{row.label}</span></button><input type="color" value={String(selectedOverride[colorKey] ?? config[colorKey])} onChange={(event) => selectedSliceIds.length ? updateSelected({ [colorKey]: event.target.value }) : updateGlobal(colorKey, event.target.value)} aria-label={`${row.label} color`} /></div>; })}<div className="range-row precise aligned-control"><span>Line width</span><input type="range" min="1" max="12" step="0.5" value={selectedOverride.lineWidth ?? config.lineWidth} onChange={(event) => selectedSliceIds.length ? updateSelected({ lineWidth: Number(event.target.value) }) : updateGlobal("lineWidth", Number(event.target.value))} /><input className="precise-input" type="number" min="1" max="12" step="0.5" value={selectedOverride.lineWidth ?? config.lineWidth} onChange={(event) => selectedSliceIds.length ? updateSelected({ lineWidth: Number(event.target.value) }) : updateGlobal("lineWidth", Number(event.target.value))} /></div><label className="color-wide"><span>Grid / border</span><input type="color" value={selectedOverride.metricGridColor ?? config.metricGridColor} onChange={(event) => selectedSliceIds.length ? updateSelected({ metricGridColor: event.target.value }) : updateGlobal("metricGridColor", event.target.value)} /></label></div>
          <div className="control-group"><div className="control-group-title">Center marker</div>{(() => { const enabled = selectedBoolean("showCenterDot", config.showCenterDot); return <><div className="overlay-row"><button className={enabled ? "switch on" : "switch"} onClick={() => selectedSliceIds.length ? updateSelected({ showCenterDot: !enabled }) : updateGlobal("showCenterDot", !enabled)}><i /><span>Center dot</span></button><input type="color" value={selectedOverride.centerDotColor ?? config.centerDotColor} onChange={(event) => selectedSliceIds.length ? updateSelected({ centerDotColor: event.target.value }) : updateGlobal("centerDotColor", event.target.value)} aria-label="Center dot color" /></div>{enabled && <div className="range-row precise aligned-control"><span>Dot size</span><input type="range" min="2" max="80" value={selectedOverride.centerDotSize ?? config.centerDotSize} onChange={(event) => selectedSliceIds.length ? updateSelected({ centerDotSize: Number(event.target.value) }) : updateGlobal("centerDotSize", Number(event.target.value))} /><input className="precise-input" type="number" min="2" max="80" value={selectedOverride.centerDotSize ?? config.centerDotSize} onChange={(event) => selectedSliceIds.length ? updateSelected({ centerDotSize: Number(event.target.value) }) : updateGlobal("centerDotSize", Number(event.target.value))} /></div>}</>; })()}</div>
          {selectedSliceIds.length > 0 ? <button className="panel-action" onClick={() => setSliceOverrides((current) => { const next = { ...current }; selectedSliceIds.forEach((id) => delete next[id]); return next; })}>Reset selected to global</button> : <button className="panel-action" onClick={applyGlobalToAll}>Apply global to all slices</button>}
        </section>}
        {controlTab === "logo" && <section className="compact-section logo-controls">
          <div className="section-title"><span>Logo placement</span><small>{selectedSliceIds.length ? `${selectedSliceIds.length} selected` : "global master"}</small></div>
          <button className="drop-button logo" onClick={() => logoInputRef.current?.click()}><strong>{logoName || "Upload logo"}</strong><small>PNG, JPG, WEBP or SVG</small></button><input ref={logoInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => loadLogo(event.target.files?.[0])} />
          {(() => { const visible = selectedBoolean("logoVisible", config.showLogo); return <button className={visible ? "visibility-button active" : "visibility-button"} onClick={() => selectedSliceIds.length ? updateSelected({ logoVisible: !visible }) : updateGlobal("showLogo", !visible)}>{visible ? (selectedSliceIds.length ? "Logo visible on selection" : "Logo visible globally") : (selectedSliceIds.length ? "Logo hidden on selection" : "Logo hidden globally")}</button>; })()}
          <label className="select-field"><span>Position</span><select value={selectedOverride.logoPosition ?? config.customLogoPosition} onChange={(event) => selectedSliceIds.length ? updateSelected({ logoPosition: event.target.value as LogoPosition }) : updateGlobal("customLogoPosition", event.target.value as LogoPosition)}><option value="top-left">Top left</option><option value="top-center">Top center</option><option value="top-right">Top right</option><option value="center-left">Center left</option><option value="center">Center</option><option value="center-right">Center right</option><option value="bottom-left">Bottom left</option><option value="bottom-center">Bottom center</option><option value="bottom-right">Bottom right</option></select></label>
          <div className="range-row precise"><span>Scale</span><input type="range" min="25" max="200" value={selectedOverride.logoScale ?? config.customLogoScale} onChange={(event) => selectedSliceIds.length ? updateSelected({ logoScale: Number(event.target.value) }) : updateGlobal("customLogoScale", Number(event.target.value))} /><input className="precise-input" type="number" min="25" max="200" value={selectedOverride.logoScale ?? config.customLogoScale} onChange={(event) => selectedSliceIds.length ? updateSelected({ logoScale: Number(event.target.value) }) : updateGlobal("customLogoScale", Number(event.target.value))} /></div>
          <div className="range-row"><span>Opacity <output>{config.customLogoOpacity}%</output></span><input type="range" min="10" max="100" value={config.customLogoOpacity} onChange={(event) => updateGlobal("customLogoOpacity", Number(event.target.value))} /></div>
          {selectedSliceIds.length > 0 ? <button className="text-button" onClick={() => setSliceOverrides((current) => { const next = { ...current }; selectedSliceIds.forEach((id) => { if (next[id]) next[id] = { ...next[id], logoScale: undefined, logoVisible: undefined, logoPosition: undefined }; }); return next; })}>Reset selected logo to global</button> : <button className="text-button" onClick={applyGlobalToAll}>Apply global to all slices</button>}
          <button className="text-button" onClick={() => { setLogoData(""); setLogoName(""); setLogoImage(null); if (logoInputRef.current) logoInputRef.current.value = ""; }}>Remove uploaded logo</button>
        </section>}
      </div></aside>
      <section className={`stage ${workspaceMode === "simulation" ? "simulation-stage" : ""}`}>
        <div className="stage-bar"><div><span className="eyebrow">{workspaceMode === "simulation" ? "Experimental WYSIWYG workspace" : `Live ${workspaceMode === "resolume" ? `${mapView} map` : "output"}`}</span><h1>{workspaceMode === "simulation" ? resolumeMap?.name || "3D Simulation" : workspaceMode === "resolume" ? resolumeMap?.name || "Resolume Pixel Map" : PATTERNS.find((pattern) => pattern.id === config.pattern)?.name}</h1></div><div className="stage-spec"><strong>{outputWidth} × {outputHeight} px</strong><span>{workspaceMode === "simulation" ? `${allSlices.length} physical screens · ${round(simulationDepthM * 100, 1)} cm deep` : workspaceMode === "resolume" ? `${activeSlices.length} slices` : `${config.wallWidth} × ${config.wallHeight} m`}</span></div></div>
        <div className="preview-shell" ref={fullscreenHostRef} data-fullscreen-mode={fullscreenMode}>
          {workspaceMode === "simulation" ? <><div className="preview-toolbar"><span><i className="green" /> 3D scene · metres · configurable bottom pivots</span><div className="view-tools simulation-tools"><button className={simulationTool === "translate" ? "active" : ""} onClick={() => setSimulationTool("translate")}>Move</button><button className={simulationTool === "rotate" ? "active" : ""} onClick={() => setSimulationTool("rotate")}>Rotate</button><button onClick={() => setSimulationFitSignal((value) => value + 1)}>Fit scene</button></div></div><ThreeSimulation slices={allSlices} compositionWidth={resolumeMap?.compositionWidth || config.resolutionWidth} compositionHeight={resolumeMap?.compositionHeight || config.resolutionHeight} masterPitchMm={simulationMasterPitchMm} pitchBySlice={simulationPitchBySlice} depthBySlice={simulationDepthBySlice} curvatureBySlice={simulationCurvatureBySlice} pivotBySlice={simulationPivotBySlice} selectedIds={selectedSliceIds} transforms={simulationTransforms} transformMode={simulationTool} transformSpace={simulationTransformSpace} source={simulationSource} sourceOverrides={simulationSourceOverrides} sourceMedia={simulationSourceMedia} sourceQuality={simulationQuality} cameraState={simulationCamera} textureVersion={simulationTextureVersion} fitSignal={simulationFitSignal} gridVisible={simulationGridVisible} floorVisible={simulationFloorVisible} backgroundLevel={simulationBackgroundLevel} drawPatternTexture={drawSimulationTexture} onSelectionChange={(ids) => { setSimulationTransformPreview(null); setSelectedSliceIds(ids); }} onTransformPreview={setSimulationTransformPreview} onTransformsChange={(updates) => { recordSimulationHistory(`${simulationTool === "translate" ? "Move" : "Rotate"} ${Object.keys(updates).length} slice${Object.keys(updates).length > 1 ? "s" : ""}`); setSimulationTransforms((current) => ({ ...current, ...updates })); }} onCameraChange={setSimulationCamera} /></> : <><div className="preview-toolbar"><span><i className="green" /> Pixel canvas · {outputWidth} × {outputHeight}</span><div className="view-tools"><button onClick={() => adjustZoom(zoomRef.current / 1.2)} aria-label="Zoom out">−</button><output>{Math.round(displayScale * 100)}%</output><button onClick={() => adjustZoom(zoomRef.current * 1.2)} aria-label="Zoom in">+</button><button className={fullscreenMode === "fit" && zoom === 1 ? "active" : ""} onClick={resetView}>Fit Canvas</button><button className={fullscreenMode === "actual" && zoom === 1 ? "active" : ""} onClick={actualPixels}>Actual 1:1</button></div></div><div ref={canvasStageRef} className={`canvas-stage ${spaceDown ? "panning" : ""} ${selectionMarquee ? "selecting" : ""}`} onPointerDown={beginInteraction} onPointerMove={moveInteraction} onPointerUp={endInteraction} onPointerCancel={cancelInteraction} onWheel={(event) => { event.preventDefault(); adjustZoom(zoomRef.current * (event.deltaY > 0 ? 0.9 : 1.1), event.clientX, event.clientY); }}><canvas ref={canvasRef} style={{ width: `${outputWidth * baseScale}px`, height: `${outputHeight * baseScale}px`, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, imageRendering: displayScale < 1 ? "auto" : "pixelated" }} aria-label="Live LED pattern output" />{selectionMarquee && <div className="selection-marquee" style={selectionMarquee} aria-hidden="true" />}</div></>}
        </div>
        {workspaceMode === "simulation" ? <div className="simulation-status"><div><span>Source</span><strong>{simulationSource === "pattern" ? "Pattern Generator" : simulationSource === "video" ? (simulationSourceVideo ? simulationSourceStatus : "Video Devices · not connected") : simulationNativeConnected && simulationNativeKind === simulationSource ? simulationSourceStatus : simulationSource === "ndi" ? "NDI · not connected" : "Spout · not connected"}</strong></div><div><span>Mapping</span><strong>XML crop · stretched composition</strong></div><div><span>Quality</span><strong>{simulationSource === "pattern" ? "Native full quality" : simulationQuality === "latency" ? "Low latency proxy" : "High quality native"}</strong></div><div><span>Geometry</span><strong>Smooth curve · full extrusion · transform saved</strong></div></div> : <div className="pattern-bar"><div className="pattern-bar-heading"><span>{workspaceMode === "resolume" ? "Slice fill mode" : "Pattern mode"}</span>{workspaceMode === "resolume" && <div className="scope-control"><button className={config.mapPatternScope === "slice" ? "active" : ""} onClick={() => updateGlobal("mapPatternScope", "slice")}>Per slice</button><button className={config.mapPatternScope === "map" ? "active" : ""} onClick={() => updateGlobal("mapPatternScope", "map")}>Across map</button></div>}</div><div className="pattern-buttons">{workspaceMode === "resolume" ? MAP_FILLS.map((fill) => <button key={fill.id} className={config.mapFill === fill.id ? "active" : ""} onClick={() => updateGlobal("mapFill", fill.id)}><i>{fill.code}</i>{fill.name}</button>) : <>{PATTERNS.map((pattern) => <button key={pattern.id} className={config.pattern === pattern.id ? "active" : ""} onClick={() => selectPattern(pattern.id)}><i>{pattern.code}</i>{pattern.name}</button>)}<button onClick={() => changeWorkspace("resolume")}><i>MAP</i>Pixel Map</button></>}</div></div>}
      </section>
      {workspaceMode === "simulation" && <aside className="right-panel panel simulation-inspector"><section className="inspector-section"><div className="section-title"><span>3D scene integrity</span><small>beta</small></div><div className="integrity-card"><div><span>Composition</span><strong>{outputWidth} × {outputHeight}</strong></div><div><span>World scale</span><strong>{simulationMasterPitchMm.toFixed(4)} mm / px</strong></div><div><span>LED material</span><strong>Unlit · native color</strong></div><p><i className="green" /> No fog, light falloff or repeated textures</p></div></section><section className="inspector-section selection-card"><div className="section-title"><span>Slice selection</span><small>{selectedSlices.length ? `${selectedSlices.length} selected` : "click scene"}</small></div>{selectedSlices.length ? <><strong>{selectedSlices.length === 1 ? selectedSlices[0].name : `${selectedSlices.length} screens`}</strong><span>{selectedSlices.length === 1 ? `${(selectedSlices[0].input.width * (simulationPitchBySlice[selectedSlices[0].id] || config.pixelPitchMm) / 1000).toFixed(3)} × ${(selectedSlices[0].input.height * (simulationPitchBySlice[selectedSlices[0].id] || config.pixelPitchMm) / 1000).toFixed(3)} m` : "Move or rotate together"}</span><button className="inspector-button" onClick={() => setSelectedSliceIds([])}>Clear selection</button><button className="inspector-button" onClick={resetSelectedTransforms}>Reset to XML position</button></> : <p>Click, Ctrl/Shift-click, or Ctrl-drag a marquee around visible slices.</p>}</section><section className="inspector-section"><div className="section-title"><span>Scene state</span><small>project-saved</small></div><dl className="summary-list"><div><dt>Transform</dt><dd>{simulationTool === "translate" ? "Move" : "Rotate"} · {simulationTransformSpace}</dd></div><div><dt>Scale</dt><dd>Locked</dd></div><div><dt>Pivot</dt><dd>{selectedSimulationPivot === "mixed" ? "Mixed" : PIVOT_LABELS[selectedSimulationPivot]}</dd></div><div><dt>Depth</dt><dd>{selectedSlices.length === 1 ? round((simulationDepthBySlice[selectedSlices[0].id] || simulationDepthM) * 100, 1) : round(simulationDepthM * 100, 1)} cm{selectedSlices.length === 1 && (simulationDepthBySlice[selectedSlices[0].id] || simulationDepthM) < simulationDepthM ? " · auto-safe" : ""}</dd></div><div><dt>H curve</dt><dd>{selectedCurvature.horizontal === null ? "Mixed" : `${selectedCurvature.horizontal}°`}</dd></div><div><dt>V curve</dt><dd>{selectedCurvature.vertical === null ? "Mixed" : `${selectedCurvature.vertical}°`}</dd></div><div><dt>Floor</dt><dd>{simulationFloorVisible ? "Visible" : "Hidden"}</dd></div><div><dt>Grid</dt><dd>{simulationGridVisible ? "Visible" : "Hidden"}</dd></div><div><dt>Background</dt><dd>{simulationBackgroundLevel}%</dd></div></dl></section><section className="inspector-section"><div className="section-title"><span>History</span><small>100 steps</small></div><div className="history-row"><button className="inspector-button" disabled={!historyState.undo} onClick={undoSimulation}>Undo</button><button className="inspector-button" disabled={!historyState.redo} onClick={redoSimulation}>Redo</button></div><p className="micro-note">Ctrl+Z · Ctrl+Shift+Z · Ctrl+Y</p></section><section className="inspector-section export-section"><div className="section-title"><span>Export 3D scene</span><small>UV + transforms</small></div><label className="select-field"><span>Format</span><select aria-label="3D export format" value={simulationExportFormat} onChange={(event) => setSimulationExportFormat(event.target.value as SceneExportFormat)}><option value="glb">GLB · Universal</option><option value="gltf">glTF Package · ZIP</option><option value="obj">OBJ Package · ZIP</option><option value="mvr">MVR 1.5 · Scene meshes</option></select></label><button className="button primary wide export-3d-button" disabled={!allSlices.length || simulationExporting} onClick={() => void export3DScene()}>{simulationExporting ? "Building export…" : "Export 3D scene"}</button><p className="micro-note">Exports the complete curved mesh, physical scale, UV map, screen names and saved transforms. Floor, grid, camera and gizmos are excluded.</p></section><section className="inspector-section grow"><div className="section-title"><span>Project tools</span><small>beta copy only</small></div><button className="inspector-button" onClick={saveProject}>Save beta project</button><button className="inspector-button" onClick={() => projectInputRef.current?.click()}>Load project</button><p className="micro-note">Transforms, pivots, sources, depth, curvature, auto-safe depth, axes, floor, grid, background and camera are stored in the project file.</p></section><div className="beta-safety">Experimental preview · current LO2S version untouched</div></aside>}
      <aside className="right-panel panel"><section className="inspector-section"><div className="section-title"><span>Pixel integrity</span><small>{fullscreenMode === "fit" ? "proportional" : "native pixels"}</small></div><div className="integrity-card"><div><span>Source</span><strong>{outputWidth} × {outputHeight}</strong></div><div><span>Aspect</span><strong>{(outputWidth / outputHeight).toFixed(4)} : 1</strong></div><div><span>Preview</span><strong>{fullscreenMode === "fit" ? "Uniform fit" : "1 source px"}</strong></div><p><i className="green" /> No horizontal or vertical distortion</p></div></section>{workspaceMode === "resolume" && resolumeMap && <><section className="inspector-section selection-card"><div className="section-title"><span>Slice selection</span><small>{selectedSlices.length ? "overrides enabled" : "click the map"}</small></div>{selectedSlices.length ? <><strong>{selectedSlices.length === 1 ? selectedSlices[0].name : `${selectedSlices.length} slices`}</strong><span>{selectedSlices.length === 1 ? `${Math.round((mapView === "input" ? selectedSlices[0].input : selectedSlices[0].output).width)} × ${Math.round((mapView === "input" ? selectedSlices[0].input : selectedSlices[0].output).height)} px` : "Ctrl / Shift click to add or remove"}</span><button className="inspector-button" onClick={() => setSelectedSliceIds([])}>Clear selection</button></> : <p>Click a slice to edit it. Ctrl/Shift-click selects multiple slices.</p>}</section><section className="inspector-section"><div className="section-title"><span>Background</span><small>PNG alpha</small></div><div className="segmented"><button className={config.backgroundMode === "black" ? "active" : ""} onClick={() => update("backgroundMode", "black")}>Black</button><button className={config.backgroundMode === "transparent" ? "active" : ""} onClick={() => update("backgroundMode", "transparent")}>Transparent</button></div></section><section className="inspector-section validation-compact"><div className="section-title"><span>XML validation</span><small>Resolume {resolumeMap.version}</small></div><div className="validation-list">{validations.map((item, index) => <p key={`${item.text}-${index}`} className={item.level}><i />{item.text}</p>)}</div></section></>}{workspaceMode === "patterns" && <section className="inspector-section"><div className="section-title"><span>Wall summary</span><small>metric</small></div><dl className="summary-list"><div><dt>Surface</dt><dd>{stats.area.toFixed(2)} m²</dd></div><div><dt>Pixel pitch</dt><dd>{stats.pitchX.toFixed(4)} mm</dd></div><div><dt>Cabinet grid</dt><dd>{stats.cols.toFixed(1)} × {stats.rows.toFixed(1)}</dd></div><div><dt>Total pixels</dt><dd>{(config.resolutionWidth * config.resolutionHeight).toLocaleString()}</dd></div></dl></section>}<section className="inspector-section grow"><div className="section-title"><span>Project tools</span><small>local only</small></div><button className="inspector-button" onClick={saveProject}>Save project</button><button className="inspector-button" onClick={() => projectInputRef.current?.click()}>Load project</button><input ref={projectInputRef} hidden type="file" accept=".json,application/json" onChange={(event) => loadProject(event.target.files?.[0])} /><button className={sequenceActive ? "inspector-button active" : "inspector-button"} onClick={() => setSequenceActive((current) => !current)} disabled={workspaceMode !== "patterns"}>{sequenceActive ? "Stop test sequence" : "Run test sequence"}</button></section><div className="export-stack"><button className="button primary wide" onClick={exportCurrent}>{workspaceMode === "resolume" && mapView === "input" ? "Export Input PNG" : "Export Current PNG"}</button>{workspaceMode === "resolume" && resolumeMap && <><button className="button wide" disabled={!selectedSlices.length} onClick={exportSelected}>Export Selected Slice{selectedSlices.length > 1 ? "s" : ""}</button><button className="button wide" onClick={exportOutputs}>Export Output Maps ({resolumeMap.screens.length})</button></>}</div></aside>
    </section>{notice && <button className="toast" onClick={() => setNotice("")}>{notice}<span>×</span></button>}
  </main>;
}
