import { Material } from "../core/Material";
import { Mesh } from "../core/Mesh";
import { computeNormals } from "./GLTFLoader";

/**
 * Minimal Wavefront OBJ importer: v / vn / vt / f (with negative indices and
 * polygon fan triangulation), split into one Mesh per `o`/`g`/`usemtl` group
 * so materials and decals can still be assigned per part. When a parsed MTL
 * library is provided (from a co-dropped .mtl file), `usemtl` groups pick up
 * their materials — including texture maps.
 */
export function loadOBJ(
  text: string,
  fileName = "model",
  mtlLibrary?: Map<string, Material>,
): Mesh[] {
  const vs: number[] = [];
  const vts: number[] = [];
  const vns: number[] = [];

  interface Group {
    name: string;
    mtl: string | null;
    positions: number[];
    normals: number[];
    uvs: number[];
    hasNormals: boolean;
  }
  const groups: Group[] = [];
  let current: Group | null = null;

  const getGroup = (): Group => {
    if (!current) {
      current = {
        name: `${fileName}_0`, mtl: null,
        positions: [], normals: [], uvs: [], hasNormals: true,
      };
      groups.push(current);
    }
    return current;
  };

  const resolve = (idx: number, len: number) => (idx > 0 ? idx - 1 : len + idx);

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    switch (parts[0]) {
      case "v":
        vs.push(+parts[1], +parts[2], +parts[3]);
        break;
      case "vt":
        vts.push(+parts[1], +parts[2]);
        break;
      case "vn":
        vns.push(+parts[1], +parts[2], +parts[3]);
        break;
      case "o":
      case "g":
      case "usemtl": {
        const name = parts.slice(1).join(" ") || `${fileName}_${groups.length}`;
        // usemtl names the material; o/g groups inherit the active one.
        const inheritedMtl: string | null = (current as Group | null)?.mtl ?? null;
        current = {
          name,
          mtl: parts[0] === "usemtl" ? name : inheritedMtl,
          positions: [], normals: [], uvs: [], hasNormals: true,
        };
        groups.push(current);
        break;
      }
      case "f": {
        const g = getGroup();
        const verts = parts.slice(1).map((p) => {
          const [vi, ti, ni] = p.split("/");
          return {
            v: resolve(parseInt(vi, 10), vs.length / 3),
            t: ti ? resolve(parseInt(ti, 10), vts.length / 2) : -1,
            n: ni ? resolve(parseInt(ni, 10), vns.length / 3) : -1,
          };
        });
        // Fan triangulation for quads/ngons.
        for (let i = 1; i + 1 < verts.length; i++) {
          for (const vv of [verts[0], verts[i], verts[i + 1]]) {
            g.positions.push(vs[vv.v * 3], vs[vv.v * 3 + 1], vs[vv.v * 3 + 2]);
            if (vv.n >= 0) {
              g.normals.push(vns[vv.n * 3], vns[vv.n * 3 + 1], vns[vv.n * 3 + 2]);
            } else {
              g.hasNormals = false;
              g.normals.push(0, 0, 0);
            }
            if (vv.t >= 0) g.uvs.push(vts[vv.t * 2], vts[vv.t * 2 + 1]);
            else g.uvs.push(0, 0);
          }
        }
        break;
      }
    }
  }

  const meshes: Mesh[] = [];
  for (const g of groups) {
    if (g.positions.length === 0) continue;
    const positions = new Float32Array(g.positions);
    const indices = Uint32Array.from({ length: positions.length / 3 }, (_, i) => i);
    const normals = g.hasNormals ? new Float32Array(g.normals) : computeNormals(positions, indices);
    const material = (g.mtl && mtlLibrary?.get(g.mtl)) ||
      new Material({ name: `${g.name}-mat`, baseColor: [0.75, 0.75, 0.78], roughness: 0.45 });
    meshes.push(
      new Mesh(g.name, { positions, normals, uvs: new Float32Array(g.uvs), indices }, material),
    );
  }
  if (meshes.length === 0) throw new Error("OBJ contained no faces");
  return meshes;
}

/**
 * Parse a Wavefront .mtl library into engine materials. Texture map
 * statements resolve through `resolveImage`, which the host app backs with
 * the files dropped alongside the OBJ.
 */
export async function parseMTL(
  text: string,
  resolveImage: (fileName: string) => Promise<ImageBitmap | null>,
): Promise<Map<string, Material>> {
  const materials = new Map<string, Material>();
  let current: Material | null = null;
  const pending: Promise<void>[] = [];

  const assignMap = (
    mat: Material,
    slot: "albedoMap" | "normalMap" | "roughnessMap" | "metallicMap",
    args: string[],
  ): void => {
    // Options like `-bm 0.5` precede the filename; the filename is last.
    const file = args[args.length - 1];
    if (!file) return;
    pending.push(resolveImage(file).then((bmp) => {
      if (bmp) mat[slot] = bmp;
    }));
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    const key = parts[0].toLowerCase();
    if (key === "newmtl") {
      current = new Material({ name: parts.slice(1).join(" ") || "material" });
      current.metallic = 0;
      current.roughness = 0.6;
      materials.set(current.name, current);
      continue;
    }
    if (!current) continue;
    switch (key) {
      case "kd":
        current.baseColor = [+parts[1] || 0, +parts[2] || 0, +parts[3] || 0];
        break;
      case "ns": { // Blinn-Phong exponent -> perceptual roughness
        const ns = Math.max(+parts[1] || 0, 0);
        current.roughness = Math.min(1, Math.max(0.03, Math.sqrt(2 / (ns + 2))));
        break;
      }
      case "ni":
        current.ior = Math.max(1, +parts[1] || 1.5);
        break;
      case "d": { // dissolve: treat partial transparency as transmission
        const d = +parts[1];
        if (Number.isFinite(d) && d < 1) current.transmission = 1 - d;
        break;
      }
      case "ke": {
        const e: [number, number, number] = [+parts[1] || 0, +parts[2] || 0, +parts[3] || 0];
        if (e.some((v) => v > 0)) current.emissive = e;
        break;
      }
      case "pm":
        current.metallic = Math.min(1, Math.max(0, +parts[1] || 0));
        break;
      case "pr":
        current.roughness = Math.min(1, Math.max(0.03, +parts[1] || 0.5));
        break;
      case "map_kd":
        assignMap(current, "albedoMap", parts.slice(1));
        break;
      case "map_bump":
      case "bump":
      case "norm":
        assignMap(current, "normalMap", parts.slice(1));
        break;
      case "map_pr":
        assignMap(current, "roughnessMap", parts.slice(1));
        break;
      case "map_pm":
        assignMap(current, "metallicMap", parts.slice(1));
        break;
    }
  }
  await Promise.all(pending);
  return materials;
}
