import { Mesh } from "./Mesh";

/**
 * Selection system for managing selected meshes in the scene.
 * Supports single and multi-selection.
 */
export class Selection {
  private selected = new Set<Mesh>();
  onChange: ((selected: Mesh[]) => void) | null = null;

  /** Select a single mesh, clearing previous selection. */
  select(mesh: Mesh): void {
    this.selected.clear();
    this.selected.add(mesh);
    this.notifyChange();
  }

  /** Add a mesh to the current selection. */
  add(mesh: Mesh): void {
    this.selected.add(mesh);
    this.notifyChange();
  }

  /** Remove a mesh from the selection. */
  remove(mesh: Mesh): void {
    this.selected.delete(mesh);
    this.notifyChange();
  }

  /** Toggle a mesh's selection state. */
  toggle(mesh: Mesh): void {
    if (this.selected.has(mesh)) {
      this.selected.delete(mesh);
    } else {
      this.selected.add(mesh);
    }
    this.notifyChange();
  }

  /** Clear all selections. */
  clear(): void {
    this.selected.clear();
    this.notifyChange();
  }

  /** Check if a mesh is selected. */
  isSelected(mesh: Mesh): boolean {
    return this.selected.has(mesh);
  }

  /** Get all selected meshes as an array. */
  getSelected(): Mesh[] {
    return Array.from(this.selected);
  }

  /** Get the first selected mesh (useful for single-selection operations). */
  getPrimary(): Mesh | null {
    return this.selected.values().next().value ?? null;
  }

  /** Check if there are any selections. */
  hasSelection(): boolean {
    return this.selected.size > 0;
  }

  private notifyChange(): void {
    this.onChange?.(this.getSelected());
  }
}
