import { FrameStats, RendererBackend, RenderSettings, defaultRenderSettings } from "./RendererBackend";
import { Scene } from "./Scene";

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  /** Force a backend instead of auto-detecting. */
  backend?: "webgpu" | "webgl2" | "auto";
  /** Cap the device pixel ratio (mobile GPUs appreciate 1.5). */
  maxPixelRatio?: number;
}

interface BackendEntry {
  backend: RendererBackend;
  canvas: HTMLCanvasElement;
}

/**
 * Engine facade: picks the best backend the device supports (WebGPU compute
 * path tracing where available; WebGL2 rasterized PBR everywhere else),
 * owns the render loop and forwards scene changes.
 *
 * Ray tracing can be toggled at runtime with setRaytracing(). A canvas can
 * only ever hold one context type, so the alternate backend lives on a
 * sibling canvas (same class/layout) and the engine swaps their visibility.
 */
export class Engine {
  readonly canvas: HTMLCanvasElement;
  readonly settings: RenderSettings = defaultRenderSettings();
  backend!: RendererBackend;
  scene: Scene | null = null;
  onFrame: ((stats: FrameStats) => void) | null = null;

  private entries: BackendEntry[] = [];
  private running = false;
  private sceneVersion = -1;
  private maxPixelRatio: number;
  private rebuildQueued = false;
  private swapping = false;

  private constructor(canvas: HTMLCanvasElement, maxPixelRatio: number) {
    this.canvas = canvas;
    this.maxPixelRatio = maxPixelRatio;
  }

  static async create(options: EngineOptions): Promise<Engine> {
    const engine = new Engine(options.canvas, options.maxPixelRatio ?? 2);
    const want = options.backend ?? "auto";

    let backend: RendererBackend | null = null;
    if (want === "webgpu" || want === "auto") {
      try {
        if (navigator.gpu) {
          const { WebGPUPathTracer } = await import("../backends/webgpu/WebGPUPathTracer");
          backend = await WebGPUPathTracer.create(options.canvas);
        } else if (want === "webgpu") {
          throw new Error("WebGPU not available in this browser");
        }
      } catch (err) {
        if (want === "webgpu") throw err;
        console.warn("[lacquer] WebGPU unavailable, falling back to WebGL2:", err);
      }
    }
    if (!backend) {
      const { WebGL2Raster } = await import("../backends/webgl2/WebGL2Raster");
      backend = new WebGL2Raster(options.canvas);
    }
    engine.backend = backend;
    engine.entries.push({ backend, canvas: options.canvas });
    engine.watchResize();
    return engine;
  }

  /* --------------------------- backend switching -------------------------- */

  /** Whether this device can path trace at all. */
  get raytracingAvailable(): boolean {
    return typeof navigator !== "undefined" && !!navigator.gpu;
  }

  get raytracingEnabled(): boolean {
    return this.backend.kind === "webgpu-pathtracer";
  }

  /**
   * Toggle between the path tracer (on) and realtime rasterization with
   * image-based global illumination (off). Returns false if the requested
   * backend cannot be created on this device.
   */
  async setRaytracing(on: boolean): Promise<boolean> {
    const targetKind = on ? "webgpu-pathtracer" : "webgl2-raster";
    if (this.backend.kind === targetKind || this.swapping) {
      return this.backend.kind === targetKind;
    }
    this.swapping = true;
    try {
      let entry = this.entries.find((e) => e.backend.kind === targetKind);
      if (!entry) {
        const alt = document.createElement("canvas");
        alt.className = this.canvas.className;
        if (!alt.className) alt.style.cssText = this.canvas.style.cssText;
        this.canvas.insertAdjacentElement("afterend", alt);
        try {
          let backend: RendererBackend;
          if (on) {
            const { WebGPUPathTracer } = await import("../backends/webgpu/WebGPUPathTracer");
            backend = await WebGPUPathTracer.create(alt);
          } else {
            const { WebGL2Raster } = await import("../backends/webgl2/WebGL2Raster");
            backend = new WebGL2Raster(alt);
          }
          entry = { backend, canvas: alt };
          this.entries.push(entry);
        } catch (err) {
          alt.remove();
          console.warn("[lacquer] backend switch failed:", err);
          return false;
        }
      }
      if (this.scene) {
        await entry.backend.setScene(this.scene);
        this.sceneVersion = this.scene.version;
      }
      this.backend = entry.backend;
      for (const e of this.entries) {
        e.canvas.style.visibility = e === entry ? "visible" : "hidden";
      }
      this.applySize(entry);
      this.backend.resetAccumulation();
      return true;
    } finally {
      this.swapping = false;
    }
  }

  /* ------------------------------ scene/loop ------------------------------ */

  async setScene(scene: Scene): Promise<void> {
    this.scene = scene;
    await this.backend.setScene(scene);
    this.sceneVersion = scene.version;
  }

  /** Restart progressive accumulation (e.g. after camera movement). */
  resetAccumulation(): void {
    this.backend.resetAccumulation();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      if (this.scene && !this.swapping) {
        if (this.scene.version !== this.sceneVersion && !this.rebuildQueued) {
          // Scene structure changed: rebuild GPU data asynchronously, keep
          // rendering the old scene meanwhile.
          this.rebuildQueued = true;
          const target = this.scene.version;
          Promise.resolve(this.backend.setScene(this.scene)).then(() => {
            this.sceneVersion = target;
            this.rebuildQueued = false;
            this.backend.resetAccumulation();
          });
        }
        const stats = this.backend.render(this.settings);
        this.onFrame?.(stats);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
  }

  dispose(): void {
    this.stop();
    for (const e of this.entries) {
      e.backend.dispose();
      if (e.canvas !== this.canvas) e.canvas.remove();
    }
    this.entries = [];
  }

  /* -------------------------------- sizing -------------------------------- */

  private applySize(entry: BackendEntry): void {
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio);
    // The primary canvas drives layout; siblings share its class and rect.
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (entry.canvas.width !== w || entry.canvas.height !== h) {
      entry.canvas.width = w;
      entry.canvas.height = h;
      entry.backend.resize(w, h);
    }
  }

  private watchResize(): void {
    const apply = () => {
      const active = this.entries.find((e) => e.backend === this.backend);
      if (active) this.applySize(active);
    };
    apply();
    new ResizeObserver(apply).observe(this.canvas);
  }
}
