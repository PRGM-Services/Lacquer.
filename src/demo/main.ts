import { Engine } from "../core/Engine";
import { Light, LightType } from "../core/Light";
import { ViewMode } from "../core/RendererBackend";
import { Scene } from "../core/Scene";
import { Mesh } from "../core/Mesh";
import { Material, MaterialImage } from "../core/Material";
import { Decal } from "../core/Decal";
import { Environment } from "../core/Environment";
import { GizmoAxis, GizmoMode, GizmoRay, GizmoTarget } from "../core/Gizmo";
import { loadGLTF } from "../loaders/GLTFLoader";
import { loadOBJ, parseMTL } from "../loaders/OBJLoader";
import { loadFBX } from "../loaders/FBXLoader";
import { loadSceneFile, saveSceneFile } from "./sceneFile";
import { makeZip } from "./zip";
import { planeGeometry, sphereGeometry } from "../geometry/primitives";
import {
  Mat4, Vec3, add, cross, eulerFromQuat, length, mat4Compose, mat4DecomposeTRS,
  mat4FromTRS, mat4Invert, mat4LookAt, mat4Multiply, mat4Perspective, mat4Scale,
  mat4Translation, normalize, quatFromEuler, quatToMat4, scale as v3scale, sub,
  transformDirection, transformPoint,
} from "../math/vec";
import { makeLiveryDecal } from "./livery";
import {
  addMaterialToLibrary, MaterialManagerHost, openMaterialManager, SavedMaps, SavedProps,
} from "./materialManager";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/* ------------------------------- icon system ------------------------------- */
/* Feather-style stroke icons, colored via currentColor. */

const ICONS: Record<string, string> = {
  move: '<polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/>' +
    '<polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/>' +
    '<line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>',
  rotate: '<polyline points="23 4 23 10 17 10"/>' +
    '<path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  scale: '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>' +
    '<line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>',
  import: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
    '<polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  folderPlus: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' +
    '<line x1="12" y1="10" x2="12" y2="16"/><line x1="9" y1="13" x2="15" y2="13"/>',
  folderOpen: '<path d="M6 14l1.45-2.9A2 2 0 0 1 9.24 10H21a2 2 0 0 1 1.94 2.5l-1.55 6A2 2 0 0 1 19.46 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h6a2 2 0 0 1 2 2v1"/>',
  bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>' +
    '<path d="M9 18h6"/><path d="M10 22h4"/>',
  spot: '<path d="M9 2h6l2 11H7z"/><path d="M12 17v4"/>' +
    '<path d="M8 17l-2 4"/><path d="M16 17l2 4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/>' +
    '<path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/>' +
    '<path d="M2 12h2"/><path d="M20 12h2"/>' +
    '<path d="M6.34 17.66l-1.41 1.41"/><path d="M19.07 4.93l-1.41 1.41"/>',
  cube: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>' +
    '<polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>' +
    '<line x1="1" y1="1" x2="23" y2="23"/>',
  camera: '<polygon points="23 7 16 12 23 17 23 7"/>' +
    '<rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>' +
    '<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>' +
    '<polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  rectlight: '<rect x="3" y="6" width="18" height="12" rx="1.5"/>' +
    '<line x1="7" y1="10" x2="17" y2="10"/><line x1="7" y1="14" x2="17" y2="14"/>',
  octagon: '<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86"/>',
  export: '<rect x="3" y="3" width="18" height="18" rx="2"/>' +
    '<circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  backdrop: '<rect x="3" y="3" width="18" height="18" rx="2"/>' +
    '<path d="M3 16l5-5 4 4 4-4 5 5"/>',
  undo: '<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
  redo: '<polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/>',
};

function iconSVG(name: keyof typeof ICONS, size = 14): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="2" stroke-linecap="round" ` +
    `stroke-linejoin="round">${ICONS[name]}</svg>`;
}

/* static toolbar icons */
$("mode-translate").innerHTML = iconSVG("move");
$("mode-rotate").innerHTML = iconSVG("rotate");
$("mode-scale").innerHTML = iconSVG("scale");
$("open-btn").innerHTML = `${iconSVG("folderOpen", 13)} Open`;
$("import-btn").innerHTML = `${iconSVG("import", 13)} Import`;
$("save-scene-btn").innerHTML = iconSVG("save");
$("undo-btn").innerHTML = iconSVG("undo");
$("redo-btn").innerHTML = iconSVG("redo");
$("open-settings").innerHTML = iconSVG("gear");
$("add-folder").innerHTML = iconSVG("folderPlus");
$("add-point").innerHTML = iconSVG("bulb");
$("add-spot").innerHTML = iconSVG("spot");
$("add-sun").innerHTML = iconSVG("sun");
$("add-rect").innerHTML = iconSVG("rectlight");
$("add-oct").innerHTML = iconSVG("octagon");
$("add-camera").innerHTML = iconSVG("camera");
$("export-btn").innerHTML = `${iconSVG("export", 13)} Export render`;

const canvas = $<HTMLCanvasElement>("viewport");
const scene = new Scene(Environment.proceduralSky({ sunDir: [0.4, 0.7, 0.3] }));

/* ------------------------------ default scene ----------------------------- */

const ground = new Mesh(
  "studio-floor",
  planeGeometry(60, 60),
  new Material({ name: "floor", baseColor: [0.42, 0.42, 0.44], roughness: 0.25, metallic: 0.05 }),
);

function showcaseMeshes(): Mesh[] {
  const group = Mesh.group("showcase");
  const paint = Material.carPaint([0.55, 0.02, 0.04]);
  group.add(
    new Mesh("showcase-paint", sphereGeometry(0.6), paint, mat4Translation([-1.6, 0.6, 0])),
    new Mesh("showcase-glass", sphereGeometry(0.6), Material.glass(), mat4Translation([0, 0.6, 0])),
    new Mesh("showcase-chrome", sphereGeometry(0.6), Material.metal([0.9, 0.91, 0.92], 0.08),
      mat4Translation([1.6, 0.6, 0])),
  );
  return [group];
}

scene.add(ground, ...showcaseMeshes());
scene.camera.position = [3.6, 1.8, 4.6];
scene.camera.target = [0, 0.5, 0];
scene.camera.focusDistance = 5.8;

/* --------------------------------- engine --------------------------------- */

// Start on the lightweight raster backend; the path tracer is only created
// (lazily, on a sibling canvas) when the user flips the ray-tracing toggle.
const engine = await Engine.create({ canvas, maxPixelRatio: 2, backend: "webgl2" });
await engine.setScene(scene);
engine.start();

function updateBackendBadge(): void {
  $("backend").textContent = engine.backend.kind === "webgpu-pathtracer"
    ? "WebGPU path tracing"
    : "WebGL2 realtime raster + IBL GI";
}
updateBackendBadge();

/* --------------------------- ray tracing toggle --------------------------- */

const rtToggle = $<HTMLButtonElement>("rt-toggle");
function syncRTButton(): void {
  rtToggle.classList.toggle("active", engine.raytracingEnabled);
}
syncRTButton();
if (!engine.raytracingAvailable) {
  rtToggle.disabled = true;
  rtToggle.title = "WebGPU is not available in this browser";
}
rtToggle.addEventListener("click", async () => {
  if (rtToggle.disabled) return;
  const want = !engine.raytracingEnabled;
  rtToggle.disabled = true;
  if (want) {
    // The path tracer only renders the standard view — leave debug modes.
    engine.settings.viewMode = "standard";
    $<HTMLSelectElement>("view-mode").value = "standard";
  }
  const ok = await engine.setRaytracing(want);
  rtToggle.disabled = false;
  if (!ok) alert("Ray tracing is not available on this device.");
  syncRTButton();
  updateBackendBadge();
});

/* ------------------------------- view modes -------------------------------- */

const viewModeSel = $<HTMLSelectElement>("view-mode");
viewModeSel.addEventListener("change", async () => {
  const mode = viewModeSel.value as ViewMode;
  engine.settings.viewMode = mode;
  if (mode !== "standard" && engine.raytracingEnabled) {
    // Inspection views are raster-only; drop out of path tracing.
    await engine.setRaytracing(false);
    syncRTButton();
    updateBackendBadge();
  }
  engine.resetAccumulation();
});

engine.onFrame = (stats) => {
  $("stats").textContent =
    `${stats.samples.toLocaleString()} spp · ${stats.triangles.toLocaleString()} tris`;
  updateRTProgress(stats.backend === "webgpu-pathtracer" ? stats.samples : -1);
  drawOverlay();
};

/* --------------------- path-tracing convergence indicator ------------------ */

let rtConvergeTarget = parseInt(localStorage.getItem("lacquer.rtTarget") ?? "256", 10) || 256;
let rtWasDone = false;
let rtFadeTimer: number | null = null;
const RTP_CIRCUMFERENCE = 40.84;

/** samples = -1 hides the pill (raster backend renders instantly). */
function updateRTProgress(samples: number): void {
  const pill = $("rt-progress");
  if (samples < 0) {
    pill.hidden = true;
    rtWasDone = false;
    return;
  }
  pill.hidden = false;
  const frac = Math.min(1, samples / rtConvergeTarget);
  ($("rtp-arc") as unknown as SVGCircleElement).style.strokeDashoffset =
    String(RTP_CIRCUMFERENCE * (1 - frac));
  $("rtp-label").textContent = `${samples.toLocaleString()} spp`;
  const done = samples >= rtConvergeTarget;
  if (done && !rtWasDone) {
    pill.classList.add("done");
    if (rtFadeTimer !== null) clearTimeout(rtFadeTimer);
    rtFadeTimer = window.setTimeout(() => pill.classList.add("faded"), 2500);
  } else if (!done && rtWasDone) {
    // accumulation restarted (camera/scene changed) — back to progress mode
    pill.classList.remove("done", "faded");
    if (rtFadeTimer !== null) {
      clearTimeout(rtFadeTimer);
      rtFadeTimer = null;
    }
  }
  rtWasDone = done;
}

/* ----------------------- selection / gizmo integration -------------------- */

const gizmo = scene.gizmo;
const selection = scene.selection;

// External listeners (e.g. the material manager popup) notified on selection.
const selectionListeners = new Set<() => void>();

// Scene already routes selection -> gizmo target; chain our UI updates on top.
const sceneSelectionHook = selection.onChange;
selection.onChange = (selected) => {
  sceneSelectionHook?.(selected);
  decalEditState = null; // scene hook re-targeted the gizmo to the mesh
  if (selected.length > 0) {
    // picking a mesh releases any light/camera/environment selection
    selectedLight = null;
    editingLightTarget = false;
    selectedViewCam = null;
    selectedEnv = false;
    refreshLightUI();
    refreshCameraUI();
  }
  refreshHierarchyHighlight();
  syncMaterialUI();
  refreshDecalUI();
  syncTransformUI();
  refreshPropertyPanels();
  for (const cb of selectionListeners) cb();
};

/** Rebuild the path tracer's BVH at a bounded rate while dragging. */
let lastRebuild = 0;
gizmo.onChange = () => {
  syncTransformUI();
  if (selectedLight) {
    pushLightUpdate(); // fast path: lights buffer only
    return;
  }
  if (selectedViewCam) {
    return; // camera bookmarks only affect the overlay, redrawn every frame
  }
  if (decalEditState) {
    // Decal projectors live in backend decal buffers, not mesh transforms —
    // both backends need an invalidate to see the projector move.
    scheduleDecalRebuild();
  } else {
    const now = performance.now();
    const isPathTracer = engine.backend.kind === "webgpu-pathtracer";
    if (isPathTracer && now - lastRebuild > 400) {
      lastRebuild = now;
      scene.invalidate();
    }
  }
  engine.resetAccumulation();
};

/* ----------------------------- camera controls ---------------------------- */

let orbiting = false;
let panning = false;
let lastX = 0;
let lastY = 0;
let downX = 0;
let downY = 0;

// Events are delegated at the document so the engine's backend-swap sibling
// canvases (class "viewport") work without rebinding.
const onViewport = (e: Event): boolean =>
  e.target instanceof HTMLElement && e.target.classList.contains("viewport");

document.addEventListener("pointerdown", (e) => {
  if (!onViewport(e)) return;
  orbiting = true;
  panning = e.button === 2 || e.shiftKey;
  lastX = downX = e.clientX;
  lastY = downY = e.clientY;
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
});
document.addEventListener("pointermove", (e) => {
  if (!orbiting) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  if (panning) scene.camera.pan(-dx * 0.004, dy * 0.004);
  else {
    scene.camera.orbit(-dx * 0.005, -dy * 0.005);
    // Only show the pivot reticle when the user set one with a double-click.
    if (customPivotActive) pivotVisibleUntil = performance.now() + 900;
  }
  // Looking through a camera "possesses" it: moving drives the camera itself.
  if (activeViewCam && (dx !== 0 || dy !== 0)) possessActiveCam();
});
document.addEventListener("pointerup", (e) => {
  if (!orbiting) return;
  orbiting = false;
  // A click (no drag) picks the mesh under the cursor; Alt-click instead
  // sets the depth-of-field focus distance to the clicked surface.
  if (Math.hypot(e.clientX - downX, e.clientY - downY) < 4 && e.button === 0) {
    const ray = pointerRay(e);
    const hit = raycastScene(ray);
    if (e.altKey) {
      if (hit) {
        const { forward } = scene.camera.basis();
        const focus = hit.t * (ray.direction[0] * forward[0] +
          ray.direction[1] * forward[1] + ray.direction[2] * forward[2]);
        scene.camera.focusDistance = Math.max(0.1, focus);
        $<HTMLInputElement>("focus").value = focus.toFixed(1);
        refreshSliderReadouts();
        engine.resetAccumulation();
      }
      return;
    }
    if (hit) selection.select(hit.mesh);
    else selection.clear();
  }
});
// Double-click a surface to re-pivot the orbit around that exact point.
document.addEventListener("dblclick", (e) => {
  if (!onViewport(e)) return;
  const ray = pointerRay(e);
  const hit = raycastScene(ray);
  if (!hit) return;
  const pivot = add(ray.origin, v3scale(ray.direction, hit.t));
  clearActiveView();
  // Re-aim at the pivot, keeping the camera where it is so it swings to
  // look at (and orbit around) the clicked point.
  const dist = length(sub(scene.camera.position, pivot));
  animateCameraTo(pivot, scene.camera.position, Math.max(0.1, dist));
  customPivotActive = true;
  pivotVisibleUntil = performance.now() + 2500;
});
document.addEventListener("contextmenu", (e) => {
  if (onViewport(e)) e.preventDefault();
});
document.addEventListener("wheel", (e) => {
  if (!onViewport(e)) return;
  e.preventDefault();
  scene.camera.dolly(Math.exp(e.deltaY * 0.0012));
  if (activeViewCam) possessActiveCam(); // dolly the possessed camera too
}, { passive: false });

window.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement).tagName === "INPUT") return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.code === "KeyZ") {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
    return;
  }
  if (mod && e.code === "KeyY") {
    e.preventDefault();
    redo();
    return;
  }
  if (mod && e.code === "KeyS") {
    e.preventDefault();
    void saveScene();
    return;
  }
  if (mod) return; // don't let modifier chords trigger single-key shortcuts
  if (e.code === "KeyW") setGizmoMode("translate");
  else if (e.code === "KeyE") setGizmoMode("rotate");
  else if (e.code === "KeyR") setGizmoMode("scale");
  else if (e.code === "KeyI") toggleIsolate();
  else if (e.code === "KeyF") focusSelected();
  else if (e.code === "KeyG") toggleOverlays();          // game mode: hide editor overlays
  else if (e.code === "Home") resetOrbitPivot();         // recenter the orbit point
  else if (e.code === "Delete" || e.code === "Backspace") {
    e.preventDefault();
    if (selectedLight) deleteLight(selectedLight);
    else if (selectedViewCam) deleteViewCam(selectedViewCam);
    else {
      const mesh = selection.getPrimary();
      if (mesh) deleteMesh(mesh);
    }
  } else if (e.code === "Escape") {
    if (settingsModal.classList.contains("open")) setSettingsOpen(false);
    else if (exportModal.classList.contains("open")) setExportOpen(false);
    else if (decalEditState) endDecalEdit();
    else if (activeViewCam) clearActiveView();  // stop possessing the camera
    else if (selectedLight) selectLight(null);
    else if (selectedViewCam) selectViewCam(null);
    else if (selectedEnv) selectEnvironment(false);
    else selection.clear();
  }
});

/* ------------------------------ focus (F key) ------------------------------ */

let cameraAnim: number | null = null;

/** Combined world-space AABB over the given subtrees (null when empty). */
function worldAABBOf(roots: Mesh[]): { min: Vec3; max: Vec3 } | null {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const root of roots) {
    for (const mesh of root.getAllMeshes()) {
      if (mesh.geometry.indices.length === 0) continue;
      const box = localAABB(mesh);
      const world = mesh.getWorldTransform();
      for (let i = 0; i < 8; i++) {
        const p = transformPoint(world, [
          i & 1 ? box.max[0] : box.min[0],
          i & 2 ? box.max[1] : box.min[1],
          i & 4 ? box.max[2] : box.min[2],
        ]);
        for (let c = 0; c < 3; c++) {
          if (p[c] < min[c]) min[c] = p[c];
          if (p[c] > max[c]) max[c] = p[c];
        }
      }
    }
  }
  return Number.isFinite(min[0]) ? { min, max } : null;
}

/** Smoothly frame the selected subtree (or the whole model when nothing is
 *  selected), keeping the current viewing direction. */
function focusSelected(): void {
  clearActiveView();
  customPivotActive = false; // framing sets a fresh, non-custom pivot
  const cam = scene.camera;
  const primary = selection.getPrimary();
  const roots = primary ? [primary] : scene.meshes.filter((m) => m !== ground);
  const box = worldAABBOf(roots);
  if (!box) return;
  const { min, max } = box;
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const radius = Math.max(0.15, 0.5 * length(sub(max, min)));
  const dist = Math.min(80, radius / Math.tan((cam.fovYDeg * Math.PI) / 360) * 1.2);
  const dir = normalize(sub(cam.position, cam.target));
  animateCameraTo(center, add(center, v3scale(dir, dist)), dist);
}

function animateCameraTo(target: Vec3, position: Vec3, focusDist: number): void {
  const cam = scene.camera;
  const from = { position: cam.position, target: cam.target, focus: cam.focusDistance };
  const start = performance.now();
  const DURATION = 320;
  if (cameraAnim !== null) cancelAnimationFrame(cameraAnim);
  const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 =>
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const step = (): void => {
    const t = Math.min(1, (performance.now() - start) / DURATION);
    const e = 1 - Math.pow(1 - t, 3); // ease-out cubic
    cam.position = lerp3(from.position, position, e);
    cam.target = lerp3(from.target, target, e);
    cam.focusDistance = from.focus + (focusDist - from.focus) * e;
    cameraAnim = t < 1 ? requestAnimationFrame(step) : null;
  };
  step();
  $<HTMLInputElement>("focus").value = String(focusDist.toFixed(1));
  refreshSliderReadouts();
}

/* ------------------------------ mesh deletion ------------------------------ */

function deleteMesh(mesh: Mesh): void {
  commitHistory();
  // Deleting the isolated subtree (or an ancestor of it) exits isolation.
  if (scene.isolated && (scene.isolated === mesh || scene.isolated.isDescendantOf(mesh))) {
    scene.setIsolated(null);
    $("isolate").textContent = "Isolate (I)";
    $("isolate").classList.remove("active");
  }
  selection.clear(); // also ends any decal edit via the selection hook
  scene.remove(mesh);
  scene.invalidate();
  buildHierarchyUI();
}

$("delete-mesh").addEventListener("click", () => {
  const mesh = selection.getPrimary();
  if (!mesh) {
    alert("Select an object to delete.");
    return;
  }
  deleteMesh(mesh);
});

/* -------------------------------- isolation ------------------------------- */

function toggleIsolate(): void {
  if (scene.isolated) {
    scene.setIsolated(null);
  } else {
    const mesh = selection.getPrimary();
    if (!mesh) return;
    scene.setIsolated(mesh);
    focusSelected(); // isolation implies "look at this" — frame it too
  }
  const btn = $("isolate");
  btn.textContent = scene.isolated ? "Exit (I)" : "Isolate (I)";
  btn.classList.toggle("active", !!scene.isolated);
}
$("isolate").addEventListener("click", toggleIsolate);

function setGizmoMode(mode: GizmoMode): void {
  gizmo.mode = mode;
  for (const m of ["translate", "rotate", "scale"] as const) {
    $(`mode-${m}`).classList.toggle("active", m === mode);
  }
}
$("mode-translate").addEventListener("click", () => setGizmoMode("translate"));
$("mode-rotate").addEventListener("click", () => setGizmoMode("rotate"));
$("mode-scale").addEventListener("click", () => setGizmoMode("scale"));

$("snap-btn").addEventListener("click", () => {
  gizmo.snapEnabled = !gizmo.snapEnabled;
  $("snap-btn").classList.toggle("active", gizmo.snapEnabled);
});

/* snap increments popover */
const snapPop = $("snap-pop");
$("snap-cfg").addEventListener("click", (e) => {
  e.stopPropagation();
  snapPop.hidden = !snapPop.hidden;
});
snapPop.addEventListener("click", (e) => e.stopPropagation());
document.addEventListener("click", () => {
  if (!snapPop.hidden) snapPop.hidden = true;
});

function bindSnapStep(id: string, apply: (v: number) => void): void {
  $<HTMLInputElement>(id).addEventListener("change", (e) => {
    const v = parseFloat((e.target as HTMLInputElement).value);
    if (Number.isFinite(v) && v > 0) apply(v);
  });
}
bindSnapStep("snap-step-t", (v) => (gizmo.snapTranslate = v));
bindSnapStep("snap-step-r", (v) => (gizmo.snapRotateDeg = v));
bindSnapStep("snap-step-s", (v) => (gizmo.snapScale = v));

/* --------------------------- numeric transform UI -------------------------- */

const XF_IDS = [
  "xf-px", "xf-py", "xf-pz",
  "xf-rx", "xf-ry", "xf-rz",
  "xf-sx", "xf-sy", "xf-sz",
] as const;
const RAD2DEG = 180 / Math.PI;

/**
 * The Transform panel edits whatever the gizmo is currently manipulating —
 * a mesh, a light body, a light target, a camera, or a decal — and which of
 * position/rotation/scale actually apply depends on that object.
 */
interface TransformCtx {
  target: GizmoTarget;
  rot: boolean;   // rotation channel meaningful?
  scale: boolean; // scale channel meaningful?
}
function transformCtx(): TransformCtx | null {
  const target = gizmo.getTarget();
  if (!target) return null;
  if (selectedLight) {
    if (editingLightTarget) return { target, rot: false, scale: false };
    // Body rotation is only meaningful when aiming freely (no focus point).
    return { target, rot: !selectedLight.targeted, scale: false };
  }
  if (selectedViewCam) return { target, rot: true, scale: false };
  return { target, rot: true, scale: true }; // mesh or decal
}

let selectedEnv = false;

/**
 * Show only the property sections relevant to the current selection so the
 * panel isn't crowded: a mesh gets Transform+Material+Decals, a light gets
 * Transform+Light, a camera gets Transform+Camera, the environment gets its
 * own controls.
 */
function refreshPropertyPanels(): void {
  const mesh = selection.getPrimary();
  const showMesh = !!mesh && !selectedLight && !selectedViewCam && !selectedEnv;
  const showLight = !!selectedLight;
  const showCam = !!selectedViewCam;
  const anything = showMesh || showLight || showCam || selectedEnv || !!decalEditState;
  const setVis = (id: string, on: boolean): void => { $(id).hidden = !on; };
  setVis("transform-props", anything && !selectedEnv);
  setVis("material-props", showMesh);
  setVis("decal-props", showMesh);
  setVis("light-props", showLight);
  setVis("camera-props", showCam);
  setVis("env-props", selectedEnv);
  $("props-empty").hidden = anything;
}

function syncTransformUI(): void {
  const ctx = transformCtx();
  const inputs = XF_IDS.map((id) => $<HTMLInputElement>(id));
  if (!ctx) {
    for (const el of inputs) {
      el.value = "";
      el.disabled = true;
    }
    return;
  }
  const { position, quaternion, scale: scl } = mat4DecomposeTRS(ctx.target.transform);
  const euler = eulerFromQuat(quaternion);
  const vals = [
    position[0], position[1], position[2],
    euler[0] * RAD2DEG, euler[1] * RAD2DEG, euler[2] * RAD2DEG,
    scl[0], scl[1], scl[2],
  ];
  const editable = [
    true, true, true,
    ctx.rot, ctx.rot, ctx.rot,
    ctx.scale, ctx.scale, ctx.scale,
  ];
  inputs.forEach((el, i) => {
    el.disabled = !editable[i];
    // Don't stomp the field the user is currently typing in.
    if (document.activeElement !== el) {
      el.value = String(+vals[i].toFixed(i >= 3 && i < 6 ? 1 : 3));
    }
  });
}

function applyTransformInputs(): void {
  const ctx = transformCtx();
  if (!ctx) return;
  const v = XF_IDS.map((id) => parseFloat($<HTMLInputElement>(id).value));
  if (v.some((n) => !Number.isFinite(n))) return;
  ctx.target.transform = mat4FromTRS(
    [v[0], v[1], v[2]],
    quatFromEuler(v[3] / RAD2DEG, v[4] / RAD2DEG, v[5] / RAD2DEG),
    [Math.max(0.001, v[6]), Math.max(0.001, v[7]), Math.max(0.001, v[8])],
  );
  // Route the change to the right backend update (mirrors gizmo.onChange).
  if (selectedLight) {
    pushLightUpdate();
  } else if (selectedViewCam) {
    // Camera bookmark only affects the overlay, which redraws each frame.
  } else if (decalEditState) {
    scheduleDecalRebuild();
    engine.resetAccumulation();
  } else {
    scene.invalidate();
    engine.resetAccumulation();
  }
}

// "change" (Enter / blur) rather than every keystroke: typing "1.25" should
// not trigger three scene rebuilds along the way.
for (const id of XF_IDS) {
  $<HTMLInputElement>(id).addEventListener("focus", () => commitHistory());
  $<HTMLInputElement>(id).addEventListener("change", applyTransformInputs);
}

/* --------------------------- projection / picking ------------------------- */

function viewProj(): Mat4 {
  const cam = scene.camera;
  const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  return mat4Multiply(
    mat4Perspective((cam.fovYDeg * Math.PI) / 180, aspect, 0.05, 500),
    mat4LookAt(cam.position, cam.target, cam.up),
  );
}

/** World point -> CSS pixels. Returns null when behind the camera. */
function project(vp: Mat4, p: Vec3): [number, number] | null {
  const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12];
  const y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
  const w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
  if (w <= 1e-6) return null;
  return [
    ((x / w) * 0.5 + 0.5) * canvas.clientWidth,
    (0.5 - (y / w) * 0.5) * canvas.clientHeight,
  ];
}

function pointerRay(e: { clientX: number; clientY: number }): GizmoRay {
  const cam = scene.camera;
  const { forward, right, up } = cam.basis();
  const rect = canvas.getBoundingClientRect();
  const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
  const tanHalf = Math.tan((cam.fovYDeg * Math.PI) / 360);
  const aspect = rect.width / rect.height;
  return {
    origin: cam.position,
    direction: normalize(add(
      forward,
      add(v3scale(right, ndcX * tanHalf * aspect), v3scale(up, -ndcY * tanHalf)),
    )),
  };
}

/** Local-space AABBs cached per geometry for fast pick rejection. */
const aabbCache = new WeakMap<Mesh, { min: Vec3; max: Vec3 }>();
function localAABB(mesh: Mesh): { min: Vec3; max: Vec3 } {
  let box = aabbCache.get(mesh);
  if (!box) {
    const p = mesh.geometry.positions;
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 3) {
      for (let c = 0; c < 3; c++) {
        if (p[i + c] < min[c]) min[c] = p[i + c];
        if (p[i + c] > max[c]) max[c] = p[i + c];
      }
    }
    box = { min, max };
    aabbCache.set(mesh, box);
  }
  return box;
}

/** Closest visible mesh under the ray (t in world units), or null. */
function raycastScene(ray: GizmoRay): { mesh: Mesh; t: number } | null {
  let bestT = Infinity;
  let bestMesh: Mesh | null = null;
  for (const mesh of scene.getAllMeshes()) {
    if (!scene.isMeshRenderable(mesh) || mesh.geometry.indices.length === 0) continue;
    const inv = mat4Invert(mesh.getWorldTransform());
    const o = transformPoint(inv, ray.origin);
    const d = transformDirection(inv, ray.direction); // unnormalized: t stays in world units
    const box = localAABB(mesh);
    let tNear = 0;
    let tFar = bestT;
    let miss = false;
    for (let c = 0; c < 3 && !miss; c++) {
      if (Math.abs(d[c]) < 1e-12) {
        if (o[c] < box.min[c] || o[c] > box.max[c]) miss = true;
      } else {
        let t0 = (box.min[c] - o[c]) / d[c];
        let t1 = (box.max[c] - o[c]) / d[c];
        if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
        tNear = Math.max(tNear, t0);
        tFar = Math.min(tFar, t1);
        if (tNear > tFar) miss = true;
      }
    }
    if (miss) continue;

    const g = mesh.geometry;
    for (let i = 0; i < g.indices.length; i += 3) {
      const t = rayTriangle(o, d, g.positions, g.indices[i], g.indices[i + 1], g.indices[i + 2]);
      if (t > 1e-5 && t < bestT) {
        bestT = t;
        bestMesh = mesh;
      }
    }
  }
  return bestMesh ? { mesh: bestMesh, t: bestT } : null;
}

function rayTriangle(
  o: Vec3, d: Vec3, pos: Float32Array, ia: number, ib: number, ic: number,
): number {
  const ax = pos[ia * 3], ay = pos[ia * 3 + 1], az = pos[ia * 3 + 2];
  const e1: Vec3 = [pos[ib * 3] - ax, pos[ib * 3 + 1] - ay, pos[ib * 3 + 2] - az];
  const e2: Vec3 = [pos[ic * 3] - ax, pos[ic * 3 + 1] - ay, pos[ic * 3 + 2] - az];
  const p = cross(d, e2);
  const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
  if (Math.abs(det) < 1e-12) return -1;
  const inv = 1 / det;
  const tv: Vec3 = [o[0] - ax, o[1] - ay, o[2] - az];
  const u = (tv[0] * p[0] + tv[1] * p[1] + tv[2] * p[2]) * inv;
  if (u < 0 || u > 1) return -1;
  const q = cross(tv, e1);
  const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * inv;
  if (v < 0 || u + v > 1) return -1;
  return (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
}

/* ------------------------------ gizmo overlay ------------------------------ */

const overlay = $<HTMLElement>("overlay") as unknown as SVGSVGElement;
const AXIS_COLORS: Record<"x" | "y" | "z", string> = {
  x: "#ff5f56", y: "#8ce99a", z: "#58a6ff",
};
const SVG_NS = "http://www.w3.org/2000/svg";

interface AxisElems {
  line: SVGLineElement;
  ring: SVGPathElement;
  /** Translate mode: cone/arrowhead at the axis tip. */
  arrow: SVGPathElement;
  /** Scale mode: square handle at the axis tip. */
  box: SVGRectElement;
}
const axisElems = {} as Record<"x" | "y" | "z", AxisElems>;
let centerHandle!: SVGCircleElement; // translate: uniform move
let centerBox!: SVGRectElement;      // scale: uniform scale
let selectionBox!: SVGPathElement;
let decalBox!: SVGPathElement;
let pivotMarker!: SVGGElement;
/** Orbit pivot reticle stays visible until this timestamp (ms). */
let pivotVisibleUntil = 0;
/** True once the user set a pivot with a double-click (crosshair only shows then). */
let customPivotActive = false;
/** "Game mode" — hide all editor overlays (gizmos, boxes, indicators). */
let overlaysHidden = false;
let lightTargetMarker!: SVGGElement;
let lightTargetLine!: SVGLineElement;
let lightTargetHit!: SVGGElement;

let iconLayer!: SVGGElement;

/** Toggle all viewport editor overlays (like Unreal's "G" game mode). */
function toggleOverlays(): void {
  overlaysHidden = !overlaysHidden;
  overlay.style.display = overlaysHidden ? "none" : "";
}

/** Recenter the orbit point on the scene and drop any custom (double-click) pivot. */
function resetOrbitPivot(): void {
  customPivotActive = false;
  pivotVisibleUntil = 0;
  const box = worldAABBOf(scene.meshes.filter((m) => m !== ground));
  const cam = scene.camera;
  const center: Vec3 = box
    ? [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2]
    : [0, 0.4, 0];
  animateCameraTo(center, cam.position, length(sub(cam.position, center)));
}

function buildOverlay(): void {
  // Light/camera indicators render beneath the gizmo elements.
  iconLayer = document.createElementNS(SVG_NS, "g");
  overlay.appendChild(iconLayer);

  // Orbit-pivot marker: a soft concentric focus dot (outer ring + filled core).
  pivotMarker = document.createElementNS(SVG_NS, "g");
  pivotMarker.style.pointerEvents = "none";
  const pOuter = document.createElementNS(SVG_NS, "circle");
  pOuter.setAttribute("r", "7");
  pOuter.setAttribute("fill", "rgba(255,59,31,0.12)");
  pOuter.setAttribute("stroke", "#ff3b1f");
  pOuter.setAttribute("stroke-width", "1.5");
  const pCore = document.createElementNS(SVG_NS, "circle");
  pCore.setAttribute("r", "2.4");
  pCore.setAttribute("fill", "#ff3b1f");
  pivotMarker.append(pOuter, pCore);
  pivotMarker.setAttribute("visibility", "hidden");
  overlay.appendChild(pivotMarker);

  // Light target handle: dashed connector from the light to a clickable
  // diamond aim-marker. Clicking it moves the target with the gizmo.
  lightTargetMarker = document.createElementNS(SVG_NS, "g");
  lightTargetLine = document.createElementNS(SVG_NS, "line");
  lightTargetLine.setAttribute("stroke", "#ffd43b");
  lightTargetLine.setAttribute("stroke-width", "1.2");
  lightTargetLine.setAttribute("stroke-dasharray", "4 4");
  lightTargetLine.style.pointerEvents = "none";
  lightTargetMarker.appendChild(lightTargetLine);
  lightTargetHit = document.createElementNS(SVG_NS, "g");
  lightTargetHit.style.pointerEvents = "auto";
  lightTargetHit.style.cursor = "pointer";
  const ltDiamond = document.createElementNS(SVG_NS, "path");
  ltDiamond.setAttribute("d", "M0,-8 L8,0 L0,8 L-8,0 Z");
  ltDiamond.setAttribute("fill", "rgba(255,212,59,0.14)");
  ltDiamond.setAttribute("stroke", "#ffd43b");
  ltDiamond.setAttribute("stroke-width", "1.5");
  ltDiamond.setAttribute("stroke-linejoin", "round");
  const ltDot = document.createElementNS(SVG_NS, "circle");
  ltDot.setAttribute("r", "1.5");
  ltDot.setAttribute("fill", "#ffd43b");
  lightTargetHit.append(ltDiamond, ltDot);
  lightTargetHit.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (selectedLight) selectLightTarget(selectedLight);
  });
  lightTargetMarker.appendChild(lightTargetHit);
  lightTargetMarker.setAttribute("visibility", "hidden");
  overlay.appendChild(lightTargetMarker);

  selectionBox = document.createElementNS(SVG_NS, "path");
  selectionBox.setAttribute("fill", "none");
  selectionBox.setAttribute("stroke", "rgba(255,200,60,0.55)");
  selectionBox.setAttribute("stroke-width", "1");
  overlay.appendChild(selectionBox);

  decalBox = document.createElementNS(SVG_NS, "path");
  decalBox.setAttribute("fill", "none");
  decalBox.setAttribute("stroke", "#ffd43b");
  decalBox.setAttribute("stroke-width", "1.5");
  decalBox.setAttribute("stroke-dasharray", "5 4");
  overlay.appendChild(decalBox);

  for (const a of ["x", "y", "z"] as const) {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("stroke", AXIS_COLORS[a]);
    line.setAttribute("stroke-width", "2.5");
    const ring = document.createElementNS(SVG_NS, "path");
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke", AXIS_COLORS[a]);
    ring.setAttribute("stroke-width", "3");
    ring.style.pointerEvents = "stroke";
    ring.style.cursor = "grab";
    const arrow = document.createElementNS(SVG_NS, "path");
    arrow.setAttribute("fill", AXIS_COLORS[a]);
    arrow.style.pointerEvents = "auto";
    arrow.style.cursor = "grab";
    const box = document.createElementNS(SVG_NS, "rect");
    box.setAttribute("width", "11");
    box.setAttribute("height", "11");
    box.setAttribute("rx", "2");
    box.setAttribute("fill", AXIS_COLORS[a]);
    box.style.pointerEvents = "auto";
    box.style.cursor = "grab";
    overlay.append(line, ring, arrow, box);
    axisElems[a] = { line, ring, arrow, box };
    arrow.addEventListener("pointerdown", (e) => beginGizmoDrag(a, e));
    box.addEventListener("pointerdown", (e) => beginGizmoDrag(a, e));
    ring.addEventListener("pointerdown", (e) => beginGizmoDrag(a, e));
  }
  centerHandle = document.createElementNS(SVG_NS, "circle");
  centerHandle.setAttribute("r", "6");
  centerHandle.setAttribute("fill", "#e8e8ea");
  centerHandle.style.pointerEvents = "auto";
  centerHandle.style.cursor = "grab";
  overlay.appendChild(centerHandle);
  centerHandle.addEventListener("pointerdown", (e) => beginGizmoDrag("xyz", e));

  centerBox = document.createElementNS(SVG_NS, "rect");
  centerBox.setAttribute("width", "11");
  centerBox.setAttribute("height", "11");
  centerBox.setAttribute("rx", "2");
  centerBox.setAttribute("fill", "#e8e8ea");
  centerBox.style.pointerEvents = "auto";
  centerBox.style.cursor = "grab";
  overlay.appendChild(centerBox);
  centerBox.addEventListener("pointerdown", (e) => beginGizmoDrag("xyz", e));
}
buildOverlay();

function beginGizmoDrag(axis: GizmoAxis, e: PointerEvent): void {
  e.preventDefault();
  e.stopPropagation();
  if (!gizmo.startDrag(axis, pointerRay(e))) return;
  commitHistory(); // one undo step per drag
  const move = (ev: PointerEvent) => gizmo.updateDrag(pointerRay(ev));
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    gizmo.endDrag();
    scene.invalidate(); // final exact rebuild
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function drawOverlay(): void {
  const vp = viewProj();
  drawSceneIcons(vp);
  drawPivot(vp);
  drawLightTarget(vp);

  const geo = gizmo.getGizmoGeometry(scene.camera);
  const selected = selection.getPrimary();
  const hide = (el: SVGElement) => el.setAttribute("visibility", "hidden");
  const show = (el: SVGElement) => el.setAttribute("visibility", "visible");

  if (!geo) {
    for (const a of ["x", "y", "z"] as const) {
      hide(axisElems[a].line); hide(axisElems[a].arrow);
      hide(axisElems[a].box); hide(axisElems[a].ring);
    }
    hide(centerHandle);
    hide(centerBox);
    hide(selectionBox);
    hide(decalBox);
    return;
  }
  drawDecalBox(vp, hide, show);
  const center = project(vp, geo.position);
  if (!center) return;

  for (const a of ["x", "y", "z"] as const) {
    const el = axisElems[a];
    const dir = geo.axes[a];
    if (geo.mode === "rotate") {
      hide(el.line); hide(el.arrow); hide(el.box);
      // ring: circle of radius size in the plane perpendicular to the axis
      const seed: Vec3 = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const u = normalize(cross(dir, seed));
      const v = cross(dir, u);
      let dpath = "";
      for (let i = 0; i <= 32; i++) {
        const th = (i / 32) * Math.PI * 2;
        const p = add(geo.position,
          add(v3scale(u, Math.cos(th) * geo.size), v3scale(v, Math.sin(th) * geo.size)));
        const s = project(vp, p);
        if (!s) { dpath = ""; break; }
        dpath += `${i === 0 ? "M" : "L"}${s[0].toFixed(1)},${s[1].toFixed(1)}`;
      }
      if (dpath) {
        el.ring.setAttribute("d", dpath);
        show(el.ring);
      } else hide(el.ring);
    } else {
      hide(el.ring);
      const tip = project(vp, add(geo.position, v3scale(dir, geo.size)));
      if (!tip) { hide(el.line); hide(el.arrow); hide(el.box); continue; }
      el.line.setAttribute("x1", String(center[0]));
      el.line.setAttribute("y1", String(center[1]));
      el.line.setAttribute("x2", String(tip[0]));
      el.line.setAttribute("y2", String(tip[1]));
      show(el.line);
      // Screen-space direction of the axis, for orienting the tip handle.
      const ddx = tip[0] - center[0];
      const ddy = tip[1] - center[1];
      const dlen = Math.hypot(ddx, ddy) || 1;
      const ux = ddx / dlen;
      const uy = ddy / dlen;
      if (geo.mode === "translate") {
        hide(el.box);
        // arrowhead: triangle pointing along the axis
        const tipX = tip[0] + ux * 11, tipY = tip[1] + uy * 11;
        const b1x = tip[0] - uy * 5.5, b1y = tip[1] + ux * 5.5;
        const b2x = tip[0] + uy * 5.5, b2y = tip[1] - ux * 5.5;
        el.arrow.setAttribute("d",
          `M${tipX.toFixed(1)},${tipY.toFixed(1)}` +
          `L${b1x.toFixed(1)},${b1y.toFixed(1)}` +
          `L${b2x.toFixed(1)},${b2y.toFixed(1)}Z`);
        show(el.arrow);
      } else {
        hide(el.arrow);
        // scale: square block at the tip
        el.box.setAttribute("x", String(tip[0] - 5.5));
        el.box.setAttribute("y", String(tip[1] - 5.5));
        show(el.box);
      }
    }
    const active = gizmo.getActiveAxis() === a;
    const color = active ? "#ffd43b" : AXIS_COLORS[a];
    el.arrow.setAttribute("fill", color);
    el.box.setAttribute("fill", color);
    el.ring.setAttribute("stroke", color);
  }
  if (geo.mode === "rotate") {
    hide(centerHandle);
    hide(centerBox);
  } else if (geo.mode === "translate") {
    hide(centerBox);
    centerHandle.setAttribute("cx", String(center[0]));
    centerHandle.setAttribute("cy", String(center[1]));
    show(centerHandle);
  } else {
    hide(centerHandle);
    centerBox.setAttribute("x", String(center[0] - 5.5));
    centerBox.setAttribute("y", String(center[1] - 5.5));
    show(centerBox);
  }

  // Selection box indicator. Leaves get their oriented local AABB; groups
  // (and anything with children) get the world-aligned box of the whole
  // subtree so selecting a sub-assembly is clearly visible.
  const corners = selected ? selectionBoxCorners(selected, vp) : null;
  if (corners) {
    const EDGES = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4],
      [0, 4], [1, 5], [2, 6], [3, 7]];
    let d = "";
    for (const [i, j] of EDGES) {
      const a = corners[i], b = corners[j];
      if (a && b) d += `M${a[0].toFixed(1)},${a[1].toFixed(1)}L${b[0].toFixed(1)},${b[1].toFixed(1)}`;
    }
    selectionBox.setAttribute("d", d);
    show(selectionBox);
  } else hide(selectionBox);
}

/* ------------------------- light / camera indicators ----------------------- */

interface SceneIcon {
  key: object;
  g: SVGGElement;
  halo: SVGCircleElement;
  glyph: SVGPathElement;
  body: SVGElement;
}
let lightIcons: SceneIcon[] = [];
let camIcons: SceneIcon[] = [];

/** A distinct fixed-size silhouette per light type, so lights are told apart
 *  at a glance: disc (point), cone (spot), starburst (sun), rectangle (rect),
 *  octagon (octagon). Filled with the light colour each frame. */
function lightBodyShape(type: LightType): SVGElement {
  const path = (d: string): SVGElement => {
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", d);
    return p;
  };
  if (type === "point") {
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("r", "5");
    return c;
  }
  if (type === "spot") return path("M0,-6.5 L5.5,5 L-5.5,5 Z");
  if (type === "rect") {
    const r = document.createElementNS(SVG_NS, "rect");
    r.setAttribute("x", "-7"); r.setAttribute("y", "-4.5");
    r.setAttribute("width", "14"); r.setAttribute("height", "9");
    r.setAttribute("rx", "1.5");
    return r;
  }
  if (type === "octagon") {
    let d = "";
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      d += `${k === 0 ? "M" : "L"}${(Math.cos(a) * 6).toFixed(1)},${(Math.sin(a) * 6).toFixed(1)}`;
    }
    return path(d + "Z");
  }
  // directional (sun): an 8-spike starburst
  let d = "";
  for (let k = 0; k < 16; k++) {
    const r = k % 2 === 0 ? 6.5 : 2.6;
    const a = (k / 16) * Math.PI * 2;
    d += `${k === 0 ? "M" : "L"}${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
  }
  return path(d + "Z");
}

function makeIcon(kind: "light" | "camera", key: object, onPick: () => void): SceneIcon {
  const g = document.createElementNS(SVG_NS, "g");
  g.style.pointerEvents = "auto";
  g.style.cursor = "pointer";
  const halo = document.createElementNS(SVG_NS, "circle");
  halo.setAttribute("r", "12");
  halo.setAttribute("fill", "none");
  halo.setAttribute("stroke", "#ffd43b");
  halo.setAttribute("stroke-width", "1.5");
  const glyph = document.createElementNS(SVG_NS, "path");
  glyph.setAttribute("fill", "none");
  glyph.setAttribute("stroke-width", "1.6");
  let body: SVGElement;
  if (kind === "light") {
    body = lightBodyShape((key as Light).type);
  } else {
    body = document.createElementNS(SVG_NS, "rect");
    body.setAttribute("x", "-7");
    body.setAttribute("y", "-4.5");
    body.setAttribute("width", "14");
    body.setAttribute("height", "9");
    body.setAttribute("rx", "2");
    body.setAttribute("fill", "#c6c7cd");
  }
  body.setAttribute("stroke", "rgba(0,0,0,0.55)");
  g.append(halo, glyph, body);
  g.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    e.preventDefault();
    onPick();
  });
  iconLayer.appendChild(g);
  return { key, g, halo, glyph, body };
}

/** Orbit-pivot reticle at the camera's target, shown only after a double-click. */
function drawPivot(vp: Mat4): void {
  const remain = customPivotActive ? pivotVisibleUntil - performance.now() : 0;
  if (remain <= 0) {
    pivotMarker.setAttribute("visibility", "hidden");
    return;
  }
  const s = project(vp, scene.camera.target);
  if (!s) {
    pivotMarker.setAttribute("visibility", "hidden");
    return;
  }
  pivotMarker.setAttribute("visibility", "visible");
  pivotMarker.setAttribute("transform", `translate(${s[0].toFixed(1)},${s[1].toFixed(1)})`);
  pivotMarker.setAttribute("opacity", Math.min(1, remain / 500).toFixed(2));
}

/** Dashed connector + crosshair at the selected light's aim point. */
function drawLightTarget(vp: Mat4): void {
  const l = selectedLight;
  // The connector line carries an explicit visibility="visible" (SVG lets a
  // child override an ancestor's hidden), so it must be hidden explicitly on
  // every early-out or it leaks after the light is deselected.
  const hideMarker = (): void => {
    lightTargetMarker.setAttribute("visibility", "hidden");
    lightTargetLine.setAttribute("visibility", "hidden");
  };
  if (!l || !lightHasTarget(l)) {
    hideMarker();
    return;
  }
  const tp = project(vp, l.target);
  const lp = project(vp, l.position);
  if (!tp) {
    hideMarker();
    return;
  }
  lightTargetMarker.setAttribute("visibility", "visible");
  if (lp) {
    lightTargetLine.setAttribute("x1", lp[0].toFixed(1));
    lightTargetLine.setAttribute("y1", lp[1].toFixed(1));
    lightTargetLine.setAttribute("x2", tp[0].toFixed(1));
    lightTargetLine.setAttribute("y2", tp[1].toFixed(1));
    lightTargetLine.setAttribute("visibility", "visible");
  } else {
    lightTargetLine.setAttribute("visibility", "hidden");
  }
  lightTargetHit.setAttribute("transform", `translate(${tp[0].toFixed(1)},${tp[1].toFixed(1)})`);
  // Emphasize the crosshair while its gizmo is active.
  lightTargetHit.setAttribute("opacity", editingLightTarget ? "1" : "0.75");
}

function drawSceneIcons(vp: Mat4): void {
  // Reconcile icon element lists with the current scene objects.
  if (lightIcons.length !== scene.lights.length ||
      lightIcons.some((ic, i) => ic.key !== scene.lights[i])) {
    for (const ic of lightIcons) ic.g.remove();
    lightIcons = scene.lights.map((light) =>
      makeIcon("light", light, () => selectLight(light)));
  }
  if (camIcons.length !== viewCams.length ||
      camIcons.some((ic, i) => ic.key !== viewCams[i])) {
    for (const ic of camIcons) ic.g.remove();
    camIcons = viewCams.map((cam) =>
      makeIcon("camera", cam, () => selectViewCam(cam)));
  }

  lightIcons.forEach((ic, i) => {
    const light = scene.lights[i];
    const s = project(vp, light.position);
    if (!s) {
      ic.g.setAttribute("visibility", "hidden");
      return;
    }
    ic.g.setAttribute("visibility", "visible");
    ic.g.setAttribute("transform", `translate(${s[0].toFixed(1)},${s[1].toFixed(1)})`);
    const hex = light.visible ? rgbToHex(light.color) : "#5b5d66";
    ic.body.setAttribute("fill", hex);
    ic.glyph.setAttribute("stroke", hex);
    ic.halo.setAttribute("visibility", selectedLight === light ? "visible" : "hidden");

    // The body silhouette conveys the light TYPE; the glyph adds direction (an
    // aim line toward the target) and, for the selected area light, the real
    // projected emitter outline so you can judge its size in the scene.
    let dPath = "";
    const dirLight = light.type !== "point";
    if (dirLight) {
      const tip = project(vp, add(light.position, v3scale(normalize(light.direction), 0.8)));
      if (tip) {
        const dx = tip[0] - s[0];
        const dy = tip[1] - s[1];
        const len = Math.hypot(dx, dy) || 1;
        dPath += `M0,0L${((dx / len) * 24).toFixed(1)},${((dy / len) * 24).toFixed(1)}`;
      }
    }
    if (selectedLight === light && (light.type === "rect" || light.type === "octagon")) {
      const nL = normalize(light.direction);
      const seed: Vec3 = Math.abs(nL[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      const bu = normalize(cross(nL, seed));
      const bv = cross(nL, bu);
      const verts: Vec3[] = [];
      if (light.type === "rect") {
        const hw = light.width / 2;
        const hh = light.height / 2;
        for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
          verts.push(add(light.position, add(v3scale(bu, su * hw), v3scale(bv, sv * hh))));
        }
      } else {
        const r = light.width / 2;
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
          verts.push(add(light.position,
            add(v3scale(bu, Math.cos(a) * r), v3scale(bv, Math.sin(a) * r))));
        }
      }
      let ok = true;
      let outline = "";
      verts.forEach((wp, k) => {
        const sp = project(vp, wp);
        if (!sp) { ok = false; return; }
        outline += `${k === 0 ? "M" : "L"}${(sp[0] - s[0]).toFixed(1)},${(sp[1] - s[1]).toFixed(1)}`;
      });
      if (ok) dPath += outline + "Z";
    }
    ic.glyph.setAttribute("d", dPath);
  });

  camIcons.forEach((ic, i) => {
    const cam = viewCams[i];
    const s = project(vp, cam.position);
    if (!s) {
      ic.g.setAttribute("visibility", "hidden");
      return;
    }
    ic.g.setAttribute("visibility", "visible");
    ic.g.setAttribute("transform", `translate(${s[0].toFixed(1)},${s[1].toFixed(1)})`);
    ic.halo.setAttribute("visibility", selectedViewCam === cam ? "visible" : "hidden");
    ic.glyph.setAttribute("stroke", selectedViewCam === cam ? "#ffd43b" : "#9a9ba3");

    // lens wedge + dashed aim line toward the camera's target
    const st = project(vp, cam.target);
    let dPath = "";
    if (st) {
      const dx = st[0] - s[0];
      const dy = st[1] - s[1];
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const px = -uy;
      const py = ux;
      dPath = `M${(ux * 7).toFixed(1)},${(uy * 7).toFixed(1)}` +
        `L${(ux * 15 + px * 5).toFixed(1)},${(uy * 15 + py * 5).toFixed(1)}` +
        `L${(ux * 15 - px * 5).toFixed(1)},${(uy * 15 - py * 5).toFixed(1)}Z` +
        `M${(ux * 15).toFixed(1)},${(uy * 15).toFixed(1)}` +
        `L${(dx * 0.92).toFixed(1)},${(dy * 0.92).toFixed(1)}`;
    }
    ic.glyph.setAttribute("d", dPath);
    ic.glyph.setAttribute("stroke-dasharray", "4 4");
  });
}

/** Dashed outline of the decal projector box while a decal is being edited,
 *  plus a tick along the projection direction. */
function drawDecalBox(
  vp: Mat4,
  hide: (el: SVGElement) => void,
  show: (el: SVGElement) => void,
): void {
  if (!decalEditState) {
    hide(decalBox);
    return;
  }
  const d = decalEditState.decal;
  const toWorld = mat4Compose(d.position, d.rotation, d.size);
  const corners: ([number, number] | null)[] = [];
  for (let i = 0; i < 8; i++) {
    corners.push(project(vp, transformPoint(toWorld, [
      i & 1 ? 0.5 : -0.5,
      i & 2 ? 0.5 : -0.5,
      i & 4 ? 0.5 : -0.5,
    ])));
  }
  const EDGES = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4],
    [0, 4], [1, 5], [2, 6], [3, 7]];
  let path = "";
  for (const [i, j] of EDGES) {
    const a = corners[i], b = corners[j];
    if (a && b) path += `M${a[0].toFixed(1)},${a[1].toFixed(1)}L${b[0].toFixed(1)},${b[1].toFixed(1)}`;
  }
  const c0 = project(vp, d.position);
  const c1 = project(vp, add(d.position, v3scale(d.projectionDir(), d.size[2] * 0.5)));
  if (c0 && c1) path += `M${c0[0].toFixed(1)},${c0[1].toFixed(1)}L${c1[0].toFixed(1)},${c1[1].toFixed(1)}`;
  if (path) {
    decalBox.setAttribute("d", path);
    show(decalBox);
  } else hide(decalBox);
}

function selectionBoxCorners(selected: Mesh, vp: Mat4): ([number, number] | null)[] | null {
  if (selected.children.length === 0 && selected.geometry.indices.length > 0) {
    // leaf: oriented local box
    const box = localAABB(selected);
    const world = selected.getWorldTransform();
    const corners: ([number, number] | null)[] = [];
    for (let i = 0; i < 8; i++) {
      corners.push(project(vp, transformPoint(world, [
        i & 1 ? box.max[0] : box.min[0],
        i & 2 ? box.max[1] : box.min[1],
        i & 4 ? box.max[2] : box.min[2],
      ])));
    }
    return corners;
  }
  // group / parent: world-aligned box over every descendant's geometry
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const mesh of selected.getAllMeshes()) {
    if (mesh.geometry.indices.length === 0) continue;
    const box = localAABB(mesh);
    const world = mesh.getWorldTransform();
    for (let i = 0; i < 8; i++) {
      const p = transformPoint(world, [
        i & 1 ? box.max[0] : box.min[0],
        i & 2 ? box.max[1] : box.min[1],
        i & 4 ? box.max[2] : box.min[2],
      ]);
      for (let c = 0; c < 3; c++) {
        if (p[c] < min[c]) min[c] = p[c];
        if (p[c] > max[c]) max[c] = p[c];
      }
    }
  }
  if (!Number.isFinite(min[0])) return null;
  const corners: ([number, number] | null)[] = [];
  for (let i = 0; i < 8; i++) {
    corners.push(project(vp, [
      i & 1 ? max[0] : min[0],
      i & 2 ? max[1] : min[1],
      i & 4 ? max[2] : min[2],
    ]));
  }
  return corners;
}

/* ----------------------------- hierarchy panel ----------------------------- */

/** Groups the user collapsed; survives rebuilds within the session. */
const collapsedNodes = new Set<Mesh>();

/* Environment state shown as a hierarchy node. */
let envName = "Procedural sky";
let envHiddenIntensity: number | null = null;
let folderCounter = 0;

/* Drag & drop reparenting. */
let draggedMesh: Mesh | null = null;

function canDropOn(target: Mesh): boolean {
  return !!draggedMesh && draggedMesh !== target && !target.isDescendantOf(draggedMesh);
}

function reparentMesh(mesh: Mesh, newParent: Mesh | null): void {
  commitHistory();
  if (mesh.parent) mesh.parent.remove(mesh);
  else scene.meshes = scene.meshes.filter((m) => m !== mesh);
  if (newParent) newParent.add(mesh);
  else scene.meshes.push(mesh);
  scene.invalidate();
  buildHierarchyUI();
}

function toggleEnvironment(): void {
  commitHistory();
  if (envHiddenIntensity === null) {
    envHiddenIntensity = scene.environment.intensity;
    scene.environment.intensity = 0;
  } else {
    scene.environment.intensity = envHiddenIntensity;
    envHiddenIntensity = null;
  }
  engine.resetAccumulation();
  buildHierarchyUI();
}

function resetEnvironment(): void {
  commitHistory();
  envHiddenIntensity = null;
  envName = "Procedural sky";
  scene.setEnvironment(Environment.proceduralSky({ sunDir: [0.4, 0.7, 0.3] }));
  $<HTMLInputElement>("env-intensity").value = "1";
  refreshSliderReadouts();
  buildHierarchyUI();
}

/** Select the environment so its controls appear in the Properties panel. */
function selectEnvironment(on: boolean): void {
  if (on) {
    selection.clear();       // release any mesh/decal selection + gizmo
    selectedLight = null;
    editingLightTarget = false;
    selectedViewCam = null;
  }
  selectedEnv = on;
  refreshLightUI();
  refreshCameraUI();
  syncEnvProps();
  refreshPropertyPanels();
  buildHierarchyUI();
}

function syncEnvProps(): void {
  if (!selectedEnv) return;
  const env = scene.environment;
  $("env-prop-name").textContent = envName;
  $<HTMLInputElement>("env-prop-intensity").value =
    String(envHiddenIntensity ?? env.intensity);
  $<HTMLInputElement>("env-prop-rotation").value =
    String(Math.round((env.rotation * 180) / Math.PI));
  $<HTMLInputElement>("env-prop-backdrop").checked = engine.settings.envBackground;
  $<HTMLInputElement>("env-prop-lighting").checked = envHiddenIntensity === null;
  refreshSliderReadouts();
}

function treeHead(host: HTMLElement, text: string): void {
  const head = document.createElement("div");
  head.className = "tree-head";
  head.textContent = text;
  host.appendChild(head);
}

$<HTMLInputElement>("env-prop-intensity").addEventListener("input", (e) => {
  const v = parseFloat((e.target as HTMLInputElement).value);
  if (envHiddenIntensity !== null) envHiddenIntensity = v; // stash while lighting off
  else scene.environment.intensity = v;
  engine.resetAccumulation();
});
$<HTMLInputElement>("env-prop-rotation").addEventListener("input", (e) => {
  scene.environment.rotation = (parseFloat((e.target as HTMLInputElement).value) * Math.PI) / 180;
  engine.resetAccumulation();
});
$<HTMLInputElement>("env-prop-backdrop").addEventListener("change", (e) => {
  engine.settings.envBackground = (e.target as HTMLInputElement).checked;
  engine.resetAccumulation();
  buildHierarchyUI();
});
$<HTMLInputElement>("env-prop-lighting").addEventListener("change", () => {
  toggleEnvironment(); // flips envHiddenIntensity + rebuilds hierarchy
  syncEnvProps();
});
$("env-prop-import").addEventListener("click", () => $<HTMLInputElement>("file-input").click());
$("env-prop-reset").addEventListener("click", () => {
  resetEnvironment();
  syncEnvProps();
});

function buildHierarchyUI(): void {
  const host = $("hierarchy");
  host.innerHTML = "";

  /* ------------------------- environment node ------------------------- */
  treeHead(host, "Environment");
  {
    const row = document.createElement("div");
    row.className = `tree-row${selectedEnv ? " selected" : ""}`;
    row.addEventListener("click", () => selectEnvironment(true));
    const glyph = document.createElement("span");
    glyph.className = "tree-ico";
    glyph.innerHTML = iconSVG("globe", 12);
    glyph.style.color = "#7fb8d8";
    const label = document.createElement("span");
    label.className = "tree-label";
    label.textContent = envName;
    const backdrop = document.createElement("span");
    backdrop.className = "tree-eye";
    backdrop.innerHTML = iconSVG("backdrop", 12);
    const bgOn = engine.settings.envBackground;
    backdrop.title = bgOn
      ? "Hide backdrop (HDRI keeps lighting the scene)"
      : "Show HDRI backdrop";
    backdrop.style.color = bgOn ? "" : "#ff5f56";
    backdrop.addEventListener("click", (e) => {
      e.stopPropagation();
      engine.settings.envBackground = !engine.settings.envBackground;
      engine.resetAccumulation();
      buildHierarchyUI();
    });
    const eye = document.createElement("span");
    eye.className = "tree-eye";
    eye.innerHTML = iconSVG(envHiddenIntensity === null ? "eye" : "eyeOff", 12);
    eye.title = envHiddenIntensity === null
      ? "Hide environment lighting entirely"
      : "Show environment lighting";
    eye.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleEnvironment();
    });
    const del = document.createElement("span");
    del.className = "tree-del";
    del.textContent = "✕";
    del.title = "Remove HDRI (reset to procedural sky)";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      resetEnvironment();
    });
    row.append(glyph, backdrop, eye, label, del);
    host.appendChild(row);
  }

  /* ------------------------------ lights ------------------------------ */
  if (scene.lights.length > 0) {
    treeHead(host, "Lights");
    for (const light of scene.lights) {
      const row = document.createElement("div");
      row.className = `tree-row${selectedLight === light ? " selected" : ""}`;
      const glyph = document.createElement("span");
      glyph.className = "tree-ico";
      glyph.innerHTML = iconSVG(LIGHT_ICON[light.type], 12);
      glyph.style.color = rgbToHex(light.color);
      const label = document.createElement("span");
      label.className = "tree-label";
      label.textContent = light.name;
      const eye = document.createElement("span");
      eye.className = "tree-eye";
      eye.innerHTML = iconSVG(light.visible ? "eye" : "eyeOff", 12);
      eye.title = "Toggle light";
      eye.addEventListener("click", (e) => {
        e.stopPropagation();
        light.visible = !light.visible;
        pushLightUpdate();
        buildHierarchyUI();
      });
      const del = document.createElement("span");
      del.className = "tree-del";
      del.textContent = "✕";
      del.title = "Delete light";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteLight(light);
      });
      row.append(glyph, eye, label, del);
      row.addEventListener("click", () => selectLight(light));
      host.appendChild(row);
    }
  }

  /* ------------------------------ objects ----------------------------- */
  treeHead(host, "Objects");

  const addRow = (mesh: Mesh, depth: number, guides: string, isLast: boolean): void => {
    const row = document.createElement("div");
    row.className = "tree-row";
    row.dataset.mesh = "1";

    // Ancestor guide lines + this row's branch connector.
    const guide = document.createElement("span");
    guide.className = "tree-guides";
    guide.textContent = guides + (depth > 0 ? (isLast ? "└─" : "├─") : "");

    const hasKids = mesh.children.length > 0;
    const isCollapsed = collapsedNodes.has(mesh);
    const arrow = document.createElement("span");
    arrow.className = "tree-arrow";
    arrow.textContent = hasKids ? (isCollapsed ? "▶" : "▼") : "";
    if (hasKids) {
      arrow.classList.add("clickable");
      arrow.title = isCollapsed ? "Expand" : "Collapse";
      arrow.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isCollapsed) collapsedNodes.delete(mesh);
        else collapsedNodes.add(mesh);
        buildHierarchyUI();
      });
    }

    const isGroup = mesh.geometry.indices.length === 0;
    const typeIco = document.createElement("span");
    typeIco.className = "tree-ico";
    typeIco.innerHTML = iconSVG(isGroup ? "folder" : "cube", 12);
    if (isGroup) typeIco.style.color = "#cfa96b";

    const eye = document.createElement("span");
    eye.className = "tree-eye";
    eye.innerHTML = iconSVG(mesh.visible ? "eye" : "eyeOff", 12);
    eye.title = "Toggle visibility";
    eye.addEventListener("click", (e) => {
      e.stopPropagation();
      mesh.visible = !mesh.visible;
      eye.innerHTML = iconSVG(mesh.visible ? "eye" : "eyeOff", 12);
      scene.invalidate();
    });

    const label = document.createElement("span");
    label.className = "tree-label";
    if (isGroup) label.classList.add("group");
    label.textContent = mesh.name;

    const del = document.createElement("span");
    del.className = "tree-del";
    del.textContent = "✕";
    del.title = "Delete object";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteMesh(mesh);
    });

    // Visibility eye sits on the LEFT (just after the type icon) so it stays
    // in view without scrolling wide rows horizontally.
    row.append(guide, arrow, typeIco, eye, label, del);
    row.addEventListener("click", () => selection.select(mesh));
    (row as HTMLElement & { __mesh?: Mesh }).__mesh = mesh;

    // Drag to re-organize: any mesh can be dragged; groups/folders receive.
    row.draggable = true;
    row.addEventListener("dragstart", (e) => {
      draggedMesh = mesh;
      row.classList.add("dragging");
      e.dataTransfer!.effectAllowed = "move";
      e.dataTransfer!.setData("text/plain", mesh.name);
    });
    row.addEventListener("dragend", () => {
      draggedMesh = null;
      row.classList.remove("dragging");
    });
    if (mesh.geometry.indices.length === 0) {
      row.addEventListener("dragover", (e) => {
        if (!canDropOn(mesh)) return;
        e.preventDefault();
        e.stopPropagation();
        row.classList.add("drop-target");
      });
      row.addEventListener("dragleave", () => row.classList.remove("drop-target"));
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        row.classList.remove("drop-target");
        if (draggedMesh && canDropOn(mesh)) reparentMesh(draggedMesh, mesh);
      });
    }

    host.appendChild(row);

    if (hasKids && !isCollapsed) {
      const childGuides = guides + (depth > 0 ? (isLast ? "  " : "│ ") : "");
      mesh.children.forEach((c, i) =>
        addRow(c, depth + 1, childGuides, i === mesh.children.length - 1));
    }
  };

  scene.meshes.forEach((m, i) => addRow(m, 0, "", i === scene.meshes.length - 1));
  refreshHierarchyHighlight();
}

// Dropping on the tree background (not a folder) moves the mesh to the root.
$("hierarchy").addEventListener("dragover", (e) => {
  if (draggedMesh) e.preventDefault();
});
$("hierarchy").addEventListener("drop", (e) => {
  e.preventDefault();
  if (draggedMesh && draggedMesh.parent) reparentMesh(draggedMesh, null);
});

$("add-folder").addEventListener("click", () => {
  commitHistory();
  const folder = Mesh.group(`Folder ${++folderCounter}`);
  scene.add(folder);
  buildHierarchyUI();
});

function refreshHierarchyHighlight(): void {
  for (const row of document.querySelectorAll<HTMLElement>("#hierarchy .tree-row")) {
    const mesh = (row as HTMLElement & { __mesh?: Mesh }).__mesh;
    row.classList.toggle("selected", !!mesh && selection.isSelected(mesh));
  }
}

/* ------------------------------- file import ------------------------------ */

async function importModel(file: File, aux?: Map<string, File>): Promise<void> {
  commitHistory();
  const name = file.name.replace(/\.[^.]+$/, "");
  let roots: Mesh[];
  if (/\.obj$/i.test(file.name)) {
    // Resolve the MTL library (and its textures) from co-dropped files.
    let mtlLib: Map<string, Material> | undefined;
    const mtlFile = aux?.get(file.name.toLowerCase().replace(/obj$/, "mtl")) ??
      (aux && [...aux.values()].find((f) => f.name.toLowerCase().endsWith(".mtl")));
    if (mtlFile) {
      mtlLib = await parseMTL(await mtlFile.text(), async (imgName) => {
        const base = imgName.split(/[\\/]/).pop()?.toLowerCase() ?? "";
        const imgFile = aux?.get(base);
        return imgFile ? createImageBitmap(imgFile).catch(() => null) : null;
      });
    }
    roots = loadOBJ(await file.text(), name, mtlLib);
  } else if (/\.fbx$/i.test(file.name)) {
    roots = await loadFBX(await file.arrayBuffer(), name, aux);
  } else {
    roots = await loadGLTF(await file.arrayBuffer(), name);
  }
  normalizeToStage(roots);

  // The first real import retires the demo showcase spheres.
  const showcase = scene.meshes.find((m) => m.name === "showcase");
  if (showcase) scene.remove(showcase);

  // Additive import: place the new model beside what's already on stage.
  const existing = scene.meshes.filter((m) => m !== ground);
  const exBox = worldAABBOf(existing);
  const newBox = worldAABBOf(roots);
  if (exBox && newBox) {
    const newCenter = (newBox.min[0] + newBox.max[0]) / 2;
    const newHalf = (newBox.max[0] - newBox.min[0]) / 2;
    const dx = exBox.max[0] + newHalf + 0.75 - newCenter;
    for (const root of roots) {
      root.transform = mat4Multiply(mat4Translation([dx, 0, 0]), root.transform);
    }
  }

  selection.clear();
  scene.add(...roots); // bumps scene.version
  buildHierarchyUI();
}

/** Center the model, sit it on the floor, scale it to a ~4.5 m stage. */
function normalizeToStage(roots: Mesh[]): void {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const root of roots) {
    for (const mesh of root.getAllMeshes()) {
      if (mesh.geometry.indices.length === 0) continue;
      const g = mesh.worldGeometry();
      for (let i = 0; i < g.positions.length; i += 3) {
        for (let a = 0; a < 3; a++) {
          min[a] = Math.min(min[a], g.positions[i + a]);
          max[a] = Math.max(max[a], g.positions[i + a]);
        }
      }
    }
  }
  if (!Number.isFinite(min[0])) return;
  const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;
  const s = 4.5 / extent;
  const center = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
  const norm = mat4Multiply(
    mat4Scale([s, s, s]),
    mat4Translation([-center[0], -center[1], -center[2]]),
  );
  for (const root of roots) {
    root.transform = mat4Multiply(norm, root.transform);
  }
}

async function importHDR(file: File): Promise<void> {
  commitHistory();
  const env = Environment.fromHDR(await file.arrayBuffer());
  env.intensity = parseFloat($<HTMLInputElement>("env-intensity").value);
  scene.setEnvironment(env);
  envName = file.name.replace(/\.[^.]+$/, "");
  envHiddenIntensity = null;
  buildHierarchyUI();
  if (selectedEnv) syncEnvProps();
}

async function handleFiles(fileList: FileList | File[]): Promise<void> {
  const files = [...fileList];
  // Auxiliary lookup (by lowercase name) lets OBJ/FBX importers resolve
  // .mtl libraries and texture images dropped in the same batch.
  const aux = new Map<string, File>();
  for (const f of files) aux.set(f.name.toLowerCase(), f);

  for (const file of files) {
    const lower = file.name.toLowerCase();
    try {
      if (lower.endsWith(".lacquer")) await loadSceneFromFile(file);
      else if (lower.endsWith(".hdr")) await importHDR(file);
      else if (/\.(glb|gltf|obj|fbx)$/.test(lower)) await importModel(file, aux);
      else if (/\.(mtl|png|jpe?g|webp|tga|bmp)$/.test(lower)) {
        // consumed by the model importers above; nothing to do standalone
      } else {
        alert(`Unsupported file: ${file.name} ` +
          "(use .glb, .gltf, .obj, .fbx, .hdr or .lacquer)");
      }
    } catch (err) {
      console.error(err);
      alert(`Failed to load ${file.name}: ${(err as Error).message}`);
    }
  }
}

window.addEventListener("dragover", (e) => {
  e.preventDefault();
  $("drop-overlay").classList.add("active");
});
window.addEventListener("dragleave", (e) => {
  if (!e.relatedTarget) $("drop-overlay").classList.remove("active");
});
window.addEventListener("drop", (e) => {
  e.preventDefault();
  $("drop-overlay").classList.remove("active");
  if (e.dataTransfer?.files.length) void handleFiles(e.dataTransfer.files);
});
$<HTMLInputElement>("file-input").addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  if (input.files?.length) void handleFiles(input.files);
  input.value = "";
});

// "Open" is scoped to .lacquer scene files; handleFiles routes them to load.
$("open-btn").addEventListener("click", () => $<HTMLInputElement>("open-input").click());
$<HTMLInputElement>("open-input").addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  if (input.files?.length) void handleFiles(input.files);
  input.value = "";
});

/* ------------------------------ render settings --------------------------- */

function bindSlider(id: string, apply: (v: number) => void, reset = true): void {
  const el = $<HTMLInputElement>(id);
  el.addEventListener("input", () => {
    apply(parseFloat(el.value));
    if (reset) engine.resetAccumulation();
  });
}

bindSlider("exposure", (v) => (engine.settings.exposure = v), false);
$<HTMLInputElement>("rt-target").value = String(rtConvergeTarget);
$<HTMLInputElement>("rt-target").addEventListener("input", (e) => {
  rtConvergeTarget = Math.max(32, parseInt((e.target as HTMLInputElement).value, 10) || 256);
  localStorage.setItem("lacquer.rtTarget", String(rtConvergeTarget));
});

const denoiseToggle = $<HTMLInputElement>("denoise-toggle");
denoiseToggle.checked = engine.settings.denoise;
denoiseToggle.addEventListener("change", () => {
  engine.settings.denoise = denoiseToggle.checked;
  engine.resetAccumulation();
});
bindSlider("bounces", (v) => (engine.settings.maxBounces = Math.round(v)));
bindSlider("res-scale", (v) => (engine.settings.resolutionScale = v));
bindSlider("env-intensity", (v) => (scene.environment.intensity = v));
bindSlider("env-rotation", (v) => (scene.environment.rotation = (v * Math.PI) / 180));
bindSlider("aperture", (v) => (scene.camera.aperture = v));
bindSlider("focus", (v) => (scene.camera.focusDistance = v));

/* ----------------------------- material editing --------------------------- */

function syncMaterialUI(): void {
  const m = selection.getPrimary()?.material;
  $("mat-target").textContent = selection.getPrimary()
    ? `${selection.getPrimary()!.name}`
    : "nothing selected — click an object";
  const nameInput = $<HTMLInputElement>("mat-name");
  nameInput.disabled = !m;
  ($("save-to-lib") as HTMLButtonElement).disabled = !m;
  if (document.activeElement !== nameInput) nameInput.value = m?.name ?? "";
  syncMapSlots();
  if (!m) return;
  $<HTMLInputElement>("mat-color").value = rgbToHex(m.baseColor);
  $<HTMLInputElement>("mat-hex").value = rgbToHex(m.baseColor);
  $<HTMLInputElement>("mat-metallic").value = String(m.metallic);
  $<HTMLInputElement>("mat-roughness").value = String(m.roughness);
  $<HTMLInputElement>("mat-clearcoat").value = String(m.clearcoat);
  $<HTMLInputElement>("mat-transmission").value = String(m.transmission);
  $<HTMLInputElement>("mat-ior").value = String(m.ior);
  $<HTMLInputElement>("mat-flakes").value = String(m.flakeIntensity);
  $<HTMLSelectElement>("map-mode").value = m.triplanar ? "triplanar" : "uv";
  updateTilingRange(m.triplanar);
  $<HTMLInputElement>("map-scale").value = String(m.texScale);
  // Emission stored as colour x strength; decompose for the two controls.
  const emitStrength = Math.max(m.emissive[0], m.emissive[1], m.emissive[2]);
  $<HTMLInputElement>("mat-emissive-str").value = String(emitStrength);
  if (emitStrength > 0) {
    $<HTMLInputElement>("mat-emissive").value = rgbToHex([
      m.emissive[0] / emitStrength, m.emissive[1] / emitStrength, m.emissive[2] / emitStrength,
    ]);
  }
  refreshSliderReadouts();
}

function applyEmissive(): void {
  const rgb = hexToRgb($<HTMLInputElement>("mat-emissive").value);
  const strength = parseFloat($<HTMLInputElement>("mat-emissive-str").value);
  onMaterialEdit((m) =>
    (m.emissive = [rgb[0] * strength, rgb[1] * strength, rgb[2] * strength]));
  engine.resetAccumulation();
}
$<HTMLInputElement>("mat-emissive").addEventListener("click", () => commitHistory());
$<HTMLInputElement>("mat-emissive").addEventListener("input", applyEmissive);
$<HTMLInputElement>("mat-emissive-str").addEventListener("input", applyEmissive);

function onMaterialEdit(apply: (m: Material) => void): void {
  const mesh = selection.getPrimary();
  if (!mesh) return;
  apply(mesh.material);
  if (engine.backend.updateMaterials) engine.backend.updateMaterials(scene);
  else scene.invalidate();
}

// Opening the picker (click) marks one undo step for the whole color drag.
$<HTMLInputElement>("mat-color").addEventListener("click", () => commitHistory());
$<HTMLInputElement>("mat-color").addEventListener("input", (e) => {
  const hex = (e.target as HTMLInputElement).value;
  $<HTMLInputElement>("mat-hex").value = hex;
  onMaterialEdit((m) => (m.baseColor = hexToRgb(hex)));
});
$<HTMLInputElement>("mat-hex").addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  const match = /^#?([0-9a-f]{6})$/i.exec(input.value.trim());
  if (!match) {
    input.value = $<HTMLInputElement>("mat-color").value;
    return;
  }
  const hex = `#${match[1].toLowerCase()}`;
  commitHistory();
  input.value = hex;
  $<HTMLInputElement>("mat-color").value = hex;
  onMaterialEdit((m) => (m.baseColor = hexToRgb(hex)));
});
for (const [id, key] of [
  ["mat-metallic", "metallic"],
  ["mat-roughness", "roughness"],
  ["mat-clearcoat", "clearcoat"],
  ["mat-transmission", "transmission"],
  ["mat-ior", "ior"],
  ["mat-flakes", "flakeIntensity"],
] as const) {
  $<HTMLInputElement>(id).addEventListener("input", (e) =>
    onMaterialEdit((m) => ((m as unknown as Record<string, number>)[key] =
      parseFloat((e.target as HTMLInputElement).value))));
}

$("preset-paint").addEventListener("click", () => {
  commitHistory();
  onMaterialEdit((m) => Object.assign(m, Material.carPaint(m.baseColor), { name: m.name }));
});
$("preset-glass").addEventListener("click", () => {
  commitHistory();
  onMaterialEdit((m) => Object.assign(m, Material.glass(), { name: m.name }));
});
$("preset-chrome").addEventListener("click", () => {
  commitHistory();
  onMaterialEdit((m) =>
    Object.assign(m, Material.metal([0.9, 0.91, 0.92], 0.08), { name: m.name }));
});

/* ---------------------------- texture map slots ---------------------------- */

const MAP_SLOTS = ["albedoMap", "normalMap", "roughnessMap", "metallicMap"] as const;
type MapSlot = (typeof MAP_SLOTS)[number];
let pendingMapSlot: MapSlot | null = null;

/** Small dataURL thumbnails, cached per source image. */
const thumbCache = new WeakMap<object, string>();
function thumbFor(img: MaterialImage): string {
  let url = thumbCache.get(img);
  if (!url) {
    const c = document.createElement("canvas");
    c.width = c.height = 44;
    c.getContext("2d")!.drawImage(img as CanvasImageSource, 0, 0, 44, 44);
    url = c.toDataURL();
    thumbCache.set(img, url);
  }
  return url;
}

function syncMapSlots(): void {
  const m = selection.getPrimary()?.material ?? null;
  for (const slot of MAP_SLOTS) {
    const el = $(`slot-${slot}`);
    const img = m ? m[slot] : null;
    el.classList.toggle("has", !!img);
    el.querySelector<HTMLElement>(".thumb")!.style.backgroundImage =
      img ? `url(${thumbFor(img)})` : "";
  }
}

for (const slot of MAP_SLOTS) {
  const el = $(`slot-${slot}`);
  el.querySelector<HTMLElement>(".clear")!.addEventListener("click", (e) => {
    e.stopPropagation();
    const mesh = selection.getPrimary();
    if (!mesh) return;
    commitHistory();
    mesh.material[slot] = null;
    appliedMapsSig.delete(mesh.material); // manual edit invalidates library sig
    scene.invalidate();
    syncMapSlots();
  });
  el.addEventListener("click", () => {
    if (!selection.getPrimary()) {
      alert("Select an object first.");
      return;
    }
    pendingMapSlot = slot;
    $<HTMLInputElement>("map-file").click();
  });
}

$<HTMLInputElement>("map-file").addEventListener("change", async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  const mesh = selection.getPrimary();
  if (!file || !mesh || !pendingMapSlot) return;
  try {
    commitHistory();
    mesh.material[pendingMapSlot] = await createImageBitmap(file);
    appliedMapsSig.delete(mesh.material); // manual edit invalidates library sig
    scene.invalidate();
    syncMapSlots();
  } catch (err) {
    alert(`Could not load image: ${(err as Error).message}`);
  }
});

/** Triplanar tiles per world unit and often needs far higher repeats. */
function updateTilingRange(triplanar: boolean): void {
  $<HTMLInputElement>("map-scale").max = triplanar ? "500" : "8";
}

$<HTMLSelectElement>("map-mode").addEventListener("change", (e) => {
  const triplanar = (e.target as HTMLSelectElement).value === "triplanar";
  updateTilingRange(triplanar);
  onMaterialEdit((m) => (m.triplanar = triplanar));
});
$<HTMLInputElement>("map-scale").addEventListener("input", (e) =>
  onMaterialEdit((m) => (m.texScale = parseFloat((e.target as HTMLInputElement).value))));

/* --------------------------------- decals --------------------------------- */
/*
 * Decals are edited with the SAME gizmo as meshes: "Select decal" attaches
 * the gizmo to the decal's projector box through a tiny GizmoTarget adapter,
 * so W/E/R move, tilt/roll, and resize the projector directly in the
 * viewport. Only opacity (and the image itself) remain as panel controls.
 */

/** Adapts a Decal (position + rotation matrix + size) to the GizmoTarget
 *  interface: its "local transform" is the projector box's world TRS. */
class DecalGizmoTarget {
  readonly parent = null;
  constructor(readonly decal: Decal) {}
  get transform(): Mat4 {
    return mat4Compose(this.decal.position, this.decal.rotation, this.decal.size);
  }
  set transform(m: Mat4) {
    const { position, quaternion, scale: s } = mat4DecomposeTRS(m);
    this.decal.position = position;
    this.decal.rotation = quatToMat4(quaternion);
    this.decal.size = [
      Math.max(0.02, s[0]), Math.max(0.02, s[1]), Math.max(0.02, s[2]),
    ];
  }
  getWorldTransform(): Mat4 {
    return this.transform;
  }
}

let decalEditState: { mesh: Mesh; decal: Decal } | null = null;

/** Throttled scene invalidate: responsive while dragging a decal, with a
 *  trailing call so the final position always lands. */
let decalRebuildTimer: number | null = null;
let lastDecalRebuild = 0;
function scheduleDecalRebuild(): void {
  const now = performance.now();
  if (now - lastDecalRebuild > 150) {
    lastDecalRebuild = now;
    scene.invalidate();
    return;
  }
  if (decalRebuildTimer !== null) return;
  decalRebuildTimer = window.setTimeout(() => {
    decalRebuildTimer = null;
    lastDecalRebuild = performance.now();
    scene.invalidate();
  }, 150);
}

function beginDecalEdit(mesh: Mesh, decal: Decal): void {
  decalEditState = { mesh, decal };
  gizmo.setTarget(new DecalGizmoTarget(decal));
  refreshDecalUI();
  syncTransformUI();
}

function endDecalEdit(): void {
  if (!decalEditState) return;
  decalEditState = null;
  gizmo.setTarget(selection.getPrimary());
  refreshDecalUI();
  syncTransformUI();
}

function refreshDecalUI(): void {
  const mesh = selection.getPrimary();
  const list = $("decal-list");
  list.innerHTML = "";
  const decals = mesh?.decals ?? [];
  decals.forEach((decal, i) => {
    const isEditing = decalEditState?.decal === decal;
    const row = document.createElement("div");
    row.className = `decal-row${isEditing ? " editing" : ""}`;
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = `Decal ${i + 1}`;
    const btn = document.createElement("button");
    btn.textContent = isEditing ? "Editing…" : "Select decal";
    btn.classList.toggle("active", isEditing);
    btn.addEventListener("click", () =>
      isEditing ? endDecalEdit() : beginDecalEdit(mesh!, decal));
    row.append(name, btn);
    list.appendChild(row);
  });
  const tools = $("decal-tools");
  tools.hidden = !decalEditState;
  if (decalEditState) {
    $<HTMLInputElement>("decal-opacity").value = String(decalEditState.decal.opacity);
    syncDecalFinishButtons();
    refreshSliderReadouts();
  }
}

/** Vinyl finish: decal.roughness overrides the paint's roughness where the
 *  decal is opaque — low = glossy sticker, high = matte wrap. */
function setDecalFinish(roughness: number): void {
  if (!decalEditState) return;
  decalEditState.decal.roughness = roughness;
  syncDecalFinishButtons();
  scheduleDecalRebuild();
  engine.resetAccumulation();
}

function syncDecalFinishButtons(): void {
  const r = decalEditState?.decal.roughness ?? 0.35;
  $("decal-glossy").classList.toggle("active", r <= 0.2);
  $("decal-matte").classList.toggle("active", r > 0.2);
}

$("decal-glossy").addEventListener("click", () => setDecalFinish(0.08));
$("decal-matte").addEventListener("click", () => setDecalFinish(0.65));

$<HTMLInputElement>("decal-opacity").addEventListener("input", (e) => {
  if (!decalEditState) return;
  decalEditState.decal.opacity = parseFloat((e.target as HTMLInputElement).value);
  scheduleDecalRebuild();
  engine.resetAccumulation();
});

$("decal-done").addEventListener("click", endDecalEdit);

$("decal-delete").addEventListener("click", () => {
  if (!decalEditState) return;
  commitHistory();
  const { mesh, decal } = decalEditState;
  mesh.decals = mesh.decals.filter((d) => d !== decal);
  endDecalEdit();
  scene.invalidate();
});

$("add-decal").addEventListener("click", () => {
  const mesh = selection.getPrimary();
  if (!mesh || mesh.geometry.indices.length === 0) {
    alert("Select a mesh (not a group) to receive the livery.");
    return;
  }
  commitHistory();
  // Project the livery onto the +X side of the selected mesh's world bounds.
  const g = mesh.worldGeometry();
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < g.positions.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], g.positions[i + a]);
      max[a] = Math.max(max[a], g.positions[i + a]);
    }
  }
  const cy = (min[1] + max[1]) / 2;
  const cz = (min[2] + max[2]) / 2;
  const h = Math.max(0.4, (max[1] - min[1]) * 0.7);
  const count = scene.getAllMeshes().reduce((n, m) => n + m.decals.length, 0);
  const decal = new Decal({
    image: makeLiveryDecal(String(count * 3 + 11)),
    position: [max[0], cy, cz],
    rotation: Decal.rotationFromDir([-1, 0, 0]), // project inward from +X
    size: [h, h, Math.max(0.5, (max[0] - min[0]) * 1.2)],
    angleCutoffDeg: 85,
  });
  mesh.decals.push(decal);
  scene.invalidate();
  beginDecalEdit(mesh, decal); // straight into gizmo placement
});

$("decal-image").addEventListener("click", () => {
  if (!decalEditState) return;
  $<HTMLInputElement>("decal-file").click();
});
$<HTMLInputElement>("decal-file").addEventListener("change", async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !decalEditState) return;
  try {
    decalEditState.decal.image = await createImageBitmap(file);
    scene.invalidate();
  } catch (err) {
    alert(`Could not load image: ${(err as Error).message}`);
  }
});

$("clear-decals").addEventListener("click", () => {
  commitHistory();
  let removed = 0;
  for (const mesh of scene.getAllMeshes()) {
    removed += mesh.decals.length;
    mesh.decals = [];
  }
  endDecalEdit();
  refreshDecalUI();
  if (removed) scene.invalidate();
});

/* --------------------------------- lights ---------------------------------- */

let selectedLight: Light | null = null;
/** When true, the gizmo edits the selected light's TARGET point, not its body. */
let editingLightTarget = false;

/** Whether a visible focus-point handle applies (directional + targeted). */
function lightHasTarget(l: Light): boolean {
  return l.type !== "point" && l.targeted;
}
/** Whether the focus-point toggle is offered at all (any directional light). */
function lightCanTarget(l: Light): boolean {
  return l.type !== "point";
}

/**
 * Light BODY gizmo.
 *  - Focus-point (targeted): moving the body keeps the focus point fixed, so
 *    the light orbits around it and re-aims automatically.
 *  - Free: moving the body carries the aim rigidly; rotating re-aims it.
 * Throw distance (free mode) is captured at selection.
 */
class LightGizmoTarget {
  readonly parent = null;
  private throwDist: number;
  constructor(readonly light: Light) {
    this.throwDist = length(sub(light.target, light.position)) || 3;
  }
  get transform(): Mat4 {
    return mat4Compose(
      this.light.position, Decal.rotationFromDir(normalize(this.light.direction)), [1, 1, 1]);
  }
  set transform(m: Mat4) {
    const { position, quaternion } = mat4DecomposeTRS(m);
    if (this.light.targeted) {
      // Orbit around the fixed focus point; direction re-derives from it.
      this.light.position = position;
    } else {
      // Free aim: translate carries the direction, rotate re-aims it.
      const rot = quatToMat4(quaternion);
      const dir: Vec3 = normalize([-rot[8], -rot[9], -rot[10]]);
      this.light.position = position;
      this.light.target = add(position, v3scale(dir, this.throwDist));
    }
  }
  getWorldTransform(): Mat4 {
    return this.transform;
  }
}

/** Light TARGET gizmo: translate moves the aim point; the body stays put and
 *  the light re-aims (direction is derived from position → target). */
class LightTargetGizmoTarget {
  readonly parent = null;
  constructor(readonly light: Light) {}
  get transform(): Mat4 {
    return mat4Translation(this.light.target);
  }
  set transform(m: Mat4) {
    this.light.target = [m[12], m[13], m[14]];
  }
  getWorldTransform(): Mat4 {
    return this.transform;
  }
}

function pushLightUpdate(): void {
  if (engine.backend.updateLights) engine.backend.updateLights(scene);
  else scene.invalidate();
  engine.resetAccumulation();
}

function selectLight(light: Light | null): void {
  selection.clear(); // also resets decal edit + gizmo target via the hook
  selectedViewCam = null;
  if (light) selectedEnv = false;
  selectedLight = light;
  editingLightTarget = false;
  if (light) gizmo.setTarget(new LightGizmoTarget(light));
  refreshLightUI();
  refreshCameraUI();
  syncTransformUI();
}

/** Switch the gizmo to the selected light's target point (or back to body). */
function selectLightTarget(light: Light): void {
  if (selectedLight !== light) selectLight(light);
  editingLightTarget = true;
  gizmo.setTarget(new LightTargetGizmoTarget(light));
  syncTransformUI();
}

function addLight(type: LightType): void {
  commitHistory();
  const count = scene.lights.filter((l) => l.type === type).length + 1;
  const light = new Light(type, {
    name: `${type === "directional" ? "sun" : type} ${count}`,
    position: [1.6, 2.4, 1.6],
    target: [0, 0.5, 0], // aim at the stage centre by default
  });
  scene.lights.push(light);
  pushLightUpdate();
  selectLight(light);
}

function deleteLight(light: Light): void {
  commitHistory();
  scene.lights = scene.lights.filter((l) => l !== light);
  if (selectedLight === light) selectLight(null);
  pushLightUpdate();
  refreshLightUI();
}

const LIGHT_ICON: Record<LightType, "bulb" | "spot" | "sun" | "rectlight" | "octagon"> = {
  point: "bulb", spot: "spot", directional: "sun", rect: "rectlight", octagon: "octagon",
};

/** Lights render inside the hierarchy tree; rebuild it and the props card. */
function refreshLightUI(): void {
  buildHierarchyUI();
  syncLightProps();
}

function syncLightProps(): void {
  refreshPropertyPanels(); // section visibility centralized here
  if (!selectedLight) return;
  const l = selectedLight;
  $("light-name").textContent = `${l.name} — ${l.type}`;
  $<HTMLInputElement>("light-color").value = rgbToHex(l.color);
  $<HTMLInputElement>("light-hex").value = rgbToHex(l.color);
  $<HTMLInputElement>("light-intensity").value = String(l.intensity);
  $<HTMLInputElement>("light-angle").value = String(l.angleDeg);
  $<HTMLInputElement>("light-softness").value = String(l.softness);
  $<HTMLInputElement>("light-width").value = String(l.width);
  $<HTMLInputElement>("light-height").value = String(l.height);
  $("light-angle-row").style.display = l.type === "spot" ? "" : "none";
  $("light-soft-row").style.display = l.type === "spot" ? "" : "none";
  const isArea = l.type === "rect" || l.type === "octagon";
  $("light-width-row").style.display = isArea ? "" : "none";
  ($("light-width-row").firstElementChild as HTMLElement).textContent =
    l.type === "octagon" ? "Size" : "Width";
  $("light-height-row").style.display = l.type === "rect" ? "" : "none";
  // Focus-point toggle + a mode-appropriate hint (hidden for point lights).
  const canTarget = lightCanTarget(l);
  $("light-targeted-row").style.display = canTarget ? "" : "none";
  $<HTMLInputElement>("light-targeted").checked = l.targeted;
  $("light-aim-hint").textContent = !canTarget
    ? "Point lights shine in every direction."
    : l.targeted
      ? "Moving the light orbits the yellow focus point; drag the focus to re-aim."
      : "Move the light with W; rotate with E to aim it freely.";
  refreshSliderReadouts();
}

$("add-point").addEventListener("click", () => addLight("point"));
$("add-spot").addEventListener("click", () => addLight("spot"));
$("add-sun").addEventListener("click", () => addLight("directional"));
$("add-rect").addEventListener("click", () => addLight("rect"));
$("add-oct").addEventListener("click", () => addLight("octagon"));

$<HTMLInputElement>("light-color").addEventListener("click", () => commitHistory());
$<HTMLInputElement>("light-color").addEventListener("input", (e) => {
  if (!selectedLight) return;
  const hex = (e.target as HTMLInputElement).value;
  $<HTMLInputElement>("light-hex").value = hex;
  selectedLight.color = hexToRgb(hex);
  pushLightUpdate();
  refreshLightUI();
});
$<HTMLInputElement>("light-hex").addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  const match = /^#?([0-9a-f]{6})$/i.exec(input.value.trim());
  if (!match || !selectedLight) {
    input.value = $<HTMLInputElement>("light-color").value;
    return;
  }
  const hex = `#${match[1].toLowerCase()}`;
  commitHistory();
  input.value = hex;
  $<HTMLInputElement>("light-color").value = hex;
  selectedLight.color = hexToRgb(hex);
  pushLightUpdate();
  refreshLightUI();
});
$<HTMLInputElement>("light-intensity").addEventListener("input", (e) => {
  if (!selectedLight) return;
  selectedLight.intensity = parseFloat((e.target as HTMLInputElement).value);
  pushLightUpdate();
});
$<HTMLInputElement>("light-angle").addEventListener("input", (e) => {
  if (!selectedLight) return;
  selectedLight.angleDeg = parseFloat((e.target as HTMLInputElement).value);
  pushLightUpdate();
});
$<HTMLInputElement>("light-softness").addEventListener("input", (e) => {
  if (!selectedLight) return;
  selectedLight.softness = parseFloat((e.target as HTMLInputElement).value);
  pushLightUpdate();
});
$<HTMLInputElement>("light-width").addEventListener("input", (e) => {
  if (!selectedLight) return;
  selectedLight.width = parseFloat((e.target as HTMLInputElement).value);
  pushLightUpdate();
});
$<HTMLInputElement>("light-height").addEventListener("input", (e) => {
  if (!selectedLight) return;
  selectedLight.height = parseFloat((e.target as HTMLInputElement).value);
  pushLightUpdate();
});
$<HTMLInputElement>("light-targeted").addEventListener("change", (e) => {
  if (!selectedLight) return;
  commitHistory();
  selectedLight.targeted = (e.target as HTMLInputElement).checked;
  // Leaving focus mode drops any target-point edit; refresh the gizmo so the
  // new interaction model (and a fresh throw distance) takes effect.
  editingLightTarget = false;
  gizmo.setTarget(new LightGizmoTarget(selectedLight));
  syncLightProps();
  syncTransformUI();
});

/* -------------------------------- cameras ---------------------------------- */

interface ViewCam {
  name: string;
  position: Vec3;
  target: Vec3;
  fovYDeg: number;
  aperture: number;
  focusDistance: number;
}
const viewCams: ViewCam[] = [];
let selectedViewCam: ViewCam | null = null;
let camCounter = 0;

/** Translate moves the body (aim point follows); rotate re-aims. */
class CamGizmoTarget {
  readonly parent = null;
  constructor(readonly cam: ViewCam) {}
  get transform(): Mat4 {
    const dir = normalize(sub(this.cam.target, this.cam.position));
    return mat4Compose(this.cam.position, Decal.rotationFromDir(dir), [1, 1, 1]);
  }
  set transform(m: Mat4) {
    const { position, quaternion } = mat4DecomposeTRS(m);
    const dist = length(sub(this.cam.target, this.cam.position));
    const rot = quatToMat4(quaternion);
    const dir: Vec3 = normalize([-rot[8], -rot[9], -rot[10]]);
    this.cam.position = position;
    this.cam.target = add(position, v3scale(dir, dist));
  }
  getWorldTransform(): Mat4 {
    return this.transform;
  }
}

function selectViewCam(cam: ViewCam | null): void {
  selection.clear();
  selectedLight = null;
  editingLightTarget = false;
  if (cam) selectedEnv = false;
  selectedViewCam = cam;
  if (cam) gizmo.setTarget(new CamGizmoTarget(cam));
  refreshLightUI();
  refreshCameraUI();
  syncTransformUI();
}

function deleteViewCam(cam: ViewCam): void {
  commitHistory();
  if (activeViewCam === cam) clearActiveView();
  const idx = viewCams.indexOf(cam);
  if (idx !== -1) viewCams.splice(idx, 1);
  if (selectedViewCam === cam) selectViewCam(null);
  refreshCameraUI();
}

/** The bookmark currently being "looked through" — drives the viewport
 *  outline and links the FOV slider to the live camera. */
let activeViewCam: ViewCam | null = null;

function lookThrough(cam: ViewCam): void {
  scene.camera.fovYDeg = cam.fovYDeg;
  scene.camera.aperture = cam.aperture;
  animateCameraTo(cam.target, cam.position, cam.focusDistance);
  engine.resetAccumulation();
  activeViewCam = cam;
  const frame = $("cam-view-frame");
  frame.hidden = false;
  $("cam-view-badge").textContent = `● ${cam.name}`;
}

function clearActiveView(): void {
  if (!activeViewCam) return;
  activeViewCam = null;
  $("cam-view-frame").hidden = true;
}
$("cam-view-exit").addEventListener("click", () => clearActiveView());

/** While looking through a camera, write the live viewpoint back into it, so
 *  moving the view actually moves (possesses) the camera. */
function possessActiveCam(): void {
  const c = activeViewCam;
  if (!c) return;
  const cam = scene.camera;
  c.position = [...cam.position];
  c.target = [...cam.target];
  c.fovYDeg = cam.fovYDeg;
  c.aperture = cam.aperture;
  c.focusDistance = cam.focusDistance;
  if (selectedViewCam === c) syncCameraProps();
}

function refreshCameraUI(): void {
  const host = $("camera-list");
  host.innerHTML = "";
  if (viewCams.length === 0) {
    const empty = document.createElement("div");
    empty.className = "hint-text";
    empty.style.padding = "2px 8px 4px";
    empty.textContent = "No cameras yet — use the toolbar above.";
    host.appendChild(empty);
  }
  for (const cam of viewCams) {
    const row = document.createElement("div");
    row.className = `tree-row${selectedViewCam === cam ? " selected" : ""}`;

    const glyph = document.createElement("span");
    glyph.className = "tree-ico";
    glyph.innerHTML = iconSVG("camera", 12);

    const name = document.createElement("span");
    name.className = "tree-label";
    name.textContent = cam.name;

    const view = document.createElement("button");
    view.className = "row-btn";
    view.textContent = "View";
    view.title = "Look through this camera";
    view.addEventListener("click", (e) => {
      e.stopPropagation();
      lookThrough(cam);
    });

    const del = document.createElement("span");
    del.className = "tree-del";
    del.textContent = "✕";
    del.title = "Delete camera";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteViewCam(cam);
    });

    row.append(glyph, name, view, del);
    row.addEventListener("click", () => selectViewCam(cam));
    host.appendChild(row);
  }
  syncCameraProps();
}

function syncCameraProps(): void {
  refreshPropertyPanels(); // section visibility centralized here
  if (!selectedViewCam) return;
  $("camera-name").textContent = selectedViewCam.name;
  $<HTMLInputElement>("camera-fov").value = String(selectedViewCam.fovYDeg);
  refreshSliderReadouts();
}

$("add-camera").addEventListener("click", () => {
  commitHistory();
  const cam = scene.camera;
  camCounter++;
  const vc: ViewCam = {
    name: `Camera ${camCounter}`,
    position: [...cam.position],
    target: [...cam.target],
    fovYDeg: cam.fovYDeg,
    aperture: cam.aperture,
    focusDistance: cam.focusDistance,
  };
  viewCams.push(vc);
  selectViewCam(vc);
});

$<HTMLInputElement>("camera-fov").addEventListener("input", (e) => {
  if (!selectedViewCam) return;
  const fov = parseFloat((e.target as HTMLInputElement).value);
  selectedViewCam.fovYDeg = fov;
  // When looking through this camera, update the live view in real time.
  if (activeViewCam === selectedViewCam) {
    scene.camera.fovYDeg = fov;
    engine.resetAccumulation();
  }
});
$("camera-look").addEventListener("click", () => {
  if (selectedViewCam) lookThrough(selectedViewCam);
});
$("camera-update").addEventListener("click", () => {
  if (!selectedViewCam) return;
  commitHistory();
  const cam = scene.camera;
  selectedViewCam.position = [...cam.position];
  selectedViewCam.target = [...cam.target];
  selectedViewCam.fovYDeg = cam.fovYDeg;
  selectedViewCam.aperture = cam.aperture;
  selectedViewCam.focusDistance = cam.focusDistance;
});

/* ------------------------------ undo / redo -------------------------------- */
/*
 * Snapshot-based history. Geometry and images are shared by REFERENCE (they
 * never mutate — only structure, transforms and parameters do), so snapshots
 * are cheap even for heavy scenes. commitHistory() is called BEFORE each
 * discrete action; continuous edits (gizmo drags, slider drags) commit once
 * at interaction start.
 */

interface MatSnap {
  name: string;
  baseColor: [number, number, number];
  metallic: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  transmission: number;
  ior: number;
  emissive: [number, number, number];
  flakeIntensity: number;
  flakeScale: number;
  texScale: number;
  triplanar: boolean;
  albedoMap: MaterialImage | null;
  normalMap: MaterialImage | null;
  roughnessMap: MaterialImage | null;
  metallicMap: MaterialImage | null;
}

interface DecalSnap {
  decal: Decal;
  position: Vec3;
  rotation: Mat4;
  size: Vec3;
  opacity: number;
  roughness: number;
  image: Decal["image"];
}

interface MeshSnap {
  mesh: Mesh;
  transform: Mat4;
  visible: boolean;
  material: Material;
  decals: DecalSnap[];
  children: MeshSnap[];
}

interface LightSnap {
  light: Light;
  name: string;
  color: [number, number, number];
  intensity: number;
  position: Vec3;
  target: Vec3;
  angleDeg: number;
  softness: number;
  width: number;
  height: number;
  targeted: boolean;
  visible: boolean;
}

interface HistorySnap {
  roots: MeshSnap[];
  materials: [Material, MatSnap][];
  lights: LightSnap[];
  env: Environment;
  envIntensity: number;
  envRotation: number;
  envNameSnap: string;
  envHidden: number | null;
  cams: { cam: ViewCam; data: Omit<ViewCam, "position" | "target"> &
    { position: Vec3; target: Vec3 } }[];
}

const undoStack: HistorySnap[] = [];
const redoStack: HistorySnap[] = [];
const HISTORY_MAX = 40;

function snapMaterial(m: Material): MatSnap {
  return {
    name: m.name, baseColor: [...m.baseColor], metallic: m.metallic,
    roughness: m.roughness, clearcoat: m.clearcoat,
    clearcoatRoughness: m.clearcoatRoughness, transmission: m.transmission,
    ior: m.ior, emissive: [...m.emissive], flakeIntensity: m.flakeIntensity,
    flakeScale: m.flakeScale, texScale: m.texScale, triplanar: m.triplanar,
    albedoMap: m.albedoMap, normalMap: m.normalMap,
    roughnessMap: m.roughnessMap, metallicMap: m.metallicMap,
  };
}

function snapMesh(mesh: Mesh, mats: Map<Material, MatSnap>): MeshSnap {
  if (!mats.has(mesh.material)) mats.set(mesh.material, snapMaterial(mesh.material));
  return {
    mesh,
    transform: new Float32Array(mesh.transform),
    visible: mesh.visible,
    material: mesh.material,
    decals: mesh.decals.map((d) => ({
      decal: d, position: [...d.position], rotation: new Float32Array(d.rotation),
      size: [...d.size], opacity: d.opacity, roughness: d.roughness, image: d.image,
    })),
    children: mesh.children.map((c) => snapMesh(c, mats)),
  };
}

function captureSnap(): HistorySnap {
  const mats = new Map<Material, MatSnap>();
  return {
    roots: scene.meshes.map((m) => snapMesh(m, mats)),
    materials: [...mats.entries()],
    lights: scene.lights.map((l) => ({
      light: l, name: l.name, color: [...l.color], intensity: l.intensity,
      position: [...l.position], target: [...l.target],
      angleDeg: l.angleDeg, softness: l.softness,
      width: l.width, height: l.height, targeted: l.targeted, visible: l.visible,
    })),
    env: scene.environment,
    envIntensity: scene.environment.intensity,
    envRotation: scene.environment.rotation,
    envNameSnap: envName,
    envHidden: envHiddenIntensity,
    cams: viewCams.map((c) => ({
      cam: c,
      data: { name: c.name, position: [...c.position], target: [...c.target],
        fovYDeg: c.fovYDeg, aperture: c.aperture, focusDistance: c.focusDistance },
    })),
  };
}

function applySnap(s: HistorySnap): void {
  const rebuild = (ns: MeshSnap, parent: Mesh | null): Mesh => {
    const m = ns.mesh;
    m.transform = new Float32Array(ns.transform);
    m.visible = ns.visible;
    m.material = ns.material;
    m.decals = ns.decals.map((ds) => {
      const d = ds.decal;
      d.position = [...ds.position];
      d.rotation = new Float32Array(ds.rotation);
      d.size = [...ds.size];
      d.opacity = ds.opacity;
      d.roughness = ds.roughness;
      d.image = ds.image;
      return d;
    });
    m.parent = parent;
    m.children = ns.children.map((c) => rebuild(c, m));
    return m;
  };
  scene.meshes = s.roots.map((r) => rebuild(r, null));
  for (const [mat, snap] of s.materials) {
    Object.assign(mat, snap, {
      baseColor: [...snap.baseColor], emissive: [...snap.emissive],
    });
  }
  scene.lights = s.lights.map((ls) => {
    const l = ls.light;
    l.name = ls.name;
    l.color = [...ls.color];
    l.intensity = ls.intensity;
    l.position = [...ls.position];
    l.target = [...ls.target];
    l.angleDeg = ls.angleDeg;
    l.softness = ls.softness;
    l.width = ls.width;
    l.height = ls.height;
    l.targeted = ls.targeted;
    l.visible = ls.visible;
    return l;
  });
  if (scene.environment !== s.env) scene.setEnvironment(s.env);
  s.env.intensity = s.envIntensity;
  s.env.rotation = s.envRotation;
  envName = s.envNameSnap;
  envHiddenIntensity = s.envHidden;
  viewCams.length = 0;
  for (const cs of s.cams) {
    Object.assign(cs.cam, cs.data, {
      position: [...cs.data.position], target: [...cs.data.target],
    });
    viewCams.push(cs.cam);
  }

  selection.clear();
  selectedLight = null;
  selectedViewCam = null;
  scene.invalidate();
  pushLightUpdate(); // fast lights sync + accumulation reset
  buildHierarchyUI();
  syncMaterialUI();
  refreshDecalUI();
  syncTransformUI();
  refreshCameraUI();
  refreshSliderReadouts();
}

function commitHistory(): void {
  undoStack.push(captureSnap());
  if (undoStack.length > HISTORY_MAX) undoStack.shift();
  redoStack.length = 0;
  updateHistoryButtons();
}

function undo(): void {
  const snap = undoStack.pop();
  if (!snap) return;
  redoStack.push(captureSnap());
  applySnap(snap);
  updateHistoryButtons();
}

function redo(): void {
  const snap = redoStack.pop();
  if (!snap) return;
  undoStack.push(captureSnap());
  applySnap(snap);
  updateHistoryButtons();
}

function updateHistoryButtons(): void {
  ($("undo-btn") as HTMLButtonElement).disabled = undoStack.length === 0;
  ($("redo-btn") as HTMLButtonElement).disabled = redoStack.length === 0;
}

$("undo-btn").addEventListener("click", undo);
$("redo-btn").addEventListener("click", redo);

/* ------------------------------- save / load ------------------------------- */

async function saveScene(): Promise<void> {
  const cam = scene.camera;
  const blob = await saveSceneFile({
    meshes: scene.meshes,
    lights: scene.lights,
    environment: scene.environment,
    envName,
    camera: {
      name: "view", position: [...cam.position], target: [...cam.target],
      fovYDeg: cam.fovYDeg, aperture: cam.aperture, focusDistance: cam.focusDistance,
    },
    viewCams: viewCams.map((c) => ({
      name: c.name, position: [...c.position], target: [...c.target],
      fovYDeg: c.fovYDeg, aperture: c.aperture, focusDistance: c.focusDistance,
    })),
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "scene.lacquer";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
$("save-scene-btn").addEventListener("click", () => void saveScene());

async function loadSceneFromFile(file: File): Promise<void> {
  commitHistory(); // undo returns to the pre-load scene
  const data = await loadSceneFile(await file.arrayBuffer());
  selection.clear();
  selectedLight = null;
  selectedViewCam = null;
  scene.meshes = data.meshes;
  scene.lights = data.lights;
  scene.setEnvironment(data.environment);
  envName = data.envName;
  envHiddenIntensity = null;
  const cam = scene.camera;
  cam.position = [...data.camera.position];
  cam.target = [...data.camera.target];
  cam.fovYDeg = data.camera.fovYDeg;
  cam.aperture = data.camera.aperture;
  cam.focusDistance = data.camera.focusDistance;
  viewCams.length = 0;
  for (const c of data.viewCams) {
    viewCams.push({
      name: c.name, position: [...c.position], target: [...c.target],
      fovYDeg: c.fovYDeg, aperture: c.aperture, focusDistance: c.focusDistance,
    });
  }
  camCounter = viewCams.length;
  scene.invalidate();
  pushLightUpdate();
  buildHierarchyUI();
  syncMaterialUI();
  refreshDecalUI();
  syncTransformUI();
  refreshCameraUI();
  refreshSliderReadouts();
}

/* ------------------------------ image export ------------------------------- */
/*
 * Renders the scene on a second, hidden engine at an arbitrary resolution
 * and downloads the canvas as a PNG. Path tracing accumulates the requested
 * sample count; raster exports after the frame settles.
 */

const exportModal = $("export-modal");
const exportBackdrop = $("export-backdrop");

const exportRT = $<HTMLInputElement>("export-rt");

function syncExportControls(): void {
  $("export-samples-row").style.display = exportRT.checked ? "" : "none";
  $("export-frames-row").style.display =
    $<HTMLInputElement>("export-turntable").checked ? "" : "none";
}
$<HTMLInputElement>("export-turntable").addEventListener("change", syncExportControls);

function setExportOpen(open: boolean): void {
  exportModal.classList.toggle("open", open);
  exportBackdrop.classList.toggle("open", open);
  if (open) {
    // Default to the viewport's mode, but exporting can path trace even
    // while the viewport runs rasterized (and vice versa).
    if (engine.raytracingAvailable) {
      exportRT.disabled = false;
      exportRT.checked = engine.raytracingEnabled;
    } else {
      exportRT.checked = false;
      exportRT.disabled = true;
    }
    syncExportControls();
    $("export-status").textContent = "";
  }
}
exportRT.addEventListener("change", syncExportControls);
$("export-btn").addEventListener("click", () => setExportOpen(true));
$("export-close").addEventListener("click", () => setExportOpen(false));
exportBackdrop.addEventListener("click", () => setExportOpen(false));

let exporting = false;
async function runExport(deliver: "download" | "clipboard"): Promise<void> {
  if (exporting) return;
  const status = $("export-status");
  const w = Math.round(parseFloat($<HTMLInputElement>("export-w").value));
  const h = Math.round(parseFloat($<HTMLInputElement>("export-h").value));
  if (!(w >= 16 && w <= 8192 && h >= 16 && h <= 8192)) {
    status.textContent = "Enter a size between 16 and 8192 px.";
    return;
  }
  const wantRT = exportRT.checked;
  const samples = Math.round(parseFloat($<HTMLInputElement>("export-samples").value));
  const turntable = $<HTMLInputElement>("export-turntable").checked;
  const frameCount = turntable
    ? Math.min(120, Math.max(8, Math.round(parseFloat($<HTMLInputElement>("export-frames").value))))
    : 1;
  exporting = true;
  const runBtn = $("export-run") as HTMLButtonElement;
  const copyBtn = $("export-copy") as HTMLButtonElement;
  runBtn.disabled = true;
  copyBtn.disabled = true;

  // Free the GPU (and avoid the viewport fighting the exporter) while rendering.
  engine.stop();
  const cam = scene.camera;
  const savedCam = {
    position: [...cam.position] as Vec3, target: [...cam.target] as Vec3,
    fovYDeg: cam.fovYDeg, aperture: cam.aperture, focusDistance: cam.focusDistance,
  };

  // Match the viewport's framing. The renderer uses a fixed vertical FOV, so an
  // export wider than the viewport would otherwise reveal extra content on the
  // sides ("too wide"). Keep the same horizontal field of view instead, so the
  // export is a true crop of what you see rather than a wider shot.
  const vpAspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  const exAspect = w / h;
  if (exAspect > vpAspect) {
    const tanX = Math.tan((savedCam.fovYDeg * Math.PI) / 360) * vpAspect;
    cam.fovYDeg = (2 * Math.atan(tanX / exAspect) * 180) / Math.PI;
  }

  // Turntable orbit basis (elevation + radius preserved, yaw swept 360°).
  const off = sub(cam.position, cam.target);
  const radius = length(off);
  const pitch = Math.asin(Math.max(-1, Math.min(1, off[1] / (radius || 1))));
  const yaw0 = Math.atan2(off[0], off[2]);

  // Hidden host: visibility:hidden keeps layout so clientWidth = target size.
  const holder = document.createElement("div");
  holder.style.cssText = `position:fixed;left:-100000px;top:0;width:${w}px;` +
    `height:${h}px;visibility:hidden;pointer-events:none;`;
  const exCanvas = document.createElement("canvas");
  exCanvas.style.cssText = "width:100%;height:100%;display:block";
  holder.appendChild(exCanvas);
  document.body.appendChild(holder);

  let exp: Engine | null = null;
  try {
    status.textContent = wantRT ? "Preparing path tracer…" : "Preparing renderer…";
    exp = await Engine.create({
      canvas: exCanvas,
      maxPixelRatio: 1,
      backend: wantRT ? "webgpu" : "webgl2",
    });
    Object.assign(exp.settings, engine.settings, { resolutionScale: 1 });
    status.textContent = "Building scene…";
    await exp.setScene(scene);
    exp.start();

    const isPT = exp.backend.kind === "webgpu-pathtracer";
    const target = isPT ? Math.max(1, samples) : 2; // raster: settle a couple frames

    /** Renders the CURRENT camera to a PNG blob at the configured sample count. */
    const renderCurrentFrame = (label: string): Promise<Blob> =>
      new Promise((resolve, reject) => {
        let done = false;
        let ticks = 0;
        exp!.onFrame = (stats) => {
          if (done) return;
          ticks++;
          const progress = isPT ? stats.samples : ticks;
          status.textContent = isPT ? `${label}${progress} / ${target} spp` : label;
          if (progress >= target) {
            done = true;
            // Capture synchronously before compositing clears the buffer.
            exCanvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))),
              "image/png");
          }
        };
      });

    const orbitTo = (i: number): void => {
      const yaw = yaw0 + (i / frameCount) * Math.PI * 2;
      cam.position = [
        cam.target[0] + radius * Math.cos(pitch) * Math.sin(yaw),
        cam.target[1] + radius * Math.sin(pitch),
        cam.target[2] + radius * Math.cos(pitch) * Math.cos(yaw),
      ];
    };

    if (!turntable) {
      const blob = await renderCurrentFrame(isPT ? "Path tracing… " : "Rendering…");
      if (deliver === "clipboard") {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        status.textContent = "Done — image copied to the clipboard.";
      } else {
        downloadBlob(blob, `lacquer-${w}x${h}.png`);
        status.textContent = "Done — PNG downloaded.";
      }
    } else {
      const files: { name: string; data: Uint8Array }[] = [];
      for (let i = 0; i < frameCount; i++) {
        orbitTo(i);
        const blob = await renderCurrentFrame(`Frame ${i + 1}/${frameCount} · `);
        files.push({
          name: `frame_${String(i).padStart(3, "0")}.png`,
          data: new Uint8Array(await blob.arrayBuffer()),
        });
      }
      status.textContent = "Packaging ZIP…";
      downloadBlob(makeZip(files), `lacquer-turntable-${frameCount}f.zip`);
      status.textContent = `Done — ${frameCount}-frame turntable downloaded.`;
    }
  } catch (err) {
    console.error(err);
    status.textContent = `Export failed: ${(err as Error).message}`;
  } finally {
    exp?.dispose();
    holder.remove();
    // Restore the viewport camera and resume live rendering.
    cam.position = savedCam.position;
    cam.target = savedCam.target;
    cam.fovYDeg = savedCam.fovYDeg;
    cam.aperture = savedCam.aperture;
    cam.focusDistance = savedCam.focusDistance;
    engine.resetAccumulation();
    engine.start();
    runBtn.disabled = false;
    copyBtn.disabled = false;
    exporting = false;
  }
}
function downloadBlob(blob: Blob, name: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
$("export-run").addEventListener("click", () => void runExport("download"));
$("export-copy").addEventListener("click", () => void runExport("clipboard"));

/* ------------------------------ settings modal ----------------------------- */

const settingsModal = $("settings-modal");
const settingsBackdrop = $("settings-backdrop");

function setSettingsOpen(open: boolean): void {
  settingsModal.classList.toggle("open", open);
  settingsBackdrop.classList.toggle("open", open);
}
$("open-settings").addEventListener("click", () => setSettingsOpen(true));
$("settings-close").addEventListener("click", () => setSettingsOpen(false));
settingsBackdrop.addEventListener("click", () => setSettingsOpen(false));

/* render-stats chip (backend · spp · triangles), toggleable from Settings */
const statsChip = $("stats-chip");
const statsToggle = $<HTMLInputElement>("stats-toggle");
statsToggle.checked = localStorage.getItem("lacquer.showStats") === "1";
statsChip.hidden = !statsToggle.checked;
statsToggle.addEventListener("change", () => {
  statsChip.hidden = !statsToggle.checked;
  localStorage.setItem("lacquer.showStats", statsToggle.checked ? "1" : "0");
});

/* ---------------------------- material manager ----------------------------- */

/** Decode a library entry's dataURL maps back into live ImageBitmaps.
 *  Skips the (expensive) scene rebuild when the maps haven't changed —
 *  live-preview slider drags re-apply the same maps on every input event. */
const appliedMapsSig = new WeakMap<Material, string>();
async function applySavedMaps(material: Material, maps: SavedMaps): Promise<void> {
  const sig = [maps.albedo, maps.normal, maps.roughness, maps.metallic]
    .map((u) => (u ? `${u.length}:${u.slice(-48)}` : "-")).join("|");
  const hadMaps = !!(material.albedoMap || material.normalMap ||
    material.roughnessMap || material.metallicMap);
  if (appliedMapsSig.get(material) === sig || (!hadMaps && sig === "-|-|-|-")) {
    appliedMapsSig.set(material, sig);
    return;
  }
  appliedMapsSig.set(material, sig);
  const decode = async (url: string | null | undefined): Promise<ImageBitmap | null> =>
    url ? createImageBitmap(await (await fetch(url)).blob()) : null;
  const [albedo, normal, roughness, metallic] = await Promise.all([
    decode(maps.albedo), decode(maps.normal), decode(maps.roughness), decode(maps.metallic),
  ]);
  material.albedoMap = albedo;
  material.normalMap = normal;
  material.roughnessMap = roughness;
  material.metallicMap = metallic;
  scene.invalidate(); // texture layers live in scene GPU data on both backends
  syncMapSlots();
}

const materialHost: MaterialManagerHost = {
  getSelectedName: () => selection.getPrimary()?.name ?? null,
  getSelectedMaterial: () => selection.getPrimary()?.material ?? null,
  applyToSelection: (props: SavedProps): boolean => {
    const mesh = selection.getPrimary();
    if (!mesh) return false;
    commitHistory();
    const { maps, ...scalars } = props;
    Object.assign(mesh.material, structuredClone(scalars));
    // Older library entries predate these fields; normalize them.
    mesh.material.texScale = scalars.texScale ?? 1;
    mesh.material.triplanar = scalars.triplanar ?? false;
    if (engine.backend.updateMaterials) engine.backend.updateMaterials(scene);
    else scene.invalidate();
    engine.resetAccumulation();
    syncMaterialUI();
    void applySavedMaps(mesh.material, maps ?? {});
    return true;
  },
  onSelectionChange: (cb) => {
    selectionListeners.add(cb);
    return () => selectionListeners.delete(cb);
  },
};

$("open-materials").addEventListener("click", () => openMaterialManager(materialHost));
$("open-materials-2").addEventListener("click", () => openMaterialManager(materialHost));

// Rename the selected object's material (imported materials keep their name).
$<HTMLInputElement>("mat-name").addEventListener("focus", () => commitHistory());
$<HTMLInputElement>("mat-name").addEventListener("change", (e) => {
  const mesh = selection.getPrimary();
  if (!mesh) return;
  const name = (e.target as HTMLInputElement).value.trim();
  if (name) mesh.material.name = name;
  $("mat-target").textContent = mesh.name;
});

// Save the selected object's full material (scalars + texture maps) to the
// shared library, so it can be reused and shows up in the manager popup.
$("save-to-lib").addEventListener("click", () => {
  const mesh = selection.getPrimary();
  if (!mesh) return;
  const btn = $("save-to-lib") as HTMLButtonElement;
  const result = addMaterialToLibrary(mesh.material);
  btn.textContent = result === "ok"
    ? "✓ Saved to library"
    : "Storage full — couldn't save";
  setTimeout(() => (btn.innerHTML = "＋ Save material to library"), 1800);
});

/* ------------------------------- import button ----------------------------- */

$("import-btn").addEventListener("click", () => $<HTMLInputElement>("file-input").click());

/* ----------------------------- panel resizing ------------------------------ */
/*
 * Dragging a resizer changes the side panel's width; the viewport frame is
 * the flex-1 middle child, so it reflows and the engine's ResizeObserver
 * picks up the canvas size change automatically.
 */

function initPanelResize(handleId: string, panelId: string, side: "left" | "right"): void {
  const handle = $(handleId);
  const panel = $(panelId);
  const KEY = `lacquer.panel.${side}`;
  const clampW = (w: number): number => Math.min(460, Math.max(side === "left" ? 170 : 200, w));

  const saved = parseInt(localStorage.getItem(KEY) ?? "", 10);
  if (Number.isFinite(saved)) panel.style.width = `${clampW(saved)}px`;

  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    handle.classList.add("active");
    const startX = e.clientX;
    const startW = panel.getBoundingClientRect().width;
    const move = (ev: PointerEvent): void => {
      const dw = side === "left" ? ev.clientX - startX : startX - ev.clientX;
      panel.style.width = `${clampW(startW + dw)}px`;
    };
    const up = (): void => {
      handle.classList.remove("active");
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      localStorage.setItem(KEY, String(Math.round(panel.getBoundingClientRect().width)));
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  });
}
initPanelResize("resize-left", "left-panel", "left");
initPanelResize("resize-right", "right-panel", "right");

/* ----------------------------- slider readouts ----------------------------- */
/*
 * Every `.ctl` range slider gets an EDITABLE numeric field: it mirrors the
 * slider live, and typing a value drives the slider (clamped to its range)
 * and fires the slider's own input listeners. Programmatic slider writes
 * don't fire events, so sync functions call refreshSliderReadouts().
 */

const sliderReadoutUpdaters: (() => void)[] = [];
for (const slider of document.querySelectorAll<HTMLInputElement>(
  "label.ctl input[type=range]",
)) {
  const val = document.createElement("input");
  val.type = "number";
  val.className = "val";
  val.step = slider.step || "any";
  slider.insertAdjacentElement("afterend", val);
  const update = (): void => {
    if (document.activeElement === val) return; // don't stomp typing
    const step = parseFloat(slider.step || "1");
    const v = parseFloat(slider.value);
    val.value = step >= 1 ? String(Math.round(v)) : step >= 0.1 ? v.toFixed(1) : v.toFixed(2);
  };
  update();
  slider.addEventListener("input", update);
  slider.addEventListener("pointerdown", () => commitHistory()); // one step per drag
  val.addEventListener("focus", () => commitHistory());
  val.addEventListener("change", () => {
    const typed = parseFloat(val.value);
    if (!Number.isFinite(typed)) {
      update();
      return;
    }
    const clamped = Math.min(parseFloat(slider.max), Math.max(parseFloat(slider.min), typed));
    slider.value = String(clamped);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    val.value = String(clamped);
  });
  sliderReadoutUpdaters.push(update);
}

function refreshSliderReadouts(): void {
  for (const update of sliderReadoutUpdaters) update();
}

/* --------------------------------- helpers -------------------------------- */

function rgbToHex(c: [number, number, number]): string {
  // linear -> sRGB for the color picker
  const to = (v: number) =>
    Math.round(Math.min(1, Math.max(0, Math.pow(v, 1 / 2.2))) * 255)
      .toString(16).padStart(2, "0");
  return `#${to(c[0])}${to(c[1])}${to(c[2])}`;
}
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const from = (v: number) => Math.pow(v / 255, 2.2);
  return [from((n >> 16) & 255), from((n >> 8) & 255), from(n & 255)];
}

setGizmoMode("translate");
buildHierarchyUI();
syncMaterialUI();
refreshDecalUI();
syncTransformUI();
refreshLightUI();
refreshCameraUI();
