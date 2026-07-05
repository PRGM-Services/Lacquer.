/**
 * Image-based lighting environment.
 *
 * Holds an equirectangular radiance map (linear float RGB) plus the
 * precomputed 2D CDF tables the path tracer uses for luminance-weighted
 * importance sampling of the environment (marginal CDF over rows, conditional
 * CDF within each row, both weighted by sin(theta) solid-angle terms).
 *
 * Sources:
 *  - `Environment.fromHDR(buffer)` parses Radiance .hdr (RGBE) files.
 *  - `Environment.proceduralSky()` synthesizes a studio-ish sky with a sun
 *    disc so the engine lights correctly with zero external assets.
 */
export class Environment {
  width: number;
  height: number;
  /** RGB float triplets, row-major, linear radiance. */
  data: Float32Array;
  /** Multiplier applied at render time. */
  intensity = 1;
  /** Rotation around Y in radians. */
  rotation = 0;

  /** length = height; cumulative over rows (normalized to 1 at the end). */
  marginalCDF: Float32Array;
  /** length = width * height; per-row cumulative (normalized per row). */
  conditionalCDF: Float32Array;
  /** Average luminance weighted by solid angle — normalizes the sampling pdf. */
  totalWeight: number;

  constructor(width: number, height: number, data: Float32Array) {
    this.width = width;
    this.height = height;
    this.data = data;
    const { marginal, conditional, total } = Environment.buildCDF(width, height, data);
    this.marginalCDF = marginal;
    this.conditionalCDF = conditional;
    this.totalWeight = total;
  }

  private static buildCDF(w: number, h: number, data: Float32Array) {
    const marginal = new Float32Array(h);
    const conditional = new Float32Array(w * h);
    let total = 0;
    for (let y = 0; y < h; y++) {
      // sin(theta) accounts for equirect texel solid angle.
      const sinTheta = Math.sin((Math.PI * (y + 0.5)) / h);
      let rowSum = 0;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 3;
        const lum =
          (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) * sinTheta;
        rowSum += lum;
        conditional[y * w + x] = rowSum;
      }
      if (rowSum > 0) {
        for (let x = 0; x < w; x++) conditional[y * w + x] /= rowSum;
      } else {
        for (let x = 0; x < w; x++) conditional[y * w + x] = (x + 1) / w;
      }
      total += rowSum;
      marginal[y] = total;
    }
    if (total > 0) {
      for (let y = 0; y < h; y++) marginal[y] /= total;
    } else {
      for (let y = 0; y < h; y++) marginal[y] = (y + 1) / h;
    }
    // Average luminance over the sphere; the pdf in the shader divides by this.
    // Each texel covers (2*pi/w)*(pi/h) steradians before the sin weight.
    const avg = (total / (w * h)) * ((2 * Math.PI * Math.PI) / 1); // see shader
    return { marginal, conditional, total: avg };
  }

  /* ------------------------- Radiance .hdr parser ------------------------ */

  static fromHDR(buffer: ArrayBuffer): Environment {
    const bytes = new Uint8Array(buffer);
    let pos = 0;

    const readLine = (): string => {
      let s = "";
      while (pos < bytes.length) {
        const c = bytes[pos++];
        if (c === 0x0a) break;
        s += String.fromCharCode(c);
      }
      return s;
    };

    const magic = readLine();
    if (!magic.startsWith("#?RADIANCE") && !magic.startsWith("#?RGBE")) {
      throw new Error("Not a Radiance .hdr file");
    }
    let line = readLine();
    while (line !== "") {
      // skip header (FORMAT, EXPOSURE, comments) until the blank line
      line = readLine();
    }
    const dims = readLine();
    const m = dims.match(/-Y\s+(\d+)\s+\+X\s+(\d+)/);
    if (!m) throw new Error(`Unsupported .hdr orientation: "${dims}"`);
    const height = parseInt(m[1], 10);
    const width = parseInt(m[2], 10);

    const data = new Float32Array(width * height * 3);
    const rgbe = new Uint8Array(4);

    const writeTexel = (idx: number) => {
      const e = rgbe[3];
      if (e === 0) {
        data[idx] = data[idx + 1] = data[idx + 2] = 0;
      } else {
        const f = Math.pow(2, e - 136); // 2^(e-128) / 256
        data[idx] = rgbe[0] * f;
        data[idx + 1] = rgbe[1] * f;
        data[idx + 2] = rgbe[2] * f;
      }
    };

    for (let y = 0; y < height; y++) {
      // New-style RLE scanline?
      if (
        width >= 8 && width < 32768 &&
        bytes[pos] === 2 && bytes[pos + 1] === 2 &&
        ((bytes[pos + 2] << 8) | bytes[pos + 3]) === width
      ) {
        pos += 4;
        const row = new Uint8Array(width * 4);
        for (let ch = 0; ch < 4; ch++) {
          let x = 0;
          while (x < width) {
            let count = bytes[pos++];
            if (count > 128) {
              count -= 128;
              const v = bytes[pos++];
              for (let i = 0; i < count; i++) row[(x++) * 4 + ch] = v;
            } else {
              for (let i = 0; i < count; i++) row[(x++) * 4 + ch] = bytes[pos++];
            }
          }
        }
        for (let x = 0; x < width; x++) {
          rgbe[0] = row[x * 4];
          rgbe[1] = row[x * 4 + 1];
          rgbe[2] = row[x * 4 + 2];
          rgbe[3] = row[x * 4 + 3];
          writeTexel((y * width + x) * 3);
        }
      } else {
        // Flat (or old-style RLE) scanlines.
        for (let x = 0; x < width; x++) {
          rgbe[0] = bytes[pos++];
          rgbe[1] = bytes[pos++];
          rgbe[2] = bytes[pos++];
          rgbe[3] = bytes[pos++];
          writeTexel((y * width + x) * 3);
        }
      }
    }
    return new Environment(width, height, data);
  }

  /* --------------------------- Procedural sky ---------------------------- */

  /**
   * Analytic clear-sky gradient + sun disc + soft ground bounce. Not a full
   * Hosek-Wilkie fit, but spectrally plausible and pleasant for car paint.
   */
  static proceduralSky(opts: {
    width?: number;
    height?: number;
    sunDir?: [number, number, number];
    sunIntensity?: number;
    turbidity?: number;
  } = {}): Environment {
    const w = opts.width ?? 1024;
    const h = opts.height ?? 512;
    const sunI = opts.sunIntensity ?? 80;
    const t = opts.turbidity ?? 2.5;
    let sd = opts.sunDir ?? [0.35, 0.55, 0.55];
    const sl = Math.hypot(sd[0], sd[1], sd[2]);
    sd = [sd[0] / sl, sd[1] / sl, sd[2] / sl];

    const data = new Float32Array(w * h * 3);
    const horizon = [0.85, 0.82, 0.78];
    const zenith = [0.18, 0.32, 0.62];
    const ground = [0.22, 0.2, 0.18];

    for (let y = 0; y < h; y++) {
      const theta = (Math.PI * (y + 0.5)) / h; // 0 = up
      const cy = Math.cos(theta);
      const sy = Math.sin(theta);
      for (let x = 0; x < w; x++) {
        const phi = (2 * Math.PI * (x + 0.5)) / w - Math.PI;
        const dir = [sy * Math.sin(phi), cy, sy * Math.cos(phi)];
        let r: number, g: number, b: number;
        if (dir[1] >= 0) {
          // Sky: horizon->zenith gradient with turbidity-driven haze.
          const k = Math.pow(Math.max(0, dir[1]), 1 / (0.6 + 0.2 * t));
          r = horizon[0] + (zenith[0] - horizon[0]) * k;
          g = horizon[1] + (zenith[1] - horizon[1]) * k;
          b = horizon[2] + (zenith[2] - horizon[2]) * k;
          const cosSun = dir[0] * sd[0] + dir[1] * sd[1] + dir[2] * sd[2];
          // Circumsolar glow
          const glow = Math.pow(Math.max(0, cosSun), 64) * 0.6;
          r += glow * 1.0; g += glow * 0.85; b += glow * 0.6;
          // Sun disc (~0.5 deg angular radius)
          if (cosSun > 0.99996) {
            r += sunI; g += sunI * 0.94; b += sunI * 0.82;
          }
        } else {
          // Ground bounce, darkening toward nadir.
          const k = Math.min(1, -dir[1] * 1.6);
          r = ground[0] * (1 - 0.5 * k);
          g = ground[1] * (1 - 0.5 * k);
          b = ground[2] * (1 - 0.5 * k);
        }
        const i = (y * w + x) * 3;
        data[i] = r; data[i + 1] = g; data[i + 2] = b;
      }
    }
    return new Environment(w, h, data);
  }
}
