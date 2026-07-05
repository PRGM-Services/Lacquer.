import { Camera } from "./Camera";
import {
  Vec3,
  Mat4,
  Quat,
  add,
  cross,
  dot,
  length,
  mat4DecomposeTRS,
  mat4FromTRS,
  mat4Identity,
  mat4Invert,
  normalize,
  scale,
  sub,
  transformDirection,
  quatMultiply,
  quatFromAxisAngle,
} from "../math/vec";

export type GizmoMode = "translate" | "rotate" | "scale";
export type GizmoAxis = "x" | "y" | "z" | "xyz" | null;

/** World-space picking ray (unprojected by the host app from the pointer). */
export interface GizmoRay {
  origin: Vec3;
  direction: Vec3;
}

/**
 * Anything the gizmo can manipulate: a local TRS `transform`, an optional
 * parent (for world/local conversion), and a world transform. Mesh satisfies
 * this directly; other objects (decal projectors, lights, cameras) can adapt
 * themselves with a tiny wrapper.
 */
export interface GizmoTarget {
  transform: Mat4;
  parent?: { getWorldTransform(): Mat4 } | null;
  getWorldTransform(): Mat4;
}

const LOCAL_AXES: Record<"x" | "y" | "z", Vec3> = {
  x: [1, 0, 0],
  y: [0, 1, 0],
  z: [0, 0, 1],
};

/**
 * Transform-manipulation gizmo for anything exposing a GizmoTarget.
 *
 * The gizmo is pure math + state: the host app renders its geometry (see
 * getGizmoGeometry) however it likes and feeds pointer input back in as
 * world-space rays. Axes follow the target's local orientation; drags edit
 * the target's LOCAL transform, so manipulating a child of a rotated/scaled
 * parent behaves correctly.
 */
export class Gizmo {
  mode: GizmoMode = "translate";
  /** Fired after every drag update — hook progressive-render invalidation here. */
  onChange: (() => void) | null = null;

  /** Snapping: quantized grid movement / angle steps / scale steps. */
  snapEnabled = false;
  /** Translation grid size in world units. */
  snapTranslate = 0.25;
  /** Rotation increment in degrees. */
  snapRotateDeg = 15;
  /** Scale factor increment. */
  snapScale = 0.1;

  private target: GizmoTarget | null = null;
  private activeAxis: GizmoAxis = null;
  private dragStart: Vec3 | null = null;
  private planeNormal: Vec3 = [0, 1, 0];
  private origin: Vec3 = [0, 0, 0];
  private initial: { position: Vec3; quaternion: Quat; scale: Vec3 } | null = null;
  private parentInverse: Mat4 = mat4Identity();
  private worldAxis: Vec3 = [1, 0, 0];

  setTarget(target: GizmoTarget | null): void {
    this.target = target;
    this.endDrag();
  }

  getTarget(): GizmoTarget | null {
    return this.target;
  }

  isDragging(): boolean {
    return this.activeAxis !== null && this.dragStart !== null;
  }

  getActiveAxis(): GizmoAxis {
    return this.activeAxis;
  }

  /** Begin manipulating along `axis`. Returns false if the ray misses. */
  startDrag(axis: GizmoAxis, ray: GizmoRay): boolean {
    if (!this.target || !axis) return false;
    const world = this.target.getWorldTransform();
    this.origin = [world[12], world[13], world[14]];
    this.initial = mat4DecomposeTRS(this.target.transform);
    this.parentInverse = this.target.parent
      ? mat4Invert(this.target.parent.getWorldTransform())
      : mat4Identity();

    if (axis !== "xyz") {
      this.worldAxis = normalize(transformDirection(world, LOCAL_AXES[axis]));
    }

    if (this.mode === "rotate" && axis !== "xyz") {
      // Drag around the ring: the ring's own plane.
      this.planeNormal = this.worldAxis;
    } else if (axis === "xyz") {
      // Screen-aligned plane.
      this.planeNormal = scale(ray.direction, -1);
    } else {
      // Plane that contains the axis and faces the camera as much as
      // possible — stable regardless of view direction.
      const t = cross(this.worldAxis, ray.direction);
      if (length(t) < 1e-5) return false; // axis parallel to view
      this.planeNormal = normalize(cross(t, this.worldAxis));
    }

    const hit = this.intersectPlane(ray);
    if (!hit) return false;
    this.activeAxis = axis;
    this.dragStart = hit;
    return true;
  }

  updateDrag(ray: GizmoRay): void {
    if (!this.target || !this.activeAxis || !this.dragStart || !this.initial) return;
    const hit = this.intersectPlane(ray);
    if (!hit) return;

    if (this.mode === "translate") this.applyTranslate(hit);
    else if (this.mode === "rotate") this.applyRotate(hit);
    else this.applyScale(hit);
    this.onChange?.();
  }

  endDrag(): void {
    this.activeAxis = null;
    this.dragStart = null;
    this.initial = null;
  }

  /* ------------------------------ operations ----------------------------- */

  private applyTranslate(hit: Vec3): void {
    const t = this.target!;
    const init = this.initial!;
    const delta = sub(hit, this.dragStart!);
    let movement: Vec3;
    if (this.activeAxis === "xyz") {
      movement = this.snapEnabled
        ? [this.snapVal(delta[0], this.snapTranslate),
           this.snapVal(delta[1], this.snapTranslate),
           this.snapVal(delta[2], this.snapTranslate)]
        : delta;
    } else {
      let amount = dot(delta, this.worldAxis);
      if (this.snapEnabled) amount = this.snapVal(amount, this.snapTranslate);
      movement = scale(this.worldAxis, amount);
    }
    // World delta -> parent space so children of transformed groups move
    // under the cursor, not along some scaled/rotated phantom axis.
    const localDelta = transformDirection(this.parentInverse, movement);
    t.transform = mat4FromTRS(add(init.position, localDelta), init.quaternion, init.scale);
  }

  private applyRotate(hit: Vec3): void {
    const t = this.target!;
    const init = this.initial!;
    if (this.activeAxis === "xyz") return;
    const v0 = sub(this.dragStart!, this.origin);
    const v1 = sub(hit, this.origin);
    if (length(v0) < 1e-6 || length(v1) < 1e-6) return;
    let angle = Math.atan2(dot(cross(v0, v1), this.worldAxis), dot(v0, v1));
    if (this.snapEnabled) {
      angle = this.snapVal(angle, (this.snapRotateDeg * Math.PI) / 180);
    }
    // Gizmo axes are the target's local axes, so compose in local space.
    const dq = quatFromAxisAngle(LOCAL_AXES[this.activeAxis as "x" | "y" | "z"], angle);
    t.transform = mat4FromTRS(init.position, quatMultiply(init.quaternion, dq), init.scale);
  }

  private applyScale(hit: Vec3): void {
    const t = this.target!;
    const init = this.initial!;
    let f: number;
    if (this.activeAxis === "xyz") {
      const d0 = length(sub(this.dragStart!, this.origin));
      f = d0 > 1e-6 ? length(sub(hit, this.origin)) / d0 : 1;
    } else {
      const a0 = dot(sub(this.dragStart!, this.origin), this.worldAxis);
      const a1 = dot(sub(hit, this.origin), this.worldAxis);
      f = Math.abs(a0) > 1e-6 ? a1 / a0 : 1;
    }
    if (this.snapEnabled) f = this.snapVal(f, this.snapScale) || this.snapScale;
    f = Math.max(0.01, Math.min(100, f));
    const s: Vec3 = [...init.scale];
    if (this.activeAxis === "xyz") {
      s[0] *= f; s[1] *= f; s[2] *= f;
    } else {
      const i = this.activeAxis === "x" ? 0 : this.activeAxis === "y" ? 1 : 2;
      s[i] *= f;
    }
    t.transform = mat4FromTRS(init.position, init.quaternion, s);
  }

  private snapVal(v: number, step: number): number {
    return Math.round(v / step) * step;
  }

  private intersectPlane(ray: GizmoRay): Vec3 | null {
    const denom = dot(this.planeNormal, ray.direction);
    if (Math.abs(denom) < 1e-8) return null;
    const t = dot(sub(this.origin, ray.origin), this.planeNormal) / denom;
    if (t < 0) return null;
    return add(ray.origin, scale(ray.direction, t));
  }

  /* ------------------------------- geometry ------------------------------ */

  /** Data the host app needs to draw the gizmo (world space). */
  getGizmoGeometry(camera: Camera): GizmoGeometry | null {
    if (!this.target) return null;
    const world = this.target.getWorldTransform();
    const position: Vec3 = [world[12], world[13], world[14]];
    const distToCamera = length(sub(camera.position, position));
    return {
      position,
      size: distToCamera * 0.16,
      mode: this.mode,
      activeAxis: this.activeAxis,
      axes: {
        x: normalize(transformDirection(world, [1, 0, 0])),
        y: normalize(transformDirection(world, [0, 1, 0])),
        z: normalize(transformDirection(world, [0, 0, 1])),
      },
    };
  }
}

export interface GizmoGeometry {
  position: Vec3;
  size: number;
  mode: GizmoMode;
  activeAxis: GizmoAxis;
  axes: {
    x: Vec3;
    y: Vec3;
    z: Vec3;
  };
}
