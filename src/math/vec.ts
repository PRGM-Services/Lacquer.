/**
 * Minimal, allocation-light linear algebra used across the engine.
 * Vectors are plain [x, y, z] tuples; matrices are column-major
 * Float32Array(16), matching WGSL/GLSL conventions.
 */

export type Vec3 = [number, number, number];
export type Mat4 = Float32Array;

export const v3 = (x = 0, y = 0, z = 0): Vec3 => [x, y, z];

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}
export function mul(a: Vec3, b: Vec3): Vec3 {
  return [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
}
export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}
export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 0];
}
export function min3(a: Vec3, b: Vec3): Vec3 {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
}
export function max3(a: Vec3, b: Vec3): Vec3 {
  return [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
}

/* ------------------------------- Mat4 ---------------------------------- */

export function mat4Identity(): Mat4 {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

/** out = a * b (column-major). */
export function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

export function mat4Translation(t: Vec3): Mat4 {
  const m = mat4Identity();
  m[12] = t[0];
  m[13] = t[1];
  m[14] = t[2];
  return m;
}

export function mat4Scale(s: Vec3): Mat4 {
  const m = mat4Identity();
  m[0] = s[0];
  m[5] = s[1];
  m[10] = s[2];
  return m;
}

/** Rotation around an arbitrary normalized axis by `rad` radians. */
export function mat4AxisRotation(axis: Vec3, rad: number): Mat4 {
  const [x, y, z] = normalize(axis);
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const t = 1 - c;
  const m = mat4Identity();
  m[0] = t * x * x + c;
  m[1] = t * x * y + s * z;
  m[2] = t * x * z - s * y;
  m[4] = t * x * y - s * z;
  m[5] = t * y * y + c;
  m[6] = t * y * z + s * x;
  m[8] = t * x * z + s * y;
  m[9] = t * y * z - s * x;
  m[10] = t * z * z + c;
  return m;
}

export function mat4Compose(translation: Vec3, rotation: Mat4, scl: Vec3): Mat4 {
  return mat4Multiply(
    mat4Translation(translation),
    mat4Multiply(rotation, mat4Scale(scl)),
  );
}

/** General 4x4 inverse (Gauss-Jordan free, cofactor based). */
export function mat4Invert(m: Mat4): Mat4 {
  const inv = new Float32Array(16);
  const a = m;
  inv[0] =
    a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] +
    a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10];
  inv[4] =
    -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] -
    a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10];
  inv[8] =
    a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] +
    a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9];
  inv[12] =
    -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] -
    a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9];
  inv[1] =
    -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15] -
    a[9] * a[3] * a[14] - a[13] * a[2] * a[11] + a[13] * a[3] * a[10];
  inv[5] =
    a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15] +
    a[8] * a[3] * a[14] + a[12] * a[2] * a[11] - a[12] * a[3] * a[10];
  inv[9] =
    -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15] -
    a[8] * a[3] * a[13] - a[12] * a[1] * a[11] + a[12] * a[3] * a[9];
  inv[13] =
    a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] +
    a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9];
  inv[2] =
    a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15] +
    a[5] * a[3] * a[14] + a[13] * a[2] * a[7] - a[13] * a[3] * a[6];
  inv[6] =
    -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15] -
    a[4] * a[3] * a[14] - a[12] * a[2] * a[7] + a[12] * a[3] * a[6];
  inv[10] =
    a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15] +
    a[4] * a[3] * a[13] + a[12] * a[1] * a[7] - a[12] * a[3] * a[5];
  inv[14] =
    -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] -
    a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5];
  inv[3] =
    -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[2] * a[11] -
    a[5] * a[3] * a[10] - a[9] * a[2] * a[7] + a[9] * a[3] * a[6];
  inv[7] =
    a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11] +
    a[4] * a[3] * a[10] + a[8] * a[2] * a[7] - a[8] * a[3] * a[6];
  inv[11] =
    -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11] -
    a[4] * a[3] * a[9] - a[8] * a[1] * a[7] + a[8] * a[3] * a[5];
  inv[15] =
    a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10] +
    a[4] * a[2] * a[9] + a[8] * a[1] * a[6] - a[8] * a[2] * a[5];

  let det = a[0] * inv[0] + a[1] * inv[4] + a[2] * inv[8] + a[3] * inv[12];
  if (Math.abs(det) < 1e-20) return mat4Identity();
  det = 1 / det;
  for (let i = 0; i < 16; i++) inv[i] *= det;
  return inv;
}

export function transformPoint(m: Mat4, p: Vec3): Vec3 {
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15] || 1;
  return [
    (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w,
    (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w,
    (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]) / w,
  ];
}

/** Transform a direction by the upper 3x3 (no translation). */
export function transformDirection(m: Mat4, d: Vec3): Vec3 {
  return [
    m[0] * d[0] + m[4] * d[1] + m[8] * d[2],
    m[1] * d[0] + m[5] * d[1] + m[9] * d[2],
    m[2] * d[0] + m[6] * d[1] + m[10] * d[2],
  ];
}

/**
 * Normal matrix as the inverse-transpose of the upper 3x3, returned as a
 * full Mat4 so it can be used with transformDirection.
 */
export function mat4NormalMatrix(m: Mat4): Mat4 {
  const inv = mat4Invert(m);
  const out = mat4Identity();
  // transpose of inverse, upper 3x3 only
  out[0] = inv[0]; out[1] = inv[4]; out[2] = inv[8];
  out[4] = inv[1]; out[5] = inv[5]; out[6] = inv[9];
  out[8] = inv[2]; out[9] = inv[6]; out[10] = inv[10];
  return out;
}

/* ------------------------------ Quaternions ----------------------------- */

/** [x, y, z, w] */
export type Quat = [number, number, number, number];

export const quatIdentity = (): Quat => [0, 0, 0, 1];

export function quatFromAxisAngle(axis: Vec3, rad: number): Quat {
  const [x, y, z] = normalize(axis);
  const s = Math.sin(rad / 2);
  return [x * s, y * s, z * s, Math.cos(rad / 2)];
}

export function quatMultiply(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

export function quatNormalize(q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

export function quatToMat4(q: Quat): Mat4 {
  const [x, y, z, w] = q;
  const m = mat4Identity();
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  m[0] = 1 - (yy + zz); m[1] = xy + wz; m[2] = xz - wy;
  m[4] = xy - wz; m[5] = 1 - (xx + zz); m[6] = yz + wx;
  m[8] = xz + wy; m[9] = yz - wx; m[10] = 1 - (xx + yy);
  return m;
}

/** Rotation part of a (rotation-only, orthonormal) matrix to quaternion. */
export function quatFromMat4(m: Mat4): Quat {
  const t = m[0] + m[5] + m[10];
  let q: Quat;
  if (t > 0) {
    const s = Math.sqrt(t + 1) * 2;
    q = [(m[6] - m[9]) / s, (m[8] - m[2]) / s, (m[1] - m[4]) / s, s / 4];
  } else if (m[0] > m[5] && m[0] > m[10]) {
    const s = Math.sqrt(1 + m[0] - m[5] - m[10]) * 2;
    q = [s / 4, (m[4] + m[1]) / s, (m[8] + m[2]) / s, (m[6] - m[9]) / s];
  } else if (m[5] > m[10]) {
    const s = Math.sqrt(1 + m[5] - m[0] - m[10]) * 2;
    q = [(m[4] + m[1]) / s, s / 4, (m[9] + m[6]) / s, (m[8] - m[2]) / s];
  } else {
    const s = Math.sqrt(1 + m[10] - m[0] - m[5]) * 2;
    q = [(m[8] + m[2]) / s, (m[9] + m[6]) / s, s / 4, (m[1] - m[4]) / s];
  }
  return quatNormalize(q);
}

/** Compose local matrix from TRS. */
/** Quaternion from XYZ euler angles (radians), composed R = Rz·Ry·Rx. */
export function quatFromEuler(x: number, y: number, z: number): Quat {
  const cx = Math.cos(x / 2), sx = Math.sin(x / 2);
  const cy = Math.cos(y / 2), sy = Math.sin(y / 2);
  const cz = Math.cos(z / 2), sz = Math.sin(z / 2);
  return quatNormalize([
    sx * cy * cz - cx * sy * sz,
    cx * sy * cz + sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz,
  ]);
}

/** XYZ euler angles (radians) from a quaternion; inverse of quatFromEuler. */
export function eulerFromQuat(q: Quat): Vec3 {
  const [x, y, z, w] = q;
  const sinp = 2 * (w * y - z * x);
  const yr = Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp);
  const xr = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y));
  const zr = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
  return [xr, yr, zr];
}

export function mat4FromTRS(t: Vec3, q: Quat, s: Vec3): Mat4 {
  const m = quatToMat4(q);
  m[0] *= s[0]; m[1] *= s[0]; m[2] *= s[0];
  m[4] *= s[1]; m[5] *= s[1]; m[6] *= s[1];
  m[8] *= s[2]; m[9] *= s[2]; m[10] *= s[2];
  m[12] = t[0]; m[13] = t[1]; m[14] = t[2];
  return m;
}

/**
 * Decompose an affine matrix into TRS (shear is discarded; negative
 * determinant flips the X scale so mirrored nodes survive round-trips).
 */
export function mat4DecomposeTRS(m: Mat4): { position: Vec3; quaternion: Quat; scale: Vec3 } {
  const position: Vec3 = [m[12], m[13], m[14]];
  let sx = Math.hypot(m[0], m[1], m[2]);
  const sy = Math.hypot(m[4], m[5], m[6]);
  const sz = Math.hypot(m[8], m[9], m[10]);
  const det =
    m[0] * (m[5] * m[10] - m[6] * m[9]) -
    m[4] * (m[1] * m[10] - m[2] * m[9]) +
    m[8] * (m[1] * m[6] - m[2] * m[5]);
  if (det < 0) sx = -sx;
  const r = mat4Identity();
  const isx = sx ? 1 / sx : 0, isy = sy ? 1 / sy : 0, isz = sz ? 1 / sz : 0;
  r[0] = m[0] * isx; r[1] = m[1] * isx; r[2] = m[2] * isx;
  r[4] = m[4] * isy; r[5] = m[5] * isy; r[6] = m[6] * isy;
  r[8] = m[8] * isz; r[9] = m[9] * isz; r[10] = m[10] * isz;
  return { position, quaternion: quatFromMat4(r), scale: [sx, sy, sz] };
}

export function mat4LookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const f = normalize(sub(target, eye));
  const r = normalize(cross(f, up));
  const u = cross(r, f);
  const m = mat4Identity();
  m[0] = r[0]; m[1] = u[0]; m[2] = -f[0];
  m[4] = r[1]; m[5] = u[1]; m[6] = -f[1];
  m[8] = r[2]; m[9] = u[2]; m[10] = -f[2];
  m[12] = -dot(r, eye);
  m[13] = -dot(u, eye);
  m[14] = dot(f, eye);
  return m;
}

export function mat4Perspective(fovYRad: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovYRad / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}
