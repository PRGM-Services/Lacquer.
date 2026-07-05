import { buildSceneBVH } from "../../accel/BVH";
import { Material } from "../../core/Material";
import { FrameStats, RendererBackend, RenderSettings } from "../../core/RendererBackend";
import { Scene } from "../../core/Scene";
import pathtracerWGSL from "./pathtracer.wgsl?raw";
import tonemapWGSL from "./tonemap.wgsl?raw";

const DECAL_TEX_SIZE = 1024;
const DECAL_VEC4S = 6;
const MAT_TEX_SIZE = 1024;
/** Layer sentinel for "no map" (packs into one byte per map slot). */
const MAP_NONE = 0xff;
const MAX_LIGHTS = 8;
const LIGHT_VEC4S = 4;
const LIGHT_TYPE_ID = { point: 0, spot: 1, directional: 2, rect: 3, octagon: 4 } as const;

/**
 * WebGPU progressive path tracer — the engine's reference backend.
 * Every frame dispatches one sample per pixel into an accumulation buffer;
 * a second pass resolves it (average, exposure, ACES) to the canvas.
 */
export class WebGPUPathTracer implements RendererBackend {
  readonly kind = "webgpu-pathtracer" as const;

  private device: GPUDevice;
  private context: GPUCanvasContext;
  private format: GPUTextureFormat;

  private computePipeline!: GPUComputePipeline;
  private tonemapPipeline!: GPURenderPipeline;
  private bufferLayout!: GPUBindGroupLayout;
  private textureLayout!: GPUBindGroupLayout;
  private tonemapLayout!: GPUBindGroupLayout;

  private uniformBuffer!: GPUBuffer;
  private accumBuffer: GPUBuffer | null = null;
  private sceneBuffers: GPUBuffer[] = [];
  private sceneTextures: GPUTexture[] = [];
  private computeBindGroup: GPUBindGroup | null = null;
  private textureBindGroup: GPUBindGroup | null = null;
  private tonemapBindGroup: GPUBindGroup | null = null;

  private scene: Scene | null = null;
  private materialList: Material[] = [];
  private materialBuffer: GPUBuffer | null = null;
  private lightsBuffer: GPUBuffer | null = null;
  /** Packed map-layer u32 per material (layers assigned at setScene). */
  private materialPacks = new Map<Material, number>();
  private triangleCount = 0;
  private frameIndex = 0;
  private renderW = 0;
  private renderH = 0;
  private canvasW = 0;
  private canvasH = 0;
  private invalidationHash = "";

  private constructor(canvas: HTMLCanvasElement, device: GPUDevice, format: GPUTextureFormat) {
    this.device = device;
    this.format = format;
    const ctx = canvas.getContext("webgpu");
    if (!ctx) throw new Error("Could not create WebGPU canvas context");
    this.context = ctx;
    this.context.configure({ device, format, alphaMode: "opaque" });
    this.canvasW = canvas.width;
    this.canvasH = canvas.height;
    this.createPipelines();
  }

  static async create(canvas: HTMLCanvasElement): Promise<WebGPUPathTracer> {
    if (!navigator.gpu) throw new Error("WebGPU not supported");
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("No WebGPU adapter available");
    // Lift storage buffer limits so multi-million-triangle cars fit.
    const device = await adapter.requestDevice({
      requiredLimits: {
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        maxBufferSize: adapter.limits.maxBufferSize,
      },
    });
    return new WebGPUPathTracer(canvas, device, navigator.gpu.getPreferredCanvasFormat());
  }

  private createPipelines(): void {
    const d = this.device;
    this.bufferLayout = d.createBindGroupLayout({
      label: "pt-buffers",
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        ...[2, 3, 4, 5, 6, 7, 8].map((binding) => ({
          binding,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "read-only-storage" as const },
        })),
      ],
    });
    this.textureLayout = d.createBindGroupLayout({
      label: "pt-textures",
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "float" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, sampler: {} },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          texture: { sampleType: "float", viewDimension: "2d-array" },
        },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, sampler: {} },
        {
          binding: 4,
          visibility: GPUShaderStage.COMPUTE,
          texture: { sampleType: "float", viewDimension: "2d-array" },
        },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, sampler: {} },
      ],
    });
    this.tonemapLayout = d.createBindGroupLayout({
      label: "tonemap",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
      ],
    });

    const ptModule = d.createShaderModule({ label: "pathtracer", code: pathtracerWGSL });
    this.computePipeline = d.createComputePipeline({
      label: "pathtracer",
      layout: d.createPipelineLayout({ bindGroupLayouts: [this.bufferLayout, this.textureLayout] }),
      compute: { module: ptModule, entryPoint: "main" },
    });

    const tmModule = d.createShaderModule({ label: "tonemap", code: tonemapWGSL });
    this.tonemapPipeline = d.createRenderPipeline({
      label: "tonemap",
      layout: d.createPipelineLayout({ bindGroupLayouts: [this.tonemapLayout] }),
      vertex: { module: tmModule, entryPoint: "vsMain" },
      fragment: { module: tmModule, entryPoint: "fsMain", targets: [{ format: this.format }] },
      primitive: { topology: "triangle-list" },
    });

    this.uniformBuffer = d.createBuffer({
      label: "uniforms",
      size: 9 * 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  /* ------------------------------ Scene upload --------------------------- */

  async setScene(scene: Scene): Promise<void> {
    this.scene = scene;
    const d = this.device;

    for (const b of this.sceneBuffers) b.destroy();
    for (const t of this.sceneTextures) t.destroy();
    this.sceneBuffers = [];
    this.sceneTextures = [];

    const bvh = buildSceneBVH(scene);
    this.triangleCount = bvh.triangleCount;

    const makeStorage = (data: Float32Array | Uint32Array, label: string): GPUBuffer => {
      const size = Math.max(16, Math.ceil(data.byteLength / 16) * 16);
      const buf = d.createBuffer({
        label,
        size,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      if (data.byteLength) d.queue.writeBuffer(buf, 0, data.buffer, data.byteOffset, data.byteLength);
      this.sceneBuffers.push(buf);
      return buf;
    };

    const triBuffer = makeStorage(bvh.triangles, "triangles");
    const bvhBuffer = makeStorage(bvh.nodes, "bvh");

    // --- materials (shared instances deduplicated) + mesh infos + decals ---
    const materialList: Material[] = [];
    const materialIndex = new Map<object, number>();
    const decalData: number[] = [];
    const decalImages: { image: CanvasImageSource; layer: number }[] = [];
    // Same flattened enumeration as buildSceneBVH so triangle meshIndex,
    // material index and decal ranges all agree.
    const allMeshes = scene.getAllMeshes();
    const meshInfoData = new Uint32Array(Math.max(1, allMeshes.length) * 4);

    // Material map images -> layers in one shared texture array. Packed
    // per-material layer indices ride in the material buffer (slot 14).
    const mapLayerOf = new Map<object, number>();
    const mapImages: CanvasImageSource[] = [];
    const layerFor = (img: object | null): number => {
      if (!img) return MAP_NONE;
      let layer = mapLayerOf.get(img);
      if (layer === undefined) {
        if (mapImages.length >= MAP_NONE) return MAP_NONE; // 255-layer cap
        layer = mapImages.length;
        mapLayerOf.set(img, layer);
        mapImages.push(img as CanvasImageSource);
      }
      return layer;
    };
    this.materialPacks = new Map();

    allMeshes.forEach((mesh, i) => {
      let mi = materialIndex.get(mesh.material);
      if (mi === undefined) {
        mi = materialList.length;
        materialList.push(mesh.material);
        materialIndex.set(mesh.material, mi);
        const m = mesh.material;
        this.materialPacks.set(m,
          (layerFor(m.albedoMap) |
            (layerFor(m.normalMap) << 8) |
            (layerFor(m.roughnessMap) << 16) |
            (layerFor(m.metallicMap) << 24)) >>> 0);
      }
      const decalOffset = decalData.length / (DECAL_VEC4S * 4);
      for (const decal of mesh.decals) {
        const layer = decalImages.length;
        decalImages.push({ image: decal.image as CanvasImageSource, layer });
        const m = decal.worldToDecal();
        decalData.push(...m); // 16 floats, column-major = mat4x4f(c0..c3)
        const cutoffCos = Math.cos((decal.angleCutoffDeg * Math.PI) / 180);
        decalData.push(layer, decal.opacity, cutoffCos, decal.roughness);
        const pd = decal.projectionDir();
        decalData.push(pd[0], pd[1], pd[2], 0);
      }
      meshInfoData[i * 4] = mi;
      meshInfoData[i * 4 + 1] = decalOffset;
      meshInfoData[i * 4 + 2] = mesh.decals.length;
    });

    this.materialList = materialList;
    const materialData = serializeMaterials(materialList, this.materialPacks);

    const meshInfoBuffer = makeStorage(meshInfoData, "mesh-infos");
    const materialBuffer = makeStorage(materialData, "materials");
    this.materialBuffer = materialBuffer;
    const decalBuffer = makeStorage(
      new Float32Array(decalData.length ? decalData : new Array(DECAL_VEC4S * 4).fill(0)),
      "decals",
    );

    // --- punctual lights (fixed-size buffer; count rides in the uniforms) ---
    const lightsBuffer = d.createBuffer({
      label: "lights",
      size: MAX_LIGHTS * LIGHT_VEC4S * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.sceneBuffers.push(lightsBuffer);
    this.lightsBuffer = lightsBuffer;
    d.queue.writeBuffer(lightsBuffer, 0, serializeLights(scene));

    // --- environment ---
    const env = scene.environment;
    const cdf = new Float32Array(env.marginalCDF.length + env.conditionalCDF.length);
    cdf.set(env.marginalCDF, 0);
    cdf.set(env.conditionalCDF, env.marginalCDF.length);
    const cdfBuffer = makeStorage(cdf, "env-cdf");

    const envTexture = d.createTexture({
      label: "environment",
      size: [env.width, env.height],
      format: "rgba16float",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.sceneTextures.push(envTexture);
    const half = new Uint16Array(env.width * env.height * 4);
    for (let i = 0; i < env.width * env.height; i++) {
      half[i * 4] = f32ToF16(env.data[i * 3]);
      half[i * 4 + 1] = f32ToF16(env.data[i * 3 + 1]);
      half[i * 4 + 2] = f32ToF16(env.data[i * 3 + 2]);
      half[i * 4 + 3] = 0x3c00; // 1.0
    }
    d.queue.writeTexture(
      { texture: envTexture },
      half,
      { bytesPerRow: env.width * 8, rowsPerImage: env.height },
      [env.width, env.height],
    );

    // --- decal texture array (sRGB so sampling yields linear) ---
    const layerCount = Math.max(1, decalImages.length);
    const decalTexture = d.createTexture({
      label: "decals",
      size: [DECAL_TEX_SIZE, DECAL_TEX_SIZE, layerCount],
      format: "rgba8unorm-srgb",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.sceneTextures.push(decalTexture);
    for (const { image, layer } of decalImages) {
      const bitmap = await normalizeDecalImage(image);
      d.queue.copyExternalImageToTexture(
        { source: bitmap },
        { texture: decalTexture, origin: [0, 0, layer] },
        [DECAL_TEX_SIZE, DECAL_TEX_SIZE],
      );
    }

    const linearSampler = d.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "repeat",
      addressModeV: "clamp-to-edge",
    });
    const decalSampler = d.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });

    // --- material map texture array (linear storage; albedo is decoded from
    //     sRGB in the shader so one array serves every map type) ---
    const matLayerCount = Math.max(1, mapImages.length);
    const matTexture = d.createTexture({
      label: "material-maps",
      size: [MAT_TEX_SIZE, MAT_TEX_SIZE, matLayerCount],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.sceneTextures.push(matTexture);
    for (let layer = 0; layer < mapImages.length; layer++) {
      const bitmap = await normalizeImage(mapImages[layer], MAT_TEX_SIZE);
      d.queue.copyExternalImageToTexture(
        { source: bitmap },
        { texture: matTexture, origin: [0, 0, layer] },
        [MAT_TEX_SIZE, MAT_TEX_SIZE],
      );
    }
    const matSampler = d.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "repeat",
      addressModeV: "repeat",
    });

    this.textureBindGroup = d.createBindGroup({
      layout: this.textureLayout,
      entries: [
        { binding: 0, resource: envTexture.createView() },
        { binding: 1, resource: linearSampler },
        { binding: 2, resource: decalTexture.createView({ dimension: "2d-array" }) },
        { binding: 3, resource: decalSampler },
        { binding: 4, resource: matTexture.createView({ dimension: "2d-array" }) },
        { binding: 5, resource: matSampler },
      ],
    });

    // Depends on accum buffer size; (re)built lazily in render().
    this.sceneBuffersForBindGroup = {
      triBuffer, bvhBuffer, meshInfoBuffer, materialBuffer, decalBuffer, cdfBuffer,
      lightsBuffer,
    };
    this.computeBindGroup = null;
    this.frameIndex = 0;
  }

  private sceneBuffersForBindGroup: {
    triBuffer: GPUBuffer;
    bvhBuffer: GPUBuffer;
    meshInfoBuffer: GPUBuffer;
    materialBuffer: GPUBuffer;
    decalBuffer: GPUBuffer;
    cdfBuffer: GPUBuffer;
    lightsBuffer: GPUBuffer;
  } | null = null;

  /* --------------------------------- Frame ------------------------------- */

  render(settings: RenderSettings): FrameStats {
    const scene = this.scene;
    if (!scene || !this.sceneBuffersForBindGroup) {
      return { samples: 0, triangles: 0, backend: this.kind };
    }
    const d = this.device;

    const scaleClamped = Math.min(1, Math.max(0.25, settings.resolutionScale));
    const rw = Math.max(8, Math.floor(this.canvasW * scaleClamped));
    const rh = Math.max(8, Math.floor(this.canvasH * scaleClamped));
    if (rw !== this.renderW || rh !== this.renderH || !this.accumBuffer) {
      this.renderW = rw;
      this.renderH = rh;
      this.accumBuffer?.destroy();
      // 2 vec4 per pixel: radiance+count, then the denoiser normal+depth guide.
      this.accumBuffer = d.createBuffer({
        label: "accumulation",
        size: rw * rh * 32,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      this.computeBindGroup = null;
      this.tonemapBindGroup = null;
      this.frameIndex = 0;
    }

    // Anything that changes the image restarts accumulation automatically.
    const cam = scene.camera;
    const hash = [
      ...cam.position, ...cam.target, cam.fovYDeg, cam.aperture, cam.focusDistance,
      settings.maxBounces, settings.fireflyClamp,
      scene.environment.intensity, scene.environment.rotation,
    ].join(",");
    if (hash !== this.invalidationHash) {
      this.invalidationHash = hash;
      this.frameIndex = 0;
    }

    if (!this.computeBindGroup) {
      const b = this.sceneBuffersForBindGroup;
      this.computeBindGroup = d.createBindGroup({
        layout: this.bufferLayout,
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: { buffer: this.accumBuffer! } },
          { binding: 2, resource: { buffer: b.triBuffer } },
          { binding: 3, resource: { buffer: b.bvhBuffer } },
          { binding: 4, resource: { buffer: b.meshInfoBuffer } },
          { binding: 5, resource: { buffer: b.materialBuffer } },
          { binding: 6, resource: { buffer: b.decalBuffer } },
          { binding: 7, resource: { buffer: b.cdfBuffer } },
          { binding: 8, resource: { buffer: b.lightsBuffer } },
        ],
      });
      this.tonemapBindGroup = d.createBindGroup({
        layout: this.tonemapLayout,
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: { buffer: this.accumBuffer! } },
        ],
      });
    }

    // --- uniforms ---
    const { forward, right, up } = cam.basis();
    const env = scene.environment;
    const uf = new Float32Array(9 * 4);
    const ui = new Uint32Array(uf.buffer);
    const tanHalf = Math.tan((cam.fovYDeg * Math.PI) / 360);
    uf.set([...cam.position, tanHalf], 0);
    uf.set([...forward, this.renderW / this.renderH], 4);
    uf.set([...right, cam.aperture], 8);
    uf.set([...up, cam.focusDistance], 12);
    ui.set([this.renderW, this.renderH, this.frameIndex, this.frameIndex + 1], 16);
    ui.set([settings.maxBounces, this.triangleCount, env.width, env.height], 20);
    uf.set([env.rotation, env.intensity, Math.max(env.totalWeight, 1e-8), settings.fireflyClamp], 24);
    uf.set([settings.exposure, 0, 0, 0], 28);
    ui[29] = Math.min(scene.lights.filter((l) => l.visible).length, MAX_LIGHTS);
    ui[30] = settings.envBackground === false ? 0 : 1;
    uf[31] = settings.denoise === false ? 0 : 1;
    // Tell the resolve pass whether to run the upscaler (render < display res).
    uf[32] = (this.renderW < this.canvasW || this.renderH < this.canvasH) ? 1 : 0;
    d.queue.writeBuffer(this.uniformBuffer, 0, uf);

    const encoder = d.createCommandEncoder();
    const compute = encoder.beginComputePass();
    compute.setPipeline(this.computePipeline);
    compute.setBindGroup(0, this.computeBindGroup);
    compute.setBindGroup(1, this.textureBindGroup!);
    compute.dispatchWorkgroups(Math.ceil(this.renderW / 8), Math.ceil(this.renderH / 8));
    compute.end();

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });
    pass.setPipeline(this.tonemapPipeline);
    pass.setBindGroup(0, this.tonemapBindGroup!);
    pass.draw(3);
    pass.end();
    d.queue.submit([encoder.finish()]);

    this.frameIndex++;
    return { samples: this.frameIndex, triangles: this.triangleCount, backend: this.kind };
  }

  resetAccumulation(): void {
    this.frameIndex = 0;
  }

  /** Fast path for light edits: rewrite the lights buffer only (count is
   *  read from the scene every frame via the uniforms). */
  updateLights(scene: Scene): void {
    if (!this.lightsBuffer) return;
    this.device.queue.writeBuffer(this.lightsBuffer, 0, serializeLights(scene));
    this.frameIndex = 0;
  }

  /** Fast path for paint tweaking: rewrite the material buffer only.
   *  (Map image changes need a full setScene — layers are assigned there.) */
  updateMaterials(_scene: Scene): void {
    if (!this.materialBuffer || !this.materialList.length) return;
    this.device.queue.writeBuffer(
      this.materialBuffer, 0, serializeMaterials(this.materialList, this.materialPacks));
    this.frameIndex = 0;
  }

  resize(width: number, height: number): void {
    this.canvasW = width;
    this.canvasH = height;
    // accum buffer is lazily recreated in render() from canvas size * scale
  }

  dispose(): void {
    for (const b of this.sceneBuffers) b.destroy();
    for (const t of this.sceneTextures) t.destroy();
    this.accumBuffer?.destroy();
    this.uniformBuffer.destroy();
    this.device.destroy();
  }
}

/* --------------------------------- helpers ------------------------------- */

async function normalizeImage(
  image: CanvasImageSource, size: number,
): Promise<ImageBitmap | OffscreenCanvas> {
  const w = (image as HTMLImageElement).naturalWidth ?? (image as HTMLCanvasElement).width;
  const h = (image as HTMLImageElement).naturalHeight ?? (image as HTMLCanvasElement).height;
  if (w === size && h === size && image instanceof ImageBitmap) return image;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(image, 0, 0, size, size);
  return canvas;
}

const normalizeDecalImage = (image: CanvasImageSource): Promise<ImageBitmap | OffscreenCanvas> =>
  normalizeImage(image, DECAL_TEX_SIZE);

/** [pos, type] [color*intensity, cosOuter] [dir, cosInner] per light. */
function serializeLights(scene: Scene): Float32Array<ArrayBuffer> {
  const data = new Float32Array(MAX_LIGHTS * LIGHT_VEC4S * 4);
  const visible = scene.lights.filter((l) => l.visible).slice(0, MAX_LIGHTS);
  visible.forEach((light, i) => {
    const { outer, inner } = light.coneCosines();
    const d = normalize3(light.direction);
    // Fold emitter area into the radiance so a larger area light is brighter
    // (the path tracer samples the shape, which also softens its shadows).
    const e = light.intensity * light.emitterArea();
    data.set([
      ...light.position, LIGHT_TYPE_ID[light.type],
      light.color[0] * e,
      light.color[1] * e,
      light.color[2] * e, outer,
      ...d, inner,
      light.width, light.height, 0, 0,
    ], i * LIGHT_VEC4S * 4);
  });
  return data;
}

function normalize3(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function serializeMaterials(
  list: Material[], packs: Map<Material, number>,
): Float32Array<ArrayBuffer> {
  const data = new Float32Array(Math.max(1, list.length) * 16);
  const dataU32 = new Uint32Array(data.buffer);
  list.forEach((m, i) => {
    // Slot 15: signed tiling factor — negative selects triplanar projection.
    const texScale = Math.max(0.01, m.texScale || 1) * (m.triplanar ? -1 : 1);
    data.set(
      [
        ...m.baseColor, m.metallic,
        ...m.emissive, m.roughness,
        m.clearcoat, m.clearcoatRoughness, m.transmission, m.ior,
        m.flakeIntensity, m.flakeScale, 0, texScale,
      ],
      i * 16,
    );
    // Slot 14 carries the packed map layers as a raw u32 (shader bitcasts).
    dataU32[i * 16 + 14] = packs.get(m) ?? 0xffffffff;
  });
  return data;
}

function f32ToF16(value: number): number {
  f32Scratch[0] = value;
  const x = u32Scratch[0];
  const sign = (x >> 16) & 0x8000;
  let exp = ((x >> 23) & 0xff) - 127 + 15;
  let mant = x & 0x7fffff;
  if (exp <= 0) return sign; // flush denormals/underflow to zero
  if (exp >= 31) return sign | 0x7bff; // clamp to max half (avoid inf)
  return sign | (exp << 10) | (mant >> 13);
}
const f32Scratch = new Float32Array(1);
const u32Scratch = new Uint32Array(f32Scratch.buffer);
