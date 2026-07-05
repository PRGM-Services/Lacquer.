import { Vec3, add, cross, normalize, scale, sub } from "../math/vec";

/**
 * Physically parameterized perspective camera with thin-lens depth of field.
 * `aperture` is the lens radius in world units (0 = pinhole); `focusDistance`
 * is the distance to the plane of perfect focus.
 */
export class Camera {
  position: Vec3 = [4, 1.5, 5];
  target: Vec3 = [0, 0.4, 0];
  up: Vec3 = [0, 1, 0];
  /** Vertical field of view in degrees. */
  fovYDeg = 40;
  aperture = 0;
  focusDistance = 6;

  /** Orthonormal basis: forward, right, up. */
  basis(): { forward: Vec3; right: Vec3; up: Vec3 } {
    const forward = normalize(sub(this.target, this.position));
    const right = normalize(cross(forward, this.up));
    const up = cross(right, forward);
    return { forward, right, up };
  }

  /** Orbit around the target (spherical coordinates), used by controls. */
  orbit(dYaw: number, dPitch: number): void {
    const offset = sub(this.position, this.target);
    const radius = Math.hypot(offset[0], offset[1], offset[2]);
    let yaw = Math.atan2(offset[0], offset[2]);
    let pitch = Math.asin(Math.max(-1, Math.min(1, offset[1] / radius)));
    yaw += dYaw;
    pitch = Math.max(-1.45, Math.min(1.45, pitch + dPitch));
    this.position = add(this.target, [
      radius * Math.cos(pitch) * Math.sin(yaw),
      radius * Math.sin(pitch),
      radius * Math.cos(pitch) * Math.cos(yaw),
    ]);
  }

  dolly(factor: number): void {
    const offset = sub(this.position, this.target);
    const r = Math.max(0.3, Math.min(80, Math.hypot(...offset) * factor));
    this.position = add(this.target, scale(normalize(offset), r));
  }

  pan(dx: number, dy: number): void {
    const { right, up } = this.basis();
    const move = add(scale(right, dx), scale(up, dy));
    this.position = add(this.position, move);
    this.target = add(this.target, move);
  }
}
