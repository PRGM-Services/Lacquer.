import { Material } from "../core/Material";
import { Geometry, Mesh } from "../core/Mesh";
import {
  Mat4,
  mat4Identity,
  mat4Multiply,
} from "../math/vec";

/**
 * Self-contained glTF 2.0 loader (.glb binary and .gltf with embedded
 * data-URI buffers). Imports triangle geometry with node-hierarchy
 * transforms baked in, plus pbrMetallicRoughness materials including the
 * KHR_materials_transmission / _clearcoat / _ior / _emissive_strength
 * extensions — which is exactly the set automotive assets exported from
 * Blender or Substance use for paint and glass.
 *
 * Not yet supported: textures (factors only), skins, animation, Draco.
 */

interface GLTFJson {
  scenes?: { nodes?: number[] }[];
  scene?: number;
  nodes?: GLTFNode[];
  meshes?: { name?: string; primitives: GLTFPrimitive[] }[];
  materials?: GLTFMaterial[];
  accessors?: GLTFAccessor[];
  bufferViews?: GLTFBufferView[];
  buffers?: { uri?: string; byteLength: number }[];
  textures?: { source?: number }[];
  images?: { uri?: string; bufferView?: number; mimeType?: string }[];
}
interface GLTFNode {
  name?: string;
  children?: number[];
  mesh?: number;
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
}
interface GLTFPrimitive {
  attributes: Record<string, number>;
  indices?: number;
  material?: number;
  mode?: number;
}
interface GLTFMaterial {
  name?: string;
  pbrMetallicRoughness?: {
    baseColorFactor?: number[];
    metallicFactor?: number;
    roughnessFactor?: number;
    baseColorTexture?: { index: number };
    metallicRoughnessTexture?: { index: number };
  };
  normalTexture?: { index: number };
  emissiveFactor?: number[];
  extensions?: {
    KHR_materials_transmission?: { transmissionFactor?: number };
    KHR_materials_clearcoat?: { clearcoatFactor?: number; clearcoatRoughnessFactor?: number };
    KHR_materials_ior?: { ior?: number };
    KHR_materials_emissive_strength?: { emissiveStrength?: number };
  };
}
interface GLTFAccessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  normalized?: boolean;
  count: number;
  type: string;
}
interface GLTFBufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
}

const COMPONENT_SIZE: Record<number, number> = {
  5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4,
};
const TYPE_COUNT: Record<string, number> = {
  SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16,
};

export async function loadGLTF(buffer: ArrayBuffer, fileName = "model"): Promise<Mesh[]> {
  let json: GLTFJson;
  let bin: ArrayBuffer | null = null;

  const magic = new DataView(buffer).byteLength >= 4 ? new DataView(buffer).getUint32(0, true) : 0;
  if (magic === 0x46546c67) {
    // GLB container
    const view = new DataView(buffer);
    const version = view.getUint32(4, true);
    if (version !== 2) throw new Error(`Unsupported GLB version ${version}`);
    let offset = 12;
    let jsonText = "";
    while (offset < view.getUint32(8, true)) {
      const chunkLen = view.getUint32(offset, true);
      const chunkType = view.getUint32(offset + 4, true);
      const chunkData = buffer.slice(offset + 8, offset + 8 + chunkLen);
      if (chunkType === 0x4e4f534a) jsonText = new TextDecoder().decode(chunkData);
      else if (chunkType === 0x004e4942) bin = chunkData;
      offset += 8 + chunkLen + (chunkLen % 4 === 0 ? 0 : 4 - (chunkLen % 4));
    }
    json = JSON.parse(jsonText);
  } else {
    json = JSON.parse(new TextDecoder().decode(buffer));
  }

  // Resolve buffers (GLB bin chunk or data: URIs).
  const buffers: ArrayBuffer[] = (json.buffers ?? []).map((b) => {
    if (b.uri) {
      if (b.uri.startsWith("data:")) {
        const base64 = b.uri.slice(b.uri.indexOf(",") + 1);
        const raw = atob(base64);
        const arr = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
        return arr.buffer;
      }
      throw new Error(
        `External buffer "${b.uri}" not supported for drag-drop .gltf — use .glb or embedded buffers`,
      );
    }
    if (!bin) throw new Error("glTF buffer has no data");
    return bin;
  });

  const readAccessor = (index: number): Float32Array | Uint32Array => {
    const acc = json.accessors![index];
    const comps = TYPE_COUNT[acc.type];
    const compSize = COMPONENT_SIZE[acc.componentType];
    const out =
      acc.componentType === 5126 || acc.normalized
        ? new Float32Array(acc.count * comps)
        : new Uint32Array(acc.count * comps);
    if (acc.bufferView === undefined) return out; // zero-filled sparse base
    const bv = json.bufferViews![acc.bufferView];
    const stride = bv.byteStride ?? comps * compSize;
    const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const dv = new DataView(buffers[bv.buffer]);
    for (let i = 0; i < acc.count; i++) {
      for (let c = 0; c < comps; c++) {
        const o = base + i * stride + c * compSize;
        let v: number;
        switch (acc.componentType) {
          case 5126: v = dv.getFloat32(o, true); break;
          case 5125: v = dv.getUint32(o, true); break;
          case 5123: v = dv.getUint16(o, true); if (acc.normalized) v /= 65535; break;
          case 5122: v = dv.getInt16(o, true); if (acc.normalized) v = Math.max(v / 32767, -1); break;
          case 5121: v = dv.getUint8(o); if (acc.normalized) v /= 255; break;
          case 5120: v = dv.getInt8(o); if (acc.normalized) v = Math.max(v / 127, -1); break;
          default: throw new Error(`Unsupported componentType ${acc.componentType}`);
        }
        out[i * comps + c] = v;
      }
    }
    return out;
  };

  // Decode embedded texture images up front (bufferView or data: URI).
  const imageBitmaps: (ImageBitmap | null)[] = await Promise.all(
    (json.images ?? []).map(async (img) => {
      try {
        if (img.uri) {
          if (!img.uri.startsWith("data:")) return null; // external files unsupported
          return await createImageBitmap(await (await fetch(img.uri)).blob());
        }
        if (img.bufferView === undefined) return null;
        const bv = json.bufferViews![img.bufferView];
        const bytes = new Uint8Array(buffers[bv.buffer], bv.byteOffset ?? 0, bv.byteLength);
        return await createImageBitmap(
          new Blob([bytes.slice()], { type: img.mimeType ?? "image/png" }));
      } catch (err) {
        console.warn("[lacquer/gltf] failed to decode texture image:", err);
        return null;
      }
    }),
  );
  const texImage = (texIndex: number | undefined): ImageBitmap | null => {
    if (texIndex === undefined) return null;
    const source = json.textures?.[texIndex]?.source;
    return source === undefined ? null : imageBitmaps[source] ?? null;
  };

  const convertMaterial = (index: number | undefined): Material => {
    if (index === undefined || !json.materials?.[index]) {
      return new Material({ name: "default" });
    }
    const m = json.materials[index];
    const pbr = m.pbrMetallicRoughness ?? {};
    const bc = pbr.baseColorFactor ?? [1, 1, 1, 1];
    const ext = m.extensions ?? {};
    const emissiveStrength = ext.KHR_materials_emissive_strength?.emissiveStrength ?? 1;
    const em = (m.emissiveFactor ?? [0, 0, 0]).map((v) => v * emissiveStrength);
    // glTF ORM texture: G = roughness, B = metallic — exactly our sampling
    // convention, so one bitmap serves both slots.
    const orm = texImage(pbr.metallicRoughnessTexture?.index);
    return new Material({
      name: m.name ?? `material_${index}`,
      baseColor: [bc[0], bc[1], bc[2]],
      metallic: pbr.metallicFactor ?? 1,
      roughness: pbr.roughnessFactor ?? 1,
      emissive: [em[0], em[1], em[2]],
      transmission: ext.KHR_materials_transmission?.transmissionFactor ?? 0,
      clearcoat: ext.KHR_materials_clearcoat?.clearcoatFactor ?? 0,
      clearcoatRoughness: ext.KHR_materials_clearcoat?.clearcoatRoughnessFactor ?? 0.03,
      ior: ext.KHR_materials_ior?.ior ?? 1.5,
      albedoMap: texImage(pbr.baseColorTexture?.index),
      normalMap: texImage(m.normalTexture?.index),
      roughnessMap: orm,
      metallicMap: orm,
    });
  };

  const nodeMatrix = (n: GLTFNode): Mat4 => {
    if (n.matrix) return new Float32Array(n.matrix);
    const t = n.translation ?? [0, 0, 0];
    const q = n.rotation ?? [0, 0, 0, 1];
    const s = n.scale ?? [1, 1, 1];
    // Compose TRS with quaternion rotation.
    const [x, y, z, w] = q;
    const m = mat4Identity();
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    m[0] = (1 - (yy + zz)) * s[0]; m[1] = (xy + wz) * s[0]; m[2] = (xz - wy) * s[0];
    m[4] = (xy - wz) * s[1]; m[5] = (1 - (xx + zz)) * s[1]; m[6] = (yz + wx) * s[1];
    m[8] = (xz + wy) * s[2]; m[9] = (yz - wx) * s[2]; m[10] = (1 - (xx + yy)) * s[2];
    m[12] = t[0]; m[13] = t[1]; m[14] = t[2];
    return m;
  };

  // Walk the scene graph, emitting one engine Mesh per primitive with the
  // accumulated world transform. Materials stay shared across primitives
  // that reference the same glTF material so edits propagate.
  const meshes: Mesh[] = [];
  const materialCache = new Map<number, Material>();
  const defaultMat = new Material({ name: "default" });

  const visit = (nodeIndex: number, parent: Mat4) => {
    const node = json.nodes?.[nodeIndex];
    if (!node) return;
    const world = mat4Multiply(parent, nodeMatrix(node));
    if (node.mesh !== undefined && json.meshes?.[node.mesh]) {
      const gltfMesh = json.meshes[node.mesh];
      gltfMesh.primitives.forEach((prim, pi) => {
        if ((prim.mode ?? 4) !== 4) return; // triangles only
        if (prim.attributes.POSITION === undefined) return;
        const positions = readAccessor(prim.attributes.POSITION) as Float32Array;
        const vertCount = positions.length / 3;
        const indices =
          prim.indices !== undefined
            ? new Uint32Array(readAccessor(prim.indices))
            : Uint32Array.from({ length: vertCount }, (_, i) => i);
        let normals =
          prim.attributes.NORMAL !== undefined
            ? (readAccessor(prim.attributes.NORMAL) as Float32Array)
            : computeNormals(positions, indices);
        if (normals.length !== positions.length) normals = computeNormals(positions, indices);
        const uvs =
          prim.attributes.TEXCOORD_0 !== undefined
            ? (readAccessor(prim.attributes.TEXCOORD_0) as Float32Array)
            : new Float32Array(vertCount * 2);
        const geometry: Geometry = { positions, normals, uvs, indices };
        let material: Material;
        if (prim.material === undefined) {
          material = defaultMat;
        } else {
          material = materialCache.get(prim.material) ?? convertMaterial(prim.material);
          materialCache.set(prim.material, material);
        }
        const name = node.name ?? gltfMesh.name ?? `${fileName}_${meshes.length}`;
        meshes.push(new Mesh(pi === 0 ? name : `${name}.${pi}`, geometry, material, world));
      });
    }
    for (const child of node.children ?? []) visit(child, world);
  };

  const sceneDef = json.scenes?.[json.scene ?? 0];
  const roots = sceneDef?.nodes ?? (json.nodes ? json.nodes.map((_, i) => i) : []);
  const rootSet = new Set(roots);
  if (!sceneDef && json.nodes) {
    // No scene: treat non-child nodes as roots.
    for (const n of json.nodes) for (const c of n.children ?? []) rootSet.delete(c);
  }
  for (const r of rootSet) visit(r, mat4Identity());

  if (meshes.length === 0) throw new Error("glTF contained no triangle meshes");
  return meshes;
}

export function computeNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const e1 = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
    const e2 = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
    const nx = e1[1] * e2[2] - e1[2] * e2[1];
    const ny = e1[2] * e2[0] - e1[0] * e2[2];
    const nz = e1[0] * e2[1] - e1[1] * e2[0];
    for (const v of [a, b, c]) {
      normals[v] += nx; normals[v + 1] += ny; normals[v + 2] += nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= l; normals[i + 1] /= l; normals[i + 2] /= l;
  }
  return normals;
}
