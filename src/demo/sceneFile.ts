import { Decal } from "../core/Decal";
import { Environment } from "../core/Environment";
import { Light, LightType } from "../core/Light";
import { Material, MaterialImage } from "../core/Material";
import { Mesh } from "../core/Mesh";
import { Mat4, Vec3 } from "../math/vec";

/**
 * .lacquer scene file — a GLB-style container:
 *
 *   [ "LACQ" ][ u32 version ][ u32 jsonLength ][ JSON (padded to 4) ][ BIN ]
 *
 * The JSON manifest describes the scene graph, materials, lights, cameras
 * and environment; geometry buffers, PNG-encoded texture/decal images and
 * the raw environment radiance ride in the BIN section, referenced by
 * offset/length relative to the BIN start.
 */

const MAGIC = 0x5143414c; // "LACQ" little-endian
const VERSION = 1;

interface BufRef { o: number; l: number }

interface DecalJSON {
  position: number[];
  rotation: number[];
  size: number[];
  opacity: number;
  angleCutoffDeg: number;
  roughness: number;
  image: number;
}

interface MeshJSON {
  name: string;
  transform: number[];
  visible: boolean;
  material: number;
  geometry: { positions: BufRef; normals: BufRef; uvs: BufRef; indices: BufRef } | null;
  decals: DecalJSON[];
  children: MeshJSON[];
}

interface MaterialJSON {
  name: string;
  baseColor: number[];
  metallic: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  transmission: number;
  ior: number;
  emissive: number[];
  flakeIntensity: number;
  flakeScale: number;
  texScale: number;
  triplanar: boolean;
  albedoMap: number;
  normalMap: number;
  roughnessMap: number;
  metallicMap: number;
}

interface LightJSON {
  type: LightType;
  name: string;
  color: number[];
  intensity: number;
  position: number[];
  /** Legacy direction (pre-target files); target derived from it on load. */
  direction: number[];
  target?: number[];
  angleDeg: number;
  softness: number;
  width?: number;
  height?: number;
  targeted?: boolean;
  visible: boolean;
}

export interface CameraJSON {
  name: string;
  position: Vec3;
  target: Vec3;
  fovYDeg: number;
  aperture: number;
  focusDistance: number;
}

interface Manifest {
  version: number;
  camera: CameraJSON;
  viewCams: CameraJSON[];
  lights: LightJSON[];
  env: { width: number; height: number; data: BufRef; intensity: number;
    rotation: number; name: string };
  materials: MaterialJSON[];
  images: BufRef[];
  meshes: MeshJSON[];
}

export interface SceneFileData {
  meshes: Mesh[];
  lights: Light[];
  environment: Environment;
  envName: string;
  camera: CameraJSON;
  viewCams: CameraJSON[];
}

/* ---------------------------------- save ---------------------------------- */

async function encodeImage(img: MaterialImage): Promise<Uint8Array> {
  const w = (img as HTMLImageElement).naturalWidth ?? (img as { width: number }).width;
  const h = (img as HTMLImageElement).naturalHeight ?? (img as { height: number }).height;
  const canvas = new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
  canvas.getContext("2d")!.drawImage(img as CanvasImageSource, 0, 0);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Uint8Array(await blob.arrayBuffer());
}

export async function saveSceneFile(data: SceneFileData): Promise<Blob> {
  const chunks: Uint8Array[] = [];
  let binSize = 0;
  const addBytes = (bytes: Uint8Array): BufRef => {
    const ref = { o: binSize, l: bytes.byteLength };
    chunks.push(bytes);
    binSize += bytes.byteLength;
    const pad = (4 - (binSize % 4)) % 4;
    if (pad) {
      chunks.push(new Uint8Array(pad));
      binSize += pad;
    }
    return ref;
  };
  const addArray = (ta: Float32Array | Uint32Array): BufRef =>
    addBytes(new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength));

  // images (deduplicated by source object)
  const imageIndex = new Map<MaterialImage, number>();
  const imageRefs: BufRef[] = [];
  const imageId = async (img: MaterialImage | null): Promise<number> => {
    if (!img) return -1;
    let id = imageIndex.get(img);
    if (id === undefined) {
      id = imageRefs.length;
      imageIndex.set(img, id);
      imageRefs.push(addBytes(await encodeImage(img)));
    }
    return id;
  };

  // materials (deduplicated by instance)
  const materialIndex = new Map<Material, number>();
  const materialJSON: MaterialJSON[] = [];
  const materialId = async (m: Material): Promise<number> => {
    let id = materialIndex.get(m);
    if (id === undefined) {
      id = materialJSON.length;
      materialIndex.set(m, id);
      materialJSON.push({
        name: m.name,
        baseColor: [...m.baseColor],
        metallic: m.metallic,
        roughness: m.roughness,
        clearcoat: m.clearcoat,
        clearcoatRoughness: m.clearcoatRoughness,
        transmission: m.transmission,
        ior: m.ior,
        emissive: [...m.emissive],
        flakeIntensity: m.flakeIntensity,
        flakeScale: m.flakeScale,
        texScale: m.texScale,
        triplanar: m.triplanar,
        albedoMap: await imageId(m.albedoMap),
        normalMap: await imageId(m.normalMap),
        roughnessMap: await imageId(m.roughnessMap),
        metallicMap: await imageId(m.metallicMap),
      });
    }
    return id;
  };

  const meshJSON = async (mesh: Mesh): Promise<MeshJSON> => {
    const decals: DecalJSON[] = [];
    for (const d of mesh.decals) {
      decals.push({
        position: [...d.position],
        rotation: [...d.rotation],
        size: [...d.size],
        opacity: d.opacity,
        angleCutoffDeg: d.angleCutoffDeg,
        roughness: d.roughness,
        image: await imageId(d.image as MaterialImage),
      });
    }
    const children: MeshJSON[] = [];
    for (const c of mesh.children) children.push(await meshJSON(c));
    const hasGeo = mesh.geometry.indices.length > 0;
    return {
      name: mesh.name,
      transform: [...mesh.transform],
      visible: mesh.visible,
      material: await materialId(mesh.material),
      geometry: hasGeo
        ? {
            positions: addArray(mesh.geometry.positions),
            normals: addArray(mesh.geometry.normals),
            uvs: addArray(mesh.geometry.uvs),
            indices: addArray(mesh.geometry.indices),
          }
        : null,
      decals,
      children,
    };
  };

  const meshes: MeshJSON[] = [];
  for (const root of data.meshes) meshes.push(await meshJSON(root));

  const env = data.environment;
  const manifest: Manifest = {
    version: VERSION,
    camera: data.camera,
    viewCams: data.viewCams,
    lights: data.lights.map((l) => ({
      type: l.type,
      name: l.name,
      color: [...l.color],
      intensity: l.intensity,
      position: [...l.position],
      direction: [...l.direction],
      target: [...l.target],
      angleDeg: l.angleDeg,
      softness: l.softness,
      width: l.width,
      height: l.height,
      targeted: l.targeted,
      visible: l.visible,
    })),
    env: {
      width: env.width,
      height: env.height,
      data: addArray(env.data),
      intensity: env.intensity,
      rotation: env.rotation,
      name: data.envName,
    },
    materials: materialJSON,
    images: imageRefs,
    meshes,
  };

  let jsonBytes = new TextEncoder().encode(JSON.stringify(manifest));
  const jsonPad = (4 - (jsonBytes.byteLength % 4)) % 4;
  if (jsonPad) {
    const padded = new Uint8Array(jsonBytes.byteLength + jsonPad).fill(0x20);
    padded.set(jsonBytes);
    jsonBytes = padded;
  }

  const header = new ArrayBuffer(12);
  const hv = new DataView(header);
  hv.setUint32(0, MAGIC, true);
  hv.setUint32(4, VERSION, true);
  hv.setUint32(8, jsonBytes.byteLength, true);

  return new Blob([header, jsonBytes, ...chunks] as BlobPart[],
    { type: "application/octet-stream" });
}

/* ---------------------------------- load ---------------------------------- */

export async function loadSceneFile(buffer: ArrayBuffer): Promise<SceneFileData> {
  const dv = new DataView(buffer);
  if (buffer.byteLength < 12 || dv.getUint32(0, true) !== MAGIC) {
    throw new Error("Not a .lacquer scene file");
  }
  const version = dv.getUint32(4, true);
  if (version > VERSION) throw new Error(`Scene file version ${version} is too new`);
  const jsonLen = dv.getUint32(8, true);
  const manifest: Manifest = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, 12, jsonLen)));
  const binStart = 12 + jsonLen;

  const bytes = (r: BufRef): Uint8Array => new Uint8Array(buffer, binStart + r.o, r.l);
  const f32 = (r: BufRef): Float32Array =>
    new Float32Array(buffer.slice(binStart + r.o, binStart + r.o + r.l));
  const u32 = (r: BufRef): Uint32Array =>
    new Uint32Array(buffer.slice(binStart + r.o, binStart + r.o + r.l));

  const images: (ImageBitmap | null)[] = await Promise.all(
    manifest.images.map((ref) =>
      createImageBitmap(new Blob([bytes(ref)] as BlobPart[], { type: "image/png" }))
        .catch(() => null)),
  );
  const img = (id: number): ImageBitmap | null => (id >= 0 ? images[id] ?? null : null);

  const materials = manifest.materials.map((m) => new Material({
    name: m.name,
    baseColor: m.baseColor as [number, number, number],
    metallic: m.metallic,
    roughness: m.roughness,
    clearcoat: m.clearcoat,
    clearcoatRoughness: m.clearcoatRoughness,
    transmission: m.transmission,
    ior: m.ior,
    emissive: m.emissive as [number, number, number],
    flakeIntensity: m.flakeIntensity,
    flakeScale: m.flakeScale,
    texScale: m.texScale,
    triplanar: m.triplanar,
    albedoMap: img(m.albedoMap),
    normalMap: img(m.normalMap),
    roughnessMap: img(m.roughnessMap),
    metallicMap: img(m.metallicMap),
  }));

  const buildMesh = (mj: MeshJSON): Mesh => {
    const transform = new Float32Array(mj.transform) as Mat4;
    let mesh: Mesh;
    if (mj.geometry) {
      mesh = new Mesh(mj.name, {
        positions: f32(mj.geometry.positions),
        normals: f32(mj.geometry.normals),
        uvs: f32(mj.geometry.uvs),
        indices: u32(mj.geometry.indices),
      }, materials[mj.material] ?? new Material(), transform);
    } else {
      mesh = Mesh.group(mj.name, transform);
      mesh.material = materials[mj.material] ?? mesh.material;
    }
    mesh.visible = mj.visible;
    for (const dj of mj.decals) {
      const image = img(dj.image);
      if (!image) continue;
      mesh.decals.push(new Decal({
        image,
        position: dj.position as Vec3,
        rotation: new Float32Array(dj.rotation),
        size: dj.size as Vec3,
        opacity: dj.opacity,
        angleCutoffDeg: dj.angleCutoffDeg,
        roughness: dj.roughness,
      }));
    }
    for (const cj of mj.children) mesh.add(buildMesh(cj));
    return mesh;
  };

  const environment = new Environment(
    manifest.env.width, manifest.env.height, f32(manifest.env.data));
  environment.intensity = manifest.env.intensity;
  environment.rotation = manifest.env.rotation;

  return {
    meshes: manifest.meshes.map(buildMesh),
    lights: manifest.lights.map((l) => new Light(l.type, {
      name: l.name,
      color: l.color as [number, number, number],
      intensity: l.intensity,
      position: l.position as Vec3,
      // New files carry an explicit target; older ones derive it from direction.
      target: l.target as Vec3 | undefined,
      direction: l.direction as Vec3,
      angleDeg: l.angleDeg,
      softness: l.softness,
      width: l.width ?? 1,
      height: l.height ?? 0.6,
      targeted: l.targeted ?? true,
      visible: l.visible,
    })),
    environment,
    envName: manifest.env.name,
    camera: manifest.camera,
    viewCams: manifest.viewCams,
  };
}
