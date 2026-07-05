import { Vec3, add, length, normalize, scale, sub } from "../math/vec";

export type LightType = "point" | "spot" | "directional" | "rect" | "octagon";

/**
 * Scene light. Both backends evaluate these analytically:
 *  - point: intensity is radiant intensity (W/sr), falls off with 1/d²
 *  - spot: point light windowed to a cone (smooth inner→outer falloff)
 *  - directional: intensity is irradiance (W/m²), no falloff — a sun
 *  - rect / octagon: one-sided planar AREA lights (softboxes). The path
 *    tracer samples points across the shape, giving true soft shadows;
 *    `width`/`height` set the extent (octagon uses width as its diameter).
 *
 * The path tracer samples them with shadow rays at every bounce; the raster
 * backend adds them unshadowed (area lights as one-sided center points).
 */
export class Light {
  type: LightType;
  name: string;
  /** Linear-space color (chromaticity; scaled by intensity). */
  color: [number, number, number];
  intensity: number;
  position: Vec3;
  /** World-space aim point. Spot/directional/area lights emit from `position`
   *  toward `target`, so pointing a light is just moving its target. */
  target: Vec3;
  /** Spot outer cone half-angle in degrees. */
  angleDeg: number;
  /** 0 = hard cone edge, 1 = falloff starts at the axis. */
  softness: number;
  /** Area light extent along the shape's local X (octagon: diameter). */
  width: number;
  /** Area light extent along the shape's local Y (rect only). */
  height: number;
  /** When true the light aims at a fixed `target` (a focus point): moving the
   *  body orbits around it. When false the aim is free — moving the body
   *  carries the direction and you rotate the body to re-aim. */
  targeted: boolean;
  visible = true;

  constructor(type: LightType, opts: Partial<Omit<Light, "type">> = {}) {
    this.type = type;
    this.name = opts.name ?? type;
    this.color = opts.color ?? [1, 1, 1];
    this.intensity = opts.intensity ??
      (type === "directional" ? 3 : type === "spot" ? 40 : 20);
    this.position = opts.position ?? [0, 2.5, 0];
    // Prefer an explicit target; otherwise derive one from a direction.
    if (opts.target) {
      this.target = opts.target;
    } else {
      const dir = normalize(opts.direction ?? [0, -1, 0]);
      this.target = add(this.position, scale(dir, 3));
    }
    this.angleDeg = opts.angleDeg ?? 30;
    this.softness = opts.softness ?? 0.3;
    this.width = opts.width ?? 1;
    this.height = opts.height ?? 0.6;
    this.targeted = opts.targeted ?? true;
    if (opts.visible !== undefined) this.visible = opts.visible;
  }

  /** Unit emission direction (position → target); used by both backends. */
  get direction(): Vec3 {
    return normalize(sub(this.target, this.position));
  }
  /** Setting a direction repositions the target, preserving throw distance. */
  set direction(dir: Vec3) {
    const dist = length(sub(this.target, this.position)) || 3;
    this.target = add(this.position, scale(normalize(dir), dist));
  }

  /** Emitter surface area, used to scale brightness so a bigger softbox
   *  emits more total light. Returns 1 for non-area lights (no scaling). */
  emitterArea(): number {
    if (this.type === "rect") return Math.max(1e-4, this.width * this.height);
    if (this.type === "octagon") {
      const r = this.width / 2; // regular octagon area = 2√2 · R²
      return Math.max(1e-4, 2 * Math.SQRT2 * r * r);
    }
    return 1;
  }

  /** Cosines of the outer / inner cone angles (spot falloff window). */
  coneCosines(): { outer: number; inner: number } {
    const outer = Math.cos((this.angleDeg * Math.PI) / 180);
    const innerAngle = (this.angleDeg * (1 - this.softness) * Math.PI) / 180;
    return { outer, inner: Math.cos(Math.max(innerAngle, 0.001)) };
  }
}
