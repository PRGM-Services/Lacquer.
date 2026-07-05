import { Mat4, mat4Identity, mat4Multiply, mat4NormalMatrix, transformDirection, transformPoint, normalize } from "../math/vec";
import { Decal } from "./Decal";
import { Material } from "./Material";

/** Raw indexed triangle geometry in local space. */
export interface Geometry {
  /** xyz interleaved. */
  positions: Float32Array;
  /** xyz interleaved, same vertex count as positions. */
  normals: Float32Array;
  /** uv interleaved (may be zeros if unused). */
  uvs: Float32Array;
  indices: Uint32Array;
}

export class Mesh {
  name: string;
  geometry: Geometry;
  material: Material;
  /** Local transform relative to parent. */
  transform: Mat4;
  /**
   * Decals assigned to THIS mesh only. This per-object assignment is the
   * mechanism that keeps a livery from spilling onto neighboring meshes:
   * a decal is evaluated exclusively on the meshes that list it.
   */
  decals: Decal[] = [];
  visible = true;
  
  /** Hierarchy support */
  parent: Mesh | null = null;
  children: Mesh[] = [];

  constructor(name: string, geometry: Geometry, material: Material, transform?: Mat4) {
    this.name = name;
    this.geometry = geometry;
    this.material = material;
    this.transform = transform ?? mat4Identity();
  }

  /** Add a child mesh to this mesh's hierarchy. */
  add(...children: Mesh[]): void {
    for (const child of children) {
      if (child.parent) {
        child.parent.remove(child);
      }
      child.parent = this;
      this.children.push(child);
    }
  }

  /** Remove a child mesh from this mesh's hierarchy. */
  remove(child: Mesh): void {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      this.children.splice(index, 1);
      child.parent = null;
    }
  }

  /** Compute the world transform by traversing up the hierarchy. */
  getWorldTransform(): Mat4 {
    if (!this.parent) return this.transform;
    return mat4Multiply(this.parent.getWorldTransform(), this.transform);
  }

  /** Traverse the hierarchy and call a function on each mesh (depth-first). */
  traverse(fn: (mesh: Mesh) => void): void {
    fn(this);
    for (const child of this.children) {
      child.traverse(fn);
    }
  }

  /** Get all meshes in the hierarchy as a flat array. */
  getAllMeshes(): Mesh[] {
    const meshes: Mesh[] = [];
    this.traverse((mesh) => meshes.push(mesh));
    return meshes;
  }

  /** True if `ancestor` appears anywhere up this mesh's parent chain. */
  isDescendantOf(ancestor: Mesh): boolean {
    for (let p = this.parent; p; p = p.parent) {
      if (p === ancestor) return true;
    }
    return false;
  }

  /** Visibility including ancestors — hiding a group hides its subtree. */
  effectiveVisible(): boolean {
    let node: Mesh | null = this;
    while (node) {
      if (!node.visible) return false;
      node = node.parent;
    }
    return true;
  }

  /** Empty container node for grouping (renders nothing itself). */
  static group(name: string, transform?: Mat4): Mesh {
    return new Mesh(
      name,
      {
        positions: new Float32Array(0),
        normals: new Float32Array(0),
        uvs: new Float32Array(0),
        indices: new Uint32Array(0),
      },
      new Material({ name: "group" }),
      transform,
    );
  }

  /** Bakes the transform into world-space triangle soup (for BVH builds). */
  worldGeometry(): Geometry {
    const g = this.geometry;
    const n = g.positions.length / 3;
    const positions = new Float32Array(g.positions.length);
    const normals = new Float32Array(g.normals.length);
    const worldTransform = this.getWorldTransform();
    const nrmMat = mat4NormalMatrix(worldTransform);
    for (let i = 0; i < n; i++) {
      const p = transformPoint(worldTransform, [
        g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2],
      ]);
      positions[i * 3] = p[0];
      positions[i * 3 + 1] = p[1];
      positions[i * 3 + 2] = p[2];
      const nn = normalize(transformDirection(nrmMat, [
        g.normals[i * 3], g.normals[i * 3 + 1], g.normals[i * 3 + 2],
      ]));
      normals[i * 3] = nn[0];
      normals[i * 3 + 1] = nn[1];
      normals[i * 3 + 2] = nn[2];
    }
    return { positions, normals, uvs: g.uvs, indices: g.indices };
  }
}
