# Lacquer

**Open-source, physically based, path-traced automotive visualization for the web.**
One tiny runtime dependency (`fbx-parser`). One engine, every device: WebGPU compute
path tracing where available, a WebGL2 PBR rasterizer everywhere else (iPads, phones,
older laptops).

```bash
npm install
npm run dev        # open http://localhost:5173, drop in a .glb and a .hdr
```

## Why this exists

Automotive configurators want offline-render lighting quality — real global
illumination, believable paint, studio HDRIs, sponsor liveries — but they have to run
on whatever device the customer holds. Lacquer's answer is a single scene API with two
backends behind it:

| | WebGPU backend | WebGL2 backend |
|---|---|---|
| Technique | Progressive Monte-Carlo **path tracing** (compute) | Forward **PBR raster** + IBL |
| Global illumination | Full, unbiased, converges over frames | Image-based approximation |
| Runs on | Chrome/Edge/Safari/Firefox on desktop, Safari on modern iPads/iPhones, headless servers | Effectively everything with WebGL2 |

## Features

- **Path tracing / ray tracing, cross-platform.** Binned-SAH BVH built on the CPU,
  traversed in a WGSL compute megakernel. Progressive accumulation, Russian roulette,
  firefly clamping, thin-lens depth of field. No vendor RT extensions required — it
  runs on any WebGPU device, and falls back to WebGL2 raster below that.
- **High-quality global illumination & accurate lighting.** Luminance-weighted
  importance sampling of the HDRI with multiple importance sampling (balance
  heuristic) against BSDF sampling — crisp sun shadows and clean interiors at low
  sample counts.
- **Mathematically grounded materials.** Energy-conserving multi-lobe BSDF:
  Lambert diffuse, GGX (Trowbridge–Reitz) specular with Smith height-correlated
  visibility and Schlick Fresnel, a layered **clearcoat** lobe (the thing that makes
  car paint read as car paint), exact-Fresnel dielectric **transmission** for glass
  with configurable IOR, emissives, and procedural **metallic flake** sparkle.
- **HDRI support.** Drag-drop Radiance `.hdr` files (RLE + flat scanlines), intensity
  and rotation controls, plus a built-in procedural sky so the engine lights correctly
  with zero assets.
- **Per-object decals for liveries.** Decals are oriented-box projectors assigned
  *per mesh* — a decal only ever affects the meshes that list it, so a door number
  can never bleed onto the fender behind it. Angle-based fade prevents silhouette
  smearing; decals blend into albedo *before* shading so they sit under the clearcoat
  like real vinyl. Adjustable size, rotation, opacity, roughness.
- **Model import.** `.fbx` (binary 7.x and ASCII: hierarchy, Lcl TRS +
  pre/post-rotation + pivots, correct ByPolygonVertex normal/UV de-indexing,
  per-polygon material splits, Phong→PBR mapping, cm→m units, Z-up→Y-up),
  `.glb` / `.gltf` (embedded buffers, pbrMetallicRoughness with the
  `KHR_materials_transmission / _clearcoat / _ior / _emissive_strength`
  extensions), and Wavefront `.obj`. Models are auto-centered, grounded, framed.
- **Mesh hierarchy.** Meshes form parent/child trees with local transforms
  (`mesh.add(child)`, `getWorldTransform()`, `traverse()`); imported FBX/glTF
  hierarchies are preserved. Hiding a group hides its subtree; groups are empty
  meshes via `Mesh.group(name)`.
- **Selection & gizmos.** `scene.selection` (click-to-select raycasting in the
  demo) drives `scene.gizmo`: translate / rotate / scale handles that follow the
  target's local axes and edit its *local* transform — children of rotated or
  scaled groups manipulate correctly. Selected objects get a bounding-box
  indicator (groups show their whole subtree's box). W / E / R switch modes in
  the demo; the gizmo core is renderer-agnostic (the demo draws it as an SVG
  overlay).
- **Isolation.** `scene.setIsolated(mesh)` renders only that subtree in both
  backends (button / `I` key in the demo) — invaluable for picking interior
  parts of a full car model.
- **Ray tracing toggle.** `engine.setRaytracing(false)` hot-swaps to realtime
  rasterization with image-based global illumination + sun shadow mapping;
  `true` swaps back to the progressive path tracer. Because a canvas can hold
  only one context type, the engine manages a sibling canvas per backend and
  flips visibility.
- **Physically correct glass.** Exact unpolarized dielectric Fresnel with
  proper total internal reflection (dense→sparse only), refraction via Snell's
  law with configurable IOR, and transparent shadow rays so glass casts light
  shadows, not opaque ones. Verified against a reference: a glass sphere
  correctly inverts the image behind it like a ball lens.
- **Physical camera.** Orbit/pan/dolly controls, aperture + focus distance DoF,
  exposure in stops, ACES filmic tonemapping.

## Using the engine as a library

```ts
import { Engine, Scene, Material, Decal, Environment, loadGLTF } from "./src";

const scene = new Scene();                       // starts with a procedural sky
scene.setEnvironment(Environment.fromHDR(hdrArrayBuffer));

const meshes = await loadGLTF(glbArrayBuffer);
scene.add(...meshes);

const body = meshes.find(m => m.name === "body")!;
body.material = Material.carPaint([0.55, 0.02, 0.04]);   // candy red

body.decals.push(new Decal({                     // livery on THIS mesh only
  image: liveryCanvas,
  position: [1.1, 0.8, 0.2],
  rotation: Decal.rotationFromDir([-1, 0, 0]),
  size: [1.2, 1.2, 0.8],
}));

const engine = await Engine.create({ canvas });  // picks WebGPU, else WebGL2
await engine.setScene(scene);
engine.start();
```

Anything that changes the image (camera, materials, environment settings) restarts
progressive accumulation automatically; structural changes (`scene.add`, decals) call
`scene.invalidate()` and the engine rebuilds GPU data in the background.

## Architecture

```
src/
├── core/            Scene graph, Material, Decal, Camera, Environment (HDR + CDF)
│   ├── Engine.ts        backend selection + render loop
│   └── RendererBackend.ts   the contract both backends implement
├── accel/BVH.ts     binned-SAH BVH → flat GPU arrays
├── backends/
│   ├── webgpu/      pathtracer.wgsl (megakernel), tonemap.wgsl, driver
│   └── webgl2/      forward PBR + IBL + shadow map fallback
├── loaders/         glTF 2.0 (.glb/.gltf) and OBJ
├── geometry/        primitives
└── demo/            the viewer app (drag-drop models/HDRIs, paint & livery UI)
```

## Roadmap

- Textured materials (base color / normal / roughness maps) in both backends
- Draco / meshopt compressed glTF, multi-file .gltf imports
- Denoiser (SVGF-style) for near-instant previews
- Light sources beyond HDRI (area lights with NEE)
- Decal placement by surface click in the demo

## License

MIT — see [LICENSE](./LICENSE).
