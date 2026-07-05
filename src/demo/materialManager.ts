import { Material, MaterialImage } from "../core/Material";

/**
 * Material library manager that lives in its OWN browser window.
 *
 * The popup is same-origin (opened with window.open("")), so it talks to the
 * main app directly through the host callbacks below — no postMessage
 * plumbing needed. Materials are persisted to localStorage, which both
 * windows share.
 */

export interface MaterialManagerHost {
  /** Name of the currently selected mesh, or null. */
  getSelectedName(): string | null;
  /** Material of the currently selected mesh, or null. */
  getSelectedMaterial(): Material | null;
  /** Assign props to the selected mesh's material. False if none selected. */
  applyToSelection(props: SavedProps): boolean;
  /** Subscribe to selection changes; returns an unsubscribe function. */
  onSelectionChange(cb: () => void): () => void;
}

/** Texture maps persisted as dataURLs (downscaled to keep localStorage sane). */
export interface SavedMaps {
  albedo?: string | null;
  normal?: string | null;
  roughness?: string | null;
  metallic?: string | null;
}

export interface SavedProps {
  baseColor: [number, number, number];
  metallic: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  transmission: number;
  ior: number;
  flakeIntensity: number;
  flakeScale: number;
  emissive: [number, number, number];
  maps?: SavedMaps;
  texScale?: number;
  triplanar?: boolean;
}

interface SavedMaterial {
  id: string;
  name: string;
  props: SavedProps;
}

const STORAGE_KEY = "lacquer.materials.v1";

export function snapshotMaterial(m: Material): SavedProps {
  return {
    baseColor: [...m.baseColor],
    metallic: m.metallic,
    roughness: m.roughness,
    clearcoat: m.clearcoat,
    clearcoatRoughness: m.clearcoatRoughness,
    transmission: m.transmission,
    ior: m.ior,
    flakeIntensity: m.flakeIntensity,
    flakeScale: m.flakeScale,
    emissive: [...m.emissive],
    texScale: m.texScale,
    triplanar: m.triplanar,
  };
}

/** Downscale a map image to a persistable dataURL. */
function imageToDataURL(img: MaterialImage, max = 512): string {
  const w = (img as HTMLImageElement).naturalWidth ?? (img as { width: number }).width;
  const h = (img as HTMLImageElement).naturalHeight ?? (img as { height: number }).height;
  const s = Math.min(1, max / Math.max(w, h, 1));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  c.getContext("2d")!.drawImage(img as CanvasImageSource, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}

function snapshotMaterialMaps(m: Material): SavedMaps {
  return {
    albedo: m.albedoMap ? imageToDataURL(m.albedoMap) : null,
    normal: m.normalMap ? imageToDataURL(m.normalMap) : null,
    roughness: m.roughnessMap ? imageToDataURL(m.roughnessMap) : null,
    metallic: m.metallicMap ? imageToDataURL(m.metallicMap) : null,
  };
}

/* --------------------------------- storage -------------------------------- */

function seedLibrary(): SavedMaterial[] {
  const from = (name: string, m: Material): SavedMaterial => ({
    id: crypto.randomUUID(),
    name,
    props: snapshotMaterial(m),
  });
  return [
    from("Race Red Paint", Material.carPaint([0.55, 0.02, 0.04])),
    from("Midnight Blue Paint", Material.carPaint([0.02, 0.04, 0.18])),
    from("Pearl White Paint", Material.carPaint([0.85, 0.84, 0.8], { flakeIntensity: 0.45 })),
    from("Chrome", Material.metal([0.9, 0.91, 0.92], 0.08)),
    from("Brushed Gold", Material.metal([1.0, 0.71, 0.29], 0.35)),
    from("Glass", Material.glass()),
    from("Matte Black", new Material({
      name: "matte-black", baseColor: [0.03, 0.03, 0.03], metallic: 0, roughness: 0.9,
    })),
  ];
}

function loadLibrary(): SavedMaterial[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as SavedMaterial[];
  } catch { /* corrupted storage falls through to reseed */ }
  const seeded = seedLibrary();
  saveLibrary(seeded);
  return seeded;
}

function saveLibrary(lib: SavedMaterial[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lib));
    return true;
  } catch {
    // Texture maps as dataURLs can blow the ~5MB localStorage quota.
    return false;
  }
}

/**
 * Append a live material (scalars + texture maps) to the shared library.
 * Callable from the main window; an open manager popup picks up the change
 * via a `storage` event. Returns "ok", or "quota" if it didn't fit.
 */
export function addMaterialToLibrary(material: Material, name?: string): "ok" | "quota" {
  const library = loadLibrary();
  library.push({
    id: crypto.randomUUID(),
    name: name ?? material.name ?? "material",
    props: { ...snapshotMaterial(material), maps: snapshotMaterialMaps(material) },
  });
  return saveLibrary(library) ? "ok" : "quota";
}

/* ------------------------------ color helpers ----------------------------- */

function rgbToHex(c: [number, number, number]): string {
  const to = (v: number) =>
    Math.round(Math.min(1, Math.max(0, Math.pow(v, 1 / 2.2))) * 255)
      .toString(16).padStart(2, "0");
  return `#${to(c[0])}${to(c[1])}${to(c[2])}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const from = (v: number) => Math.pow(v / 255, 2.2);
  return [from((n >> 16) & 255), from((n >> 8) & 255), from(n & 255)];
}

/** CSS background approximating how the material reads in the viewport. */
function swatchStyle(p: SavedProps): string {
  if (p.maps?.albedo) {
    return `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.25), transparent 55%),` +
      `url(${p.maps.albedo}) center / cover`;
  }
  const hex = rgbToHex(p.baseColor);
  const sheen = p.metallic > 0.5 || p.clearcoat > 0.5 ? 0.55 : 0.2;
  const glass = p.transmission > 0.5;
  return glass
    ? `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.75), transparent 42%),` +
      `linear-gradient(145deg, rgba(160,200,255,0.35), rgba(30,40,60,0.55)), ${hex}`
    : `radial-gradient(circle at 32% 28%, rgba(255,255,255,${sheen}), transparent 55%), ${hex}`;
}

/* ----------------------------- 3D preview ball ----------------------------- */
/*
 * A self-contained WebGL2 material ball: one fullscreen-triangle fragment
 * shader analytically ray-traces a unit sphere with a procedural studio
 * environment and an approximation of the engine's paint model (base +
 * fresnel + clearcoat + flakes + transmission). The camera slowly orbits.
 * It runs on the popup's rAF so it pauses when the window is hidden.
 */

interface MaterialPreview {
  update(props: SavedProps): void;
  dispose(): void;
}

const PREVIEW_FS = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uColor;
uniform vec4 uParams0; // metallic, roughness, clearcoat, ccRough
uniform vec4 uParams1; // transmission, ior, flakes, flakeScale
uniform vec3 uEmissive;
uniform int uHasMap;
uniform sampler2D uMap;

const float PI = 3.14159265;

// procedural studio: gradient + key light + cool rim, blurred by roughness
vec3 env(vec3 d, float rough) {
  float soft = 1.0 - clamp(rough, 0.0, 1.0) * 0.85;
  vec3 base = mix(vec3(0.045, 0.05, 0.065), vec3(0.34, 0.36, 0.41),
                  smoothstep(-1.0, 1.0, d.y));
  float key = pow(max(dot(d, normalize(vec3(0.6, 0.8, 0.3))), 0.0),
                  mix(2.0, 60.0, soft)) * 3.2;
  float rim = pow(max(dot(d, normalize(vec3(-0.7, 0.25, -0.5))), 0.0),
                  mix(2.0, 40.0, soft)) * 1.3;
  return base + vec3(1.0, 0.98, 0.94) * key + vec3(0.7, 0.8, 1.0) * rim;
}

vec3 hash3(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

vec3 aces(vec3 c) {
  c *= 0.85;
  return clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  float t = uTime * 0.3;
  vec3 eye = vec3(2.6 * cos(t), 0.55, 2.6 * sin(t));
  vec3 fwd = normalize(-eye);
  vec3 rgt = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rgt, fwd);
  vec3 rd = normalize(fwd * 2.0 + rgt * uv.x + up * uv.y);

  float metallic = uParams0.x;
  float rough = uParams0.y;
  float cc = uParams0.z;
  float ccRough = uParams0.w;
  float trans = uParams1.x;
  float flakes = uParams1.z;

  float b = dot(eye, rd);
  float c = dot(eye, eye) - 1.0;
  float h = b * b - c;
  vec3 col;
  if (h < 0.0) {
    col = env(rd, 0.35) * 0.5;
  } else {
    vec3 p = eye + rd * (-b - sqrt(h));
    vec3 n = p;
    if (flakes > 0.001) {
      vec3 r3 = hash3(floor(p * max(uParams1.w, 1.0) * 0.02 + 50.0));
      if (r3.z > 0.6) n = normalize(n + (r3 - 0.5) * flakes * 0.3);
    }
    float nov = clamp(dot(n, -rd), 0.0, 1.0);
    vec3 albedo = uColor;
    if (uHasMap == 1) {
      vec2 suv = vec2(atan(p.z, p.x) / (2.0 * PI) + 0.5,
                      acos(clamp(p.y, -1.0, 1.0)) / PI);
      vec3 texel = texture(uMap, suv).rgb;
      albedo *= texel * texel; // approximate sRGB decode
    }
    vec3 f0 = mix(vec3(0.04), albedo, metallic);
    vec3 fres = f0 + (1.0 - f0) * pow(1.0 - nov, 5.0);
    vec3 r = reflect(rd, n);
    vec3 diffuse = albedo * (1.0 - metallic) * (1.0 - trans) * env(n, 1.0) * 0.9;
    vec3 spec = env(r, rough) * fres;
    float ccF = (0.04 + 0.96 * pow(1.0 - nov, 5.0)) * cc;
    vec3 coat = env(reflect(rd, p), ccRough) * ccF;
    vec3 through = env(rd, rough * 0.5 + 0.1) * albedo * trans * (1.0 - fres.g);
    col = (diffuse + spec) * (1.0 - ccF) + coat + through + uEmissive * 0.55;
  }
  o = vec4(pow(aces(col), vec3(1.0 / 2.2)), 1.0);
}`;

function createPreview(canvas: HTMLCanvasElement, win: Window): MaterialPreview | null {
  const gl = canvas.getContext("webgl2", { antialias: true });
  if (!gl) return null;

  const compile = (type: number, src: string): WebGLShader => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(`preview shader: ${gl.getShaderInfoLog(sh)}`);
    }
    return sh;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID & 1) * 4) - 1.0, float((gl_VertexID >> 1) * 4) - 1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, PREVIEW_FS));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`preview link: ${gl.getProgramInfoLog(program)}`);
  }
  const u = (name: string) => gl.getUniformLocation(program, name);
  const vao = gl.createVertexArray()!;

  let props: SavedProps | null = null;
  let mapTex: WebGLTexture | null = null;
  let mapUrl: string | null = null;
  let disposed = false;
  const start = performance.now();

  const setMap = (url: string | null): void => {
    if (url === mapUrl) return;
    mapUrl = url;
    if (mapTex) {
      gl.deleteTexture(mapTex);
      mapTex = null;
    }
    if (!url) return;
    const img = new Image();
    img.onload = () => {
      if (disposed || mapUrl !== url) return;
      mapTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, mapTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    };
    img.src = url;
  };

  const frame = (): void => {
    if (disposed || win.closed) return;
    const dpr = Math.min(win.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const hgt = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== hgt) {
      canvas.width = w;
      canvas.height = hgt;
    }
    if (props && w > 1) {
      gl.viewport(0, 0, w, hgt);
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform2f(u("uRes"), w, hgt);
      gl.uniform1f(u("uTime"), (performance.now() - start) / 1000);
      gl.uniform3fv(u("uColor"), props.baseColor);
      gl.uniform4f(u("uParams0"),
        props.metallic, props.roughness, props.clearcoat, props.clearcoatRoughness);
      gl.uniform4f(u("uParams1"),
        props.transmission, props.ior, props.flakeIntensity, props.flakeScale);
      gl.uniform3fv(u("uEmissive"), props.emissive);
      gl.uniform1i(u("uHasMap"), mapTex ? 1 : 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, mapTex);
      gl.uniform1i(u("uMap"), 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    win.requestAnimationFrame(frame);
  };
  win.requestAnimationFrame(frame);

  return {
    update(p: SavedProps): void {
      props = p;
      setMap(p.maps?.albedo ?? null);
    },
    dispose(): void {
      disposed = true;
    },
  };
}

/* --------------------------------- window --------------------------------- */

let managerWindow: Window | null = null;

export function openMaterialManager(host: MaterialManagerHost): void {
  if (managerWindow && !managerWindow.closed) {
    managerWindow.focus();
    return;
  }
  const win = window.open(
    "", "lacquer-material-manager",
    "width=980,height=780,resizable=yes,scrollbars=yes",
  );
  if (!win) {
    alert("The material manager popup was blocked — allow popups for this site.");
    return;
  }
  managerWindow = win;
  buildManagerUI(win, host);
  // Close the popup with the app so it never dangles with dead callbacks.
  window.addEventListener("pagehide", () => win.close(), { once: true });
}

function buildManagerUI(win: Window, host: MaterialManagerHost): void {
  const doc = win.document;
  doc.title = "Lacquer — Material Library";
  doc.head.innerHTML = `<meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; }
    body { background: #101116; color: #e8e8ea; overflow-x: hidden;
      font: 13px/1.5 system-ui, -apple-system, sans-serif; }
    h1 { font-size: 15px; letter-spacing: 0.05em; white-space: nowrap; }
    h1 span { color: #ff3b1f; }
    #target { font-size: 11px; color: #9a9aa2; white-space: nowrap; overflow: hidden;
      text-overflow: ellipsis; }
    button { padding: 6px 10px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.14);
      background: #1d1f24; color: #e8e8ea; font: inherit; cursor: pointer; }
    button:hover { background: #26282e; }
    button.primary { background: #ff3b1f; border-color: #ff3b1f; color: #fff; }
    button.primary:hover { background: #ff5238; }
    button.danger:hover { background: #4a1d18; }

    #head { display: flex; align-items: center; gap: 14px; padding: 13px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.08); position: sticky; top: 0;
      background: #101116; z-index: 5; }
    #head .titles { min-width: 0; }
    #search { flex: 1; min-width: 120px; padding: 7px 10px; border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.14); background: #1d1f24; color: #e8e8ea;
      font: inherit; }
    #search:focus { outline: none; border-color: #ff3b1f; }
    #save-btn { white-space: nowrap; }

    #list { padding: 14px 16px 20px; display: grid; gap: 10px;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
    .card { border-radius: 12px; background: #15161b; overflow: hidden; cursor: pointer;
      border: 1px solid rgba(255,255,255,0.09);
      transition: transform 0.13s ease, border-color 0.13s ease, box-shadow 0.13s ease; }
    .card:hover { transform: translateY(-2px); box-shadow: 0 8px 22px rgba(0,0,0,0.35); }
    .card.selected { border-color: #ff3b1f; }
    .swatch { height: 74px; }
    .card .info { padding: 8px 10px 4px; min-width: 0; }
    .card .name { font-weight: 600; font-size: 12px; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; }
    .card .meta { font-size: 10.5px; color: #9a9aa2; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; }
    .card .apply { display: block; width: calc(100% - 20px); margin: 6px 10px 10px;
      padding: 4px; font-size: 12px; }
    #empty { padding: 30px 16px; color: #6c6c74; text-align: center; grid-column: 1/-1; }

    /* editor slides in from the right */
    #editor-panel { position: fixed; top: 0; right: 0; bottom: 0; width: 360px;
      max-width: 92vw; background: #15161b; border-left: 1px solid rgba(255,255,255,0.14);
      box-shadow: -18px 0 44px rgba(0,0,0,0.5); z-index: 10;
      display: flex; flex-direction: column;
      transform: translateX(105%); transition: transform 0.28s cubic-bezier(0.2, 0.8, 0.25, 1); }
    #editor-panel.open { transform: translateX(0); }
    #editor-head { display: flex; align-items: center; justify-content: space-between;
      padding: 13px 16px; border-bottom: 1px solid rgba(255,255,255,0.08); }
    #editor-head h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em;
      color: #9a9aa2; }
    #editor-body { flex: 1; overflow-y: auto; padding: 12px 16px 16px; }

    #e-preview { display: block; width: 100%; height: 190px; border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.12); background: #0c0d10;
      margin-bottom: 8px; }

    label { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
    label > span:first-child { flex: 0 0 96px; color: #c5c5cc; }
    input.val { flex: 0 0 48px; width: 48px; padding: 2px 4px; text-align: right;
      font-size: 11px; color: #9a9aa2; background: transparent;
      border: 1px solid transparent; border-radius: 6px; font: inherit;
      font-variant-numeric: tabular-nums; -moz-appearance: textfield;
      appearance: textfield; }
    input.val::-webkit-inner-spin-button, input.val::-webkit-outer-spin-button {
      -webkit-appearance: none; }
    input.val:hover { border-color: rgba(255,255,255,0.14); background: #1d1f24; }
    input.val:focus { border-color: #ff3b1f; background: #1d1f24; color: #e8e8ea;
      outline: none; }
    input[type=range] { -webkit-appearance: none; appearance: none; flex: 1;
      min-width: 0; height: 4px; border-radius: 2px; background: #2d2f37;
      outline: none; cursor: pointer; }
    input[type=range]::-webkit-slider-thumb { -webkit-appearance: none;
      width: 13px; height: 13px; border-radius: 50%; background: #f2f2f4; border: none;
      box-shadow: 0 1px 5px rgba(0,0,0,0.55); }
    input[type=range]:active::-webkit-slider-thumb { background: #ff3b1f; }
    input[type=range]::-moz-range-thumb { width: 13px; height: 13px; border-radius: 50%;
      background: #f2f2f4; border: none; box-shadow: 0 1px 5px rgba(0,0,0,0.55); }
    input[type=range]::-moz-range-track { height: 4px; border-radius: 2px;
      background: #2d2f37; }
    input[type=color] { flex: 1; height: 26px; border: none; background: none; padding: 0; }
    input[type=text] { flex: 1; padding: 5px 8px; border-radius: 7px;
      border: 1px solid rgba(255,255,255,0.14); background: #1d1f24; color: #e8e8ea;
      font: inherit; }
    select { flex: 1; padding: 4px 6px; border-radius: 7px;
      border: 1px solid rgba(255,255,255,0.14); background: #1d1f24; color: #e8e8ea;
      font: inherit; }
    .btnrow { display: flex; gap: 6px; margin-top: 12px; }
    .btnrow button { flex: 1; }
    .live { display: flex; align-items: center; gap: 6px; font-size: 12px;
      color: #9a9aa2; margin-top: 10px; }
    .live input { accent-color: #ff3b1f; }
    h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
      color: #9a9aa2; margin: 14px 0 4px; }
    .maprow { display: flex; align-items: center; gap: 8px; margin: 5px 0; }
    .maprow .mthumb { width: 26px; height: 26px; border-radius: 5px; flex: 0 0 auto;
      background: #26282e center / cover; border: 1px solid rgba(255,255,255,0.12); }
    .maprow .mlabel { flex: 1; color: #c5c5cc; }
    .maprow button { padding: 3px 10px; font-size: 12px; }
  </style>`;
  doc.body.innerHTML = `
    <div id="head">
      <div class="titles">
        <h1>MATERIAL LIBRARY<span>.</span></h1>
        <div id="target"></div>
      </div>
      <input id="search" type="search" placeholder="Search materials…">
      <button id="save-btn" class="primary">＋ Save from selection</button>
    </div>
    <div id="list"></div>
    <div id="editor-panel">
      <div id="editor-head">
        <h2>Edit material</h2>
        <button id="editor-close" title="Close">✕</button>
      </div>
      <div id="editor-body">
        <canvas id="e-preview" title="Live material preview"></canvas>
        <label><span>Name</span><input id="e-name" type="text"></label>
        <label><span>Color</span><input id="e-color" type="color"></label>
        <h3>Surface</h3>
        <label><span>Metallic</span><input id="e-metallic" type="range" min="0" max="1" step="0.01"></label>
        <label><span>Roughness</span><input id="e-roughness" type="range" min="0.02" max="1" step="0.01"></label>
        <label><span>Clearcoat</span><input id="e-clearcoat" type="range" min="0" max="1" step="0.01"></label>
        <label><span>Coat rough.</span><input id="e-ccrough" type="range" min="0.01" max="0.4" step="0.005"></label>
        <h3>Glass</h3>
        <label><span>Transmission</span><input id="e-transmission" type="range" min="0" max="1" step="0.01"></label>
        <label><span>IOR</span><input id="e-ior" type="range" min="1.0" max="2.4" step="0.01"></label>
        <h3>Metallic flakes</h3>
        <label><span>Flakes</span><input id="e-flakes" type="range" min="0" max="1" step="0.01"></label>
        <label><span>Flake scale</span><input id="e-flakescale" type="range" min="100" max="3000" step="10"></label>
        <h3>Emission</h3>
        <label><span>Color</span><input id="e-emissive" type="color"></label>
        <label><span>Strength</span><input id="e-emissivestr" type="range" min="0" max="10" step="0.1"></label>
        <h3>Texture maps</h3>
        <div id="e-maps"></div>
        <input id="e-map-file" type="file" accept="image/png,image/jpeg,image/webp" hidden>
        <label><span>Mapping</span>
          <select id="e-mapping">
            <option value="uv">UV coordinates</option>
            <option value="triplanar">Triplanar (world)</option>
          </select>
        </label>
        <label><span>Tiling</span><input id="e-texscale" type="range" min="0.1" max="8" step="0.1"></label>
        <label class="live"><input id="e-live" type="checkbox" checked>
          Live preview on selected object</label>
        <div class="btnrow">
          <button id="e-apply" class="primary">Apply to selection</button>
          <button id="e-duplicate">Duplicate</button>
          <button id="e-delete" class="danger">Delete</button>
        </div>
      </div>
    </div>`;

  const $ = <T extends HTMLElement>(id: string): T =>
    doc.getElementById(id) as unknown as T;

  let library = loadLibrary();
  let editing: SavedMaterial | null = null;
  let searchFilter = "";

  let preview: MaterialPreview | null = null;
  try {
    preview = createPreview($<HTMLCanvasElement>("e-preview"), win);
  } catch (err) {
    console.warn("[lacquer] material preview unavailable:", err);
  }

  /* editable numeric readouts on every slider */
  const readoutUpdaters: (() => void)[] = [];
  for (const slider of doc.querySelectorAll<HTMLInputElement>("label input[type=range]")) {
    const val = doc.createElement("input");
    val.type = "number";
    val.className = "val";
    val.step = slider.step || "any";
    slider.insertAdjacentElement("afterend", val);
    const update = (): void => {
      if (doc.activeElement === val) return;
      const step = parseFloat(slider.step || "1");
      const v = parseFloat(slider.value || "0");
      val.value =
        step >= 1 ? String(Math.round(v)) : step >= 0.1 ? v.toFixed(1) : v.toFixed(2);
    };
    update();
    slider.addEventListener("input", update);
    val.addEventListener("change", () => {
      const typed = parseFloat(val.value);
      if (!Number.isFinite(typed)) {
        update();
        return;
      }
      const clamped = Math.min(parseFloat(slider.max), Math.max(parseFloat(slider.min), typed));
      slider.value = String(clamped);
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      val.value = String(clamped);
    });
    readoutUpdaters.push(update);
  }
  const refreshReadouts = (): void => {
    for (const update of readoutUpdaters) update();
  };

  const refreshTarget = (): void => {
    const name = host.getSelectedName();
    $("target").textContent = name
      ? `Selected in viewport: ${name}`
      : "Nothing selected — click an object in the viewport";
  };

  const renderList = (): void => {
    const list = $("list");
    list.innerHTML = "";
    const visible = library.filter((m) =>
      !searchFilter || m.name.toLowerCase().includes(searchFilter));
    if (visible.length === 0) {
      const empty = doc.createElement("div");
      empty.id = "empty";
      empty.textContent = searchFilter
        ? `No materials match “${searchFilter}”.`
        : "Library is empty — select an object and save its material.";
      list.appendChild(empty);
      return;
    }
    for (const mat of visible) {
      const card = doc.createElement("div");
      card.className = "card" + (editing?.id === mat.id ? " selected" : "");
      const swatch = doc.createElement("div");
      swatch.className = "swatch";
      swatch.style.background = swatchStyle(mat.props);
      const info = doc.createElement("div");
      info.className = "info";
      const flags = [
        mat.props.transmission > 0.5 ? "glass" : mat.props.metallic > 0.5 ? "metal" : "dielectric",
        mat.props.clearcoat > 0.5 ? "clearcoat" : null,
        mat.props.flakeIntensity > 0.05 ? "flakes" : null,
        Math.max(...mat.props.emissive) > 0 ? "emissive" : null,
        mat.props.maps && Object.values(mat.props.maps).some(Boolean) ? "textured" : null,
      ].filter(Boolean).join(" · ");
      info.innerHTML = `<div class="name"></div><div class="meta">${flags}</div>`;
      (info.querySelector(".name") as HTMLElement).textContent = mat.name;
      const applyBtn = doc.createElement("button");
      applyBtn.className = "apply";
      applyBtn.textContent = "Apply";
      applyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!host.applyToSelection(mat.props)) {
          win.alert("Select an object in the viewport first.");
        }
      });
      card.append(swatch, info, applyBtn);
      card.addEventListener("click", () => openEditor(mat));
      list.appendChild(card);
    }
  };

  $<HTMLInputElement>("search").addEventListener("input", (e) => {
    searchFilter = (e.target as HTMLInputElement).value.trim().toLowerCase();
    renderList();
  });

  /* texture map rows */
  const MAP_KEYS: (keyof SavedMaps)[] = ["albedo", "normal", "roughness", "metallic"];
  let pendingMapKey: keyof SavedMaps | null = null;

  const buildMapRows = (): void => {
    const host = $("e-maps");
    host.innerHTML = "";
    if (!editing) return;
    for (const key of MAP_KEYS) {
      const url = editing.props.maps?.[key] ?? null;
      const row = doc.createElement("div");
      row.className = "maprow";
      const thumb = doc.createElement("div");
      thumb.className = "mthumb";
      if (url) thumb.style.backgroundImage = `url(${url})`;
      const label = doc.createElement("span");
      label.className = "mlabel";
      label.textContent = key[0].toUpperCase() + key.slice(1);
      const setBtn = doc.createElement("button");
      setBtn.textContent = url ? "Replace…" : "Set…";
      setBtn.addEventListener("click", () => {
        pendingMapKey = key;
        $<HTMLInputElement>("e-map-file").click();
      });
      row.append(thumb, label, setBtn);
      if (url) {
        const clearBtn = doc.createElement("button");
        clearBtn.textContent = "✕";
        clearBtn.addEventListener("click", () => {
          if (!editing) return;
          editing.props.maps = { ...editing.props.maps, [key]: null };
          commitEdit();
          buildMapRows();
        });
        row.appendChild(clearBtn);
      }
      host.appendChild(row);
    }
  };

  $<HTMLInputElement>("e-map-file").addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file || !editing || !pendingMapKey) return;
    const reader = new FileReader();
    const key = pendingMapKey;
    reader.onload = () => {
      if (!editing) return;
      // Round-trip through an image so the stored dataURL is downscaled.
      const img = new Image();
      img.onload = () => {
        if (!editing) return;
        editing.props.maps = { ...editing.props.maps, [key]: imageToDataURL(img) };
        commitEdit();
        buildMapRows();
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });

  const syncEditor = (): void => {
    if (!editing) return;
    const p = editing.props;
    buildMapRows();
    $<HTMLInputElement>("e-name").value = editing.name;
    $<HTMLInputElement>("e-color").value = rgbToHex(p.baseColor);
    $<HTMLInputElement>("e-metallic").value = String(p.metallic);
    $<HTMLInputElement>("e-roughness").value = String(p.roughness);
    $<HTMLInputElement>("e-clearcoat").value = String(p.clearcoat);
    $<HTMLInputElement>("e-ccrough").value = String(p.clearcoatRoughness);
    $<HTMLInputElement>("e-transmission").value = String(p.transmission);
    $<HTMLInputElement>("e-ior").value = String(p.ior);
    $<HTMLInputElement>("e-flakes").value = String(p.flakeIntensity);
    $<HTMLInputElement>("e-flakescale").value = String(p.flakeScale);
    $<HTMLSelectElement>("e-mapping").value = p.triplanar ? "triplanar" : "uv";
    $<HTMLInputElement>("e-texscale").max = p.triplanar ? "500" : "8";
    $<HTMLInputElement>("e-texscale").value = String(p.texScale ?? 1);
    // emission decomposes to color x strength
    const strength = Math.max(p.emissive[0], p.emissive[1], p.emissive[2]);
    $<HTMLInputElement>("e-emissivestr").value = String(strength);
    $<HTMLInputElement>("e-emissive").value = rgbToHex(
      strength > 0
        ? [p.emissive[0] / strength, p.emissive[1] / strength, p.emissive[2] / strength]
        : [1, 1, 1],
    );
    refreshReadouts();
    if (editing) preview?.update(editing.props);
  };

  const openEditor = (mat: SavedMaterial): void => {
    editing = mat;
    $("editor-panel").classList.add("open");
    syncEditor();
    renderList();
  };

  const closeEditor = (): void => {
    editing = null;
    $("editor-panel").classList.remove("open");
    renderList();
  };
  $("editor-close").addEventListener("click", closeEditor);

  let lastQuotaWarn = 0;
  const commitEdit = (): void => {
    if (!editing) return;
    if (!saveLibrary(library) && performance.now() - lastQuotaWarn > 10000) {
      lastQuotaWarn = performance.now();
      win.alert("Storage is full — this library can't fit more texture maps. " +
        "Remove some maps or materials.");
    }
    renderList();
    preview?.update(editing.props);
    if ($<HTMLInputElement>("e-live").checked) {
      host.applyToSelection(editing.props);
    }
  };

  /* editor bindings */
  $<HTMLInputElement>("e-name").addEventListener("input", (e) => {
    if (!editing) return;
    editing.name = (e.target as HTMLInputElement).value || "untitled";
    saveLibrary(library);
    renderList();
  });
  $<HTMLInputElement>("e-color").addEventListener("input", (e) => {
    if (!editing) return;
    editing.props.baseColor = hexToRgb((e.target as HTMLInputElement).value);
    commitEdit();
  });
  const numericBindings: [string, keyof SavedProps][] = [
    ["e-metallic", "metallic"],
    ["e-roughness", "roughness"],
    ["e-clearcoat", "clearcoat"],
    ["e-ccrough", "clearcoatRoughness"],
    ["e-transmission", "transmission"],
    ["e-ior", "ior"],
    ["e-flakes", "flakeIntensity"],
    ["e-flakescale", "flakeScale"],
    ["e-texscale", "texScale"],
  ];
  for (const [id, key] of numericBindings) {
    $<HTMLInputElement>(id).addEventListener("input", (e) => {
      if (!editing) return;
      (editing.props as unknown as Record<string, number>)[key] =
        parseFloat((e.target as HTMLInputElement).value);
      commitEdit();
    });
  }

  const updateTilingRange = (triplanar: boolean): void => {
    $<HTMLInputElement>("e-texscale").max = triplanar ? "500" : "8";
  };

  $<HTMLSelectElement>("e-mapping").addEventListener("change", (e) => {
    if (!editing) return;
    const triplanar = (e.target as HTMLSelectElement).value === "triplanar";
    updateTilingRange(triplanar);
    editing.props.triplanar = triplanar;
    commitEdit();
  });

  const updateEmissive = (): void => {
    if (!editing) return;
    const rgb = hexToRgb($<HTMLInputElement>("e-emissive").value);
    const strength = parseFloat($<HTMLInputElement>("e-emissivestr").value);
    editing.props.emissive = [rgb[0] * strength, rgb[1] * strength, rgb[2] * strength];
    commitEdit();
  };
  $<HTMLInputElement>("e-emissive").addEventListener("input", updateEmissive);
  $<HTMLInputElement>("e-emissivestr").addEventListener("input", updateEmissive);

  $("e-apply").addEventListener("click", () => {
    if (editing && !host.applyToSelection(editing.props)) {
      win.alert("Select an object in the viewport first.");
    }
  });
  $("e-duplicate").addEventListener("click", () => {
    if (!editing) return;
    const copy: SavedMaterial = {
      id: crypto.randomUUID(),
      name: `${editing.name} copy`,
      props: structuredClone(editing.props),
    };
    library.splice(library.indexOf(editing) + 1, 0, copy);
    saveLibrary(library);
    openEditor(copy);
  });
  $("e-delete").addEventListener("click", () => {
    if (!editing) return;
    library = library.filter((m) => m !== editing);
    saveLibrary(library);
    closeEditor();
  });

  $("save-btn").addEventListener("click", () => {
    const material = host.getSelectedMaterial();
    const name = host.getSelectedName();
    if (!material || !name) {
      win.alert("Select an object in the viewport first.");
      return;
    }
    const entry: SavedMaterial = {
      id: crypto.randomUUID(),
      name: `${name} material`,
      props: { ...snapshotMaterial(material), maps: snapshotMaterialMaps(material) },
    };
    library.push(entry);
    if (!saveLibrary(library)) {
      win.alert("Storage is full — saved without persisting; remove some maps or materials.");
    }
    openEditor(entry);
  });

  const unsubscribe = host.onSelectionChange(refreshTarget);

  // The main window (or another tab) saving a material fires a storage event
  // here — reload the library so newly saved materials appear immediately.
  const onStorage = (e: StorageEvent): void => {
    if (e.key !== null && e.key !== STORAGE_KEY) return;
    library = loadLibrary();
    if (editing && !library.some((m) => m.id === editing!.id)) {
      editing = null;
      $("editor-panel").classList.remove("open");
    }
    renderList();
  };
  win.addEventListener("storage", onStorage);

  win.addEventListener("pagehide", () => {
    unsubscribe();
    win.removeEventListener("storage", onStorage);
    preview?.dispose();
    if (managerWindow === win) managerWindow = null;
  });

  refreshTarget();
  renderList();
}
