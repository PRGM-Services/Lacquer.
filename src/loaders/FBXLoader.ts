import { parseBinary, parseText, FBXNode } from "fbx-parser";
import { Material } from "../core/Material";
import { Geometry, Mesh } from "../core/Mesh";
import {
  Mat4,
  Vec3,
  mat4AxisRotation,
  mat4Identity,
  mat4Multiply,
  mat4Scale,
  mat4Translation,
  transformDirection,
  transformPoint,
  normalize as v3normalize,
} from "../math/vec";
import { computeNormals } from "./GLTFLoader";

/**
 * FBX importer (binary FBX 7.x and ASCII), built on the raw node tree from
 * `fbx-parser`. Recovers:
 *  - polygon geometry with correct per-corner normal/UV de-indexing
 *    (ByPolygonVertex / ByVertice / ByPolygon / AllSame, Direct and
 *    IndexToDirect reference modes)
 *  - the full Model hierarchy via OO connections, preserved as parent/child
 *    Mesh nodes with local transforms (Lcl TRS + Pre/Post rotation + pivots,
 *    geometric transforms baked into vertices)
 *  - per-polygon material assignment (meshes split into one child per slot)
 *  - Phong material properties mapped onto the PBR model
 *  - scene units (UnitScaleFactor -> meters) and Z-up -> Y-up conversion
 *
 * Returns a single root group named after the file.
 */
export async function loadFBX(
  buffer: ArrayBuffer,
  fileName = "model",
  /** Files dropped alongside the .fbx, for resolving external textures. */
  auxFiles?: Map<string, Blob>,
): Promise<Mesh[]> {
  const bytes = new Uint8Array(buffer);
  const isBinary = startsWith(bytes, "Kaydara FBX Binary");
  const fbx: FBXNode[] = isBinary
    ? parseBinary(bytes)
    : parseText(new TextDecoder().decode(bytes));

  const objects = child(fbx, "Objects");
  if (!objects) throw new Error("FBX has no Objects section");

  /* ------------------------------ connections ----------------------------- */
  // childId -> parentIds and parentId -> childIds (OO only; OP is animation
  // and property wiring we do not consume yet).
  const parentsOf = new Map<number, number[]>();
  const childrenOf = new Map<number, number[]>();
  // OP connections wire textures to material properties (DiffuseColor etc).
  const propConnections: { childId: number; parentId: number; prop: string }[] = [];
  for (const c of child(fbx, "Connections")?.nodes ?? []) {
    if (c.name !== "C") continue;
    if (c.props[0] === "OO") {
      const childId = num(c.props[1]);
      const parentId = num(c.props[2]);
      push(parentsOf, childId, parentId);
      push(childrenOf, parentId, childId);
    } else if (c.props[0] === "OP") {
      propConnections.push({
        childId: num(c.props[1]),
        parentId: num(c.props[2]),
        prop: str(c.props[3] ?? ""),
      });
    }
  }

  /* -------------------------------- objects ------------------------------- */
  const geometries = new Map<number, ParsedGeometry>();
  const models = new Map<number, ParsedModel>();
  const materials = new Map<number, Material>();

  const videos = new Map<number, unknown>();          // id -> Content payload
  const textures = new Map<number, string>();          // id -> file name
  for (const node of objects.nodes) {
    const id = num(node.props[0]);
    if (node.name === "Geometry" && str(node.props[2]) === "Mesh") {
      const g = parseGeometry(node);
      if (g) geometries.set(id, g);
    } else if (node.name === "Model") {
      models.set(id, parseModel(node, id));
    } else if (node.name === "Material") {
      materials.set(id, parseMaterial(node));
    } else if (node.name === "Video") {
      videos.set(id, child(node, "Content")?.props[0]);
    } else if (node.name === "Texture") {
      const file = str(
        child(node, "RelativeFilename")?.props[0] ??
        child(node, "FileName")?.props[0] ?? "");
      textures.set(id, file);
    }
  }
  if (models.size === 0) throw new Error("FBX contains no models");

  /* ------------------------------- textures ------------------------------- */
  // Embedded content wins; otherwise resolve the file name against the files
  // dropped alongside the .fbx. Assign per OP connection property name.
  const bitmapOfTexture = async (texId: number): Promise<ImageBitmap | null> => {
    const file = textures.get(texId);
    if (file === undefined) return null;
    let blob: Blob | null = null;
    const videoId = (childrenOf.get(texId) ?? []).find((k) => videos.has(k));
    const content = videoId !== undefined ? videos.get(videoId) : undefined;
    if (content instanceof Uint8Array && content.byteLength > 16) {
      blob = new Blob([content.slice()]);
    } else if (content instanceof ArrayBuffer && content.byteLength > 16) {
      blob = new Blob([content]);
    } else if (typeof content === "string" && content.length > 24) {
      try { // ASCII FBX embeds content as base64
        const raw = atob(content.replace(/\s+/g, ""));
        const arr = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
        blob = new Blob([arr]);
      } catch { /* not base64 — fall through to aux files */ }
    }
    if (!blob && auxFiles) {
      const base = file.split(/[\\/]/).pop()?.toLowerCase() ?? "";
      blob = auxFiles.get(base) ?? null;
    }
    if (!blob) return null;
    return createImageBitmap(blob).catch(() => null);
  };

  const texBitmapCache = new Map<number, Promise<ImageBitmap | null>>();
  for (const { childId, parentId, prop } of propConnections) {
    if (!textures.has(childId) || !materials.has(parentId)) continue;
    let cached = texBitmapCache.get(childId);
    if (!cached) {
      cached = bitmapOfTexture(childId);
      texBitmapCache.set(childId, cached);
    }
    const bmp = await cached;
    if (!bmp) continue;
    const mat = materials.get(parentId)!;
    const p = prop.toLowerCase();
    if (p.includes("normal") || p.includes("bump")) mat.normalMap = bmp;
    else if (p.includes("rough") || p.includes("shininess")) mat.roughnessMap = bmp;
    else if (p.includes("metal") || p.includes("reflectionfactor")) mat.metallicMap = bmp;
    else if (p.includes("diffuse") || p.includes("basecolor")) mat.albedoMap = bmp;
  }

  /* ----------------------------- build meshes ----------------------------- */
  const meshOf = new Map<number, Mesh>();
  for (const [id, model] of models) {
    const kids = childrenOf.get(id) ?? [];
    const geomId = kids.find((k) => geometries.has(k));
    const slots = kids.filter((k) => materials.has(k)).map((k) => materials.get(k)!);
    const local = model.localTransform;

    if (geomId === undefined) {
      meshOf.set(id, Mesh.group(model.name, local));
      continue;
    }
    const parsed = geometries.get(geomId)!;
    const parts = assembleGeometry(parsed, model.geometricTransform);
    if (parts.length === 1) {
      const mat = slots[parts[0].slot] ?? slots[0] ?? defaultMaterial(model.name);
      meshOf.set(id, new Mesh(model.name, parts[0].geometry, mat, local));
    } else {
      // Multi-material mesh: container node with one child per material slot
      // so each part remains individually selectable/paintable.
      const container = Mesh.group(model.name, local);
      for (const part of parts) {
        const mat = slots[part.slot] ?? defaultMaterial(`${model.name}_${part.slot}`);
        container.add(new Mesh(`${model.name}·${mat.name}`, part.geometry, mat));
      }
      meshOf.set(id, container);
    }
  }

  /* ------------------------------ hierarchy ------------------------------- */
  const root = Mesh.group(fileName, documentTransform(fbx));
  for (const [id, mesh] of meshOf) {
    const parentId = (parentsOf.get(id) ?? []).find((p) => meshOf.has(p));
    if (parentId !== undefined) meshOf.get(parentId)!.add(mesh);
    else root.add(mesh);
  }
  if (root.children.length === 0) throw new Error("FBX contains no scene meshes");
  return [root];
}

/* =========================== node tree helpers ============================ */

function startsWith(bytes: Uint8Array, text: string): boolean {
  if (bytes.length < text.length) return false;
  for (let i = 0; i < text.length; i++) if (bytes[i] !== text.charCodeAt(i)) return false;
  return true;
}

function child(nodes: FBXNode[] | FBXNode, name: string): FBXNode | undefined {
  const list = Array.isArray(nodes) ? nodes : nodes.nodes;
  return list.find((n) => n.name === name);
}

function num(p: unknown): number {
  if (typeof p === "bigint") return Number(p);
  if (typeof p === "number") return p;
  return NaN;
}

/** FBX names look like "Body\x00\x01Model" (binary) or "Model::Body" (ASCII). */
function str(p: unknown): string {
  if (typeof p !== "string") return "";
  const nul = p.indexOf("\u0000");
  if (nul >= 0) return p.slice(0, nul);
  const sep = p.indexOf("::");
  return sep >= 0 ? p.slice(sep + 2) : p;
}

/** Numeric array payload of a node (props[0] array, `a` subnode, or props). */
function arr(node: FBXNode | undefined): number[] {
  if (!node) return [];
  const p0 = node.props[0];
  if (Array.isArray(p0)) return (p0 as unknown[]).map(num);
  const a = child(node, "a");
  if (a) return a.props.flatMap((p) => (Array.isArray(p) ? (p as unknown[]).map(num) : [num(p)]));
  if (node.props.length > 0 && typeof p0 !== "string") return node.props.map(num);
  return [];
}

function push(map: Map<number, number[]>, key: number, value: number): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Values of a Properties70 "P" entry (props[4..]). */
function prop70(container: FBXNode | undefined, name: string): number[] | null {
  const p70 = container ? child(container, "Properties70") : undefined;
  for (const p of p70?.nodes ?? []) {
    if (p.name === "P" && p.props[0] === name) return p.props.slice(4).map(num);
  }
  return null;
}

/* ============================== geometry ================================== */

interface ParsedGeometry {
  vertices: number[];
  /** corner -> vertex index, polygon boundaries dissolved */
  cornerVertex: number[];
  /** corner -> polygon index */
  cornerPolygon: number[];
  /** polygon -> [first corner, corner count] */
  polygons: [number, number][];
  normals: LayerData | null;
  uvs: LayerData | null;
  /** polygon -> material slot (empty = all slot 0) */
  materialSlots: number[];
}

interface LayerData {
  data: number[];
  index: number[] | null;
  mapping: string;
  components: number;
}

function parseGeometry(node: FBXNode): ParsedGeometry | null {
  const vertices = arr(child(node, "Vertices"));
  const pvi = arr(child(node, "PolygonVertexIndex"));
  if (!vertices.length || !pvi.length) return null;

  const cornerVertex: number[] = [];
  const cornerPolygon: number[] = [];
  const polygons: [number, number][] = [];
  let polyStart = 0;
  for (let i = 0; i < pvi.length; i++) {
    let v = pvi[i];
    const last = v < 0;
    if (last) v = ~v;
    cornerVertex.push(v);
    cornerPolygon.push(polygons.length);
    if (last) {
      polygons.push([polyStart, cornerVertex.length - polyStart]);
      polyStart = cornerVertex.length;
    }
  }

  const layer = (name: string, dataName: string, indexName: string, components: number): LayerData | null => {
    const el = child(node, name);
    if (!el) return null;
    const data = arr(child(el, dataName));
    if (!data.length) return null;
    const idx = arr(child(el, indexName));
    return {
      data,
      index: idx.length ? idx : null,
      mapping: String(child(el, "MappingInformationType")?.props[0] ?? "ByPolygonVertex"),
      components,
    };
  };

  const matEl = child(node, "LayerElementMaterial");
  const matMapping = String(matEl ? child(matEl, "MappingInformationType")?.props[0] : "");
  const matArray = matEl ? arr(child(matEl, "Materials")) : [];

  return {
    vertices,
    cornerVertex,
    cornerPolygon,
    polygons,
    normals: layer("LayerElementNormal", "Normals", "NormalsIndex", 3),
    uvs: layer("LayerElementUV", "UV", "UVIndex", 2),
    materialSlots: matMapping === "ByPolygon" ? matArray : [],
  };
}

/** Read a layer value for a specific corner, honoring mapping/reference modes. */
function layerValue(
  layer: LayerData, out: number[], outOfs: number,
  corner: number, polygon: number, vertex: number,
): void {
  const c = layer.components;
  let i: number;
  switch (layer.mapping) {
    case "ByVertice":
    case "ByVertex":
      i = vertex; break;
    case "ByPolygon":
      i = polygon; break;
    case "AllSame":
      i = 0; break;
    default: // ByPolygonVertex
      i = corner; break;
  }
  if (layer.index) i = layer.index[i] ?? 0;
  for (let k = 0; k < c; k++) out[outOfs + k] = layer.data[i * c + k] ?? 0;
}

/**
 * De-index the FBX polygon soup into engine geometry, splitting by material
 * slot. Every triangle corner becomes a unique vertex, which is the only
 * correct way to honor ByPolygonVertex normals/UVs.
 */
function assembleGeometry(
  g: ParsedGeometry,
  geometric: Mat4 | null,
): { slot: number; geometry: Geometry }[] {
  interface Bucket { positions: number[]; normals: number[]; uvs: number[] }
  const buckets = new Map<number, Bucket>();
  const tmp3 = [0, 0, 0];
  const tmp2 = [0, 0];

  for (let poly = 0; poly < g.polygons.length; poly++) {
    const [first, count] = g.polygons[poly];
    if (count < 3) continue;
    const slot = g.materialSlots.length ? (g.materialSlots[poly] ?? 0) : 0;
    let bucket = buckets.get(slot);
    if (!bucket) {
      bucket = { positions: [], normals: [], uvs: [] };
      buckets.set(slot, bucket);
    }
    // fan-triangulate the polygon's corners
    for (let t = 1; t + 1 < count; t++) {
      for (const corner of [first, first + t, first + t + 1]) {
        const v = g.cornerVertex[corner];
        let px = g.vertices[v * 3] ?? 0;
        let py = g.vertices[v * 3 + 1] ?? 0;
        let pz = g.vertices[v * 3 + 2] ?? 0;
        if (geometric) {
          const p = transformPoint(geometric, [px, py, pz]);
          px = p[0]; py = p[1]; pz = p[2];
        }
        bucket.positions.push(px, py, pz);
        if (g.normals) {
          layerValue(g.normals, tmp3, 0, corner, poly, v);
          let n: Vec3 = [tmp3[0], tmp3[1], tmp3[2]];
          if (geometric) n = v3normalize(transformDirection(geometric, n));
          bucket.normals.push(n[0], n[1], n[2]);
        }
        if (g.uvs) {
          layerValue(g.uvs, tmp2, 0, corner, poly, v);
          bucket.uvs.push(tmp2[0], 1 - tmp2[1]); // FBX V is bottom-up
        }
      }
    }
  }

  const parts: { slot: number; geometry: Geometry }[] = [];
  for (const [slot, b] of buckets) {
    const positions = new Float32Array(b.positions);
    const vertCount = positions.length / 3;
    if (vertCount === 0) continue;
    const indices = Uint32Array.from({ length: vertCount }, (_, i) => i);
    parts.push({
      slot,
      geometry: {
        positions,
        normals: b.normals.length === positions.length
          ? new Float32Array(b.normals)
          : computeNormals(positions, indices),
        uvs: b.uvs.length === vertCount * 2 ? new Float32Array(b.uvs) : new Float32Array(vertCount * 2),
        indices,
      },
    });
  }
  parts.sort((a, b) => a.slot - b.slot);
  return parts;
}

/* =============================== models =================================== */

interface ParsedModel {
  name: string;
  localTransform: Mat4;
  geometricTransform: Mat4 | null;
}

/** FBX default euler order (XYZ, degrees): v' = Rz·Ry·Rx·v. */
function eulerXYZ(deg: number[] | null): Mat4 {
  if (!deg || (deg[0] === 0 && deg[1] === 0 && deg[2] === 0)) return mat4Identity();
  const r = Math.PI / 180;
  return mat4Multiply(
    mat4AxisRotation([0, 0, 1], deg[2] * r),
    mat4Multiply(
      mat4AxisRotation([0, 1, 0], deg[1] * r),
      mat4AxisRotation([1, 0, 0], deg[0] * r),
    ),
  );
}

function invRot(m: Mat4): Mat4 {
  // transpose of a pure rotation
  const t = mat4Identity();
  t[0] = m[0]; t[1] = m[4]; t[2] = m[8];
  t[4] = m[1]; t[5] = m[5]; t[6] = m[9];
  t[8] = m[2]; t[9] = m[6]; t[10] = m[10];
  return t;
}

function parseModel(node: FBXNode, id: number): ParsedModel {
  const name = str(node.props[1]) || `Model_${id}`;
  const t = prop70(node, "Lcl Translation") ?? [0, 0, 0];
  const rp = prop70(node, "RotationPivot") ?? [0, 0, 0];
  const sp = prop70(node, "ScalingPivot") ?? [0, 0, 0];
  const roff = prop70(node, "RotationOffset") ?? [0, 0, 0];
  const soff = prop70(node, "ScalingOffset") ?? [0, 0, 0];
  const s = prop70(node, "Lcl Scaling") ?? [1, 1, 1];

  const R = eulerXYZ(prop70(node, "Lcl Rotation"));
  const Rpre = eulerXYZ(prop70(node, "PreRotation"));
  const Rpost = eulerXYZ(prop70(node, "PostRotation"));

  // FBX local transform chain (common subset):
  // L = T · Roff · Rp · Rpre · R · Rpost⁻¹ · Rp⁻¹ · Soff · Sp · S · Sp⁻¹
  const chain: Mat4[] = [
    mat4Translation([t[0], t[1], t[2]]),
    mat4Translation([roff[0], roff[1], roff[2]]),
    mat4Translation([rp[0], rp[1], rp[2]]),
    Rpre,
    R,
    invRot(Rpost),
    mat4Translation([-rp[0], -rp[1], -rp[2]]),
    mat4Translation([soff[0], soff[1], soff[2]]),
    mat4Translation([sp[0], sp[1], sp[2]]),
    mat4Scale([s[0], s[1], s[2]]),
    mat4Translation([-sp[0], -sp[1], -sp[2]]),
  ];
  const localTransform = chain.reduce((acc, m) => mat4Multiply(acc, m));

  const gt = prop70(node, "GeometricTranslation");
  const gr = prop70(node, "GeometricRotation");
  const gs = prop70(node, "GeometricScaling");
  let geometricTransform: Mat4 | null = null;
  if (gt || gr || gs) {
    geometricTransform = mat4Multiply(
      mat4Translation([gt?.[0] ?? 0, gt?.[1] ?? 0, gt?.[2] ?? 0]),
      mat4Multiply(eulerXYZ(gr), mat4Scale([gs?.[0] ?? 1, gs?.[1] ?? 1, gs?.[2] ?? 1])),
    );
  }
  return { name, localTransform, geometricTransform };
}

/* ============================== materials ================================= */

function defaultMaterial(name: string): Material {
  return new Material({ name, baseColor: [0.75, 0.75, 0.78], roughness: 0.5 });
}

function parseMaterial(node: FBXNode): Material {
  const name = str(node.props[1]) || "material";
  const diffuse = prop70(node, "DiffuseColor") ?? [0.8, 0.8, 0.8];
  const emissiveColor = prop70(node, "EmissiveColor") ?? [0, 0, 0];
  const emissiveFactor = prop70(node, "EmissiveFactor")?.[0] ?? 1;
  const shininess =
    prop70(node, "ShininessExponent")?.[0] ?? prop70(node, "Shininess")?.[0] ?? 20;
  const opacity =
    prop70(node, "Opacity")?.[0] ??
    (1 - (prop70(node, "TransparencyFactor")?.[0] ?? 0));
  const reflection = prop70(node, "ReflectionFactor")?.[0] ?? 0;

  // Blinn-Phong exponent -> GGX perceptual roughness.
  const roughness = Math.min(1, Math.max(0.03, Math.sqrt(2 / (Math.max(shininess, 2) + 2))));

  return new Material({
    name,
    baseColor: [diffuse[0], diffuse[1], diffuse[2]],
    emissive: [
      emissiveColor[0] * emissiveFactor,
      emissiveColor[1] * emissiveFactor,
      emissiveColor[2] * emissiveFactor,
    ],
    roughness,
    metallic: Math.min(1, Math.max(0, reflection)),
    transmission: opacity < 0.99 ? Math.min(1, 1 - opacity) : 0,
  });
}

/* ============================ global settings ============================= */

/** Unit scale (cm -> m) and Z-up -> Y-up conversion for the file root. */
function documentTransform(fbx: FBXNode[]): Mat4 {
  const gs = child(fbx, "GlobalSettings");
  const unit = prop70(gs ?? { name: "", props: [], nodes: [] }, "UnitScaleFactor")?.[0] ?? 1;
  const upAxis = prop70(gs ?? { name: "", props: [], nodes: [] }, "UpAxis")?.[0] ?? 1;
  const k = unit / 100; // FBX units are centimeters at UnitScaleFactor 1
  let m = mat4Scale([k, k, k]);
  if (upAxis === 2) {
    m = mat4Multiply(m, mat4AxisRotation([1, 0, 0], -Math.PI / 2));
  }
  return m;
}
