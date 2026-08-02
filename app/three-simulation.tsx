"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number; points: Point[] };
export type SimulationSlice = { id: string; name: string; screenName: string; input: Rect; paletteIndex: number };
export type SliceTransform = { position: [number, number, number]; rotation: [number, number, number] };
export type CameraState = { position: [number, number, number]; target: [number, number, number] };
export type TransformMode = "translate" | "rotate";
export type SimulationSource = "pattern" | "video" | "ndi" | "spout";
export type SlicePivot = "bottom-left" | "bottom-center" | "bottom-right";
export type SliceCurvature = { horizontal: number; vertical: number };

type Props = {
  slices: SimulationSlice[];
  compositionWidth: number;
  compositionHeight: number;
  masterPitchMm: number;
  pitchBySlice: Record<string, number>;
  depthBySlice: Record<string, number>;
  curvatureBySlice: Record<string, SliceCurvature>;
  pivotBySlice: Record<string, SlicePivot>;
  selectedIds: string[];
  transforms: Record<string, SliceTransform>;
  transformMode: TransformMode;
  transformSpace: "local" | "world";
  source: SimulationSource;
  sourceOverrides: Record<string, "inherit" | SimulationSource>;
  sourceMedia: Partial<Record<"video" | "ndi" | "spout", HTMLVideoElement | HTMLCanvasElement>>;
  sourceQuality: "latency" | "quality";
  cameraState?: CameraState;
  textureVersion: string;
  fitSignal: number;
  gridVisible: boolean;
  floorVisible: boolean;
  backgroundLevel: number;
  drawPatternTexture: (canvas: HTMLCanvasElement) => void;
  onSelectionChange: (ids: string[]) => void;
  onTransformPreview: (updates: Record<string, SliceTransform> | null) => void;
  onTransformsChange: (updates: Record<string, SliceTransform>) => void;
  onCameraChange: (camera: CameraState) => void;
};

type SliceObject = THREE.Mesh<THREE.BufferGeometry, THREE.Material[]> & { userData: { sliceId: string } };

const WORLD_FLOOR_SIZE_METRES = 2000;
const WORLD_GRID_STEP_METRES = 1;

function tuple(vector: THREE.Vector3): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

function clipPolygon(points: THREE.Vector2[], axis: "x" | "y", boundary: number, keepGreater: boolean) {
  const output: THREE.Vector2[] = [];
  points.forEach((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const pointInside = keepGreater ? point[axis] >= boundary - 1e-8 : point[axis] <= boundary + 1e-8;
    const previousInside = keepGreater ? previous[axis] >= boundary - 1e-8 : previous[axis] <= boundary + 1e-8;
    if (pointInside !== previousInside) {
      const delta = point[axis] - previous[axis];
      const t = Math.abs(delta) < 1e-10 ? 0 : (boundary - previous[axis]) / delta;
      output.push(new THREE.Vector2(
        axis === "x" ? boundary : THREE.MathUtils.lerp(previous.x, point.x, t),
        axis === "y" ? boundary : THREE.MathUtils.lerp(previous.y, point.y, t),
      ));
    }
    if (pointInside) output.push(point.clone());
  });
  return output;
}

function clipPolygonToRect(points: THREE.Vector2[], minX: number, maxX: number, minY: number, maxY: number) {
  let clipped = clipPolygon(points, "x", minX, true);
  if (clipped.length) clipped = clipPolygon(clipped, "x", maxX, false);
  if (clipped.length) clipped = clipPolygon(clipped, "y", minY, true);
  if (clipped.length) clipped = clipPolygon(clipped, "y", maxY, false);
  return clipped;
}

export function createSliceGeometry(slice: SimulationSlice, pitchM: number, depthM: number, curvature: SliceCurvature, compositionWidth: number, compositionHeight: number, pivot: SlicePivot, fullSource = false) {
  const sourcePoints = slice.input.points.length >= 4 ? slice.input.points : [
    { x: slice.input.x, y: slice.input.y },
    { x: slice.input.x + slice.input.width, y: slice.input.y },
    { x: slice.input.x + slice.input.width, y: slice.input.y + slice.input.height },
    { x: slice.input.x, y: slice.input.y + slice.input.height },
  ];
  const pivotX = pivot === "bottom-left" ? slice.input.x : pivot === "bottom-right" ? slice.input.x + slice.input.width : slice.input.x + slice.input.width / 2;
  const bottomY = slice.input.y + slice.input.height;
  const local = sourcePoints.map((point) => new THREE.Vector2((point.x - pivotX) * pitchM, (bottomY - point.y) * pitchM));
  const widthM = Math.max(pitchM, slice.input.width * pitchM), heightM = Math.max(pitchM, slice.input.height * pitchM);
  const centerX = (slice.input.x + slice.input.width / 2 - pivotX) * pitchM, centerY = heightM / 2;
  const horizontalRad = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(curvature.horizontal || 0, -180, 180));
  const verticalRad = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(curvature.vertical || 0, -180, 180));
  const horizontalSegments = Math.max(1, Math.min(64, Math.ceil(Math.abs(curvature.horizontal || 0) / 3)));
  const verticalSegments = Math.max(1, Math.min(64, Math.ceil(Math.abs(curvature.vertical || 0) / 3)));
  const xMin = -slice.input.width * pitchM / 2 + centerX, xMax = slice.input.width * pitchM / 2 + centerX;
  const yMin = 0, yMax = heightM;
  const frontPositions: number[] = [], frontUvs: number[] = [], frontNormals: number[] = [];
  const bodyPositions: number[] = [], bodyUvs: number[] = [], bodyNormals: number[] = [];
  const sourceUv = (point: THREE.Vector2): [number, number] => {
    const width = fullSource ? Math.max(1, slice.input.width) : Math.max(1, compositionWidth), height = fullSource ? Math.max(1, slice.input.height) : Math.max(1, compositionHeight);
    const sourceX = pivotX + point.x / pitchM, sourceY = bottomY - point.y / pitchM;
    const x = fullSource ? sourceX - slice.input.x : sourceX, y = fullSource ? sourceY - slice.input.y : sourceY;
    return [THREE.MathUtils.clamp(x / width, 0.5 / width, 1 - 0.5 / width), THREE.MathUtils.clamp(1 - y / height, 0.5 / height, 1 - 0.5 / height)];
  };
  const surfacePoint = (point: THREE.Vector2) => {
    const xFromCenter = point.x - centerX, yFromCenter = point.y - centerY;
    const phi = Math.abs(horizontalRad) < 1e-7 ? 0 : xFromCenter * horizontalRad / widthM;
    const psi = Math.abs(verticalRad) < 1e-7 ? 0 : yFromCenter * verticalRad / heightM;
    const x = Math.abs(horizontalRad) < 1e-7 ? point.x : centerX + widthM / horizontalRad * Math.sin(phi);
    const y = Math.abs(verticalRad) < 1e-7 ? point.y : centerY + heightM / verticalRad * Math.sin(psi);
    const zHorizontal = Math.abs(horizontalRad) < 1e-7 ? 0 : widthM / horizontalRad * (1 - Math.cos(phi));
    const zVertical = Math.abs(verticalRad) < 1e-7 ? 0 : heightM / verticalRad * (1 - Math.cos(psi));
    const normal = new THREE.Vector3(-Math.sin(phi) * Math.cos(psi), -Math.cos(phi) * Math.sin(psi), Math.cos(phi) * Math.cos(psi)).normalize();
    return { position: new THREE.Vector3(x, y, zHorizontal + zVertical), normal };
  };
  const pushVertex = (positions: number[], uvs: number[], normals: number[], position: THREE.Vector3, uv: [number, number], normal: THREE.Vector3) => {
    positions.push(position.x, position.y, position.z); uvs.push(uv[0], uv[1]); normals.push(normal.x, normal.y, normal.z);
  };
  const pushFrontTriangle = (a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2) => {
    [a, b, c].forEach((point) => { const surface = surfacePoint(point); pushVertex(frontPositions, frontUvs, frontNormals, surface.position, sourceUv(point), surface.normal); });
    [c, b, a].forEach((point) => { const surface = surfacePoint(point), normal = surface.normal.clone().negate(); pushVertex(bodyPositions, bodyUvs, bodyNormals, surface.position.clone().addScaledVector(surface.normal, -depthM), [0, 0], normal); });
  };
  for (let yIndex = 0; yIndex < verticalSegments; yIndex += 1) {
    const cellMinY = THREE.MathUtils.lerp(yMin, yMax, yIndex / verticalSegments), cellMaxY = THREE.MathUtils.lerp(yMin, yMax, (yIndex + 1) / verticalSegments);
    for (let xIndex = 0; xIndex < horizontalSegments; xIndex += 1) {
      const cellMinX = THREE.MathUtils.lerp(xMin, xMax, xIndex / horizontalSegments), cellMaxX = THREE.MathUtils.lerp(xMin, xMax, (xIndex + 1) / horizontalSegments);
      const clipped = clipPolygonToRect(local, cellMinX, cellMaxX, cellMinY, cellMaxY);
      for (let index = 1; index + 1 < clipped.length; index += 1) pushFrontTriangle(clipped[0], clipped[index], clipped[index + 1]);
    }
  }
  local.forEach((point, index) => {
    const nextPoint = local[(index + 1) % local.length], delta = nextPoint.clone().sub(point);
    const steps = Math.max(1, Math.min(64, Math.ceil(Math.max(Math.abs(delta.x) / widthM * horizontalSegments, Math.abs(delta.y) / heightM * verticalSegments))));
    for (let step = 0; step < steps; step += 1) {
      const a2 = point.clone().lerp(nextPoint, step / steps), b2 = point.clone().lerp(nextPoint, (step + 1) / steps);
      const a = surfacePoint(a2), b = surfacePoint(b2), backA = a.position.clone().addScaledVector(a.normal, -depthM), backB = b.position.clone().addScaledVector(b.normal, -depthM);
      const tangent = b.position.clone().sub(a.position).normalize();
      const normalA = tangent.clone().cross(a.normal.clone().negate()).normalize(), normalB = tangent.clone().cross(b.normal.clone().negate()).normalize();
      [[a.position, normalA], [b.position, normalB], [backB, normalB], [a.position, normalA], [backB, normalB], [backA, normalA]].forEach(([position, normal]) => pushVertex(bodyPositions, bodyUvs, bodyNormals, position as THREE.Vector3, [0, 0], normal as THREE.Vector3));
    }
  });
  const geometry = new THREE.BufferGeometry();
  const positions = [...frontPositions, ...bodyPositions], uvs = [...frontUvs, ...bodyUvs], normals = [...frontNormals, ...bodyNormals];
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.addGroup(0, frontPositions.length / 3, 0);
  geometry.addGroup(frontPositions.length / 3, bodyPositions.length / 3, 1);
  return geometry;
}

export default function ThreeSimulation(props: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<{
    fit: () => void;
    updateClipping: () => void;
    controls: OrbitControls;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    transform: TransformControls;
    proxy: THREE.Object3D;
    meshes: Map<string, SliceObject>;
    texture: THREE.CanvasTexture;
    scene: THREE.Scene;
    grid: THREE.GridHelper;
    floor: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
    externalTextures: Partial<Record<"video" | "ndi" | "spout", THREE.Texture>>;
  } | null>(null);
  const latestRef = useRef(props);
  useEffect(() => { latestRef.current = props; });

  useEffect(() => {
    const host = mountRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090b0c);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true, reversedDepthBuffer: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.5));
    renderer.shadowMap.enabled = false;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.zoomToCursor = true;
    controls.screenSpacePanning = true;
    controls.minDistance = 0.1;
    controls.maxDistance = 5000;

    scene.add(new THREE.HemisphereLight(0xdce9e5, 0x20262b, 1.7));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
    keyLight.position.set(8, 14, 10);
    scene.add(keyLight);
    // The floor is physical world geometry: fixed dimensions, fixed grid
    // spacing and a permanent origin regardless of camera pan or zoom.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_FLOOR_SIZE_METRES, WORLD_FLOOR_SIZE_METRES), new THREE.MeshStandardMaterial({ color: 0x111518, roughness: 0.95, metalness: 0.05 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.002;
    scene.add(floor);
    const grid = new THREE.GridHelper(WORLD_FLOOR_SIZE_METRES, WORLD_FLOOR_SIZE_METRES / WORLD_GRID_STEP_METRES, 0x405158, 0x242c30);
    grid.position.y = 0;
    scene.add(grid);
    scene.add(new THREE.AxesHelper(1));

    const textureCanvas = document.createElement("canvas");
    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = true;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const proxy = new THREE.Object3D();
    scene.add(proxy);
    const transform = new TransformControls(camera, renderer.domElement);
    transform.setSpace(props.transformSpace);
    transform.setSize(0.82);
    scene.add(transform.getHelper());

    const meshes = new Map<string, SliceObject>();
    const updateCameraClipping = () => {
      const bounds = new THREE.Box3();
      meshes.forEach((mesh) => bounds.expandByObject(mesh));
      const sphere = bounds.isEmpty() ? new THREE.Sphere(controls.target.clone(), 1) : bounds.getBoundingSphere(new THREE.Sphere());
      const sceneDistance = camera.position.distanceTo(sphere.center);
      const targetDistance = Math.max(0.1, camera.position.distanceTo(controls.target));
      // Maintain a stable near/far ratio at every zoom level. Reversed depth
      // then keeps thin extrusions clean without pushing LED faces into bodies.
      camera.near = THREE.MathUtils.clamp(targetDistance / 10000, 0.001, 0.25);
      camera.far = Math.max(500, targetDistance * 10, sceneDistance + sphere.radius * 4 + 50);
      camera.updateProjectionMatrix();
    };
    const fit = () => {
      const current = latestRef.current;
      const pitch = current.masterPitchMm / 1000;
      const width = Math.max(1, current.compositionWidth * pitch), height = Math.max(1, current.compositionHeight * pitch);
      const span = Math.max(width, height);
      controls.target.set(0, height / 2, 0);
      camera.position.set(span * 0.8, height * 0.85 + span * 0.15, span * 1.25);
      updateCameraClipping();
      controls.update();
    };

    if (props.cameraState) {
      camera.position.fromArray(props.cameraState.position);
      controls.target.fromArray(props.cameraState.target);
    } else fit();

    let frame = 0, dirty = true;
    const render = () => {
      frame = requestAnimationFrame(render);
      if (controls.update()) dirty = true;
      if (dirty) { renderer.render(scene, camera); dirty = false; }
    };
    render();
    const resize = () => {
      const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      dirty = true;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const invalidate = () => { updateCameraClipping(); dirty = true; };
    controls.addEventListener("change", invalidate);
    controls.addEventListener("end", () => latestRef.current.onCameraChange({ position: tuple(camera.position), target: tuple(controls.target) }));

    let pointerStart: { x: number; y: number } | null = null, marqueeStart: { x: number; y: number } | null = null, marqueeMoved = false, selectedOnDown = false;
    let transformDragging = false;
    let transformStart: { proxyPosition: THREE.Vector3; proxyQuaternion: THREE.Quaternion; items: Map<string, { position: THREE.Vector3; quaternion: THREE.Quaternion }> } | null = null;
    const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
    const hitAt = (clientX: number, clientY: number) => { const rect = renderer.domElement.getBoundingClientRect(); pointer.set((clientX - rect.left) / rect.width * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1); raycaster.setFromCamera(pointer, camera); return raycaster.intersectObjects(Array.from(meshes.values()), false)[0]?.object as SliceObject | undefined; };
    const setMarquee = (left: number, top: number, width: number, height: number, visible: boolean) => { const element = marqueeRef.current; if (!element) return; Object.assign(element.style, { display: visible ? "block" : "none", left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` }); };
    const onPointerDown = (event: PointerEvent) => {
      pointerStart = { x: event.clientX, y: event.clientY };
      if (event.button === 0 && event.ctrlKey && !transformDragging && !transform.axis) {
        const rect = renderer.domElement.getBoundingClientRect();
        marqueeStart = { x: event.clientX - rect.left, y: event.clientY - rect.top }; marqueeMoved = false; controls.enabled = false;
        setMarquee(marqueeStart.x, marqueeStart.y, 0, 0, true); renderer.domElement.setPointerCapture(event.pointerId); event.preventDefault(); event.stopPropagation();
      } else if (event.button === 0 && !event.shiftKey && !transformDragging && !transform.axis) {
        const hit = hitAt(event.clientX, event.clientY);
        if (hit) { const id = hit.userData.sliceId; selectedOnDown = latestRef.current.selectedIds.length !== 1 || latestRef.current.selectedIds[0] !== id; if (selectedOnDown) latestRef.current.onSelectionChange([id]); }
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!marqueeStart) return;
      const rect = renderer.domElement.getBoundingClientRect(), x = THREE.MathUtils.clamp(event.clientX - rect.left, 0, rect.width), y = THREE.MathUtils.clamp(event.clientY - rect.top, 0, rect.height);
      marqueeMoved ||= Math.hypot(x - marqueeStart.x, y - marqueeStart.y) > 4;
      setMarquee(Math.min(x, marqueeStart.x), Math.min(y, marqueeStart.y), Math.abs(x - marqueeStart.x), Math.abs(y - marqueeStart.y), true); event.preventDefault(); event.stopPropagation();
    };
    const selectMarquee = (endX: number, endY: number) => {
      if (!marqueeStart) return;
      const rect = renderer.domElement.getBoundingClientRect(), left = Math.min(marqueeStart.x, endX), right = Math.max(marqueeStart.x, endX), top = Math.min(marqueeStart.y, endY), bottom = Math.max(marqueeStart.y, endY), objects = Array.from(meshes.values()), selected: string[] = [];
      const firstHitAt = (x: number, y: number) => { pointer.set(x / rect.width * 2 - 1, -(y / rect.height * 2 - 1)); raycaster.setFromCamera(pointer, camera); return (raycaster.intersectObjects(objects, false)[0]?.object as SliceObject | undefined)?.userData.sliceId; };
      objects.forEach((mesh) => {
        mesh.geometry.computeBoundingBox(); const box = mesh.geometry.boundingBox; if (!box) return;
        const points = [new THREE.Vector3(box.min.x, box.min.y, box.min.z), new THREE.Vector3(box.max.x, box.min.y, box.min.z), new THREE.Vector3(box.min.x, box.max.y, box.min.z), new THREE.Vector3(box.max.x, box.max.y, box.min.z), new THREE.Vector3(box.min.x, box.min.y, box.max.z), new THREE.Vector3(box.max.x, box.min.y, box.max.z), new THREE.Vector3(box.min.x, box.max.y, box.max.z), new THREE.Vector3(box.max.x, box.max.y, box.max.z)].map((point) => point.applyMatrix4(mesh.matrixWorld).project(camera));
        const minX = Math.min(...points.map((point) => (point.x + 1) * rect.width / 2)), maxX = Math.max(...points.map((point) => (point.x + 1) * rect.width / 2)), minY = Math.min(...points.map((point) => (1 - point.y) * rect.height / 2)), maxY = Math.max(...points.map((point) => (1 - point.y) * rect.height / 2));
        const overlapLeft = Math.max(left, minX), overlapRight = Math.min(right, maxX), overlapTop = Math.max(top, minY), overlapBottom = Math.min(bottom, maxY); if (overlapRight < overlapLeft || overlapBottom < overlapTop) return;
        const samples: Array<[number, number]> = [[(overlapLeft + overlapRight) / 2, (overlapTop + overlapBottom) / 2], [overlapLeft + 1, overlapTop + 1], [overlapRight - 1, overlapTop + 1], [overlapLeft + 1, overlapBottom - 1], [overlapRight - 1, overlapBottom - 1]];
        if (samples.some(([x, y]) => firstHitAt(x, y) === mesh.userData.sliceId)) selected.push(mesh.userData.sliceId);
      });
      latestRef.current.onSelectionChange(Array.from(new Set([...latestRef.current.selectedIds, ...selected])));
    };
    const onPointerUp = (event: PointerEvent) => {
      if (marqueeStart) {
        const rect = renderer.domElement.getBoundingClientRect(), endX = THREE.MathUtils.clamp(event.clientX - rect.left, 0, rect.width), endY = THREE.MathUtils.clamp(event.clientY - rect.top, 0, rect.height), didMove = marqueeMoved;
        if (didMove) selectMarquee(endX, endY); setMarquee(0, 0, 0, 0, false); marqueeStart = null; marqueeMoved = false; controls.enabled = !transformDragging; event.preventDefault(); event.stopPropagation(); if (didMove) { pointerStart = null; return; }
      }
      if (!pointerStart || transformDragging || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 4) { pointerStart = null; selectedOnDown = false; return; }
      if (selectedOnDown) { pointerStart = null; selectedOnDown = false; return; }
      pointerStart = null;
      const hit = hitAt(event.clientX, event.clientY);
      const current = latestRef.current.selectedIds;
      if (!hit) { if (!event.ctrlKey && !event.shiftKey) latestRef.current.onSelectionChange([]); return; }
      const id = hit.userData.sliceId;
      if (event.ctrlKey || event.shiftKey) latestRef.current.onSelectionChange(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
      else latestRef.current.onSelectionChange([id]);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown, true);
    renderer.domElement.addEventListener("pointermove", onPointerMove, true);
    renderer.domElement.addEventListener("pointerup", onPointerUp, true);

    const beginTransform = () => {
      const items = new Map<string, { position: THREE.Vector3; quaternion: THREE.Quaternion }>();
      latestRef.current.selectedIds.forEach((id) => { const mesh = meshes.get(id); if (mesh) items.set(id, { position: mesh.position.clone(), quaternion: mesh.quaternion.clone() }); });
      transformStart = { proxyPosition: proxy.position.clone(), proxyQuaternion: proxy.quaternion.clone(), items };
    };
    const updateTransform = () => {
      if (!transformStart) return;
      const deltaQuaternion = proxy.quaternion.clone().multiply(transformStart.proxyQuaternion.clone().invert());
      const translation = proxy.position.clone().sub(transformStart.proxyPosition);
      transformStart.items.forEach((start, id) => {
        const mesh = meshes.get(id); if (!mesh) return;
        mesh.position.copy(start.position.clone().sub(transformStart!.proxyPosition).applyQuaternion(deltaQuaternion).add(transformStart!.proxyPosition).add(translation));
        mesh.quaternion.copy(deltaQuaternion.clone().multiply(start.quaternion));
      });
      const preview: Record<string, SliceTransform> = {};
      transformStart.items.forEach((_, id) => { const mesh = meshes.get(id); if (mesh) preview[id] = { position: tuple(mesh.position), rotation: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z] }; });
      latestRef.current.onTransformPreview(preview);
      dirty = true;
    };
    const endTransform = () => {
      if (!transformStart) return;
      const updates: Record<string, SliceTransform> = {};
      transformStart.items.forEach((_, id) => { const mesh = meshes.get(id); if (mesh) updates[id] = { position: tuple(mesh.position), rotation: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z] }; });
      transformStart = null;
      latestRef.current.onTransformsChange(updates);
      latestRef.current.onTransformPreview(null);
    };
    transform.addEventListener("mouseDown", beginTransform);
    transform.addEventListener("objectChange", updateTransform);
    transform.addEventListener("mouseUp", endTransform);
    transform.addEventListener("dragging-changed", (event) => { transformDragging = Boolean((event as { value?: boolean }).value); controls.enabled = !transformDragging; dirty = true; });

    runtimeRef.current = { fit, updateClipping: updateCameraClipping, controls, camera, renderer, transform, proxy, meshes, texture, scene, grid, floor, externalTextures: {} };
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      transform.dispose();
      texture.dispose();
      meshes.forEach((mesh) => { mesh.geometry.dispose(); mesh.material.forEach((material) => material.dispose()); });
      renderer.domElement.removeEventListener("pointerdown", onPointerDown, true);
      renderer.domElement.removeEventListener("pointermove", onPointerMove, true);
      renderer.domElement.removeEventListener("pointerup", onPointerUp, true);
      renderer.dispose();
      renderer.domElement.remove();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const canvas = runtime.texture.image as HTMLCanvasElement;
    props.drawPatternTexture(canvas);
    runtime.texture.needsUpdate = true;
    runtime.renderer.render(runtime.scene, runtime.camera);
  }, [props.textureVersion, props.drawPatternTexture]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    Object.values(runtime.externalTextures).forEach((texture) => texture?.dispose());
    runtime.externalTextures = {};
    let frame = 0;
    const canvasFrameVersions = new Map<HTMLCanvasElement, string>();
    const mediaEntries = Object.entries(props.sourceMedia) as Array<["video" | "ndi" | "spout", HTMLVideoElement | HTMLCanvasElement]>;
    mediaEntries.forEach(([kind, source]) => {
      let texture: THREE.Texture;
      if (props.sourceQuality === "quality" && source instanceof HTMLVideoElement) {
        texture = new THREE.VideoTexture(source);
      } else if (source instanceof HTMLCanvasElement) {
        texture = new THREE.CanvasTexture(source);
        canvasFrameVersions.set(source, source.dataset.frameVersion || "0");
      } else {
        const sourceWidth = Math.max(1, source.videoWidth || 1920);
        const sourceHeight = Math.max(1, source.videoHeight || 1080);
        const scale = props.sourceQuality === "quality" ? 1 : Math.min(1, 960 / sourceWidth);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(sourceWidth * scale));
        canvas.height = Math.max(1, Math.round(sourceHeight * scale));
        texture = new THREE.CanvasTexture(canvas);
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.generateMipmaps = false;
      runtime.externalTextures[kind] = texture;
    });
    const update = () => {
      let changed = false;
      mediaEntries.forEach(([kind, source]) => {
        const active = runtime.externalTextures[kind];
        if (!(active instanceof THREE.CanvasTexture)) return;
        const canvas = active.image as HTMLCanvasElement;
        if (canvas === source) {
          const version = source.dataset.frameVersion || "0";
          if (canvasFrameVersions.get(source) === version) return;
          canvasFrameVersions.set(source, version);
        } else canvas.getContext("2d", { alpha: true })?.drawImage(source, 0, 0, canvas.width, canvas.height);
        active.needsUpdate = true;
        changed = true;
      });
      if (changed) runtime.renderer.render(runtime.scene, runtime.camera);
      frame = requestAnimationFrame(update);
    };
    update();
    return () => {
      cancelAnimationFrame(frame);
      Object.values(runtime.externalTextures).forEach((texture) => texture?.dispose());
      runtime.externalTextures = {};
    };
  }, [props.sourceQuality, props.sourceMedia.video, props.sourceMedia.ndi, props.sourceMedia.spout]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.meshes.forEach((mesh) => {
      runtime.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.forEach((material) => material.dispose());
    });
    runtime.meshes.clear();
    const masterPitchM = props.masterPitchMm / 1000;
    props.slices.forEach((slice) => {
      const localPitchM = (props.pitchBySlice[slice.id] || props.masterPitchMm) / 1000;
      const route = props.sourceOverrides[slice.id] || "inherit", resolvedSource = route === "inherit" ? props.source : route;
      const pivot = props.pivotBySlice[slice.id] || "bottom-center";
      const geometry = createSliceGeometry(slice, localPitchM, props.depthBySlice[slice.id] || 0.01, props.curvatureBySlice[slice.id] || { horizontal: 0, vertical: 0 }, props.compositionWidth, props.compositionHeight, pivot, route !== "inherit");
      const sourceTexture = resolvedSource === "pattern" ? runtime.texture : runtime.externalTextures[resolvedSource];
      const front = new THREE.MeshBasicMaterial({ map: sourceTexture, color: sourceTexture ? 0xffffff : resolvedSource === "ndi" ? 0x5a7380 : 0x725d7f, side: THREE.DoubleSide, toneMapped: false, fog: false, depthTest: true, depthWrite: true });
      const body = new THREE.MeshStandardMaterial({ color: 0x252a2d, roughness: 0.78, metalness: 0.28, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geometry, [front, body]) as unknown as SliceObject;
      mesh.userData.sliceId = slice.id;
      const pivotInputX = pivot === "bottom-left" ? slice.input.x : pivot === "bottom-right" ? slice.input.x + slice.input.width : slice.input.x + slice.input.width / 2;
      const initialPosition: [number, number, number] = [
        (pivotInputX - props.compositionWidth / 2) * masterPitchM,
        (props.compositionHeight - slice.input.y - slice.input.height) * masterPitchM,
        0,
      ];
      const saved = props.transforms[slice.id];
      mesh.position.fromArray(saved?.position || initialPosition);
      if (saved) mesh.rotation.fromArray([...saved.rotation, "XYZ"]);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 20), new THREE.LineBasicMaterial({ color: props.selectedIds.includes(slice.id) ? 0xffffff : 0x546166, transparent: true, opacity: props.selectedIds.includes(slice.id) ? 1 : 0.58, depthWrite: false }));
      edges.userData.nonInteractive = true;
      mesh.add(edges);
      runtime.scene.add(mesh);
      runtime.meshes.set(slice.id, mesh);
    });
    runtime.updateClipping();
    runtime.renderer.render(runtime.scene, runtime.camera);
  }, [props.slices, props.compositionWidth, props.compositionHeight, props.masterPitchMm, props.pitchBySlice, props.depthBySlice, props.curvatureBySlice, props.pivotBySlice, props.transforms, props.source, props.sourceOverrides, props.sourceMedia.video, props.sourceMedia.ndi, props.sourceMedia.spout, props.sourceQuality]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.meshes.forEach((mesh, id) => {
      const edges = mesh.children[0] as THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial> | undefined;
      if (edges) { edges.material.color.set(props.selectedIds.includes(id) ? 0xffffff : 0x546166); edges.material.opacity = props.selectedIds.includes(id) ? 1 : 0.58; }
    });
    const selected = props.selectedIds.map((id) => runtime.meshes.get(id)).filter(Boolean) as SliceObject[];
    if (!selected.length) { runtime.transform.detach(); runtime.renderer.render(runtime.scene, runtime.camera); return; }
    runtime.proxy.position.set(0, 0, 0);
    selected.forEach((mesh) => runtime.proxy.position.add(mesh.position));
    runtime.proxy.position.multiplyScalar(1 / selected.length);
    if (props.transformSpace === "local") runtime.proxy.quaternion.copy(selected[selected.length - 1].quaternion); else runtime.proxy.rotation.set(0, 0, 0);
    runtime.transform.attach(runtime.proxy);
    runtime.renderer.render(runtime.scene, runtime.camera);
  }, [props.selectedIds, props.transformSpace, props.transforms, props.pivotBySlice]);

  useEffect(() => { const runtime = runtimeRef.current; if (!runtime) return; runtime.transform.setMode(props.transformMode); runtime.renderer.render(runtime.scene, runtime.camera); }, [props.transformMode]);
  useEffect(() => { const runtime = runtimeRef.current; if (!runtime) return; runtime.transform.setSpace(props.transformSpace); const selected = props.selectedIds.map((id) => runtime.meshes.get(id)).filter(Boolean) as SliceObject[]; if (selected.length && props.transformSpace === "local") runtime.proxy.quaternion.copy(selected[selected.length - 1].quaternion); else runtime.proxy.rotation.set(0, 0, 0); runtime.renderer.render(runtime.scene, runtime.camera); }, [props.transformSpace, props.selectedIds, props.transforms, props.pivotBySlice]);
  useEffect(() => { const runtime = runtimeRef.current; if (!runtime) return; runtime.grid.visible = props.gridVisible; if (runtime.floor) runtime.floor.visible = props.floorVisible; const level = THREE.MathUtils.clamp(props.backgroundLevel / 100, 0, 2), base = new THREE.Color(0x090b0c), floorColor = new THREE.Color(0x111518); base.multiplyScalar(level); floorColor.multiplyScalar(level); runtime.scene.background = base; if (runtime.floor) runtime.floor.material.color.copy(floorColor); runtime.renderer.render(runtime.scene, runtime.camera); }, [props.gridVisible, props.floorVisible, props.backgroundLevel]);
  useEffect(() => { if (props.fitSignal) runtimeRef.current?.fit(); }, [props.fitSignal]);

  return <div className="three-view" ref={mountRef}>
    {!props.slices.length && <div className="three-empty"><strong>Import a Resolume XML map</strong><span>Every slice will appear here as a physically sized 3D screen.</span></div>}
    <div ref={marqueeRef} className="three-marquee" aria-hidden="true" />
    <div className="three-help">Left drag orbit · Right drag pan · Wheel zoom to cursor · Ctrl-drag marquee · Ctrl/Shift-click multi-select</div>
  </div>;
}
