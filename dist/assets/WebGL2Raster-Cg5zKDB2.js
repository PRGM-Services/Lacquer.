import{d as B,n as S,m as U,a as O,b as D,t as I,c as G,e as V}from"./index-CH3stMxW.js";const X=.05,z=200,y=2048,R=1024,M=4,C=Math.PI/180,N=`
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
`,W=`#version 300 es
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
`,k=`#version 300 es
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

${N}

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
`,H=`#version 300 es
layout(location = 0) in vec3 aPosition;
uniform mat4 uModel;
uniform mat4 uViewProj;
void main() {
  gl_Position = uViewProj * (uModel * vec4(aPosition, 1.0));
}
`,Y=`#version 300 es
precision mediump float;
uniform vec3 uColor;
out vec4 outColor;
void main() {
  outColor = vec4(uColor, 1.0);
}
`,K=`#version 300 es
layout(location = 0) in vec3 aPosition;
uniform mat4 uModel;
uniform mat4 uViewProj;
void main() {
  gl_Position = uViewProj * (uModel * vec4(aPosition, 1.0));
}
`,j=`#version 300 es
void main() {}
`,q=`#version 300 es
out vec2 vNdc;
void main() {
  // Fullscreen triangle from gl_VertexID, pinned to the far plane (z = w).
  vec2 p = vec2(float((gl_VertexID & 1) * 4) - 1.0, float((gl_VertexID >> 1) * 4) - 1.0);
  vNdc = p;
  gl_Position = vec4(p, 1.0, 1.0);
}
`,$=`#version 300 es
precision highp float;

in vec2 vNdc;
out vec4 outColor;

uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamForward;
uniform float uTanHalfFov;
uniform float uAspect;

${N}

void main() {
  vec3 dir = normalize(
    uCamForward
    + vNdc.x * uTanHalfFov * uAspect * uCamRight
    + vNdc.y * uTanHalfFov * uCamUp);
  outColor = vec4(finalizeColor(sampleEnv(dir, 0.0)), 1.0);
}
`;function Q(b,o,t,r,e,a){const n=new Float32Array(16);return n[0]=2/(o-b),n[5]=2/(r-t),n[10]=-2/(a-e),n[12]=-(o+b)/(o-b),n[13]=-(r+t)/(r-t),n[14]=-(a+e)/(a-e),n[15]=1,n}function Z(b,o,t){const r=Math.max(1,o>>1),e=Math.max(1,t>>1),a=new Float32Array(r*e*4);for(let n=0;n<e;n++){const s=Math.min(n*2,t-1),i=Math.min(n*2+1,t-1);for(let l=0;l<r;l++){const c=Math.min(l*2,o-1),h=Math.min(l*2+1,o-1),d=(n*r+l)*4;for(let u=0;u<4;u++)a[d+u]=.25*(b[(s*o+c)*4+u]+b[(s*o+h)*4+u]+b[(i*o+c)*4+u]+b[(i*o+h)*4+u])}}return{data:a,w:r,h:e}}const J={standard:0,wireframe:0,lighting:1,ao:2,shadow:3,reflection:4};class te{kind="webgl2-raster";canvas;gl;contextLost=!1;pbr;shadow;background;flat;emptyVao;scene=null;meshes=[];envTexture=null;envMaxLod=0;sunDirLocal=null;sunColorBase=[0,0,0];decalTexture=null;decalLayerOf=new Map;matTexOf=new Map;shadowTexture;shadowFbo;msaaSamples=1;renderFbo=null;resolveFbo=null;targetRbs=[];targetWidth=0;targetHeight=0;width;height;decalMats=new Float32Array(M*16);decalDirs=new Float32Array(M*3);decalParams=new Float32Array(M*4);lights0=new Float32Array(8*4);lights1=new Float32Array(8*4);lights2=new Float32Array(8*4);onContextLost=o=>{o.preventDefault(),this.contextLost=!0,console.warn("[lacquer/webgl2] WebGL context lost; rendering paused.")};onContextRestored=()=>{console.warn("[lacquer/webgl2] WebGL context restored; rebuilding GPU resources."),this.contextLost=!1,this.initStaticResources(),this.scene&&this.setScene(this.scene)};constructor(o){this.canvas=o;const t=o.getContext("webgl2",{antialias:!1,depth:!1,stencil:!1,alpha:!1,powerPreference:"high-performance"});if(!t)throw new Error("WebGL2 is not supported on this device");this.gl=t,this.width=o.width||1,this.height=o.height||1,o.addEventListener("webglcontextlost",this.onContextLost),o.addEventListener("webglcontextrestored",this.onContextRestored),this.initStaticResources()}initStaticResources(){const o=this.gl;o.getExtension("OES_texture_float_linear"),this.pbr=this.linkProgram(W,k,"pbr"),this.shadow=this.linkProgram(K,j,"shadow"),this.background=this.linkProgram(q,$,"background"),this.flat=this.linkProgram(H,Y,"flat"),o.useProgram(this.pbr.program),o.uniform1i(this.pbr.uniforms.uEnvTex,0),o.uniform1i(this.pbr.uniforms.uShadowMap,1),o.uniform1i(this.pbr.uniforms.uDecalTex,2),o.uniform1i(this.pbr.uniforms.uAlbedoMap,3),o.uniform1i(this.pbr.uniforms.uNormalMap,4),o.uniform1i(this.pbr.uniforms.uRoughnessMap,5),o.uniform1i(this.pbr.uniforms.uMetallicMap,6),o.useProgram(this.background.program),o.uniform1i(this.background.uniforms.uEnvTex,0),this.emptyVao=o.createVertexArray(),this.shadowTexture=o.createTexture(),o.bindTexture(o.TEXTURE_2D,this.shadowTexture),o.texStorage2D(o.TEXTURE_2D,1,o.DEPTH_COMPONENT24,y,y),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MIN_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MAG_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_S,o.CLAMP_TO_EDGE),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_T,o.CLAMP_TO_EDGE),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_COMPARE_MODE,o.COMPARE_REF_TO_TEXTURE),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_COMPARE_FUNC,o.LEQUAL),this.shadowFbo=o.createFramebuffer(),o.bindFramebuffer(o.FRAMEBUFFER,this.shadowFbo),o.framebufferTexture2D(o.FRAMEBUFFER,o.DEPTH_ATTACHMENT,o.TEXTURE_2D,this.shadowTexture,0),o.drawBuffers([o.NONE]),o.readBuffer(o.NONE),o.bindFramebuffer(o.FRAMEBUFFER,null),this.msaaSamples=Math.min(4,o.getParameter(o.MAX_SAMPLES)),this.targetWidth=0,this.targetHeight=0}linkProgram(o,t,r){const e=this.gl,a=(h,d)=>{const u=e.createShader(h);if(e.shaderSource(u,d),e.compileShader(u),!e.getShaderParameter(u,e.COMPILE_STATUS)&&!e.isContextLost())throw new Error(`[lacquer/webgl2] ${r} shader compile failed: ${e.getShaderInfoLog(u)}`);return u},n=a(e.VERTEX_SHADER,o),s=a(e.FRAGMENT_SHADER,t),i=e.createProgram();if(e.attachShader(i,n),e.attachShader(i,s),e.linkProgram(i),e.deleteShader(n),e.deleteShader(s),!e.getProgramParameter(i,e.LINK_STATUS)&&!e.isContextLost())throw new Error(`[lacquer/webgl2] ${r} program link failed: ${e.getProgramInfoLog(i)}`);const l={},c=e.getProgramParameter(i,e.ACTIVE_UNIFORMS);for(let h=0;h<c;h++){const d=e.getActiveUniform(i,h);if(!d)continue;const u=d.name.replace(/\[0\]$/,""),E=e.getUniformLocation(i,d.name);E&&(l[u]=E)}return{program:i,uniforms:l}}setScene(o){if(this.scene=o,!this.contextLost){this.disposeSceneResources();for(const t of o.getAllMeshes())t.geometry.indices.length!==0&&this.meshes.push(this.buildMeshGPU(t));this.uploadDecals(o),this.uploadEnvironment(o.environment),this.extractSun(o.environment)}}buildMeshGPU(o){const t=this.gl,r=o.geometry,e=r.positions.length/3,a=r.uvs.length>=e*2?r.uvs:new Float32Array(e*2),n=t.createVertexArray();t.bindVertexArray(n);const s=[],i=(d,u,E)=>{const m=t.createBuffer();s.push(m),t.bindBuffer(t.ARRAY_BUFFER,m),t.bufferData(t.ARRAY_BUFFER,u,t.STATIC_DRAW),t.enableVertexAttribArray(d),t.vertexAttribPointer(d,E,t.FLOAT,!1,0,0)};i(0,r.positions,3),i(1,r.normals,3),i(2,a,2);const l=t.createBuffer();s.push(l),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,l),t.bufferData(t.ELEMENT_ARRAY_BUFFER,r.indices,t.STATIC_DRAW),t.bindVertexArray(null);const c=[1/0,1/0,1/0],h=[-1/0,-1/0,-1/0];for(let d=0;d<e;d++)for(let u=0;u<3;u++){const E=r.positions[d*3+u];E<c[u]&&(c[u]=E),E>h[u]&&(h[u]=E)}return e===0&&(c[0]=c[1]=c[2]=0,h[0]=h[1]=h[2]=0),{mesh:o,vao:n,buffers:s,indexCount:r.indices.length,aabbMin:c,aabbMax:h,decalLayers:[],sortKey:0,lineVao:null,lineCount:0}}ensureWireframe(o){if(o.lineVao)return;const t=this.gl,r=o.mesh.geometry.indices,e=new Set,a=[];for(let i=0;i<r.length;i+=3)for(let l=0;l<3;l++){const c=r[i+l],h=r[i+(l+1)%3],d=c<h?c*16777216+h:h*16777216+c;e.has(d)||(e.add(d),a.push(c,h))}const n=t.createVertexArray();t.bindVertexArray(n),t.bindBuffer(t.ARRAY_BUFFER,o.buffers[0]),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,3,t.FLOAT,!1,0,0);const s=t.createBuffer();o.buffers.push(s),t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,s),t.bufferData(t.ELEMENT_ARRAY_BUFFER,new Uint32Array(a),t.STATIC_DRAW),t.bindVertexArray(null),o.lineVao=n,o.lineCount=a.length}uploadDecals(o){const t=this.gl;this.decalLayerOf.clear();const r=[];for(const n of o.getAllMeshes()){n.decals.length>M&&console.warn(`[lacquer/webgl2] mesh "${n.name}" has ${n.decals.length} decals; only the first ${M} are rendered.`);for(const s of n.decals.slice(0,M))this.decalLayerOf.has(s)||(this.decalLayerOf.set(s,r.length),r.push(s))}const e=Math.max(1,r.length);this.decalTexture=t.createTexture(),t.bindTexture(t.TEXTURE_2D_ARRAY,this.decalTexture);const a=Math.floor(Math.log2(R))+1;if(t.texStorage3D(t.TEXTURE_2D_ARRAY,a,t.SRGB8_ALPHA8,R,R,e),t.texParameteri(t.TEXTURE_2D_ARRAY,t.TEXTURE_MIN_FILTER,t.LINEAR_MIPMAP_LINEAR),t.texParameteri(t.TEXTURE_2D_ARRAY,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D_ARRAY,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D_ARRAY,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),r.length>0){const n=document.createElement("canvas");n.width=R,n.height=R;const s=n.getContext("2d");if(!s)throw new Error("[lacquer/webgl2] could not create 2D staging context for decals");t.pixelStorei(t.UNPACK_FLIP_Y_WEBGL,!1),t.pixelStorei(t.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1);for(let i=0;i<r.length;i++)s.clearRect(0,0,R,R),s.drawImage(r[i].image,0,0,R,R),t.texSubImage3D(t.TEXTURE_2D_ARRAY,0,0,0,i,R,R,1,t.RGBA,t.UNSIGNED_BYTE,n);t.generateMipmap(t.TEXTURE_2D_ARRAY)}for(const n of this.meshes)n.decalLayers=n.mesh.decals.slice(0,M).map(s=>this.decalLayerOf.get(s)??0)}uploadEnvironment(o){const t=this.gl,r=o.width*o.height;let e=new Float32Array(r*4);for(let c=0;c<r;c++)e[c*4]=o.data[c*3],e[c*4+1]=o.data[c*3+1],e[c*4+2]=o.data[c*3+2],e[c*4+3]=1;const a=[{data:e,w:o.width,h:o.height}];let{w:n,h:s}={w:o.width,h:o.height};for(;n>1||s>1;){const c=Z(e,n,s);a.push(c),e=c.data,n=c.w,s=c.h}this.envMaxLod=a.length-1;const i=c=>{for(;t.getError()!==t.NO_ERROR;);for(let h=0;h<a.length;h++)t.texImage2D(t.TEXTURE_2D,h,c,a[h].w,a[h].h,0,t.RGBA,t.FLOAT,a[h].data);return t.getError()===t.NO_ERROR};this.envTexture=t.createTexture(),t.bindTexture(t.TEXTURE_2D,this.envTexture),t.pixelStorei(t.UNPACK_FLIP_Y_WEBGL,!1);let l=!0;i(t.RGBA16F)||(l=t.getExtension("OES_texture_float_linear")!==null,i(t.RGBA32F)||console.warn("[lacquer/webgl2] float environment upload failed; IBL will be black.")),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,l?t.LINEAR_MIPMAP_LINEAR:t.NEAREST_MIPMAP_NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,l?t.LINEAR:t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.REPEAT),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAX_LEVEL,this.envMaxLod)}extractSun(o){const{width:t,height:r,data:e}=o;this.sunDirLocal=null,this.sunColorBase=[0,0,0];let a=0,n=-1;for(let d=0;d<t*r;d++){const u=.2126*e[d*3]+.7152*e[d*3+1]+.0722*e[d*3+2];u>a&&(a=u,n=d)}if(n<0||a<=1e-4)return;const s=d=>{const u=d%t,E=d/t|0,m=Math.PI*(E+.5)/r,g=2*Math.PI*(u+.5)/t-Math.PI,p=Math.sin(m);return[p*Math.sin(g),Math.cos(m),p*Math.cos(g)]},i=s(n),l=Math.cos(5*C),c=[0,0,0],h=[0,0,0];for(let d=0;d<r;d++){const u=Math.sin(Math.PI*(d+.5)/r),E=2*Math.PI/t*(Math.PI/r)*u;for(let m=0;m<t;m++){const g=d*t+m,p=e[g*3],A=e[g*3+1],v=e[g*3+2],x=.2126*p+.7152*A+.0722*v;if(x<.5*a)continue;const P=s(g);B(P,i)<l||(c[0]+=p*E,c[1]+=A*E,c[2]+=v*E,h[0]+=P[0]*x,h[1]+=P[1]*x,h[2]+=P[2]*x)}}this.sunDirLocal=S(h),this.sunColorBase=c}render(o){const t={samples:1,triangles:0,backend:this.kind},r=this.scene;if(this.contextLost||!r)return t;const e=this.gl,a=o.viewMode??"standard",n=Math.min(1,Math.max(.25,o.resolutionScale)),s=Math.max(1,Math.round(this.width*n)),i=Math.max(1,Math.round(this.height*n));this.ensureRenderTargets(s,i);const l=r.camera,c=U(l.position,l.target,l.up),h=O(l.fovYDeg*C,s/i,X,z),d=D(h,c),u=r.environment;let E=[0,1,0],m=[0,0,0];if(this.sunDirLocal){const[f,T,_]=this.sunDirLocal,w=Math.cos(u.rotation),F=Math.sin(u.rotation);E=[f*w+_*F,T,_*w-f*F],m=[this.sunColorBase[0]*u.intensity,this.sunColorBase[1]*u.intensity,this.sunColorBase[2]*u.intensity]}const g=[],p=[];for(const f of this.meshes){if(!this.scene?.isMeshRenderable(f.mesh)||f.indexCount===0)continue;const T=I(f.mesh.getWorldTransform(),[(f.aabbMin[0]+f.aabbMax[0])/2,(f.aabbMin[1]+f.aabbMax[1])/2,(f.aabbMin[2]+f.aabbMax[2])/2]),_=T[0]-l.position[0],w=T[1]-l.position[1],F=T[2]-l.position[2];f.sortKey=_*_+w*w+F*F,(a==="standard"&&f.mesh.material.transmission>0?p:g).push(f),t.triangles+=f.indexCount/3}if(g.sort((f,T)=>f.sortKey-T.sortKey),p.sort((f,T)=>T.sortKey-f.sortKey),a==="wireframe")return this.renderWireframe(g,d,s,i),this.blitToCanvas(s,i),t;const A=this.renderShadowPass(g,E,m);e.bindFramebuffer(e.FRAMEBUFFER,this.renderFbo),e.viewport(0,0,s,i),a==="ao"||a==="shadow"?e.clearColor(.16,.165,.18,1):o.envBackground===!1?e.clearColor(.075,.075,.082,1):e.clearColor(0,0,0,1),e.clear(e.COLOR_BUFFER_BIT|e.DEPTH_BUFFER_BIT),e.enable(e.DEPTH_TEST),e.depthFunc(e.LEQUAL),e.depthMask(!0),e.enable(e.CULL_FACE),e.cullFace(e.BACK),e.disable(e.BLEND),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,this.envTexture),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,this.shadowTexture),e.activeTexture(e.TEXTURE2),e.bindTexture(e.TEXTURE_2D_ARRAY,this.decalTexture),e.useProgram(this.pbr.program);const v=this.pbr.uniforms;e.uniformMatrix4fv(v.uViewProj,!1,d),e.uniformMatrix4fv(v.uShadowMatrix,!1,A),e.uniform3fv(v.uCameraPos,l.position),e.uniform3fv(v.uSunDir,E),e.uniform3fv(v.uSunColor,m),e.uniform1f(v.uShadowTexel,1/y),e.uniform1f(v.uEnvIntensity,u.intensity),e.uniform1f(v.uEnvRotation,u.rotation),e.uniform1f(v.uEnvMaxLod,this.envMaxLod),e.uniform1f(v.uExposure,o.exposure),e.uniform1i(v.uViewMode,J[a]);const x=r.lights.filter(f=>f.visible).slice(0,8),P={point:0,spot:1,directional:2,rect:3,octagon:4};x.forEach((f,T)=>{const{outer:_,inner:w}=f.coneCosines(),F=Math.hypot(...f.direction)||1,L=f.intensity*f.emitterArea();this.lights0.set([...f.position,P[f.type]],T*4),this.lights1.set([f.color[0]*L,f.color[1]*L,f.color[2]*L,_],T*4),this.lights2.set([f.direction[0]/F,f.direction[1]/F,f.direction[2]/F,w],T*4)}),e.uniform1i(v.uLightCount,x.length),x.length>0&&(e.uniform4fv(v.uLights0,this.lights0,0,x.length*4),e.uniform4fv(v.uLights1,this.lights1,0,x.length*4),e.uniform4fv(v.uLights2,this.lights2,0,x.length*4));for(const f of g)this.drawMesh(f);if(a==="ao"||a==="shadow"||o.envBackground===!1||this.renderBackground(l,s/i,u,o.exposure),p.length>0){e.useProgram(this.pbr.program),e.enable(e.BLEND),e.blendFunc(e.ONE,e.ONE_MINUS_SRC_ALPHA),e.depthMask(!1),e.disable(e.CULL_FACE);for(const f of p)this.drawMesh(f);e.depthMask(!0),e.disable(e.BLEND),e.enable(e.CULL_FACE)}return this.blitToCanvas(s,i),t}renderWireframe(o,t,r,e){const a=this.gl;a.bindFramebuffer(a.FRAMEBUFFER,this.renderFbo),a.viewport(0,0,r,e),a.clearColor(.055,.06,.07,1),a.clear(a.COLOR_BUFFER_BIT|a.DEPTH_BUFFER_BIT),a.enable(a.DEPTH_TEST),a.depthFunc(a.LEQUAL),a.depthMask(!0),a.disable(a.BLEND),a.disable(a.CULL_FACE),a.useProgram(this.flat.program);const n=this.flat.uniforms;a.uniformMatrix4fv(n.uViewProj,!1,t),a.enable(a.POLYGON_OFFSET_FILL),a.polygonOffset(1,1),a.uniform3f(n.uColor,.09,.095,.11);for(const s of o)a.uniformMatrix4fv(n.uModel,!1,s.mesh.getWorldTransform()),a.bindVertexArray(s.vao),a.drawElements(a.TRIANGLES,s.indexCount,a.UNSIGNED_INT,0);a.disable(a.POLYGON_OFFSET_FILL),a.uniform3f(n.uColor,.62,.68,.78);for(const s of o)this.ensureWireframe(s),a.uniformMatrix4fv(n.uModel,!1,s.mesh.getWorldTransform()),a.bindVertexArray(s.lineVao),a.drawElements(a.LINES,s.lineCount,a.UNSIGNED_INT,0);a.bindVertexArray(null),a.enable(a.CULL_FACE)}materialTexture(o,t){let r=this.matTexOf.get(o);if(r)return r;const e=this.gl;return r=e.createTexture(),e.bindTexture(e.TEXTURE_2D,r),e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,!1),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),e.texImage2D(e.TEXTURE_2D,0,t?e.SRGB8_ALPHA8:e.RGBA8,e.RGBA,e.UNSIGNED_BYTE,o),e.generateMipmap(e.TEXTURE_2D),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR_MIPMAP_LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.REPEAT),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.REPEAT),this.matTexOf.set(o,r),r}drawMesh(o){const t=this.gl,r=this.pbr.uniforms,e=o.mesh,a=e.material,n=(l,c,h)=>c?(t.activeTexture(t.TEXTURE0+l),t.bindTexture(t.TEXTURE_2D,this.materialTexture(c,h)),1):0;t.uniform4i(r.uMapFlags,n(3,a.albedoMap,!0),n(4,a.normalMap,!1),n(5,a.roughnessMap,!1),n(6,a.metallicMap,!1)),t.uniform1f(r.uTexScale,Math.max(.01,a.texScale||1)),t.uniform1i(r.uTriplanar,a.triplanar?1:0);const s=e.getWorldTransform();t.uniformMatrix4fv(r.uModel,!1,s),t.uniformMatrix4fv(r.uNormalMat,!1,G(s)),t.uniform3fv(r.uBaseColor,a.baseColor),t.uniform1f(r.uMetallic,a.metallic),t.uniform1f(r.uRoughness,a.roughness),t.uniform1f(r.uClearcoat,a.clearcoat),t.uniform1f(r.uClearcoatRoughness,a.clearcoatRoughness),t.uniform1f(r.uTransmission,a.transmission),t.uniform1f(r.uIor,a.ior),t.uniform3fv(r.uEmissive,a.emissive),t.uniform1f(r.uFlakeIntensity,a.flakeIntensity),t.uniform1f(r.uFlakeScale,a.flakeScale);const i=Math.min(e.decals.length,M);if(t.uniform1i(r.uDecalCount,i),i>0){for(let l=0;l<i;l++){const c=e.decals[l];this.decalMats.set(c.worldToDecal(),l*16),this.decalDirs.set(S(c.projectionDir()),l*3),this.decalParams[l*4]=c.opacity,this.decalParams[l*4+1]=Math.cos(c.angleCutoffDeg*C),this.decalParams[l*4+2]=c.roughness,this.decalParams[l*4+3]=o.decalLayers[l]??0}t.uniformMatrix4fv(r.uDecalMat,!1,this.decalMats,0,i*16),t.uniform3fv(r.uDecalDir,this.decalDirs,0,i*3),t.uniform4fv(r.uDecalParams,this.decalParams,0,i*4)}t.bindVertexArray(o.vao),t.drawElements(t.TRIANGLES,o.indexCount,t.UNSIGNED_INT,0),t.bindVertexArray(null)}renderShadowPass(o,t,r){const e=this.gl;if(r[0]+r[1]+r[2]<=0||o.length===0){const m=V();return m[0]=m[5]=m[10]=0,m[14]=1,m}const a=[1/0,1/0,1/0],n=[-1/0,-1/0,-1/0];for(const m of o){const g=m.mesh.getWorldTransform();for(let p=0;p<8;p++){const A=I(g,[p&1?m.aabbMax[0]:m.aabbMin[0],p&2?m.aabbMax[1]:m.aabbMin[1],p&4?m.aabbMax[2]:m.aabbMin[2]]);for(let v=0;v<3;v++)A[v]<a[v]&&(a[v]=A[v]),A[v]>n[v]&&(n[v]=A[v])}}const s=[(a[0]+n[0])/2,(a[1]+n[1])/2,(a[2]+n[2])/2],i=Math.max(.5,Math.hypot(n[0]-a[0],n[1]-a[1],n[2]-a[2])/2),l=[s[0]+t[0]*(i+1),s[1]+t[1]*(i+1),s[2]+t[2]*(i+1)],c=Math.abs(t[1])>.99?[0,0,1]:[0,1,0],h=U(l,s,c),d=Q(-i,i,-i,i,.05,2*i+2),u=D(d,h);e.bindFramebuffer(e.FRAMEBUFFER,this.shadowFbo),e.viewport(0,0,y,y),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,null),e.clear(e.DEPTH_BUFFER_BIT),e.enable(e.DEPTH_TEST),e.depthFunc(e.LEQUAL),e.depthMask(!0),e.enable(e.CULL_FACE),e.cullFace(e.BACK),e.disable(e.BLEND),e.enable(e.POLYGON_OFFSET_FILL),e.polygonOffset(2,4),e.useProgram(this.shadow.program),e.uniformMatrix4fv(this.shadow.uniforms.uViewProj,!1,u);for(const m of o)e.uniformMatrix4fv(this.shadow.uniforms.uModel,!1,m.mesh.getWorldTransform()),e.bindVertexArray(m.vao),e.drawElements(e.TRIANGLES,m.indexCount,e.UNSIGNED_INT,0);e.bindVertexArray(null),e.disable(e.POLYGON_OFFSET_FILL),e.bindFramebuffer(e.FRAMEBUFFER,null);const E=new Float32Array([.5,0,0,0,0,.5,0,0,0,0,.5,0,.5,.5,.5,1]);return D(E,u)}renderBackground(o,t,r,e){const a=this.gl,{forward:n,right:s,up:i}=o.basis();a.useProgram(this.background.program);const l=this.background.uniforms;a.uniform3fv(l.uCamRight,s),a.uniform3fv(l.uCamUp,i),a.uniform3fv(l.uCamForward,n),a.uniform1f(l.uTanHalfFov,Math.tan(o.fovYDeg*C/2)),a.uniform1f(l.uAspect,t),a.uniform1f(l.uEnvIntensity,r.intensity),a.uniform1f(l.uEnvRotation,r.rotation),a.uniform1f(l.uEnvMaxLod,this.envMaxLod),a.uniform1f(l.uExposure,e),a.depthMask(!1),a.bindVertexArray(this.emptyVao),a.drawArrays(a.TRIANGLES,0,3),a.bindVertexArray(null),a.depthMask(!0)}ensureRenderTargets(o,t){if(this.renderFbo&&o===this.targetWidth&&t===this.targetHeight)return;const r=this.gl;this.destroyRenderTargets(),this.targetWidth=o,this.targetHeight=t;const e=this.msaaSamples>1,a=(n,s)=>{const i=r.createRenderbuffer();return this.targetRbs.push(i),r.bindRenderbuffer(r.RENDERBUFFER,i),s>1?r.renderbufferStorageMultisample(r.RENDERBUFFER,s,n,o,t):r.renderbufferStorage(r.RENDERBUFFER,n,o,t),i};this.renderFbo=r.createFramebuffer(),r.bindFramebuffer(r.FRAMEBUFFER,this.renderFbo),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.RENDERBUFFER,a(r.RGBA8,this.msaaSamples)),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.DEPTH_ATTACHMENT,r.RENDERBUFFER,a(r.DEPTH_COMPONENT24,this.msaaSamples)),e&&(this.resolveFbo=r.createFramebuffer(),r.bindFramebuffer(r.FRAMEBUFFER,this.resolveFbo),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.RENDERBUFFER,a(r.RGBA8,1))),r.bindFramebuffer(r.FRAMEBUFFER,null)}blitToCanvas(o,t){const r=this.gl;let e=this.renderFbo;this.resolveFbo&&(r.bindFramebuffer(r.READ_FRAMEBUFFER,this.renderFbo),r.bindFramebuffer(r.DRAW_FRAMEBUFFER,this.resolveFbo),r.blitFramebuffer(0,0,o,t,0,0,o,t,r.COLOR_BUFFER_BIT,r.NEAREST),e=this.resolveFbo);const a=r.drawingBufferWidth,n=r.drawingBufferHeight;r.bindFramebuffer(r.READ_FRAMEBUFFER,e),r.bindFramebuffer(r.DRAW_FRAMEBUFFER,null),r.blitFramebuffer(0,0,o,t,0,0,a,n,r.COLOR_BUFFER_BIT,o===a&&t===n?r.NEAREST:r.LINEAR),r.bindFramebuffer(r.READ_FRAMEBUFFER,null)}destroyRenderTargets(){const o=this.gl;this.renderFbo&&o.deleteFramebuffer(this.renderFbo),this.resolveFbo&&o.deleteFramebuffer(this.resolveFbo);for(const t of this.targetRbs)o.deleteRenderbuffer(t);this.renderFbo=null,this.resolveFbo=null,this.targetRbs=[]}resetAccumulation(){}updateLights(o){}resize(o,t){this.width=Math.max(1,o),this.height=Math.max(1,t)}disposeSceneResources(){const o=this.gl;for(const t of this.meshes){o.deleteVertexArray(t.vao),t.lineVao&&o.deleteVertexArray(t.lineVao);for(const r of t.buffers)o.deleteBuffer(r)}this.meshes=[],this.envTexture&&(o.deleteTexture(this.envTexture),this.envTexture=null),this.decalTexture&&(o.deleteTexture(this.decalTexture),this.decalTexture=null),this.decalLayerOf.clear();for(const t of this.matTexOf.values())o.deleteTexture(t);this.matTexOf.clear()}dispose(){const o=this.gl;this.canvas.removeEventListener("webglcontextlost",this.onContextLost),this.canvas.removeEventListener("webglcontextrestored",this.onContextRestored),this.disposeSceneResources(),this.destroyRenderTargets(),o.deleteFramebuffer(this.shadowFbo),o.deleteTexture(this.shadowTexture),o.deleteVertexArray(this.emptyVao),o.deleteProgram(this.pbr.program),o.deleteProgram(this.shadow.program),o.deleteProgram(this.background.program),o.deleteProgram(this.flat.program),this.scene=null}}export{te as WebGL2Raster};
//# sourceMappingURL=WebGL2Raster-Cg5zKDB2.js.map
