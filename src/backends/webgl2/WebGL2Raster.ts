import {
  Mat4,
  Vec3,
  dot,
  mat4Identity,
  mat4LookAt,
  mat4Multiply,
  mat4NormalMatrix,
  mat4Perspective,
  normalize,
  transformPoint,
} from "../../math/vec";
import { Decal } from "../../core/Decal";
import { Environment } from "../../core/Environment";
import { MaterialImage } from "../../core/Material";
import { Mesh } from "../../core/Mesh";
import {
  FrameStats, RendererBackend, RenderSettings, ViewMode,
} from "../../core/RendererBackend";
import { Scene } from "../../core/Scene";

const NEAR = 0.05;
const FAR = 200;
const SHADOW_MAP_SIZE = 2048;
const DECAL_LAYER_SIZE = 1024;
const MAX_DECALS_PER_MESH = 4;
const DEG2RAD = Math.PI / 180;

/* ----------------------------- GLSL sources ---------------------------- */

/** Shared fragment helpers: constants, tonemap, equirect environment. */
const GLSL_COMMON = /* glsl */ `
const float PI = 3.141592653589793;

uniform highp sampler2D uEnvTex;
uniform float uEnvIntensity;
uniform float uEnvRotation;
uniform float uEnvMaxLod;
uniform float uExposure;

// Equirectangular lookup; rotation spins the environment around +Y.
vec3 sampleEnv(vec3 d, float lod) {
  float u = (atan(d.x, d.z) - uEnvRotation) / (2.0 * PI) + 0.5;
  float v = acos(clamp(d.y, -1.0, 1.0)) / PI;
  return textureLod(uEnvTex, vec2(u, v), lod).rgb * uEnvIntensity;
}

// Stephen Hill's ACES fit (RRT + ODT), input/output in linear sRGB primaries.
const mat3 ACES_IN = mat3(
  0.59719, 0.07600, 0.02840,
  0.35458, 0.90834, 0.13383,
  0.04823, 0.01566, 0.83777);
const mat3 ACES_OUT = mat3(
  1.60475, -0.10208, -0.00327,
  -0.53108, 1.10813, -0.07276,
  -0.07367, -0.00605, 1.07602);

vec3 acesTonemap(vec3 c) {
  vec3 v = ACES_IN * c;
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return clamp(ACES_OUT * (a / b), 0.0, 1.0);
}

vec3 linearToSrgb(vec3 c) {
  return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

vec3 finalizeColor(vec3 linearColor) {
  return linearToSrgb(acesTonemap(linearColor * exp2(uExposure)));
}
`;

const PBR_VERT = /* glsl */ `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUV;

uniform mat4 uModel;
uniform mat4 uNormalMat;
uniform mat4 uViewProj;
uniform mat4 uShadowMatrix;

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vUV;
out vec4 vShadowPos;

void main() {
  vec4 wp = uModel * vec4(aPosition, 1.0);
  vWorldPos = wp.xyz;
  vNormal = mat3(uNormalMat) * aNormal;
  vUV = aUV;
  vShadowPos = uShadowMatrix * wp;
  gl_Position = uViewProj * wp;
}
`;

const PBR_FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUV;
in vec4 vShadowPos;
out vec4 outColor;

uniform vec3 uCameraPos;

// Material
uniform vec3 uBaseColor;
uniform float uMetallic;
uniform float uRoughness;
uniform float uClearcoat;
uniform float uClearcoatRoughness;
uniform float uTransmission;
uniform float uIor;
uniform vec3 uEmissive;
uniform float uFlakeIntensity;
uniform float uFlakeScale;

// Material texture maps (albedo is sRGB storage -> sampler yields linear;
// roughness reads .g and metallic reads .b so grayscale and glTF ORM
// textures both work).
uniform sampler2D uAlbedoMap;
uniform sampler2D uNormalMap;
uniform sampler2D uRoughnessMap;
uniform sampler2D uMetallicMap;
uniform ivec4 uMapFlags; // x: albedo, y: normal, z: roughness, w: metallic
uniform float uTexScale; // texture tiling factor
uniform int uTriplanar;  // 1 = project maps from world axes instead of UVs

// 0 standard PBR, 1 lighting (neutral clay), 2 ambient occlusion,
// 3 shadows only, 4 mirror reflections
uniform int uViewMode;

// Sun (color is pre-integrated irradiance, i.e. sum of L * dOmega over the disc)
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform highp sampler2DShadow uShadowMap;
uniform float uShadowTexel;

// Scene lights: [pos, type] [color*intensity, cosOuter] [dir, cosInner]
// type: 0 point, 1 spot, 2 directional, 3/4 planar area (approximated as a
// one-sided center point). Unshadowed in the raster preview.
uniform int uLightCount;
uniform vec4 uLights0[8];
uniform vec4 uLights1[8];
uniform vec4 uLights2[8];

// Decals (per-mesh assignment; count <= 4)
uniform int uDecalCount;
uniform mat4 uDecalMat[4];
uniform vec3 uDecalDir[4];
uniform vec4 uDecalParams[4]; // x: opacity, y: cos(angleCutoff), z: roughness, w: layer
uniform highp sampler2DArray uDecalTex;

${GLSL_COMMON}

vec3 fresnelSchlick(vec3 f0, float voh) {
  return f0 + (1.0 - f0) * pow(1.0 - voh, 5.0);
}

float dGGX(float noh, float a) {
  float d = noh * noh * (a * a - 1.0) + 1.0;
  return a * a / (PI * d * d);
}

// Smith height-correlated visibility (G / (4 NoV NoL) folded in).
float vSmithGGX(float nov, float nol, float a) {
  float a2 = a * a;
  float gv = nol * sqrt(nov * nov * (1.0 - a2) + a2);
  float gl = nov * sqrt(nol * nol * (1.0 - a2) + a2);
  return 0.5 / max(gv + gl, 1e-5);
}

// Karis' analytic environment BRDF approximation (no LUT needed).
vec3 envBRDFApprox(vec3 f0, float roughness, float nov) {
  const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
  const vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
  vec4 r = roughness * c0 + c1;
  float a004 = min(r.x * r.x, exp2(-9.28 * nov)) * r.x + r.y;
  vec2 ab = vec2(-1.04, 1.04) * a004 + r.zw;
  return f0 * ab.x + ab.y;
}

// Small fixed cosine-weighted kernel over a blurred mip: approximates E/PI.
vec3 envIrradiance(vec3 n) {
  vec3 t = normalize(abs(n.y) < 0.99 ? cross(vec3(0.0, 1.0, 0.0), n) : cross(vec3(1.0, 0.0, 0.0), n));
  vec3 b = cross(n, t);
  float lod = max(uEnvMaxLod - 2.0, 0.0);
  vec3 sum = sampleEnv(n, lod);
  float wsum = 1.0;
  const float K = 0.70710678; // ring tilted 45 degrees, cosine weight
  for (int i = 0; i < 6; i++) {
    float a = float(i) * (PI / 3.0);
    vec3 d = K * n + K * (cos(a) * t + sin(a) * b);
    sum += sampleEnv(d, lod) * K;
    wsum += K;
  }
  return sum / wsum;
}

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

// Triplanar blend weights from the (unperturbed) surface normal.
vec3 triplanarWeights(vec3 n) {
  vec3 w = pow(abs(n), vec3(4.0));
  return w / (w.x + w.y + w.z);
}

/** Sample a material map with either UV or world-space triplanar projection. */
vec4 sampleMap(sampler2D map, vec3 gn, vec2 uv) {
  if (uTriplanar == 0) return texture(map, uv * uTexScale);
  vec3 w = triplanarWeights(gn);
  return texture(map, vWorldPos.zy * uTexScale) * w.x
       + texture(map, vWorldPos.xz * uTexScale) * w.y
       + texture(map, vWorldPos.xy * uTexScale) * w.z;
}

float shadowFactor(vec3 n, vec3 l) {
  vec3 p = vShadowPos.xyz / vShadowPos.w;
  if (p.z >= 1.0 || any(lessThan(p.xy, vec2(0.0))) || any(greaterThan(p.xy, vec2(1.0)))) {
    return 1.0;
  }
  float bias = max(0.002 * (1.0 - dot(n, l)), 0.0005);
  float s = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      s += texture(uShadowMap, vec3(p.xy + vec2(x, y) * uShadowTexel, p.z - bias));
    }
  }
  return s / 9.0;
}

void main() {
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n; // two-sided shading for glass interiors

  // Surface normal BEFORE normal mapping — drives triplanar projection.
  vec3 gN = n;

  // --- Tangent-space normal map: derivative TBN for UV mode, whiteout
  //     blend of three world-axis projections for triplanar ---------------
  if (uMapFlags.y == 1) {
    if (uTriplanar == 1) {
      vec3 w = triplanarWeights(gN);
      float s = uTexScale;
      vec3 tnx = texture(uNormalMap, vWorldPos.zy * s).xyz * 2.0 - 1.0;
      vec3 tny = texture(uNormalMap, vWorldPos.xz * s).xyz * 2.0 - 1.0;
      vec3 tnz = texture(uNormalMap, vWorldPos.xy * s).xyz * 2.0 - 1.0;
      tnx = vec3(tnx.xy + gN.zy, abs(tnx.z) * gN.x);
      tny = vec3(tny.xy + gN.xz, abs(tny.z) * gN.y);
      tnz = vec3(tnz.xy + gN.xy, abs(tnz.z) * gN.z);
      n = normalize(tnx.zyx * w.x + tny.xzy * w.y + tnz.xyz * w.z);
    } else {
      vec2 suv = vUV * uTexScale;
      vec3 mapN = texture(uNormalMap, suv).xyz * 2.0 - 1.0;
      vec3 dp1 = dFdx(vWorldPos);
      vec3 dp2 = dFdy(vWorldPos);
      vec2 duv1 = dFdx(suv);
      vec2 duv2 = dFdy(suv);
      vec3 dp2perp = cross(dp2, n);
      vec3 dp1perp = cross(n, dp1);
      vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
      vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
      float invmax = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
      n = normalize(mat3(T * invmax, B * invmax, n) * mapN);
    }
  }

  vec3 v = normalize(uCameraPos - vWorldPos);
  float nov = clamp(dot(n, v), 1e-4, 1.0);

  // --- Inspection views that need no material evaluation ------------------
  if (uViewMode == 3) { // shadows only
    outColor = vec4(vec3(shadowFactor(n, uSunDir)), 1.0);
    return;
  }
  if (uViewMode == 4) { // pure mirror reflection of the environment
    outColor = vec4(finalizeColor(sampleEnv(reflect(-v, n), 0.0)), 1.0);
    return;
  }
  if (uViewMode == 2) { // ambient occlusion approximation: irradiance visibility
    vec3 irr = envIrradiance(n) * shadowFactor(n, uSunDir);
    float lum = dot(irr, vec3(0.2126, 0.7152, 0.0722));
    outColor = vec4(finalizeColor(vec3(lum)), 1.0);
    return;
  }

  // --- Material maps, then decals alpha-blend over the result ------------
  vec3 baseColor = uBaseColor;
  float roughness = uRoughness;
  float metallic = uMetallic;
  float transmission = uTransmission;
  float clearcoat = uClearcoat;
  float flakeI = uFlakeIntensity;
  vec3 emissive = uEmissive;
  if (uMapFlags.x == 1) baseColor *= sampleMap(uAlbedoMap, gN, vUV).rgb;
  if (uMapFlags.z == 1) roughness *= sampleMap(uRoughnessMap, gN, vUV).g;
  if (uMapFlags.w == 1) metallic = clamp(metallic * sampleMap(uMetallicMap, gN, vUV).b, 0.0, 1.0);
  for (int i = 0; i < 4; i++) {
    if (i >= uDecalCount) break;
    vec3 lp = (uDecalMat[i] * vec4(vWorldPos, 1.0)).xyz;
    if (any(greaterThan(abs(lp), vec3(0.5)))) continue; // outside projector box
    float cosDev = dot(n, -uDecalDir[i]); // surface should face the projector
    float cosCut = uDecalParams[i].y;
    float fade = clamp((cosDev - cosCut) / 0.15, 0.0, 1.0); // soften near the cutoff
    if (fade <= 0.0) continue;
    vec4 tex = texture(uDecalTex, vec3(lp.x + 0.5, 0.5 - lp.y, uDecalParams[i].w));
    float a = tex.a * uDecalParams[i].x * fade;
    baseColor = mix(baseColor, tex.rgb, a);
    roughness = mix(roughness, uDecalParams[i].z, a);
  }
  // Lighting view: neutral clay material shows light distribution alone.
  if (uViewMode == 1) {
    baseColor = vec3(0.35);
    metallic = 0.0;
    transmission = 0.0;
    clearcoat = 0.0;
    flakeI = 0.0;
    emissive = vec3(0.0);
  }

  roughness = clamp(roughness, 0.03, 1.0);
  float alphaR = roughness * roughness;

  float f0d = (uIor - 1.0) / (uIor + 1.0);
  f0d *= f0d;
  vec3 f0 = mix(vec3(f0d), baseColor, metallic);
  vec3 diffuseColor = baseColor * (1.0 - metallic) * (1.0 - transmission);

  // Clearcoat sits on top and steals energy from the base layer.
  float fcView = 0.04 + 0.96 * pow(1.0 - nov, 5.0);
  float ccAtten = 1.0 - clearcoat * fcView;

  vec3 color = emissive;

  // --- Image-based lighting ----------------------------------------------
  vec3 r = reflect(-v, n);
  color += diffuseColor * envIrradiance(n) * ccAtten;
  color += sampleEnv(r, roughness * uEnvMaxLod) * envBRDFApprox(f0, roughness, nov) * ccAtten;
  if (clearcoat > 0.0) {
    color += sampleEnv(r, uClearcoatRoughness * uEnvMaxLod)
           * envBRDFApprox(vec3(0.04), uClearcoatRoughness, nov) * clearcoat;
  }

  // --- Directional sun (brightest env region) with PCF shadows -----------
  float sunPower = uSunColor.r + uSunColor.g + uSunColor.b;
  float shadow = 1.0;
  if (sunPower > 0.0) {
    shadow = shadowFactor(n, uSunDir);
    float nol = dot(n, uSunDir);
    if (nol > 0.0 && shadow > 0.0) {
      vec3 h = normalize(v + uSunDir);
      float noh = clamp(dot(n, h), 0.0, 1.0);
      float voh = clamp(dot(v, h), 0.0, 1.0);
      vec3 f = fresnelSchlick(f0, voh);
      vec3 spec = dGGX(noh, alphaR) * vSmithGGX(nov, nol, alphaR) * f;
      vec3 direct = (diffuseColor / PI * (1.0 - f) + spec) * ccAtten;
      float aCC = max(uClearcoatRoughness * uClearcoatRoughness, 1e-3);
      float fcc = 0.04 + 0.96 * pow(1.0 - voh, 5.0);
      direct += clearcoat * fcc * dGGX(noh, aCC) * vSmithGGX(nov, nol, aCC);
      color += direct * uSunColor * nol * shadow;
    }
  }

  // --- Punctual lights (point / spot / directional) ------------------------
  for (int li = 0; li < 8; li++) {
    if (li >= uLightCount) break;
    int lType = int(uLights0[li].w);
    vec3 wi;
    vec3 radiance = uLights1[li].xyz;
    if (lType == 2) {
      wi = -uLights2[li].xyz;
    } else {
      vec3 toL = uLights0[li].xyz - vWorldPos;
      float d2 = max(dot(toL, toL), 1e-6);
      wi = toL * inversesqrt(d2);
      radiance /= d2;
      if (lType == 1) {
        float cosTheta = dot(-wi, uLights2[li].xyz);
        radiance *= smoothstep(uLights1[li].w, uLights2[li].w, cosTheta);
      } else if (lType >= 3) {
        float cosL = dot(uLights2[li].xyz, -wi); // one-sided softbox
        if (cosL <= 0.0) continue;
        radiance *= cosL;
      }
    }
    float nol = dot(n, wi);
    if (nol <= 0.0) continue;
    vec3 hh = normalize(v + wi);
    float noh = clamp(dot(n, hh), 0.0, 1.0);
    float voh = clamp(dot(v, hh), 0.0, 1.0);
    vec3 f = fresnelSchlick(f0, voh);
    vec3 spec2 = dGGX(noh, alphaR) * vSmithGGX(nov, nol, alphaR) * f;
    vec3 direct = (diffuseColor / PI * (1.0 - f) + spec2) * ccAtten;
    float aCC2 = max(uClearcoatRoughness * uClearcoatRoughness, 1e-3);
    float fcc2 = 0.04 + 0.96 * pow(1.0 - voh, 5.0);
    direct += clearcoat * fcc2 * dGGX(noh, aCC2) * vSmithGGX(nov, nol, aCC2);
    color += direct * radiance * nol;
  }

  // --- Procedural metallic flake sparkle ----------------------------------
  if (flakeI > 0.0) {
    vec3 rnd = hash33(floor(vWorldPos * uFlakeScale));
    if (rnd.z > 0.6) { // only a fraction of cells carry a visible flake
      vec3 fn = normalize(n + (rnd - 0.5) * 0.7);
      vec3 glint = sampleEnv(reflect(-v, fn), 1.0) * 0.3;
      if (sunPower > 0.0) {
        vec3 h = normalize(v + uSunDir);
        glint += uSunColor * pow(clamp(dot(fn, h), 0.0, 1.0), 256.0) * shadow;
      }
      color += glint * flakeI * baseColor;
    }
  }

  // Transmission as Fresnel-weighted coverage: reflections stay at full
  // strength (blend is ONE, ONE_MINUS_SRC_ALPHA), alpha controls how much of
  // the background survives. A plausible glass stand-in, not refraction.
  float fView = f0d + (1.0 - f0d) * pow(1.0 - nov, 5.0);
  float alpha = 1.0 - transmission * (1.0 - fView);

  outColor = vec4(finalizeColor(color), alpha);
}
`;

const FLAT_VERT = /* glsl */ `#version 300 es
layout(location = 0) in vec3 aPosition;
uniform mat4 uModel;
uniform mat4 uViewProj;
void main() {
  gl_Position = uViewProj * (uModel * vec4(aPosition, 1.0));
}
`;

const FLAT_FRAG = /* glsl */ `#version 300 es
precision mediump float;
uniform vec3 uColor;
out vec4 outColor;
void main() {
  outColor = vec4(uColor, 1.0);
}
`;

const SHADOW_VERT = /* glsl */ `#version 300 es
layout(location = 0) in vec3 aPosition;
uniform mat4 uModel;
uniform mat4 uViewProj;
void main() {
  gl_Position = uViewProj * (uModel * vec4(aPosition, 1.0));
}
`;

const SHADOW_FRAG = /* glsl */ `#version 300 es
void main() {}
`;

const BACKGROUND_VERT = /* glsl */ `#version 300 es
out vec2 vNdc;
void main() {
  // Fullscreen triangle from gl_VertexID, pinned to the far plane (z = w).
  vec2 p = vec2(float((gl_VertexID & 1) * 4) - 1.0, float((gl_VertexID >> 1) * 4) - 1.0);
  vNdc = p;
  gl_Position = vec4(p, 1.0, 1.0);
}
`;

const BACKGROUND_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 vNdc;
out vec4 outColor;

uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamForward;
uniform float uTanHalfFov;
uniform float uAspect;

${GLSL_COMMON}

void main() {
  vec3 dir = normalize(
    uCamForward
    + vNdc.x * uTanHalfFov * uAspect * uCamRight
    + vNdc.y * uTanHalfFov * uCamUp);
  outColor = vec4(finalizeColor(sampleEnv(dir, 0.0)), 1.0);
}
`;

/* ------------------------------ Utilities ------------------------------ */

function mat4Ortho(l: number, r: number, b: number, t: number, n: number, f: number): Mat4 {
  const m = new Float32Array(16);
  m[0] = 2 / (r - l);
  m[5] = 2 / (t - b);
  m[10] = -2 / (f - n);
  m[12] = -(r + l) / (r - l);
  m[13] = -(t + b) / (t - b);
  m[14] = -(f + n) / (f - n);
  m[15] = 1;
  return m;
}

/** 2x box downsample of an RGBA float image (clamped at odd edges). */
function downsampleRGBA(src: Float32Array, w: number, h: number): { data: Float32Array; w: number; h: number } {
  const nw = Math.max(1, w >> 1);
  const nh = Math.max(1, h >> 1);
  const out = new Float32Array(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    const y0 = Math.min(y * 2, h - 1);
    const y1 = Math.min(y * 2 + 1, h - 1);
    for (let x = 0; x < nw; x++) {
      const x0 = Math.min(x * 2, w - 1);
      const x1 = Math.min(x * 2 + 1, w - 1);
      const o = (y * nw + x) * 4;
      for (let c = 0; c < 4; c++) {
        out[o + c] = 0.25 * (
          src[(y0 * w + x0) * 4 + c] + src[(y0 * w + x1) * 4 + c] +
          src[(y1 * w + x0) * 4 + c] + src[(y1 * w + x1) * 4 + c]);
      }
    }
  }
  return { data: out, w: nw, h: nh };
}

interface ProgramInfo {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation>;
}

/** Shader-side ids for the inspection views (wireframe has its own path). */
const VIEW_MODE_ID: Record<ViewMode, number> = {
  standard: 0,
  wireframe: 0,
  lighting: 1,
  ao: 2,
  shadow: 3,
  reflection: 4,
};

interface MeshGPU {
  mesh: Mesh;
  vao: WebGLVertexArrayObject;
  buffers: WebGLBuffer[];
  indexCount: number;
  /** Local-space AABB, used for sorting and shadow frustum fitting. */
  aabbMin: Vec3;
  aabbMax: Vec3;
  /** Texture-array layer per decal, parallel to mesh.decals (capped at 4). */
  decalLayers: number[];
  /** Squared distance to camera, updated per frame before sorting. */
  sortKey: number;
  /** Wireframe line VAO + count, built lazily on first wireframe frame. */
  lineVao: WebGLVertexArrayObject | null;
  lineCount: number;
}

/**
 * WebGL2 forward-PBR raster fallback for devices without WebGPU.
 *
 * One environment texture with a CPU-built mip chain doubles as diffuse
 * irradiance source (blurred mips + cosine kernel) and prefiltered specular
 * (roughness-driven LOD). A directional sun extracted from the brightest
 * environment region drives a crisp GGX highlight and a 2048px PCF shadow map.
 */
export class WebGL2Raster implements RendererBackend {
  readonly kind = "webgl2-raster" as const;

  private readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private contextLost = false;

  private pbr!: ProgramInfo;
  private shadow!: ProgramInfo;
  private background!: ProgramInfo;
  private flat!: ProgramInfo;
  private emptyVao!: WebGLVertexArrayObject;

  private scene: Scene | null = null;
  private meshes: MeshGPU[] = [];

  private envTexture: WebGLTexture | null = null;
  private envMaxLod = 0;
  /** Sun direction in un-rotated environment space; world dir derives per frame. */
  private sunDirLocal: Vec3 | null = null;
  /** Pre-integrated sun irradiance (sum of radiance * solid angle), unscaled. */
  private sunColorBase: Vec3 = [0, 0, 0];

  private decalTexture: WebGLTexture | null = null;
  private decalLayerOf = new Map<Decal, number>();

  /** Material map textures, keyed by source image (deduplicated, lazy). */
  private matTexOf = new Map<MaterialImage, WebGLTexture>();

  private shadowTexture!: WebGLTexture;
  private shadowFbo!: WebGLFramebuffer;

  // Offscreen render target (honors resolutionScale, adds MSAA), blitted to canvas.
  private msaaSamples = 1;
  private renderFbo: WebGLFramebuffer | null = null;
  private resolveFbo: WebGLFramebuffer | null = null;
  private targetRbs: WebGLRenderbuffer[] = [];
  private targetWidth = 0;
  private targetHeight = 0;

  private width: number;
  private height: number;

  // Scratch storage reused every frame to avoid per-draw allocation.
  private readonly decalMats = new Float32Array(MAX_DECALS_PER_MESH * 16);
  private readonly decalDirs = new Float32Array(MAX_DECALS_PER_MESH * 3);
  private readonly decalParams = new Float32Array(MAX_DECALS_PER_MESH * 4);
  private readonly lights0 = new Float32Array(8 * 4);
  private readonly lights1 = new Float32Array(8 * 4);
  private readonly lights2 = new Float32Array(8 * 4);

  private readonly onContextLost = (e: Event): void => {
    e.preventDefault(); // allow the browser to attempt a restore
    this.contextLost = true;
    console.warn("[lacquer/webgl2] WebGL context lost; rendering paused.");
  };

  private readonly onContextRestored = (): void => {
    console.warn("[lacquer/webgl2] WebGL context restored; rebuilding GPU resources.");
    this.contextLost = false;
    this.initStaticResources();
    if (this.scene) this.setScene(this.scene);
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", {
      antialias: false, // we render into our own MSAA target and blit
      depth: false,
      stencil: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 is not supported on this device");
    this.gl = gl;

    this.width = canvas.width || 1;
    this.height = canvas.height || 1;

    canvas.addEventListener("webglcontextlost", this.onContextLost);
    canvas.addEventListener("webglcontextrestored", this.onContextRestored);

    this.initStaticResources();
  }

  /** Compiles programs and creates scene-independent GPU objects. */
  private initStaticResources(): void {
    const gl = this.gl;

    // Probed for float-texture filtering; EXT_color_buffer_float is not
    // required because environment mips are built on the CPU.
    gl.getExtension("OES_texture_float_linear");

    this.pbr = this.linkProgram(PBR_VERT, PBR_FRAG, "pbr");
    this.shadow = this.linkProgram(SHADOW_VERT, SHADOW_FRAG, "shadow");
    this.background = this.linkProgram(BACKGROUND_VERT, BACKGROUND_FRAG, "background");
    this.flat = this.linkProgram(FLAT_VERT, FLAT_FRAG, "flat");

    gl.useProgram(this.pbr.program);
    gl.uniform1i(this.pbr.uniforms.uEnvTex, 0);
    gl.uniform1i(this.pbr.uniforms.uShadowMap, 1);
    gl.uniform1i(this.pbr.uniforms.uDecalTex, 2);
    gl.uniform1i(this.pbr.uniforms.uAlbedoMap, 3);
    gl.uniform1i(this.pbr.uniforms.uNormalMap, 4);
    gl.uniform1i(this.pbr.uniforms.uRoughnessMap, 5);
    gl.uniform1i(this.pbr.uniforms.uMetallicMap, 6);
    gl.useProgram(this.background.program);
    gl.uniform1i(this.background.uniforms.uEnvTex, 0);

    this.emptyVao = gl.createVertexArray()!;

    // Shadow map: depth texture with hardware compare for sampler2DShadow PCF.
    this.shadowTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    this.shadowFbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTexture, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.msaaSamples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) as number);
    this.targetWidth = 0; // force render-target rebuild
    this.targetHeight = 0;
  }

  private linkProgram(vsSrc: string, fsSrc: string, label: string): ProgramInfo {
    const gl = this.gl;
    const compile = (type: number, src: string): WebGLShader => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
        throw new Error(`[lacquer/webgl2] ${label} shader compile failed: ${gl.getShaderInfoLog(shader)}`);
      }
      return shader;
    };
    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
      throw new Error(`[lacquer/webgl2] ${label} program link failed: ${gl.getProgramInfoLog(program)}`);
    }
    const uniforms: Record<string, WebGLUniformLocation> = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      if (!info) continue;
      const name = info.name.replace(/\[0\]$/, "");
      const loc = gl.getUniformLocation(program, info.name);
      if (loc) uniforms[name] = loc;
    }
    return { program, uniforms };
  }

  /* ------------------------------ Scene build --------------------------- */

  setScene(scene: Scene): void {
    this.scene = scene;
    if (this.contextLost) return;
    this.disposeSceneResources();

    for (const mesh of scene.getAllMeshes()) {
      if (mesh.geometry.indices.length === 0) continue; // group nodes
      this.meshes.push(this.buildMeshGPU(mesh));
    }
    this.uploadDecals(scene);
    this.uploadEnvironment(scene.environment);
    this.extractSun(scene.environment);
  }

  private buildMeshGPU(mesh: Mesh): MeshGPU {
    const gl = this.gl;
    const g = mesh.geometry;
    const vertexCount = g.positions.length / 3;
    // Tolerate absent/short UV arrays (nothing samples UVs today, but the
    // attribute stays wired for future textured materials).
    const uvs = g.uvs.length >= vertexCount * 2 ? g.uvs : new Float32Array(vertexCount * 2);

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buffers: WebGLBuffer[] = [];
    const attrib = (index: number, data: Float32Array, size: number): void => {
      const buf = gl.createBuffer()!;
      buffers.push(buf);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(index);
      gl.vertexAttribPointer(index, size, gl.FLOAT, false, 0, 0);
    };
    attrib(0, g.positions, 3);
    attrib(1, g.normals, 3);
    attrib(2, uvs, 2);
    const ibo = gl.createBuffer()!;
    buffers.push(ibo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    const aabbMin: Vec3 = [Infinity, Infinity, Infinity];
    const aabbMax: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < vertexCount; i++) {
      for (let c = 0; c < 3; c++) {
        const p = g.positions[i * 3 + c];
        if (p < aabbMin[c]) aabbMin[c] = p;
        if (p > aabbMax[c]) aabbMax[c] = p;
      }
    }
    if (vertexCount === 0) {
      aabbMin[0] = aabbMin[1] = aabbMin[2] = 0;
      aabbMax[0] = aabbMax[1] = aabbMax[2] = 0;
    }

    return {
      mesh,
      vao,
      buffers,
      indexCount: g.indices.length,
      aabbMin,
      aabbMax,
      decalLayers: [],
      sortKey: 0,
      lineVao: null,
      lineCount: 0,
    };
  }

  /** Build the unique-edge line list for wireframe rendering (lazy). */
  private ensureWireframe(rec: MeshGPU): void {
    if (rec.lineVao) return;
    const gl = this.gl;
    const indices = rec.mesh.geometry.indices;
    const seen = new Set<number>();
    const lines: number[] = [];
    for (let t = 0; t < indices.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const a = indices[t + e];
        const b = indices[t + ((e + 1) % 3)];
        const key = a < b ? a * 0x1000000 + b : b * 0x1000000 + a; // 16.7M-vertex safe
        if (seen.has(key)) continue;
        seen.add(key);
        lines.push(a, b);
      }
    }
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, rec.buffers[0]); // shared position buffer
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const ibo = gl.createBuffer()!;
    rec.buffers.push(ibo); // freed with the mesh record
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(lines), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    rec.lineVao = vao;
    rec.lineCount = lines.length;
  }

  private uploadDecals(scene: Scene): void {
    const gl = this.gl;
    this.decalLayerOf.clear();

    const unique: Decal[] = [];
    for (const mesh of scene.getAllMeshes()) {
      if (mesh.decals.length > MAX_DECALS_PER_MESH) {
        console.warn(
          `[lacquer/webgl2] mesh "${mesh.name}" has ${mesh.decals.length} decals; ` +
          `only the first ${MAX_DECALS_PER_MESH} are rendered.`);
      }
      for (const d of mesh.decals.slice(0, MAX_DECALS_PER_MESH)) {
        if (!this.decalLayerOf.has(d)) {
          this.decalLayerOf.set(d, unique.length);
          unique.push(d);
        }
      }
    }

    const layers = Math.max(1, unique.length);
    this.decalTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.decalTexture);
    const mips = Math.floor(Math.log2(DECAL_LAYER_SIZE)) + 1;
    // sRGB storage: the sampler hands linear values to the lighting code.
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, mips, gl.SRGB8_ALPHA8, DECAL_LAYER_SIZE, DECAL_LAYER_SIZE, layers);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    if (unique.length > 0) {
      // Resize every decal image to the fixed layer size via a 2D canvas.
      const staging = document.createElement("canvas");
      staging.width = DECAL_LAYER_SIZE;
      staging.height = DECAL_LAYER_SIZE;
      const ctx = staging.getContext("2d");
      if (!ctx) throw new Error("[lacquer/webgl2] could not create 2D staging context for decals");
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      for (let layer = 0; layer < unique.length; layer++) {
        ctx.clearRect(0, 0, DECAL_LAYER_SIZE, DECAL_LAYER_SIZE);
        ctx.drawImage(unique[layer].image, 0, 0, DECAL_LAYER_SIZE, DECAL_LAYER_SIZE);
        gl.texSubImage3D(
          gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer,
          DECAL_LAYER_SIZE, DECAL_LAYER_SIZE, 1,
          gl.RGBA, gl.UNSIGNED_BYTE, staging);
      }
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    }

    for (const record of this.meshes) {
      record.decalLayers = record.mesh.decals
        .slice(0, MAX_DECALS_PER_MESH)
        .map((d) => this.decalLayerOf.get(d) ?? 0);
    }
  }

  private uploadEnvironment(env: Environment): void {
    const gl = this.gl;

    // Expand RGB -> RGBA and build a CPU mip chain. Building mips ourselves
    // sidesteps generateMipmap's color-renderable requirement, so no
    // EXT_color_buffer_float dependency for the preferred RGBA16F path.
    const texels = env.width * env.height;
    let level: Float32Array = new Float32Array(texels * 4);
    for (let i = 0; i < texels; i++) {
      level[i * 4] = env.data[i * 3];
      level[i * 4 + 1] = env.data[i * 3 + 1];
      level[i * 4 + 2] = env.data[i * 3 + 2];
      level[i * 4 + 3] = 1;
    }
    const levels: { data: Float32Array; w: number; h: number }[] = [
      { data: level, w: env.width, h: env.height },
    ];
    let { w, h } = { w: env.width, h: env.height };
    while (w > 1 || h > 1) {
      const next = downsampleRGBA(level, w, h);
      levels.push(next);
      level = next.data;
      w = next.w;
      h = next.h;
    }
    this.envMaxLod = levels.length - 1;

    const upload = (internalFormat: number): boolean => {
      while (gl.getError() !== gl.NO_ERROR) { /* clear stale errors */ }
      for (let i = 0; i < levels.length; i++) {
        gl.texImage2D(gl.TEXTURE_2D, i, internalFormat, levels[i].w, levels[i].h, 0, gl.RGBA, gl.FLOAT, levels[i].data);
      }
      return gl.getError() === gl.NO_ERROR;
    };

    this.envTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.envTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    // Preferred: RGBA16F, trilinearly filterable in core WebGL2.
    let linear = true;
    if (!upload(gl.RGBA16F)) {
      // Fallback: RGBA32F; linear filtering only with OES_texture_float_linear.
      linear = gl.getExtension("OES_texture_float_linear") !== null;
      if (!upload(gl.RGBA32F)) {
        console.warn("[lacquer/webgl2] float environment upload failed; IBL will be black.");
      }
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST_MIPMAP_NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); // seamless longitude wrap
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, this.envMaxLod);
  }

  /**
   * Derives a directional sun from the environment: locates the brightest
   * texel, then integrates radiance * solid angle over the surrounding bright
   * disc (< 5 degrees, > half peak luminance). The result is the irradiance a
   * surface receives from that region, usable directly as a light color.
   */
  private extractSun(env: Environment): void {
    const { width: envW, height: envH, data } = env;
    this.sunDirLocal = null;
    this.sunColorBase = [0, 0, 0];

    let maxLum = 0;
    let maxIdx = -1;
    for (let i = 0; i < envW * envH; i++) {
      const lum = 0.2126 * data[i * 3] + 0.7152 * data[i * 3 + 1] + 0.0722 * data[i * 3 + 2];
      if (lum > maxLum) {
        maxLum = lum;
        maxIdx = i;
      }
    }
    if (maxIdx < 0 || maxLum <= 1e-4) return;

    const dirOf = (idx: number): Vec3 => {
      const x = idx % envW;
      const y = (idx / envW) | 0;
      const theta = (Math.PI * (y + 0.5)) / envH;
      const phi = (2 * Math.PI * (x + 0.5)) / envW - Math.PI;
      const st = Math.sin(theta);
      return [st * Math.sin(phi), Math.cos(theta), st * Math.cos(phi)];
    };

    const peak = dirOf(maxIdx);
    const coneCos = Math.cos(5 * DEG2RAD);
    const color: Vec3 = [0, 0, 0];
    const dirSum: Vec3 = [0, 0, 0];
    for (let y = 0; y < envH; y++) {
      const sinT = Math.sin((Math.PI * (y + 0.5)) / envH);
      const dOmega = (2 * Math.PI / envW) * (Math.PI / envH) * sinT;
      for (let x = 0; x < envW; x++) {
        const i = y * envW + x;
        const r = data[i * 3];
        const g = data[i * 3 + 1];
        const b = data[i * 3 + 2];
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (lum < 0.5 * maxLum) continue;
        const d = dirOf(i);
        if (dot(d, peak) < coneCos) continue;
        color[0] += r * dOmega;
        color[1] += g * dOmega;
        color[2] += b * dOmega;
        dirSum[0] += d[0] * lum;
        dirSum[1] += d[1] * lum;
        dirSum[2] += d[2] * lum;
      }
    }
    this.sunDirLocal = normalize(dirSum);
    this.sunColorBase = color;
  }

  /* -------------------------------- Frame ------------------------------- */

  render(settings: RenderSettings): FrameStats {
    const stats: FrameStats = { samples: 1, triangles: 0, backend: this.kind };
    const scene = this.scene;
    if (this.contextLost || !scene) return stats;
    const gl = this.gl;
    const mode = settings.viewMode ?? "standard";

    const scale = Math.min(1, Math.max(0.25, settings.resolutionScale));
    const rw = Math.max(1, Math.round(this.width * scale));
    const rh = Math.max(1, Math.round(this.height * scale));
    this.ensureRenderTargets(rw, rh);

    // Camera
    const cam = scene.camera;
    const view = mat4LookAt(cam.position, cam.target, cam.up);
    const proj = mat4Perspective(cam.fovYDeg * DEG2RAD, rw / rh, NEAR, FAR);
    const viewProj = mat4Multiply(proj, view);

    // Sun in world space: environment rotation adds to azimuth.
    const env = scene.environment;
    let sunDir: Vec3 = [0, 1, 0];
    let sunColor: Vec3 = [0, 0, 0];
    if (this.sunDirLocal) {
      const [x, y, z] = this.sunDirLocal;
      const c = Math.cos(env.rotation);
      const s = Math.sin(env.rotation);
      sunDir = [x * c + z * s, y, z * c - x * s];
      sunColor = [
        this.sunColorBase[0] * env.intensity,
        this.sunColorBase[1] * env.intensity,
        this.sunColorBase[2] * env.intensity,
      ];
    }

    // Partition visible meshes and update sort keys (opaque roughly
    // front-to-back for early-z, transmissive strictly back-to-front).
    const opaque: MeshGPU[] = [];
    const transmissive: MeshGPU[] = [];
    for (const rec of this.meshes) {
      if (!this.scene?.isMeshRenderable(rec.mesh) || rec.indexCount === 0) continue;
      const center = transformPoint(rec.mesh.getWorldTransform(), [
        (rec.aabbMin[0] + rec.aabbMax[0]) / 2,
        (rec.aabbMin[1] + rec.aabbMax[1]) / 2,
        (rec.aabbMin[2] + rec.aabbMax[2]) / 2,
      ]);
      const dx = center[0] - cam.position[0];
      const dy = center[1] - cam.position[1];
      const dz = center[2] - cam.position[2];
      rec.sortKey = dx * dx + dy * dy + dz * dz;
      // Debug views shade glass like any other surface.
      const asGlass = mode === "standard" && rec.mesh.material.transmission > 0;
      (asGlass ? transmissive : opaque).push(rec);
      stats.triangles += rec.indexCount / 3;
    }
    opaque.sort((a, b) => a.sortKey - b.sortKey);
    transmissive.sort((a, b) => b.sortKey - a.sortKey);

    if (mode === "wireframe") {
      this.renderWireframe(opaque, viewProj, rw, rh);
      this.blitToCanvas(rw, rh);
      return stats;
    }

    const shadowMatrix = this.renderShadowPass(opaque, sunDir, sunColor);

    // Main pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.renderFbo);
    gl.viewport(0, 0, rw, rh);
    if (mode === "ao" || mode === "shadow") gl.clearColor(0.16, 0.165, 0.18, 1);
    else if (settings.envBackground === false) gl.clearColor(0.075, 0.075, 0.082, 1);
    else gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.disable(gl.BLEND);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.envTexture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.decalTexture);

    gl.useProgram(this.pbr.program);
    const u = this.pbr.uniforms;
    gl.uniformMatrix4fv(u.uViewProj, false, viewProj);
    gl.uniformMatrix4fv(u.uShadowMatrix, false, shadowMatrix);
    gl.uniform3fv(u.uCameraPos, cam.position);
    gl.uniform3fv(u.uSunDir, sunDir);
    gl.uniform3fv(u.uSunColor, sunColor);
    gl.uniform1f(u.uShadowTexel, 1 / SHADOW_MAP_SIZE);
    gl.uniform1f(u.uEnvIntensity, env.intensity);
    gl.uniform1f(u.uEnvRotation, env.rotation);
    gl.uniform1f(u.uEnvMaxLod, this.envMaxLod);
    gl.uniform1f(u.uExposure, settings.exposure);
    gl.uniform1i(u.uViewMode, VIEW_MODE_ID[mode]);

    // Punctual lights (uniforms re-read every frame — no rebuild needed).
    const visibleLights = scene.lights.filter((l) => l.visible).slice(0, 8);
    const LIGHT_TYPE = { point: 0, spot: 1, directional: 2, rect: 3, octagon: 4 } as const;
    visibleLights.forEach((light, i) => {
      const { outer, inner } = light.coneCosines();
      const dl = Math.hypot(...light.direction) || 1;
      // Match the path tracer: emitter area scales an area light's brightness.
      const e = light.intensity * light.emitterArea();
      this.lights0.set([...light.position, LIGHT_TYPE[light.type]], i * 4);
      this.lights1.set([
        light.color[0] * e,
        light.color[1] * e,
        light.color[2] * e, outer,
      ], i * 4);
      this.lights2.set([
        light.direction[0] / dl, light.direction[1] / dl, light.direction[2] / dl, inner,
      ], i * 4);
    });
    gl.uniform1i(u.uLightCount, visibleLights.length);
    if (visibleLights.length > 0) {
      gl.uniform4fv(u.uLights0, this.lights0, 0, visibleLights.length * 4);
      gl.uniform4fv(u.uLights1, this.lights1, 0, visibleLights.length * 4);
      gl.uniform4fv(u.uLights2, this.lights2, 0, visibleLights.length * 4);
    }

    for (const rec of opaque) this.drawMesh(rec);

    // AO / shadow inspection reads better on a neutral backdrop; the HDRI
    // backdrop can also be hidden while its lighting stays active.
    if (mode === "ao" || mode === "shadow" || settings.envBackground === false) {
      // Depth already keeps the meshes; the clear color is the backdrop.
    } else {
      this.renderBackground(cam, rw / rh, env, settings.exposure);
    }

    if (transmissive.length > 0) {
      gl.useProgram(this.pbr.program);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // src RGB carries reflections at full strength
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE); // glass is shaded two-sided
      for (const rec of transmissive) this.drawMesh(rec);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.enable(gl.CULL_FACE);
    }

    this.blitToCanvas(rw, rh);
    return stats;
  }

  /** Hidden-line wireframe: dark depth-fill pass, then unique-edge lines. */
  private renderWireframe(records: MeshGPU[], viewProj: Mat4, rw: number, rh: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.renderFbo);
    gl.viewport(0, 0, rw, rh);
    gl.clearColor(0.055, 0.06, 0.07, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);

    gl.useProgram(this.flat.program);
    const u = this.flat.uniforms;
    gl.uniformMatrix4fv(u.uViewProj, false, viewProj);

    // Fill pass, pushed back so lines on the surface win the depth test.
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1.0, 1.0);
    gl.uniform3f(u.uColor, 0.09, 0.095, 0.11);
    for (const rec of records) {
      gl.uniformMatrix4fv(u.uModel, false, rec.mesh.getWorldTransform());
      gl.bindVertexArray(rec.vao);
      gl.drawElements(gl.TRIANGLES, rec.indexCount, gl.UNSIGNED_INT, 0);
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);

    gl.uniform3f(u.uColor, 0.62, 0.68, 0.78);
    for (const rec of records) {
      this.ensureWireframe(rec);
      gl.uniformMatrix4fv(u.uModel, false, rec.mesh.getWorldTransform());
      gl.bindVertexArray(rec.lineVao);
      gl.drawElements(gl.LINES, rec.lineCount, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);
    gl.enable(gl.CULL_FACE);
  }

  /** Lazily create (and cache) a GL texture for a material map image. */
  private materialTexture(image: MaterialImage, srgb: boolean): WebGLTexture {
    let tex = this.matTexOf.get(image);
    if (tex) return tex;
    const gl = this.gl;
    tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8,
      gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    this.matTexOf.set(image, tex);
    return tex;
  }

  private drawMesh(rec: MeshGPU): void {
    const gl = this.gl;
    const u = this.pbr.uniforms;
    const mesh = rec.mesh;
    const m = mesh.material;

    const bindMap = (unit: number, image: MaterialImage | null, srgb: boolean): number => {
      if (!image) return 0;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, this.materialTexture(image, srgb));
      return 1;
    };
    gl.uniform4i(
      u.uMapFlags,
      bindMap(3, m.albedoMap, true),
      bindMap(4, m.normalMap, false),
      bindMap(5, m.roughnessMap, false),
      bindMap(6, m.metallicMap, false),
    );
    gl.uniform1f(u.uTexScale, Math.max(0.01, m.texScale || 1));
    gl.uniform1i(u.uTriplanar, m.triplanar ? 1 : 0);

    const world = mesh.getWorldTransform();
    gl.uniformMatrix4fv(u.uModel, false, world);
    gl.uniformMatrix4fv(u.uNormalMat, false, mat4NormalMatrix(world));
    gl.uniform3fv(u.uBaseColor, m.baseColor);
    gl.uniform1f(u.uMetallic, m.metallic);
    gl.uniform1f(u.uRoughness, m.roughness);
    gl.uniform1f(u.uClearcoat, m.clearcoat);
    gl.uniform1f(u.uClearcoatRoughness, m.clearcoatRoughness);
    gl.uniform1f(u.uTransmission, m.transmission);
    gl.uniform1f(u.uIor, m.ior);
    gl.uniform3fv(u.uEmissive, m.emissive);
    gl.uniform1f(u.uFlakeIntensity, m.flakeIntensity);
    gl.uniform1f(u.uFlakeScale, m.flakeScale);

    const count = Math.min(mesh.decals.length, MAX_DECALS_PER_MESH);
    gl.uniform1i(u.uDecalCount, count);
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        const d = mesh.decals[i];
        this.decalMats.set(d.worldToDecal(), i * 16);
        this.decalDirs.set(normalize(d.projectionDir()), i * 3);
        this.decalParams[i * 4] = d.opacity;
        this.decalParams[i * 4 + 1] = Math.cos(d.angleCutoffDeg * DEG2RAD);
        this.decalParams[i * 4 + 2] = d.roughness;
        this.decalParams[i * 4 + 3] = rec.decalLayers[i] ?? 0;
      }
      gl.uniformMatrix4fv(u.uDecalMat, false, this.decalMats, 0, count * 16);
      gl.uniform3fv(u.uDecalDir, this.decalDirs, 0, count * 3);
      gl.uniform4fv(u.uDecalParams, this.decalParams, 0, count * 4);
    }

    gl.bindVertexArray(rec.vao);
    gl.drawElements(gl.TRIANGLES, rec.indexCount, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }

  /** Renders the sun shadow map; returns the world -> shadow-UV matrix. */
  private renderShadowPass(casters: MeshGPU[], sunDir: Vec3, sunColor: Vec3): Mat4 {
    const gl = this.gl;
    if (sunColor[0] + sunColor[1] + sunColor[2] <= 0 || casters.length === 0) {
      // Map everything to shadow depth 1 so shadowFactor() always returns lit
      // (guards against reading a stale/uninitialized shadow map).
      const noShadow = mat4Identity();
      noShadow[0] = noShadow[5] = noShadow[10] = 0;
      noShadow[14] = 1;
      return noShadow;
    }

    // World AABB of all opaque casters (transmissive glass casts no shadow —
    // a hard glass shadow reads worse than none in this approximation).
    const mn: Vec3 = [Infinity, Infinity, Infinity];
    const mx: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const rec of casters) {
      const world = rec.mesh.getWorldTransform();
      for (let corner = 0; corner < 8; corner++) {
        const p = transformPoint(world, [
          corner & 1 ? rec.aabbMax[0] : rec.aabbMin[0],
          corner & 2 ? rec.aabbMax[1] : rec.aabbMin[1],
          corner & 4 ? rec.aabbMax[2] : rec.aabbMin[2],
        ]);
        for (let c = 0; c < 3; c++) {
          if (p[c] < mn[c]) mn[c] = p[c];
          if (p[c] > mx[c]) mx[c] = p[c];
        }
      }
    }
    const center: Vec3 = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
    const radius = Math.max(0.5, Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2);

    const eye: Vec3 = [
      center[0] + sunDir[0] * (radius + 1),
      center[1] + sunDir[1] * (radius + 1),
      center[2] + sunDir[2] * (radius + 1),
    ];
    const up: Vec3 = Math.abs(sunDir[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0];
    const lightView = mat4LookAt(eye, center, up);
    const lightProj = mat4Ortho(-radius, radius, -radius, radius, 0.05, 2 * radius + 2);
    const lightViewProj = mat4Multiply(lightProj, lightView);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.viewport(0, 0, SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    // The shadow texture must not be bound while it is the depth attachment.
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.disable(gl.BLEND);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(2, 4);

    gl.useProgram(this.shadow.program);
    gl.uniformMatrix4fv(this.shadow.uniforms.uViewProj, false, lightViewProj);
    for (const rec of casters) {
      gl.uniformMatrix4fv(this.shadow.uniforms.uModel, false, rec.mesh.getWorldTransform());
      gl.bindVertexArray(rec.vao);
      gl.drawElements(gl.TRIANGLES, rec.indexCount, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // NDC [-1,1] -> UV/depth [0,1]
    const bias = new Float32Array([
      0.5, 0, 0, 0,
      0, 0.5, 0, 0,
      0, 0, 0.5, 0,
      0.5, 0.5, 0.5, 1,
    ]);
    return mat4Multiply(bias, lightViewProj);
  }

  /** Draws the environment behind everything via a far-plane fullscreen triangle. */
  private renderBackground(
    cam: Scene["camera"],
    aspect: number,
    env: Environment,
    exposure: number,
  ): void {
    const gl = this.gl;
    const { forward, right, up } = cam.basis();
    gl.useProgram(this.background.program);
    const u = this.background.uniforms;
    gl.uniform3fv(u.uCamRight, right);
    gl.uniform3fv(u.uCamUp, up);
    gl.uniform3fv(u.uCamForward, forward);
    gl.uniform1f(u.uTanHalfFov, Math.tan((cam.fovYDeg * DEG2RAD) / 2));
    gl.uniform1f(u.uAspect, aspect);
    gl.uniform1f(u.uEnvIntensity, env.intensity);
    gl.uniform1f(u.uEnvRotation, env.rotation);
    gl.uniform1f(u.uEnvMaxLod, this.envMaxLod);
    gl.uniform1f(u.uExposure, exposure);
    gl.depthMask(false);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.depthMask(true);
  }

  /* --------------------------- Render targets --------------------------- */

  private ensureRenderTargets(w: number, h: number): void {
    if (this.renderFbo && w === this.targetWidth && h === this.targetHeight) return;
    const gl = this.gl;
    this.destroyRenderTargets();
    this.targetWidth = w;
    this.targetHeight = h;

    const msaa = this.msaaSamples > 1;
    const rb = (internalFormat: number, samples: number): WebGLRenderbuffer => {
      const r = gl.createRenderbuffer()!;
      this.targetRbs.push(r);
      gl.bindRenderbuffer(gl.RENDERBUFFER, r);
      if (samples > 1) {
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, internalFormat, w, h);
      } else {
        gl.renderbufferStorage(gl.RENDERBUFFER, internalFormat, w, h);
      }
      return r;
    };

    this.renderFbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.renderFbo);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb(gl.RGBA8, this.msaaSamples));
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb(gl.DEPTH_COMPONENT24, this.msaaSamples));

    if (msaa) {
      // MSAA resolve must be a same-size blit; scaling happens in a second blit.
      this.resolveFbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.resolveFbo);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb(gl.RGBA8, 1));
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private blitToCanvas(rw: number, rh: number): void {
    const gl = this.gl;
    let src = this.renderFbo;
    if (this.resolveFbo) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.renderFbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.resolveFbo);
      gl.blitFramebuffer(0, 0, rw, rh, 0, 0, rw, rh, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      src = this.resolveFbo;
    }
    const cw = gl.drawingBufferWidth;
    const ch = gl.drawingBufferHeight;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(0, 0, rw, rh, 0, 0, cw, ch, gl.COLOR_BUFFER_BIT, rw === cw && rh === ch ? gl.NEAREST : gl.LINEAR);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  }

  private destroyRenderTargets(): void {
    const gl = this.gl;
    if (this.renderFbo) gl.deleteFramebuffer(this.renderFbo);
    if (this.resolveFbo) gl.deleteFramebuffer(this.resolveFbo);
    for (const rb of this.targetRbs) gl.deleteRenderbuffer(rb);
    this.renderFbo = null;
    this.resolveFbo = null;
    this.targetRbs = [];
  }

  /* ------------------------------ Lifecycle ----------------------------- */

  resetAccumulation(): void {
    // Raster renders a complete frame every call; nothing to accumulate.
  }

  /** Lights are read from the scene every frame, so edits need no rebuild —
   *  this exists purely so the host takes the fast path over setScene(). */
  updateLights(_scene: Scene): void {
    // no-op
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    // Render targets are (re)created lazily in render() from these sizes.
  }

  private disposeSceneResources(): void {
    const gl = this.gl;
    for (const rec of this.meshes) {
      gl.deleteVertexArray(rec.vao);
      if (rec.lineVao) gl.deleteVertexArray(rec.lineVao);
      for (const buf of rec.buffers) gl.deleteBuffer(buf);
    }
    this.meshes = [];
    if (this.envTexture) {
      gl.deleteTexture(this.envTexture);
      this.envTexture = null;
    }
    if (this.decalTexture) {
      gl.deleteTexture(this.decalTexture);
      this.decalTexture = null;
    }
    this.decalLayerOf.clear();
    for (const tex of this.matTexOf.values()) gl.deleteTexture(tex);
    this.matTexOf.clear();
  }

  dispose(): void {
    const gl = this.gl;
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
    this.disposeSceneResources();
    this.destroyRenderTargets();
    gl.deleteFramebuffer(this.shadowFbo);
    gl.deleteTexture(this.shadowTexture);
    gl.deleteVertexArray(this.emptyVao);
    gl.deleteProgram(this.pbr.program);
    gl.deleteProgram(this.shadow.program);
    gl.deleteProgram(this.background.program);
    gl.deleteProgram(this.flat.program);
    this.scene = null;
  }
}
