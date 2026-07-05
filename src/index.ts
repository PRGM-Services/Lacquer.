/**
 * Lacquer — open-source, physically based, path-traced automotive
 * visualization engine for the web.
 *
 * Public API surface. Everything is dependency-free TypeScript; the engine
 * auto-selects the WebGPU path tracer where available and falls back to a
 * WebGL2 PBR rasterizer everywhere else (iPads, phones, older laptops).
 */
export { Engine, type EngineOptions } from "./core/Engine";
export { Scene } from "./core/Scene";
export { Mesh, type Geometry } from "./core/Mesh";
export { Material, type MaterialProps, type MaterialImage } from "./core/Material";
export { Light, type LightType } from "./core/Light";
export { Decal } from "./core/Decal";
export { Camera } from "./core/Camera";
export { Environment } from "./core/Environment";
export { Selection } from "./core/Selection";
export { Gizmo, type GizmoMode, type GizmoAxis, type GizmoGeometry, type GizmoRay, type GizmoTarget } from "./core/Gizmo";
export {
  type RendererBackend,
  type RenderSettings,
  type FrameStats,
  type ViewMode,
  defaultRenderSettings,
} from "./core/RendererBackend";
export { loadGLTF } from "./loaders/GLTFLoader";
export { loadOBJ, parseMTL } from "./loaders/OBJLoader";
export { loadFBX } from "./loaders/FBXLoader";
export { sphereGeometry, planeGeometry, boxGeometry } from "./geometry/primitives";
export * as vec from "./math/vec";
