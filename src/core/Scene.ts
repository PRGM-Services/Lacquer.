import { Camera } from "./Camera";
import { Environment } from "./Environment";
import { Light } from "./Light";
import { Mesh } from "./Mesh";
import { Selection } from "./Selection";
import { Gizmo } from "./Gizmo";

export class Scene {
  /** Root-level meshes (may have children forming a hierarchy). */
  meshes: Mesh[] = [];
  /** Punctual lights (point/spot/directional), on top of the environment. */
  lights: Light[] = [];
  environment: Environment;
  camera = new Camera();
  /** Selection manager for tracking selected meshes. */
  selection = new Selection();
  /** Gizmo for manipulating selected meshes. */
  gizmo = new Gizmo();
  /** When set, only this mesh (and its subtree) renders — isolation mode. */
  isolated: Mesh | null = null;
  /** Bumped on any change that invalidates accumulated samples/GPU buffers. */
  version = 0;

  constructor(environment?: Environment) {
    this.environment = environment ?? Environment.proceduralSky();
    
    // Update gizmo target when selection changes
    this.selection.onChange = (selected) => {
      this.gizmo.setTarget(selected.length === 1 ? selected[0] : null);
    };
  }

  /** Add root-level meshes to the scene. */
  add(...meshes: Mesh[]): void {
    this.meshes.push(...meshes);
    this.invalidate();
  }

  /** Remove a mesh from the scene (searches recursively). */
  remove(mesh: Mesh): void {
    const index = this.meshes.indexOf(mesh);
    if (index !== -1) {
      this.meshes.splice(index, 1);
      this.invalidate();
      return;
    }

    // Search in hierarchy
    for (const root of this.meshes) {
      root.traverse((m) => {
        if (m.children.includes(mesh)) {
          m.remove(mesh);
          this.invalidate();
        }
      });
    }
  }

  /** Get all meshes in the scene as a flat array (including hierarchy). */
  getAllMeshes(): Mesh[] {
    const all: Mesh[] = [];
    for (const mesh of this.meshes) {
      mesh.traverse((m) => all.push(m));
    }
    return all;
  }

  /** Find a mesh by name (searches recursively). */
  findByName(name: string): Mesh | null {
    for (const mesh of this.meshes) {
      if (mesh.name === name) return mesh;
      for (const child of mesh.getAllMeshes()) {
        if (child.name === name) return child;
      }
    }
    return null;
  }

  /** Isolate a mesh subtree (null exits isolation). */
  setIsolated(mesh: Mesh | null): void {
    this.isolated = mesh;
    this.invalidate();
  }

  /** Whether a mesh should render, honoring visibility and isolation. */
  isMeshRenderable(mesh: Mesh): boolean {
    if (!mesh.effectiveVisible()) return false;
    if (!this.isolated) return true;
    return mesh === this.isolated || mesh.isDescendantOf(this.isolated);
  }

  setEnvironment(env: Environment): void {
    this.environment = env;
    this.invalidate();
  }

  /** Call after mutating meshes/materials/decals so backends rebuild. */
  invalidate(): void {
    this.version++;
  }
}
