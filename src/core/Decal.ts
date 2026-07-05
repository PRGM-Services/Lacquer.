import {
  Mat4,
  Vec3,
  mat4AxisRotation,
  mat4Compose,
  mat4Invert,
  mat4Multiply,
} from "../math/vec";

/**
 * Projected decal for liveries, sponsor logos, race numbers, etc.
 *
 * A decal is an oriented box projector: `position` is the box center,
 * `size` is [width, height, depth] in world units, and the texture is
 * projected along the box's -Z axis. Any surface point falling inside the
 * box receives the decal, alpha-blended over the material's base color.
 *
 * Decals are assigned PER MESH (see Mesh.decals). A decal only ever affects
 * the meshes it is explicitly attached to, so a door livery can never bleed
 * onto the fender behind it — the exact "no overlap onto other meshes"
 * guarantee automotive livery workflows need. `angleCutoffDeg` additionally
 * fades the decal out on surfaces that face away from the projector to avoid
 * smearing across silhouettes of the same mesh.
 */
export class Decal {
  /** RGBA image; alpha controls blending. */
  image: ImageBitmap | HTMLCanvasElement | HTMLImageElement | OffscreenCanvas;
  position: Vec3;
  /** Rotation applied to the projector box (defaults to identity). */
  rotation: Mat4;
  /** [width, height, projection depth] in world units. */
  size: Vec3;
  /** Overall opacity multiplier, 0..1. */
  opacity: number;
  /** Surfaces whose normal deviates more than this from the projection
   *  direction are not decaled (prevents stretching). */
  angleCutoffDeg: number;
  /** Extra roughness applied where the decal is opaque (vinyl vs paint). */
  roughness: number;

  constructor(opts: {
    image: Decal["image"];
    position: Vec3;
    rotation?: Mat4;
    size?: Vec3;
    opacity?: number;
    angleCutoffDeg?: number;
    roughness?: number;
  }) {
    this.image = opts.image;
    this.position = opts.position;
    this.rotation = opts.rotation ?? mat4AxisRotation([0, 1, 0], 0);
    this.size = opts.size ?? [1, 1, 0.5];
    this.opacity = opts.opacity ?? 1;
    this.angleCutoffDeg = opts.angleCutoffDeg ?? 80;
    this.roughness = opts.roughness ?? 0.35;
  }

  /**
   * World -> decal-local matrix. Inside the projector, local coordinates
   * span [-0.5, 0.5]^3; (x+0.5, 0.5-y) are the texture UVs and -Z is the
   * projection direction.
   */
  worldToDecal(): Mat4 {
    const decalToWorld = mat4Compose(this.position, this.rotation, this.size);
    return mat4Invert(decalToWorld);
  }

  /** Projection direction in world space (decal-local -Z). */
  projectionDir(): Vec3 {
    const r = this.rotation;
    return [-r[8], -r[9], -r[10]];
  }

  /** Convenience: rotate the projector to face along `dir`. */
  static rotationFromDir(dir: Vec3): Mat4 {
    // Build a rotation whose -Z axis points along dir.
    const z: Vec3 = [-dir[0], -dir[1], -dir[2]];
    const lenXZ = Math.hypot(z[0], z[2]);
    const yaw = Math.atan2(z[0], z[2]);
    const pitch = -Math.atan2(z[1], lenXZ);
    return mat4Multiply(
      mat4AxisRotation([0, 1, 0], yaw),
      mat4AxisRotation([1, 0, 0], pitch),
    );
  }
}
