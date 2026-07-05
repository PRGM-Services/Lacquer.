/**
 * Minimal example of the hierarchy / selection / gizmo APIs.
 *
 * The full interactive implementation (hierarchy tree panel, click-to-select
 * raycasting, SVG gizmo overlay) lives in `main.ts` — this file is a compact
 * reference for embedding the same features in your own app.
 */
import { Engine, Scene, Mesh, loadFBX } from "../index";

export async function hierarchyExample(
  canvas: HTMLCanvasElement,
  fbxBuffer: ArrayBuffer,
): Promise<{ engine: Engine; scene: Scene }> {
  const scene = new Scene();

  // loadFBX returns a single root group whose children mirror the FBX
  // Model hierarchy. Groups are empty meshes; leaves carry geometry.
  const [root] = await loadFBX(fbxBuffer, "car");
  scene.add(root);
  root.traverse((mesh: Mesh) => {
    console.log(`${"  ".repeat(depthOf(mesh))}${mesh.name}`);
  });

  // Selection drives the gizmo automatically (wired in the Scene ctor).
  const body = scene.findByName("Body");
  if (body) scene.selection.select(body);

  // The gizmo edits the target's LOCAL transform. Feed it world-space rays
  // (unproject your pointer events; see pointerRay() in main.ts):
  //   scene.gizmo.mode = "translate";            // or "rotate" / "scale"
  //   scene.gizmo.startDrag("x", ray);
  //   scene.gizmo.updateDrag(ray);               // on pointermove
  //   scene.gizmo.endDrag(); scene.invalidate(); // rebuild the BVH once
  scene.gizmo.onChange = () => engine.resetAccumulation();

  const engine = await Engine.create({ canvas });
  await engine.setScene(scene);
  engine.start();
  return { engine, scene };
}

function depthOf(mesh: Mesh): number {
  let d = 0;
  for (let p = mesh.parent; p; p = p.parent) d++;
  return d;
}
