/**
 * Physically based material model tuned for automotive visualization.
 *
 * The lighting model is energy-conserving and grounded in microfacet theory:
 *  - Lambertian diffuse for the dielectric base
 *  - GGX (Trowbridge-Reitz) specular with the Smith height-correlated
 *    visibility term and Schlick Fresnel
 *  - A second GGX clearcoat lobe (fixed IOR 1.5) layered on top, exactly the
 *    thing that makes car paint look like car paint
 *  - Smooth dielectric transmission (glass, headlight covers) driven by `ior`
 *  - Procedural metallic-flake sparkle for metallic paints
 *
 * All parameters are in physically meaningful ranges; nothing here is an
 * ad-hoc "shininess" style hack.
 */
/** Any drawable image source usable as a material texture. */
export type MaterialImage =
  | ImageBitmap
  | HTMLCanvasElement
  | HTMLImageElement
  | OffscreenCanvas;

export interface MaterialProps {
  name?: string;
  /** Linear-space albedo / specular tint for metals. */
  baseColor?: [number, number, number];
  /** 0 = dielectric, 1 = metal. */
  metallic?: number;
  /** Perceptual roughness, remapped internally to alpha = roughness^2. */
  roughness?: number;
  /** Clearcoat lobe weight, 0..1. Automotive paint typically 1.0. */
  clearcoat?: number;
  /** Roughness of the clearcoat lobe (usually very low: 0.02-0.1). */
  clearcoatRoughness?: number;
  /** 0..1 weight of specular transmission (glass). */
  transmission?: number;
  /** Index of refraction for dielectrics. Glass ~1.5, water 1.33. */
  ior?: number;
  /** Emitted radiance in linear space (headlights, displays). */
  emissive?: [number, number, number];
  /** Metallic flake sparkle intensity, 0 disables. */
  flakeIntensity?: number;
  /** Flakes per world unit; higher = finer flakes. */
  flakeScale?: number;
  /** sRGB albedo texture, multiplied with baseColor. */
  albedoMap?: MaterialImage | null;
  /** Tangent-space normal map (OpenGL convention, +Y up). */
  normalMap?: MaterialImage | null;
  /** Roughness texture; the GREEN channel multiplies `roughness`
   *  (grayscale maps and glTF ORM textures both work). */
  roughnessMap?: MaterialImage | null;
  /** Metallic texture; the BLUE channel multiplies `metallic`
   *  (grayscale maps and glTF ORM textures both work). */
  metallicMap?: MaterialImage | null;
  /** Texture tiling factor. UV mode: repeats across UV space; triplanar:
   *  tiles per world unit. */
  texScale?: number;
  /** Project maps triplanarly from world axes instead of using mesh UVs —
   *  ideal for models without (or with broken) UV layouts. */
  triplanar?: boolean;
}

export class Material {
  name: string;
  baseColor: [number, number, number];
  metallic: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  transmission: number;
  ior: number;
  emissive: [number, number, number];
  flakeIntensity: number;
  flakeScale: number;
  albedoMap: MaterialImage | null;
  normalMap: MaterialImage | null;
  roughnessMap: MaterialImage | null;
  metallicMap: MaterialImage | null;
  texScale: number;
  triplanar: boolean;

  constructor(props: MaterialProps = {}) {
    this.name = props.name ?? "material";
    this.baseColor = props.baseColor ?? [0.8, 0.8, 0.8];
    this.metallic = props.metallic ?? 0;
    this.roughness = props.roughness ?? 0.5;
    this.clearcoat = props.clearcoat ?? 0;
    this.clearcoatRoughness = props.clearcoatRoughness ?? 0.03;
    this.transmission = props.transmission ?? 0;
    this.ior = props.ior ?? 1.5;
    this.emissive = props.emissive ?? [0, 0, 0];
    this.flakeIntensity = props.flakeIntensity ?? 0;
    this.flakeScale = props.flakeScale ?? 800;
    this.albedoMap = props.albedoMap ?? null;
    this.normalMap = props.normalMap ?? null;
    this.roughnessMap = props.roughnessMap ?? null;
    this.metallicMap = props.metallicMap ?? null;
    this.texScale = props.texScale ?? 1;
    this.triplanar = props.triplanar ?? false;
  }

  /** Classic two-stage automotive paint: pigmented base + clearcoat. */
  static carPaint(color: [number, number, number], opts: Partial<MaterialProps> = {}): Material {
    return new Material({
      name: "car-paint",
      baseColor: color,
      metallic: 0.3,
      roughness: 0.45,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      flakeIntensity: 0.25,
      flakeScale: 900,
      ...opts,
    });
  }

  static glass(tint: [number, number, number] = [1, 1, 1], ior = 1.5): Material {
    return new Material({
      name: "glass",
      baseColor: tint,
      metallic: 0,
      roughness: 0.0,
      transmission: 1.0,
      ior,
    });
  }

  static metal(color: [number, number, number], roughness = 0.2): Material {
    return new Material({ name: "metal", baseColor: color, metallic: 1, roughness });
  }
}
