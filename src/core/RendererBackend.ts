import { Scene } from "./Scene";

/** Per-frame stats surfaced to the host app. */
export interface FrameStats {
  /** Accumulated progressive samples per pixel (1 for raster backends). */
  samples: number;
  triangles: number;
  backend: "webgpu-pathtracer" | "webgl2-raster";
}

/**
 * Viewport shading modes (raster backend). "standard" is full PBR; the rest
 * are inspection views. The path tracer always renders standard and the host
 * app is expected to switch to the raster backend for debug views.
 */
export type ViewMode =
  | "standard"
  | "wireframe"
  | "ao"
  | "shadow"
  | "lighting"
  | "reflection";

export interface RenderSettings {
  /** Path tracer: max bounces. Raster backend may ignore. */
  maxBounces: number;
  /** Radiance clamp to suppress fireflies (0 = off). */
  fireflyClamp: number;
  /** Output exposure in stops. */
  exposure: number;
  /** Render scale relative to canvas backing size (0.25..1). */
  resolutionScale: number;
  /** Viewport shading mode (raster backend only). */
  viewMode: ViewMode;
  /** Show the environment as a visible backdrop. When false the HDRI still
   *  LIGHTS the scene (and shows in reflections) but the background renders
   *  as a neutral studio dark. */
  envBackground: boolean;
  /** Edge-aware denoiser for the path tracer (fades out as samples grow).
   *  Ignored by the raster backend, which is already noise-free. */
  denoise: boolean;
}

export const defaultRenderSettings = (): RenderSettings => ({
  maxBounces: 6,
  fireflyClamp: 12,
  exposure: 0,
  resolutionScale: 1,
  viewMode: "standard",
  envBackground: true,
  denoise: true,
});

/**
 * Contract shared by the WebGPU path tracer and the WebGL2 raster fallback.
 * The engine picks whichever backend the device supports; apps only talk to
 * this interface, which is what makes the engine run everywhere from servers
 * with discrete GPUs down to iPads and phones.
 */
export interface RendererBackend {
  readonly kind: FrameStats["backend"];
  /** Build GPU resources for the scene. Must be called before render(). */
  setScene(scene: Scene): Promise<void> | void;
  /** Draw one frame (path tracer: one more progressive sample). */
  render(settings: RenderSettings): FrameStats;
  /** Restart progressive accumulation (camera moved, material edited...). */
  resetAccumulation(): void;
  /** React to canvas size changes. */
  resize(width: number, height: number): void;
  dispose(): void;
  /**
   * Optional fast path: material parameters changed but geometry/decals did
   * not. Backends without it fall back to a full setScene() rebuild.
   */
  updateMaterials?(scene: Scene): void;
  /**
   * Optional fast path: punctual lights changed (moved/added/edited).
   * Backends without it fall back to a full setScene() rebuild.
   */
  updateLights?(scene: Scene): void;
}
