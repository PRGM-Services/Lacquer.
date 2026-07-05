function Se(c){const e=[],t=c.getAllMeshes();t.forEach((i,S)=>{if(!c.isMeshRenderable(i)||i.geometry.indices.length===0)return;const s=i.worldGeometry(),M=s.indices;for(let z=0;z<M.length;z+=3){const p=M[z],G=M[z+1],l=M[z+2],o=new Float32Array(32),B=[s.positions[p*3],s.positions[G*3],s.positions[l*3]],y=[s.positions[p*3+1],s.positions[G*3+1],s.positions[l*3+1]],g=[s.positions[p*3+2],s.positions[G*3+2],s.positions[l*3+2]];o[0]=B[0],o[1]=y[0],o[2]=g[0],o[3]=S,o[4]=B[1],o[5]=y[1],o[6]=g[1],o[7]=0,o[8]=B[2],o[9]=y[2],o[10]=g[2],o[11]=0;for(let C=0;C<3;C++){const r=[p,G,l][C];o[12+C*4]=s.normals[r*3],o[13+C*4]=s.normals[r*3+1],o[14+C*4]=s.normals[r*3+2],o[15+C*4]=s.uvs.length?s.uvs[r*2]:0}o[24]=s.uvs.length?s.uvs[p*2+1]:0,o[25]=s.uvs.length?s.uvs[G*2+1]:0,o[26]=s.uvs.length?s.uvs[l*2+1]:0,o[27]=0;const A=Math.min(B[0],B[1],B[2]),k=Math.min(y[0],y[1],y[2]),_=Math.min(g[0],g[1],g[2]),P=Math.max(B[0],B[1],B[2]),O=Math.max(y[0],y[1],y[2]),U=Math.max(g[0],g[1],g[2]);e.push({cx:(A+P)/2,cy:(k+O)/2,cz:(_+U)/2,minx:A,miny:k,minz:_,maxx:P,maxy:O,maxz:U,data:o})}});const n=e.length;if(n===0)return{nodes:new Float32Array(8),nodeCount:1,triangles:new Float32Array(0),triangleCount:0,meshCount:t.length};const a=new Uint32Array(n);for(let i=0;i<n;i++)a[i]=i;const d=new Float32Array(2*n*8),D=new Uint32Array(d.buffer);let m=0;const E=()=>m++,L=[],N=E();L.push({first:0,count:n,nodeIndex:N});const H=4;for(;L.length;){const{first:i,count:S,nodeIndex:s}=L.pop();let M=1/0,z=1/0,p=1/0,G=-1/0,l=-1/0,o=-1/0,B=1/0,y=1/0,g=1/0,A=-1/0,k=-1/0,_=-1/0;for(let v=i;v<i+S;v++){const u=e[a[v]];M=Math.min(M,u.minx),z=Math.min(z,u.miny),p=Math.min(p,u.minz),G=Math.max(G,u.maxx),l=Math.max(l,u.maxy),o=Math.max(o,u.maxz),B=Math.min(B,u.cx),y=Math.min(y,u.cy),g=Math.min(g,u.cz),A=Math.max(A,u.cx),k=Math.max(k,u.cy),_=Math.max(_,u.cz)}const P=s*8;d[P]=M,d[P+1]=z,d[P+2]=p,d[P+4]=G,d[P+5]=l,d[P+6]=o;const O=()=>{D[P+3]=i,D[P+7]=S};if(S<=H){O();continue}const U=[A-B,k-y,_-g],C=U[0]>U[1]?U[0]>U[2]?0:2:U[1]>U[2]?1:2,r=[B,y,g][C],b=U[C];if(b<1e-12){O();continue}const h=new Float32Array(12*3).fill(1/0),w=new Float32Array(12*3).fill(-1/0),I=new Uint32Array(12),X=v=>C===0?v.cx:C===1?v.cy:v.cz;for(let v=i;v<i+S;v++){const u=e[a[v]];let f=Math.floor((X(u)-r)/b*12);f>=12&&(f=11),f<0&&(f=0),I[f]++,h[f*3]=Math.min(h[f*3],u.minx),h[f*3+1]=Math.min(h[f*3+1],u.miny),h[f*3+2]=Math.min(h[f*3+2],u.minz),w[f*3]=Math.max(w[f*3],u.maxx),w[f*3+1]=Math.max(w[f*3+1],u.maxy),w[f*3+2]=Math.max(w[f*3+2],u.maxz)}const ee=(v,u,f,Z,J,K)=>{const W=Math.max(0,Z-v),j=Math.max(0,J-u),Y=Math.max(0,K-f);return 2*(W*j+j*Y+Y*W)};let ne=1/0,R=-1;for(let v=1;v<12;v++){let u=0,f=0,Z=1/0,J=1/0,K=1/0,W=-1/0,j=-1/0,Y=-1/0,ie=1/0,se=1/0,oe=1/0,le=-1/0,ce=-1/0,ue=-1/0;for(let x=0;x<v;x++)I[x]&&(u+=I[x],Z=Math.min(Z,h[x*3]),J=Math.min(J,h[x*3+1]),K=Math.min(K,h[x*3+2]),W=Math.max(W,w[x*3]),j=Math.max(j,w[x*3+1]),Y=Math.max(Y,w[x*3+2]));for(let x=v;x<12;x++)I[x]&&(f+=I[x],ie=Math.min(ie,h[x*3]),se=Math.min(se,h[x*3+1]),oe=Math.min(oe,h[x*3+2]),le=Math.max(le,w[x*3]),ce=Math.max(ce,w[x*3+1]),ue=Math.max(ue,w[x*3+2]));if(u===0||f===0)continue;const he=u*ee(Z,J,K,W,j,Y)+f*ee(ie,se,oe,le,ce,ue);he<ne&&(ne=he,R=v)}if(R<0){O();continue}const Ie=r+b*R/12;let V=i,te=i+S-1;for(;V<=te;)if(X(e[a[V]])<Ie)V++;else{const v=a[V];a[V]=a[te],a[te]=v,te--}let q=V-i;(q===0||q===S)&&(q=S>>1);const re=E(),pe=E();if(D[P+3]=re,D[P+7]=0,pe!==re+1)throw new Error("BVH internal error: non-contiguous children");L.push({first:i,count:q,nodeIndex:re}),L.push({first:i+q,count:S-q,nodeIndex:pe})}const F=new Float32Array(n*32),T=new Uint32Array(F.buffer);for(let i=0;i<n;i++)F.set(e[a[i]].data,i*32),T[i*32+3]=e[a[i]].data[3];return{nodes:d.slice(0,m*8),nodeCount:m,triangles:F,triangleCount:n,meshCount:t.length}}const ze=`// Lacquer — progressive megakernel path tracer.
//
// One dispatch = one sample per pixel, accumulated into a storage buffer and
// resolved by tonemap.wgsl. Unidirectional path tracing with:
//   * binned-SAH BVH traversal (ordered, stack-based)
//   * multi-lobe BSDF: Lambert diffuse, GGX specular, GGX clearcoat,
//     smooth dielectric transmission (delta), metallic-flake sparkle
//   * HDRI environment with luminance-weighted CDF importance sampling and
//     balance-heuristic MIS against BSDF sampling
//   * per-mesh projected decals composited into albedo before shading
//   * Russian roulette, firefly clamping, thin-lens depth of field

struct Uniforms {
  // xyz + one packed scalar each (see WebGPUPathTracer.ts)
  camPos: vec4f,      // w = tan(fovY/2)
  camForward: vec4f,  // w = aspect
  camRight: vec4f,    // w = aperture radius
  camUp: vec4f,       // w = focus distance
  resolution: vec4u,  // x,y = render size, z = frameIndex, w = sampleCount
  params0: vec4u,     // maxBounces, triCount, envWidth, envHeight
  params1: vec4f,     // envRotation, envIntensity, envTotalWeight, fireflyClamp
  params2: vec4f,     // exposure, lightCount (bitcast u32), envBackground (bitcast u32)
  params3: vec4f,     // x = upsampling flag (used by the resolve pass only)
}

@group(0) @binding(0) var<uniform> uni: Uniforms;
@group(0) @binding(1) var<storage, read_write> accum: array<vec4f>;
@group(0) @binding(2) var<storage, read> tris: array<vec4f>;      // 8 vec4 / tri
@group(0) @binding(3) var<storage, read> bvh: array<vec4f>;       // 2 vec4 / node
@group(0) @binding(4) var<storage, read> meshInfos: array<vec4u>; // material, decalOfs, decalCount
@group(0) @binding(5) var<storage, read> materials: array<vec4f>; // 4 vec4 / material
@group(0) @binding(6) var<storage, read> decals: array<vec4f>;    // 6 vec4 / decal
@group(0) @binding(7) var<storage, read> envCDF: array<f32>;      // [marginal h][cond w*h]
// 4 vec4 / light:
//   [pos, type] [color*intensity, cosOuter] [dir, cosInner] [width, height, 0, 0]
// type: 0 point, 1 spot, 2 directional, 3 rect area, 4 octagon area
@group(0) @binding(8) var<storage, read> lights: array<vec4f>;
// accum holds TWO vec4 per pixel (kept in one buffer to stay within the
// 8-storage-buffer minimum for mobile GPUs):
//   [idx*2]   = accumulated radiance.rgb + sample count
//   [idx*2+1] = denoiser guide: primary-hit normal.xyz + hitDistance (w<0 sky)

@group(1) @binding(0) var envTex: texture_2d<f32>;
@group(1) @binding(1) var envSampler: sampler;
@group(1) @binding(2) var decalTex: texture_2d_array<f32>;
@group(1) @binding(3) var decalSampler: sampler;
@group(1) @binding(4) var matTex: texture_2d_array<f32>;   // material maps, linear storage
@group(1) @binding(5) var matSampler: sampler;             // repeat/repeat

// Material map layers pack into one u32: albedo | normal<<8 | rough<<16 | metal<<24.
const MAP_NONE: u32 = 0xffu;

const PI = 3.14159265358979;
const INV_PI = 0.31830988618;
const EPS_DIST = 1e-4;
const MAX_DIST = 1e30;

// ---------------------------------------------------------------- RNG (PCG)
var<private> rngState: u32;

fn initRNG(pixel: vec2u, frame: u32) {
  rngState = pixel.x * 1973u + pixel.y * 9277u + frame * 26699u + 1u;
  rngState = pcg(pcg(rngState));
}
fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn rand() -> f32 {
  rngState = rngState * 747796405u + 2891336453u;
  let w = ((rngState >> ((rngState >> 28u) + 4u)) ^ rngState) * 277803737u;
  return f32((w >> 22u) ^ w) * (1.0 / 4294967295.0);
}
fn rand2() -> vec2f { return vec2f(rand(), rand()); }

fn hash3(p: vec3f) -> vec3f {
  var q = vec3u(bitcast<u32>(p.x), bitcast<u32>(p.y), bitcast<u32>(p.z));
  q = q * vec3u(1597334673u, 3812015801u, 2798796415u);
  let n = (q.x ^ q.y ^ q.z) * 1597334673u;
  return vec3f(
    f32(pcg(n)) * (1.0 / 4294967295.0),
    f32(pcg(n + 1u)) * (1.0 / 4294967295.0),
    f32(pcg(n + 2u)) * (1.0 / 4294967295.0));
}

// ------------------------------------------------------------ Intersection
struct Hit {
  t: f32,
  triIndex: u32,
  bary: vec2f,
}

fn intersectTriangle(orig: vec3f, dir: vec3f, tri: u32, tMax: f32) -> vec3f {
  // returns (t, u, v); t < 0 on miss
  let base = tri * 8u;
  let v0 = tris[base].xyz;
  let v1 = tris[base + 1u].xyz;
  let v2 = tris[base + 2u].xyz;
  let e1 = v1 - v0;
  let e2 = v2 - v0;
  let p = cross(dir, e2);
  let det = dot(e1, p);
  if (abs(det) < 1e-12) { return vec3f(-1.0, 0.0, 0.0); }
  let invDet = 1.0 / det;
  let tv = orig - v0;
  let u = dot(tv, p) * invDet;
  if (u < -1e-6 || u > 1.0 + 1e-6) { return vec3f(-1.0, 0.0, 0.0); }
  let q = cross(tv, e1);
  let v = dot(dir, q) * invDet;
  if (v < -1e-6 || u + v > 1.0 + 1e-6) { return vec3f(-1.0, 0.0, 0.0); }
  let t = dot(e2, q) * invDet;
  if (t < EPS_DIST || t > tMax) { return vec3f(-1.0, 0.0, 0.0); }
  return vec3f(t, u, v);
}

fn aabbHit(bmin: vec3f, bmax: vec3f, orig: vec3f, invDir: vec3f, tMax: f32) -> f32 {
  let t0 = (bmin - orig) * invDir;
  let t1 = (bmax - orig) * invDir;
  let tsm = min(t0, t1);
  let tbg = max(t0, t1);
  let tNear = max(max(tsm.x, tsm.y), max(tsm.z, 0.0));
  let tFar = min(min(tbg.x, tbg.y), min(tbg.z, tMax));
  if (tNear <= tFar) { return tNear; }
  return -1.0;
}

fn traverse(orig: vec3f, dir: vec3f, tMax: f32, anyHit: bool) -> Hit {
  var hit: Hit;
  hit.t = tMax;
  hit.triIndex = 0xffffffffu;
  hit.bary = vec2f(0.0);
  if (uni.params0.y == 0u) { return hit; }

  let invDir = 1.0 / select(dir, vec3f(1e-12), abs(dir) < vec3f(1e-12));
  var stack: array<u32, 40>;
  var sp = 0;
  var node = 0u;

  loop {
    let n0 = bvh[node * 2u];
    let n1 = bvh[node * 2u + 1u];
    let count = bitcast<u32>(n1.w);
    let leftFirst = bitcast<u32>(n0.w);

    if (count > 0u) {
      // leaf
      for (var i = 0u; i < count; i++) {
        let tuv = intersectTriangle(orig, dir, leftFirst + i, hit.t);
        if (tuv.x > 0.0) {
          hit.t = tuv.x;
          hit.triIndex = leftFirst + i;
          hit.bary = tuv.yz;
          if (anyHit) { return hit; }
        }
      }
    } else {
      let l = leftFirst;
      let r = leftFirst + 1u;
      let ln0 = bvh[l * 2u];
      let ln1 = bvh[l * 2u + 1u];
      let rn0 = bvh[r * 2u];
      let rn1 = bvh[r * 2u + 1u];
      var tl = aabbHit(ln0.xyz, ln1.xyz, orig, invDir, hit.t);
      var tr = aabbHit(rn0.xyz, rn1.xyz, orig, invDir, hit.t);
      var near = l;
      var far = r;
      if (tr >= 0.0 && (tl < 0.0 || tr < tl)) {
        near = r; far = l;
        let tmp = tl; tl = tr; tr = tmp;
      }
      if (tl >= 0.0) {
        if (tr >= 0.0 && sp < 40) {
          stack[sp] = far;
          sp++;
        }
        node = near;
        continue;
      }
    }
    if (sp == 0) { break; }
    sp--;
    node = stack[sp];
  }
  return hit;
}

// Shadow ray that passes through smooth transmissive surfaces (glass casts
// light-tinted, not opaque, shadows). Refraction bending is ignored — the
// standard "transparent shadows" approximation; caustic focusing still
// arrives via BSDF path sampling.
fn occluded(orig: vec3f, dir: vec3f, tMax: f32) -> bool {
  var o = orig;
  for (var i = 0u; i < 8u; i++) {
    let h = traverse(o, dir, tMax, false);
    if (h.triIndex == 0xffffffffu) { return false; }
    let meshIndex = bitcast<u32>(tris[h.triIndex * 8u].w);
    let m2 = materials[meshInfos[meshIndex].x * 4u + 2u]; // z = transmission
    if (m2.z < 0.99) { return true; }
    o = o + dir * (h.t + 2e-4);
  }
  return true;
}

// ------------------------------------------------------------- Environment
fn rotateY(d: vec3f, a: f32) -> vec3f {
  let c = cos(a);
  let s = sin(a);
  return vec3f(c * d.x + s * d.z, d.y, -s * d.x + c * d.z);
}

fn envUV(dir: vec3f) -> vec2f {
  let d = rotateY(dir, -uni.params1.x);
  let u = (atan2(d.x, d.z) + PI) / (2.0 * PI);
  let v = acos(clamp(d.y, -1.0, 1.0)) / PI;
  return vec2f(u, v);
}

fn envRadiance(dir: vec3f) -> vec3f {
  let uv = envUV(dir);
  return textureSampleLevel(envTex, envSampler, uv, 0.0).rgb * uni.params1.y;
}

fn envPdf(dir: vec3f) -> f32 {
  let uv = envUV(dir);
  let w = uni.params0.z;
  let h = uni.params0.w;
  let x = min(u32(uv.x * f32(w)), w - 1u);
  let y = min(u32(uv.y * f32(h)), h - 1u);
  let texel = textureLoad(envTex, vec2u(x, y), 0).rgb;
  let lum = dot(texel, vec3f(0.2126, 0.7152, 0.0722));
  return max(lum / max(uni.params1.z, 1e-8), 1e-8);
}

struct EnvSample {
  dir: vec3f,
  radiance: vec3f,
  pdf: f32,
}

// Binary search over a normalized CDF segment [ofs, ofs+len).
fn searchCDF(ofs: u32, len: u32, u: f32) -> u32 {
  var lo = 0u;
  var hi = len - 1u;
  for (var i = 0u; i < 32u; i++) {
    if (lo >= hi) { break; }
    let mid = (lo + hi) / 2u;
    if (envCDF[ofs + mid] < u) { lo = mid + 1u; } else { hi = mid; }
  }
  return lo;
}

fn sampleEnv(u1: f32, u2: f32) -> EnvSample {
  let w = uni.params0.z;
  let h = uni.params0.w;
  let y = searchCDF(0u, h, u1);
  let x = searchCDF(h + y * w, w, u2);
  let uv = (vec2f(f32(x), f32(y)) + 0.5) / vec2f(f32(w), f32(h));
  let phi = uv.x * 2.0 * PI - PI + uni.params1.x;
  let theta = uv.y * PI;
  let st = sin(theta);
  var s: EnvSample;
  s.dir = vec3f(st * sin(phi), cos(theta), st * cos(phi));
  let texel = textureLoad(envTex, vec2u(x, y), 0).rgb;
  s.radiance = texel * uni.params1.y;
  let lum = dot(texel, vec3f(0.2126, 0.7152, 0.0722));
  s.pdf = max(lum / max(uni.params1.z, 1e-8), 1e-8);
  return s;
}

// ------------------------------------------------------------------- BSDF
struct Surface {
  albedo: vec3f,
  metallic: f32,
  roughness: f32,
  clearcoat: f32,
  clearcoatRoughness: f32,
  transmission: f32,
  ior: f32,
  emissive: vec3f,
}

fn ggxD(nh: f32, a: f32) -> f32 {
  let a2 = a * a;
  let d = nh * nh * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 1e-8);
}
fn smithG(nv: f32, nl: f32, a: f32) -> f32 {
  let a2 = a * a;
  let gv = nl * sqrt(nv * nv * (1.0 - a2) + a2);
  let gl = nv * sqrt(nl * nl * (1.0 - a2) + a2);
  return 0.5 / max(gv + gl, 1e-8) * (4.0 * nv * nl); // returns G, un-divided form
}
fn schlick(f0: vec3f, vh: f32) -> vec3f {
  return f0 + (vec3f(1.0) - f0) * pow(clamp(1.0 - vh, 0.0, 1.0), 5.0);
}
// Exact unpolarized Fresnel for dielectrics. eta = n_incident / n_transmitted,
// the SAME convention as the refract() builtin, so callers share one eta.
// Snell: sin_t = eta * sin_i; TIR when that exceeds 1 (dense -> sparse only).
fn fresnelDielectric(cosI: f32, eta: f32) -> f32 {
  let sinT2 = eta * eta * (1.0 - cosI * cosI);
  if (sinT2 >= 1.0) { return 1.0; } // total internal reflection
  let cosT = sqrt(1.0 - sinT2);
  // rs/rp divided through by n_t: n_i/n_t = eta
  let rs = (eta * cosI - cosT) / (eta * cosI + cosT);
  let rp = (cosI - eta * cosT) / (cosI + eta * cosT);
  return 0.5 * (rs * rs + rp * rp);
}

fn orthonormal(n: vec3f) -> mat3x3f {
  let s = select(1.0, -1.0, n.z < 0.0);
  let a = -1.0 / (s + n.z);
  let b = n.x * n.y * a;
  let t = vec3f(1.0 + s * n.x * n.x * a, s * b, -s * n.x);
  let bt = vec3f(b, s + n.y * n.y * a, -n.y);
  return mat3x3f(t, bt, n);
}

fn cosineSample(n: vec3f, u: vec2f) -> vec3f {
  let r = sqrt(u.x);
  let phi = 2.0 * PI * u.y;
  let local = vec3f(r * cos(phi), r * sin(phi), sqrt(max(0.0, 1.0 - u.x)));
  return normalize(orthonormal(n) * local);
}

fn ggxSampleH(n: vec3f, a: f32, u: vec2f) -> vec3f {
  let phi = 2.0 * PI * u.x;
  let ct = sqrt((1.0 - u.y) / (1.0 + (a * a - 1.0) * u.y));
  let st = sqrt(max(0.0, 1.0 - ct * ct));
  let local = vec3f(st * cos(phi), st * sin(phi), ct);
  return normalize(orthonormal(n) * local);
}

// Lobe weights used both for sampling and pdf combination.
fn lobeWeights(s: Surface, f0: vec3f) -> vec3f {
  // x: diffuse, y: specular, z: clearcoat  (transmission handled separately)
  let wd = (1.0 - s.metallic) * (1.0 - s.transmission) *
           max(max(s.albedo.r, s.albedo.g), s.albedo.b);
  let ws = max(max(f0.r, f0.g), f0.b);
  let wc = s.clearcoat * 0.25;
  let total = max(wd + ws + wc, 1e-6);
  return vec3f(wd, ws, wc) / total;
}

// Evaluate the continuous (non-delta) part of the BSDF and its pdf.
fn evalBSDF(s: Surface, n: vec3f, wo: vec3f, wi: vec3f, f0: vec3f) -> vec4f {
  let nv = dot(n, wo);
  let nl = dot(n, wi);
  if (nv <= 0.0 || nl <= 0.0) { return vec4f(0.0); }
  let h = normalize(wo + wi);
  let nh = clamp(dot(n, h), 0.0, 1.0);
  let vh = clamp(dot(wo, h), 0.0, 1.0);

  let a = max(s.roughness * s.roughness, 1e-3);
  let ac = max(s.clearcoatRoughness * s.clearcoatRoughness, 1e-3);

  let F = schlick(f0, vh);
  let D = ggxD(nh, a);
  let G = smithG(nv, nl, a);
  let spec = F * (D * G / max(4.0 * nv * nl, 1e-8));

  let Fc = schlick(vec3f(0.04), vh).x * s.clearcoat;
  let Dc = ggxD(nh, ac);
  let Gc = smithG(nv, nl, ac);
  let coat = vec3f(Fc * Dc * Gc / max(4.0 * nv * nl, 1e-8));

  let kd = (1.0 - s.metallic) * (1.0 - s.transmission);
  let diffuse = s.albedo * (kd * INV_PI) * (vec3f(1.0) - F);

  // Clearcoat energy: base layers attenuated by the coat's Fresnel.
  let f = (diffuse + spec) * (1.0 - Fc) + coat;

  let w = lobeWeights(s, f0);
  let pdfD = nl * INV_PI;
  let pdfS = D * nh / max(4.0 * vh, 1e-8);
  let pdfC = Dc * nh / max(4.0 * vh, 1e-8);
  let pdf = w.x * pdfD + w.y * pdfS + w.z * pdfC;

  return vec4f(f, max(pdf, 1e-8));
}

struct BSDFSample {
  wi: vec3f,
  // throughput weight = f * cos / pdf (already divided)
  weight: vec3f,
  pdf: f32,       // 0 for delta lobes
  isDelta: bool,
}

fn sampleBSDF(s: Surface, nIn: vec3f, ng: vec3f, wo: vec3f, flakeN: vec3f) -> BSDFSample {
  var out: BSDFSample;
  out.isDelta = false;
  out.pdf = 0.0;
  out.weight = vec3f(0.0);
  out.wi = nIn;
  var n = nIn;

  // -- transmission (delta glass) --
  let pTrans = (1.0 - s.metallic) * s.transmission;
  if (rand() < pTrans) {
    out.isDelta = true;
    var eta = 1.0 / s.ior;
    var nt = n;
    if (dot(wo, ng) < 0.0) { // exiting the medium
      eta = s.ior;
      nt = -n;
    }
    let cosI = abs(dot(wo, nt));
    let F = fresnelDielectric(cosI, eta);
    if (rand() < F) {
      out.wi = normalize(reflect(-wo, nt));
      out.weight = vec3f(1.0);
    } else {
      let refr = refract(-wo, nt, eta);
      if (dot(refr, refr) < 1e-8) {
        out.wi = normalize(reflect(-wo, nt));
        out.weight = vec3f(1.0);
      } else {
        out.wi = normalize(refr);
        out.weight = s.albedo; // absorption tint
      }
    }
    return out;
  }

  // -- opaque lobes --
  if (dot(n, wo) < 0.0) { n = -n; }
  let f0 = mix(vec3f(0.04), s.albedo, s.metallic);
  let w = lobeWeights(s, f0);
  let u = rand();
  var wi: vec3f;
  if (u < w.x) {
    wi = cosineSample(n, rand2());
  } else if (u < w.x + w.y) {
    // metallic flake sparkle perturbs only the base specular lobe
    let h = ggxSampleH(flakeN, max(s.roughness * s.roughness, 1e-3), rand2());
    wi = normalize(reflect(-wo, h));
  } else {
    let h = ggxSampleH(n, max(s.clearcoatRoughness * s.clearcoatRoughness, 1e-3), rand2());
    wi = normalize(reflect(-wo, h));
  }
  if (dot(wi, n) <= 0.0 || dot(wi, ng) * dot(wo, ng) <= 0.0) {
    return out; // absorbed
  }
  let fp = evalBSDF(s, n, wo, wi, f0);
  let pdf = fp.w * (1.0 - pTrans) + 1e-8;
  out.wi = wi;
  out.pdf = pdf;
  out.weight = fp.xyz * dot(n, wi) / pdf;
  return out;
}

// ------------------------------------------------------------------ Decals
fn applyDecals(meshIndex: u32, p: vec3f, n: vec3f, albedo: ptr<function, vec3f>,
               roughness: ptr<function, f32>) {
  let info = meshInfos[meshIndex];
  let ofs = info.y;
  let count = info.z;
  for (var i = 0u; i < count; i++) {
    let base = (ofs + i) * 6u;
    let c0 = decals[base];
    let c1 = decals[base + 1u];
    let c2 = decals[base + 2u];
    let c3 = decals[base + 3u];
    let params = decals[base + 4u];   // layer, opacity, cosCutoff, roughness
    let projDir = decals[base + 5u].xyz;
    let m = mat4x4f(c0, c1, c2, c3);
    let local = (m * vec4f(p, 1.0)).xyz;
    if (any(abs(local) > vec3f(0.5))) { continue; }
    let facing = dot(n, -projDir);
    let cutoff = params.z;
    let fade = smoothstep(cutoff, min(cutoff + 0.25, 1.0), facing);
    if (fade <= 0.0) { continue; }
    let uv = vec2f(local.x + 0.5, 0.5 - local.y);
    let texel = textureSampleLevel(decalTex, decalSampler, uv, i32(params.x), 0.0);
    let a = texel.a * params.y * fade;
    // decal textures are sRGB-decoded on upload; blend in linear space
    *albedo = mix(*albedo, texel.rgb, a);
    *roughness = mix(*roughness, params.w, a);
  }
}

// ---------------------------------------------------------------- Fetching
fn surfaceUV(triIndex: u32, bary: vec2f) -> vec2f {
  let base = triIndex * 8u;
  let us = vec3f(tris[base + 3u].w, tris[base + 4u].w, tris[base + 5u].w);
  let vs = tris[base + 6u].xyz;
  let w = vec3f(1.0 - bary.x - bary.y, bary.x, bary.y);
  return vec2f(dot(us, w), dot(vs, w));
}

// Exact piecewise sRGB EOTF (matches the WebGL2 backend's SRGB8 sampling).
fn srgbToLinear(c: vec3f) -> vec3f {
  let v = clamp(c, vec3f(0.0), vec3f(1.0));
  let lo = v / 12.92;
  let hi = pow((v + vec3f(0.055)) / 1.055, vec3f(2.4));
  return select(hi, lo, v <= vec3f(0.04045));
}

fn matPacked(matIndex: u32) -> u32 {
  return bitcast<u32>(materials[matIndex * 4u + 3u].z);
}

// Material buffer slot 15 carries the tiling factor; its sign selects the
// projection: positive = mesh UVs, negative = world-space triplanar.
fn matTexScale(matIndex: u32) -> f32 {
  return materials[matIndex * 4u + 3u].w;
}

/** Sample a material map layer with either UV or triplanar projection. */
fn sampleMap(layer: u32, uv: vec2f, p: vec3f, n: vec3f, signedScale: f32) -> vec4f {
  var s = abs(signedScale);
  if (s < 1e-6) { s = 1.0; }
  if (signedScale >= 0.0) {
    return textureSampleLevel(matTex, matSampler, uv * s, i32(layer), 0.0);
  }
  var w = pow(abs(n), vec3f(4.0));
  w /= (w.x + w.y + w.z);
  return textureSampleLevel(matTex, matSampler, p.zy * s, i32(layer), 0.0) * w.x
       + textureSampleLevel(matTex, matSampler, p.xz * s, i32(layer), 0.0) * w.y
       + textureSampleLevel(matTex, matSampler, p.xy * s, i32(layer), 0.0) * w.z;
}

fn loadSurface(triIndex: u32, bary: vec2f, p: vec3f)
    -> Surface {
  let base = triIndex * 8u;
  let meshIndex = bitcast<u32>(tris[base].w);
  let matIndex = meshInfos[meshIndex].x;
  let m0 = materials[matIndex * 4u];       // baseColor.rgb, metallic
  let m1 = materials[matIndex * 4u + 1u];  // emissive.rgb, roughness
  let m2 = materials[matIndex * 4u + 2u];  // clearcoat, ccRough, transmission, ior
  var s: Surface;
  s.albedo = m0.rgb;
  s.metallic = m0.a;
  s.emissive = m1.rgb;
  s.roughness = m1.a;
  s.clearcoat = m2.x;
  s.clearcoatRoughness = clamp(m2.y, 0.01, 1.0);
  s.transmission = m2.z;
  s.ior = max(m2.w, 1.01);

  // pass locals, not struct-field pointers (packed vec3 rules on Metal)
  let n = shadingNormal(triIndex, bary);

  // Material texture maps (albedo stored sRGB-encoded in a linear format,
  // decode here; roughness reads .g, metallic reads .b for ORM compat).
  let packed = matPacked(matIndex);
  if (packed != 0xffffffffu) {
    let uv = surfaceUV(triIndex, bary);
    let ts = matTexScale(matIndex);
    let aLayer = packed & 0xffu;
    if (aLayer != MAP_NONE) {
      s.albedo *= srgbToLinear(sampleMap(aLayer, uv, p, n, ts).rgb);
    }
    let rLayer = (packed >> 16u) & 0xffu;
    if (rLayer != MAP_NONE) {
      s.roughness *= sampleMap(rLayer, uv, p, n, ts).g;
    }
    let mLayer = (packed >> 24u) & 0xffu;
    if (mLayer != MAP_NONE) {
      s.metallic = clamp(s.metallic * sampleMap(mLayer, uv, p, n, ts).b, 0.0, 1.0);
    }
  }
  s.roughness = clamp(s.roughness, 0.02, 1.0);

  var albedo = s.albedo;
  var roughness = s.roughness;
  applyDecals(meshIndex, p, n, &albedo, &roughness);
  s.albedo = albedo;
  s.roughness = roughness;
  return s;
}

// Perturb the shading normal with the material's tangent-space normal map.
// UV mode derives the tangent frame from the triangle's edges and UV deltas
// (no vertex tangents required); triplanar mode uses Ben Golus' whiteout
// blend of three world-axis projections.
fn applyNormalMap(triIndex: u32, bary: vec2f, n: vec3f, p: vec3f) -> vec3f {
  let base = triIndex * 8u;
  let meshIndex = bitcast<u32>(tris[base].w);
  let matIndex = meshInfos[meshIndex].x;
  let packed = matPacked(matIndex);
  let nLayer = (packed >> 8u) & 0xffu;
  if (nLayer == MAP_NONE) { return n; }
  let signedScale = matTexScale(matIndex);
  var s = abs(signedScale);
  if (s < 1e-6) { s = 1.0; }

  if (signedScale < 0.0) {
    // triplanar whiteout blend
    var w = pow(abs(n), vec3f(4.0));
    w /= (w.x + w.y + w.z);
    var tnx = textureSampleLevel(matTex, matSampler, p.zy * s, i32(nLayer), 0.0).xyz * 2.0 - vec3f(1.0);
    var tny = textureSampleLevel(matTex, matSampler, p.xz * s, i32(nLayer), 0.0).xyz * 2.0 - vec3f(1.0);
    var tnz = textureSampleLevel(matTex, matSampler, p.xy * s, i32(nLayer), 0.0).xyz * 2.0 - vec3f(1.0);
    tnx = vec3f(tnx.xy + n.zy, abs(tnx.z) * n.x);
    tny = vec3f(tny.xy + n.xz, abs(tny.z) * n.y);
    tnz = vec3f(tnz.xy + n.xy, abs(tnz.z) * n.z);
    return normalize(tnx.zyx * w.x + tny.xzy * w.y + tnz.xyz * w.z);
  }

  let p0 = tris[base].xyz;
  let p1 = tris[base + 1u].xyz;
  let p2 = tris[base + 2u].xyz;
  let u0 = tris[base + 3u].w;
  let u1 = tris[base + 4u].w;
  let u2 = tris[base + 5u].w;
  let vs = tris[base + 6u].xyz;
  let e1 = p1 - p0;
  let e2 = p2 - p0;
  let du1 = u1 - u0;
  let dv1 = vs.y - vs.x;
  let du2 = u2 - u0;
  let dv2 = vs.z - vs.x;
  let det = du1 * dv2 - du2 * dv1;
  if (abs(det) < 1e-12) { return n; }
  var t = (e1 * dv2 - e2 * dv1) / det;
  t = t - n * dot(n, t); // Gram-Schmidt against the shading normal
  let tLen = length(t);
  if (tLen < 1e-8) { return n; }
  t /= tLen;
  let b = cross(n, t);

  let uv = surfaceUV(triIndex, bary) * s;
  let mapN = textureSampleLevel(matTex, matSampler, uv, i32(nLayer), 0.0).xyz * 2.0 - vec3f(1.0);
  return normalize(t * mapN.x + b * mapN.y + n * max(mapN.z, 0.05));
}

fn shadingNormal(triIndex: u32, bary: vec2f) -> vec3f {
  let base = triIndex * 8u;
  let n0 = tris[base + 3u].xyz;
  let n1 = tris[base + 4u].xyz;
  let n2 = tris[base + 5u].xyz;
  let w = 1.0 - bary.x - bary.y;
  return normalize(n0 * w + n1 * bary.x + n2 * bary.y);
}

fn geometricNormal(triIndex: u32) -> vec3f {
  let base = triIndex * 8u;
  let v0 = tris[base].xyz;
  let v1 = tris[base + 1u].xyz;
  let v2 = tris[base + 2u].xyz;
  return normalize(cross(v1 - v0, v2 - v0));
}

fn flakeNormal(s: Surface, n: vec3f, p: vec3f, matFlake: vec2f) -> vec3f {
  if (matFlake.x <= 0.0) { return n; }
  let cell = floor(p * matFlake.y);
  let r = hash3(cell) * 2.0 - vec3f(1.0);
  return normalize(n + r * matFlake.x * 0.35);
}

// ------------------------------------------------------------------- Main
fn misWeight(a: f32, b: f32) -> f32 {
  return a / max(a + b, 1e-8);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let res = uni.resolution.xy;
  if (gid.x >= res.x || gid.y >= res.y) { return; }
  let frame = uni.resolution.z;
  initRNG(gid.xy, frame);

  // --- camera ray (jittered, thin lens) ---
  let tanHalf = uni.camPos.w;
  let aspect = uni.camForward.w;
  let aperture = uni.camRight.w;
  let focusDist = uni.camUp.w;
  let jitter = rand2();
  let ndc = ((vec2f(gid.xy) + jitter) / vec2f(res)) * 2.0 - 1.0;
  var rayDir = normalize(
    uni.camForward.xyz +
    uni.camRight.xyz * (ndc.x * tanHalf * aspect) +
    uni.camUp.xyz * (-ndc.y * tanHalf));
  var rayOrig = uni.camPos.xyz;
  if (aperture > 0.0) {
    let ft = focusDist / max(dot(rayDir, uni.camForward.xyz), 1e-4);
    let pFocus = rayOrig + rayDir * ft;
    let du = rand2();
    let r = aperture * sqrt(du.x);
    let phi = 2.0 * PI * du.y;
    rayOrig += uni.camRight.xyz * (r * cos(phi)) + uni.camUp.xyz * (r * sin(phi));
    rayDir = normalize(pFocus - rayOrig);
  }

  var L = vec3f(0.0);
  var throughput = vec3f(1.0);
  var bsdfPdf = 0.0;      // pdf of the last BSDF sample (for MIS)
  var lastDelta = true;   // camera ray counts as delta

  let maxBounces = uni.params0.x;
  let clampVal = uni.params1.w;

  // Primary-hit geometry captured for the denoiser guide buffer.
  var primN = vec3f(0.0, 0.0, 0.0);
  var primDepth = -1.0;

  for (var bounce = 0u; bounce <= maxBounces; bounce++) {
    let hit = traverse(rayOrig, rayDir, MAX_DIST, false);

    if (hit.triIndex == 0xffffffffu) {
      // Hidden backdrop: primary rays get a neutral studio dark, while
      // secondary rays still see the HDRI (lighting + reflections intact).
      if (bounce == 0u && bitcast<u32>(uni.params2.z) == 0u) {
        L += vec3f(0.015, 0.015, 0.018);
        break;
      }
      var contrib = throughput * envRadiance(rayDir);
      if (!lastDelta) {
        contrib *= misWeight(bsdfPdf, envPdf(rayDir));
      }
      if (bounce > 1u && clampVal > 0.0) { contrib = min(contrib, vec3f(clampVal)); }
      L += contrib;
      break;
    }

    let p = rayOrig + rayDir * hit.t;
    let wo = -rayDir;
    var n = shadingNormal(hit.triIndex, hit.bary);
    // Winding is not trustworthy across imported assets; the authored vertex
    // normals are. Align the geometric normal with them so glass entry/exit
    // detection and ray offsets are orientation-robust.
    var ng = geometricNormal(hit.triIndex);
    if (dot(ng, n) < 0.0) { ng = -ng; }
    n = applyNormalMap(hit.triIndex, hit.bary, n, p);
    if (bounce == 0u) { primN = n; primDepth = hit.t; }
    let s = loadSurface(hit.triIndex, hit.bary, p);

    // emissive surfaces contribute directly (they are not in a light list)
    L += throughput * s.emissive;

    let isGlass = s.transmission > 0.0 && s.metallic < 1.0;
    var nFace = n;
    if (dot(nFace, wo) < 0.0 && !isGlass) { nFace = -nFace; }

    // --- next-event estimation on the environment ---
    if (!isGlassDeltaOnly(s)) {
      let es = sampleEnv(rand(), rand());
      let nl = dot(nFace, es.dir);
      if (nl > 0.0) {
        let f0 = mix(vec3f(0.04), s.albedo, s.metallic);
        let fp = evalBSDF(s, nFace, wo, es.dir, f0);
        if (fp.w > 1e-8 && any(fp.xyz > vec3f(0.0))) {
          let eps = 1e-4 * (1.0 + length(p));
          if (!occluded(p + nFace * eps, es.dir, MAX_DIST)) {
            let contPdf = fp.w * (1.0 - (1.0 - s.metallic) * s.transmission);
            var contrib = throughput * fp.xyz * nl * es.radiance *
                          misWeight(es.pdf, contPdf) / es.pdf;
            if (bounce > 0u && clampVal > 0.0) { contrib = min(contrib, vec3f(clampVal)); }
            L += contrib;
          }
        }
      }

      // --- scene lights: one shadow ray each (area lights sample the shape,
      //     which is what produces their soft shadows) ---
      let lightCount = bitcast<u32>(uni.params2.y);
      for (var li = 0u; li < lightCount; li++) {
        let l0 = lights[li * 4u];      // pos, type
        let l1 = lights[li * 4u + 1u]; // color*intensity, cosOuter
        let l2 = lights[li * 4u + 2u]; // dir, cosInner
        let l3 = lights[li * 4u + 3u]; // width, height
        let lType = u32(l0.w);
        var wi: vec3f;
        var dist = MAX_DIST;
        var radiance = l1.xyz;
        if (lType == 2u) { // directional: radiance is irradiance along -dir
          wi = -l2.xyz;
        } else if (lType >= 3u) {
          // planar area light: pick a point on the shape; the 1/area pdf
          // cancels against the per-area emitted radiance, leaving the
          // familiar I·cosθ_light/d² with stochastic shadowing.
          let nL = l2.xyz;
          let seed = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(nL.y) > 0.9);
          let tU = normalize(cross(nL, seed));
          let tV = cross(nL, tU);
          var sp: vec3f;
          if (lType == 3u) { // rectangle
            sp = l0.xyz + tU * ((rand() - 0.5) * l3.x) + tV * ((rand() - 0.5) * l3.y);
          } else { // octagon: uniform pick over the 8-triangle fan
            let r = l3.x * 0.5;
            let k = floor(rand() * 8.0);
            let a0 = (k / 8.0) * 2.0 * PI;
            let a1 = ((k + 1.0) / 8.0) * 2.0 * PI;
            let e0 = tU * (cos(a0) * r) + tV * (sin(a0) * r);
            let e1 = tU * (cos(a1) * r) + tV * (sin(a1) * r);
            let s1 = sqrt(rand());
            let s2 = rand();
            sp = l0.xyz + e0 * (s1 * (1.0 - s2)) + e1 * (s1 * s2);
          }
          let toL = sp - p;
          let d2 = max(dot(toL, toL), 1e-6);
          dist = sqrt(d2);
          wi = toL / dist;
          let cosL = dot(nL, -wi); // one-sided emission along +direction
          if (cosL <= 0.0) { continue; }
          radiance *= cosL / d2;
        } else {
          let toL = l0.xyz - p;
          let d2 = max(dot(toL, toL), 1e-6);
          dist = sqrt(d2);
          wi = toL / dist;
          radiance /= d2;
          if (lType == 1u) { // spot cone window
            let cosTheta = dot(-wi, l2.xyz);
            radiance *= smoothstep(l1.w, l2.w, cosTheta);
          }
        }
        let nl2 = dot(nFace, wi);
        if (nl2 <= 0.0 || all(radiance <= vec3f(0.0))) { continue; }
        let f0 = mix(vec3f(0.04), s.albedo, s.metallic);
        let fp = evalBSDF(s, nFace, wo, wi, f0);
        if (all(fp.xyz <= vec3f(0.0))) { continue; }
        let eps = 1e-4 * (1.0 + length(p));
        if (occluded(p + nFace * eps, wi, dist - 2.0 * eps)) { continue; }
        var contrib = throughput * fp.xyz * nl2 * radiance;
        if (bounce > 0u && clampVal > 0.0) { contrib = min(contrib, vec3f(clampVal)); }
        L += contrib;
      }
    }

    // --- continue the path ---
    let fn_ = flakeNormal(s, nFace, p, vec2f(materials[matIndexOf(hit.triIndex) * 4u + 3u].x,
                                             materials[matIndexOf(hit.triIndex) * 4u + 3u].y));
    let bs = sampleBSDF(s, nFace, ng, wo, fn_);
    if (all(bs.weight <= vec3f(0.0))) { break; }

    throughput *= bs.weight;
    lastDelta = bs.isDelta;
    bsdfPdf = bs.pdf;

    let eps = 1e-4 * (1.0 + length(p));
    let offN = select(ng, -ng, dot(bs.wi, ng) < 0.0);
    rayOrig = p + offN * eps;
    rayDir = bs.wi;

    // Russian roulette
    if (bounce > 2u) {
      let pSurvive = clamp(max(throughput.r, max(throughput.g, throughput.b)), 0.05, 0.95);
      if (rand() > pSurvive) { break; }
      throughput /= pSurvive;
    }
  }

  // NaN/Inf guard so one bad sample can't poison the accumulation buffer.
  if (any(L != L) || any(abs(L) > vec3f(1e12))) { L = vec3f(0.0); }

  let base = (gid.y * res.x + gid.x) * 2u;
  if (frame == 0u) {
    accum[base] = vec4f(L, 1.0);
  } else {
    accum[base] += vec4f(L, 1.0);
  }
  // Guide slot for the edge-aware denoiser (last-write-wins; constant modulo jitter).
  accum[base + 1u] = vec4f(primN, primDepth);
}

fn matIndexOf(triIndex: u32) -> u32 {
  let meshIndex = bitcast<u32>(tris[triIndex * 8u].w);
  return meshInfos[meshIndex].x;
}

// Pure smooth glass has only delta lobes -> NEE would always be wasted.
fn isGlassDeltaOnly(s: Surface) -> bool {
  return s.transmission >= 0.999 && s.metallic <= 0.001;
}
`,Me=`// Resolves the progressive accumulation buffer to the canvas:
// average -> exposure -> ACES filmic -> sRGB encode.

struct Uniforms {
  camPos: vec4f,
  camForward: vec4f,
  camRight: vec4f,
  camUp: vec4f,
  resolution: vec4u,  // x,y = render size, z = frameIndex, w = sampleCount
  params0: vec4u,
  params1: vec4f,
  params2: vec4f,     // x = exposure (stops), w = denoise strength (0/1)
  params3: vec4f,     // x = upsampling flag (render res < display res)
}

@group(0) @binding(0) var<uniform> uni: Uniforms;
// Two vec4 per pixel: [idx*2] radiance+count, [idx*2+1] normal+depth guide.
@group(0) @binding(1) var<storage, read> accum: array<vec4f>;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vsMain(@builtin(vertex_index) vi: u32) -> VSOut {
  // fullscreen triangle
  var out: VSOut;
  let x = f32(i32(vi & 1u) * 4 - 1);
  let y = f32(i32(vi >> 1u) * 4 - 1);
  out.pos = vec4f(x, y, 0.0, 1.0);
  out.uv = vec2f((x + 1.0) * 0.5, (1.0 - y) * 0.5);
  return out;
}

// Narkowicz ACES fit.
fn aces(x: vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

fn resolveAt(base: u32) -> vec3f {
  let d = accum[base];
  return d.rgb / max(d.a, 1.0);
}

/**
 * Joint bilateral reconstruction: one gather that both UPSCALES the (possibly
 * lower-res) accumulation buffer to the display and denoises it, guided by the
 * primary-hit normal + depth g-buffer so edges stay crisp. This is what makes
 * a reduced render scale look clean instead of blocky — render at 60% and get
 * a sharp full-res image, the browser-native answer to DLSS/FSR upscaling.
 *
 * \`denoiseOn\` adds the colour-range (noise) term, which fades as samples grow.
 */
fn reconstruct(uv: vec2f, res: vec2u, denoiseOn: bool) -> vec3f {
  let fres = vec2f(res);
  let rc = uv * fres - vec2f(0.5);         // continuous texel coordinate
  let base = floor(rc);
  let cpx = vec2u(clamp(rc + vec2f(0.5), vec2f(0.0), fres - vec2f(1.0)));
  let cbase = (cpx.y * res.x + cpx.x) * 2u;
  let samples = max(accum[cbase].a, 1.0);
  let cCenter = accum[cbase].rgb / samples;
  let gb0 = accum[cbase + 1u];
  let n0 = gb0.xyz;
  let depth0 = gb0.w;
  let useEdges = depth0 > 0.0;             // foreground surface (not sky)
  // Colour tolerance widens while noisy, tightens as it converges.
  let sigmaC = mix(0.55, 0.06, clamp(samples / 64.0, 0.0, 1.0));
  // Spatial kernel: tight for a 1:1 denoise (stays sharp), wider when the
  // render is below display resolution (smooth, bilinear-like upscaling).
  let sigmaS = select(0.42, 0.62, uni.params3.x > 0.5);
  let sigmaS2 = sigmaS * sigmaS;

  var sum = vec3f(0.0);
  var wsum = 0.0;
  for (var dy = -1; dy <= 2; dy++) {
    for (var dx = -1; dx <= 2; dx++) {
      let p = base + vec2f(f32(dx), f32(dy));
      let ip = vec2u(clamp(p, vec2f(0.0), fres - vec2f(1.0)));
      let sidx = (ip.y * res.x + ip.x) * 2u;
      let cn = resolveAt(sidx);
      let d = p - rc;
      var w = exp(-dot(d, d) / (2.0 * sigmaS2));
      if (useEdges) {
        let gbn = accum[sidx + 1u];
        if (gbn.w > 0.0) {
          w *= pow(max(dot(n0, gbn.xyz), 0.0), 32.0);
          w *= exp(-abs(depth0 - gbn.w) / (0.3 * depth0 + 1e-3));
          if (denoiseOn) {
            let dc = cn - cCenter;
            w *= exp(-dot(dc, dc) / (2.0 * sigmaC * sigmaC));
          }
        } else {
          w = 0.0; // don't pull the background into a foreground pixel
        }
      }
      sum += cn * w;
      wsum += w;
    }
  }
  if (wsum <= 1e-6) { return cCenter; }
  return sum / wsum;
}

@fragment
fn fsMain(in: VSOut) -> @location(0) vec4f {
  let res = uni.resolution.xy;
  let upsampling = uni.params3.x > 0.5;
  let denoiseOn = uni.params2.w > 0.5;
  var c: vec3f;
  if (!upsampling && !denoiseOn) {
    // 1:1 with denoise off — sample directly for maximum sharpness.
    let px = min(vec2u(in.uv * vec2f(res)), res - 1u);
    c = resolveAt((px.y * res.x + px.x) * 2u);
  } else {
    c = reconstruct(in.uv, res, denoiseOn);
  }
  c *= exp2(uni.params2.x);
  c = aces(c);
  // manual sRGB encode (canvas view format is non-srgb unorm)
  c = pow(c, vec3f(1.0 / 2.4)) * 1.055 - 0.055;
  c = clamp(c, vec3f(0.0), vec3f(1.0));
  return vec4f(c, 1.0);
}
`,$=1024,ve=6,Q=1024,fe=255,ae=8,me=4,Be={point:0,spot:1,directional:2,rect:3,octagon:4};class ye{kind="webgpu-pathtracer";device;context;format;computePipeline;tonemapPipeline;bufferLayout;textureLayout;tonemapLayout;uniformBuffer;accumBuffer=null;sceneBuffers=[];sceneTextures=[];computeBindGroup=null;textureBindGroup=null;tonemapBindGroup=null;scene=null;materialList=[];materialBuffer=null;lightsBuffer=null;materialPacks=new Map;triangleCount=0;frameIndex=0;renderW=0;renderH=0;canvasW=0;canvasH=0;invalidationHash="";constructor(e,t,n){this.device=t,this.format=n;const a=e.getContext("webgpu");if(!a)throw new Error("Could not create WebGPU canvas context");this.context=a,this.context.configure({device:t,format:n,alphaMode:"opaque"}),this.canvasW=e.width,this.canvasH=e.height,this.createPipelines()}static async create(e){if(!navigator.gpu)throw new Error("WebGPU not supported");const t=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});if(!t)throw new Error("No WebGPU adapter available");const n=await t.requestDevice({requiredLimits:{maxStorageBufferBindingSize:t.limits.maxStorageBufferBindingSize,maxBufferSize:t.limits.maxBufferSize}});return new ye(e,n,navigator.gpu.getPreferredCanvasFormat())}createPipelines(){const e=this.device;this.bufferLayout=e.createBindGroupLayout({label:"pt-buffers",entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},...[2,3,4,5,6,7,8].map(a=>({binding:a,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}}))]}),this.textureLayout=e.createBindGroupLayout({label:"pt-textures",entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,texture:{sampleType:"float"}},{binding:1,visibility:GPUShaderStage.COMPUTE,sampler:{}},{binding:2,visibility:GPUShaderStage.COMPUTE,texture:{sampleType:"float",viewDimension:"2d-array"}},{binding:3,visibility:GPUShaderStage.COMPUTE,sampler:{}},{binding:4,visibility:GPUShaderStage.COMPUTE,texture:{sampleType:"float",viewDimension:"2d-array"}},{binding:5,visibility:GPUShaderStage.COMPUTE,sampler:{}}]}),this.tonemapLayout=e.createBindGroupLayout({label:"tonemap",entries:[{binding:0,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"read-only-storage"}}]});const t=e.createShaderModule({label:"pathtracer",code:ze});this.computePipeline=e.createComputePipeline({label:"pathtracer",layout:e.createPipelineLayout({bindGroupLayouts:[this.bufferLayout,this.textureLayout]}),compute:{module:t,entryPoint:"main"}});const n=e.createShaderModule({label:"tonemap",code:Me});this.tonemapPipeline=e.createRenderPipeline({label:"tonemap",layout:e.createPipelineLayout({bindGroupLayouts:[this.tonemapLayout]}),vertex:{module:n,entryPoint:"vsMain"},fragment:{module:n,entryPoint:"fsMain",targets:[{format:this.format}]},primitive:{topology:"triangle-list"}}),this.uniformBuffer=e.createBuffer({label:"uniforms",size:9*16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST})}async setScene(e){this.scene=e;const t=this.device;for(const r of this.sceneBuffers)r.destroy();for(const r of this.sceneTextures)r.destroy();this.sceneBuffers=[],this.sceneTextures=[];const n=Se(e);this.triangleCount=n.triangleCount;const a=(r,b)=>{const h=Math.max(16,Math.ceil(r.byteLength/16)*16),w=t.createBuffer({label:b,size:h,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});return r.byteLength&&t.queue.writeBuffer(w,0,r.buffer,r.byteOffset,r.byteLength),this.sceneBuffers.push(w),w},d=a(n.triangles,"triangles"),D=a(n.nodes,"bvh"),m=[],E=new Map,L=[],N=[],H=e.getAllMeshes(),F=new Uint32Array(Math.max(1,H.length)*4),T=new Map,i=[],S=r=>{if(!r)return fe;let b=T.get(r);if(b===void 0){if(i.length>=fe)return fe;b=i.length,T.set(r,b),i.push(r)}return b};this.materialPacks=new Map,H.forEach((r,b)=>{let h=E.get(r.material);if(h===void 0){h=m.length,m.push(r.material),E.set(r.material,h);const I=r.material;this.materialPacks.set(I,(S(I.albedoMap)|S(I.normalMap)<<8|S(I.roughnessMap)<<16|S(I.metallicMap)<<24)>>>0)}const w=L.length/(ve*4);for(const I of r.decals){const X=N.length;N.push({image:I.image,layer:X});const ee=I.worldToDecal();L.push(...ee);const ne=Math.cos(I.angleCutoffDeg*Math.PI/180);L.push(X,I.opacity,ne,I.roughness);const R=I.projectionDir();L.push(R[0],R[1],R[2],0)}F[b*4]=h,F[b*4+1]=w,F[b*4+2]=r.decals.length}),this.materialList=m;const s=ge(m,this.materialPacks),M=a(F,"mesh-infos"),z=a(s,"materials");this.materialBuffer=z;const p=a(new Float32Array(L.length?L:new Array(ve*4).fill(0)),"decals"),G=t.createBuffer({label:"lights",size:ae*me*16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});this.sceneBuffers.push(G),this.lightsBuffer=G,t.queue.writeBuffer(G,0,xe(e));const l=e.environment,o=new Float32Array(l.marginalCDF.length+l.conditionalCDF.length);o.set(l.marginalCDF,0),o.set(l.conditionalCDF,l.marginalCDF.length);const B=a(o,"env-cdf"),y=t.createTexture({label:"environment",size:[l.width,l.height],format:"rgba16float",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});this.sceneTextures.push(y);const g=new Uint16Array(l.width*l.height*4);for(let r=0;r<l.width*l.height;r++)g[r*4]=de(l.data[r*3]),g[r*4+1]=de(l.data[r*3+1]),g[r*4+2]=de(l.data[r*3+2]),g[r*4+3]=15360;t.queue.writeTexture({texture:y},g,{bytesPerRow:l.width*8,rowsPerImage:l.height},[l.width,l.height]);const A=Math.max(1,N.length),k=t.createTexture({label:"decals",size:[$,$,A],format:"rgba8unorm-srgb",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});this.sceneTextures.push(k);for(const{image:r,layer:b}of N){const h=await Te(r);t.queue.copyExternalImageToTexture({source:h},{texture:k,origin:[0,0,b]},[$,$])}const _=t.createSampler({magFilter:"linear",minFilter:"linear",addressModeU:"repeat",addressModeV:"clamp-to-edge"}),P=t.createSampler({magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"}),O=Math.max(1,i.length),U=t.createTexture({label:"material-maps",size:[Q,Q,O],format:"rgba8unorm",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});this.sceneTextures.push(U);for(let r=0;r<i.length;r++){const b=await be(i[r],Q);t.queue.copyExternalImageToTexture({source:b},{texture:U,origin:[0,0,r]},[Q,Q])}const C=t.createSampler({magFilter:"linear",minFilter:"linear",addressModeU:"repeat",addressModeV:"repeat"});this.textureBindGroup=t.createBindGroup({layout:this.textureLayout,entries:[{binding:0,resource:y.createView()},{binding:1,resource:_},{binding:2,resource:k.createView({dimension:"2d-array"})},{binding:3,resource:P},{binding:4,resource:U.createView({dimension:"2d-array"})},{binding:5,resource:C}]}),this.sceneBuffersForBindGroup={triBuffer:d,bvhBuffer:D,meshInfoBuffer:M,materialBuffer:z,decalBuffer:p,cdfBuffer:B,lightsBuffer:G},this.computeBindGroup=null,this.frameIndex=0}sceneBuffersForBindGroup=null;render(e){const t=this.scene;if(!t||!this.sceneBuffersForBindGroup)return{samples:0,triangles:0,backend:this.kind};const n=this.device,a=Math.min(1,Math.max(.25,e.resolutionScale)),d=Math.max(8,Math.floor(this.canvasW*a)),D=Math.max(8,Math.floor(this.canvasH*a));(d!==this.renderW||D!==this.renderH||!this.accumBuffer)&&(this.renderW=d,this.renderH=D,this.accumBuffer?.destroy(),this.accumBuffer=n.createBuffer({label:"accumulation",size:d*D*32,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.computeBindGroup=null,this.tonemapBindGroup=null,this.frameIndex=0);const m=t.camera,E=[...m.position,...m.target,m.fovYDeg,m.aperture,m.focusDistance,e.maxBounces,e.fireflyClamp,t.environment.intensity,t.environment.rotation].join(",");if(E!==this.invalidationHash&&(this.invalidationHash=E,this.frameIndex=0),!this.computeBindGroup){const p=this.sceneBuffersForBindGroup;this.computeBindGroup=n.createBindGroup({layout:this.bufferLayout,entries:[{binding:0,resource:{buffer:this.uniformBuffer}},{binding:1,resource:{buffer:this.accumBuffer}},{binding:2,resource:{buffer:p.triBuffer}},{binding:3,resource:{buffer:p.bvhBuffer}},{binding:4,resource:{buffer:p.meshInfoBuffer}},{binding:5,resource:{buffer:p.materialBuffer}},{binding:6,resource:{buffer:p.decalBuffer}},{binding:7,resource:{buffer:p.cdfBuffer}},{binding:8,resource:{buffer:p.lightsBuffer}}]}),this.tonemapBindGroup=n.createBindGroup({layout:this.tonemapLayout,entries:[{binding:0,resource:{buffer:this.uniformBuffer}},{binding:1,resource:{buffer:this.accumBuffer}}]})}const{forward:L,right:N,up:H}=m.basis(),F=t.environment,T=new Float32Array(9*4),i=new Uint32Array(T.buffer),S=Math.tan(m.fovYDeg*Math.PI/360);T.set([...m.position,S],0),T.set([...L,this.renderW/this.renderH],4),T.set([...N,m.aperture],8),T.set([...H,m.focusDistance],12),i.set([this.renderW,this.renderH,this.frameIndex,this.frameIndex+1],16),i.set([e.maxBounces,this.triangleCount,F.width,F.height],20),T.set([F.rotation,F.intensity,Math.max(F.totalWeight,1e-8),e.fireflyClamp],24),T.set([e.exposure,0,0,0],28),i[29]=Math.min(t.lights.filter(p=>p.visible).length,ae),i[30]=e.envBackground===!1?0:1,T[31]=e.denoise===!1?0:1,T[32]=this.renderW<this.canvasW||this.renderH<this.canvasH?1:0,n.queue.writeBuffer(this.uniformBuffer,0,T);const s=n.createCommandEncoder(),M=s.beginComputePass();M.setPipeline(this.computePipeline),M.setBindGroup(0,this.computeBindGroup),M.setBindGroup(1,this.textureBindGroup),M.dispatchWorkgroups(Math.ceil(this.renderW/8),Math.ceil(this.renderH/8)),M.end();const z=s.beginRenderPass({colorAttachments:[{view:this.context.getCurrentTexture().createView(),loadOp:"clear",storeOp:"store",clearValue:{r:0,g:0,b:0,a:1}}]});return z.setPipeline(this.tonemapPipeline),z.setBindGroup(0,this.tonemapBindGroup),z.draw(3),z.end(),n.queue.submit([s.finish()]),this.frameIndex++,{samples:this.frameIndex,triangles:this.triangleCount,backend:this.kind}}resetAccumulation(){this.frameIndex=0}updateLights(e){this.lightsBuffer&&(this.device.queue.writeBuffer(this.lightsBuffer,0,xe(e)),this.frameIndex=0)}updateMaterials(e){!this.materialBuffer||!this.materialList.length||(this.device.queue.writeBuffer(this.materialBuffer,0,ge(this.materialList,this.materialPacks)),this.frameIndex=0)}resize(e,t){this.canvasW=e,this.canvasH=t}dispose(){for(const e of this.sceneBuffers)e.destroy();for(const e of this.sceneTextures)e.destroy();this.accumBuffer?.destroy(),this.uniformBuffer.destroy(),this.device.destroy()}}async function be(c,e){const t=c.naturalWidth??c.width,n=c.naturalHeight??c.height;if(t===e&&n===e&&c instanceof ImageBitmap)return c;const a=new OffscreenCanvas(e,e),d=a.getContext("2d");return d.clearRect(0,0,e,e),d.drawImage(c,0,0,e,e),a}const Te=c=>be(c,$);function xe(c){const e=new Float32Array(ae*me*4);return c.lights.filter(n=>n.visible).slice(0,ae).forEach((n,a)=>{const{outer:d,inner:D}=n.coneCosines(),m=Pe(n.direction),E=n.intensity*n.emitterArea();e.set([...n.position,Be[n.type],n.color[0]*E,n.color[1]*E,n.color[2]*E,d,...m,D,n.width,n.height,0,0],a*me*4)}),e}function Pe(c){const e=Math.hypot(c[0],c[1],c[2])||1;return[c[0]/e,c[1]/e,c[2]/e]}function ge(c,e){const t=new Float32Array(Math.max(1,c.length)*16),n=new Uint32Array(t.buffer);return c.forEach((a,d)=>{const D=Math.max(.01,a.texScale||1)*(a.triplanar?-1:1);t.set([...a.baseColor,a.metallic,...a.emissive,a.roughness,a.clearcoat,a.clearcoatRoughness,a.transmission,a.ior,a.flakeIntensity,a.flakeScale,0,D],d*16),n[d*16+14]=e.get(a)??4294967295}),t}function de(c){we[0]=c;const e=De[0],t=e>>16&32768;let n=(e>>23&255)-127+15,a=e&8388607;return n<=0?t:n>=31?t|31743:t|n<<10|a>>13}const we=new Float32Array(1),De=new Uint32Array(we.buffer);export{ye as WebGPUPathTracer};
//# sourceMappingURL=WebGPUPathTracer-t9GGLhfk.js.map
