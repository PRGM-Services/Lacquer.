# Mesh Hierarchy, Selection, and Gizmo Guide

This guide covers the new features added to the render engine:
- **FBX Import**: Load FBX files with geometry, materials, and hierarchy
- **Mesh Hierarchy**: Parent-child relationships between meshes
- **Selection System**: Track and manage selected objects
- **Gizmo Manipulation**: Interactive transform tools

## Table of Contents

1. [FBX Loading](#fbx-loading)
2. [Mesh Hierarchy](#mesh-hierarchy)
3. [Selection System](#selection-system)
4. [Gizmo Manipulation](#gizmo-manipulation)
5. [Complete Example](#complete-example)

---

## FBX Loading

Load FBX files (ASCII or binary format, FBX 2011+) with full hierarchy support.

```typescript
import { loadFBX } from "./loaders/FBXLoader";

// Load from file
const response = await fetch("model.fbx");
const buffer = await response.arrayBuffer();
const meshes = await loadFBX(buffer, "myModel");

// Add to scene
scene.add(...meshes);
```

### Supported Features

- ✅ Triangle geometry (auto-triangulated from polygons)
- ✅ Vertex normals and UVs
- ✅ Materials (basic PBR properties)
- ✅ Hierarchical transforms (parent-child relationships)
- ✅ Translation, rotation (Euler angles), and scale
- ❌ Textures (coming soon)
- ❌ Animations (coming soon)
- ❌ Skinning/Deformers (coming soon)

---

## Mesh Hierarchy

Meshes now support parent-child relationships with local transforms.

### Creating a Hierarchy

```typescript
import { Mesh, Material } from "./index";
import { mat4Translation } from "./math/vec";

// Create meshes
const parent = new Mesh("Parent", geometry1, material1);
const child1 = new Mesh("Child1", geometry2, material2);
const child2 = new Mesh("Child2", geometry3, material3);

// Build hierarchy
parent.add(child1, child2);

// Nested hierarchy
const grandchild = new Mesh("Grandchild", geometry4, material4);
child1.add(grandchild);
```

### Transform System

Each mesh has a **local transform** relative to its parent. The **world transform** is computed by traversing up the hierarchy.

```typescript
// Local transform (relative to parent)
mesh.transform = mat4Translation([1, 2, 3]);

// Get world transform (accumulated from all parents)
const worldTransform = mesh.getWorldTransform();
```

### Traversing the Hierarchy

```typescript
// Visit each mesh in the hierarchy
rootMesh.traverse((mesh) => {
  console.log(mesh.name);
});

// Get all meshes as a flat array
const allMeshes = rootMesh.getAllMeshes();

// Get all meshes in the scene (including all hierarchies)
const sceneMeshes = scene.getAllMeshes();
```

### Managing Hierarchy

```typescript
// Add children
parent.add(child1, child2);

// Remove a child
parent.remove(child1);

// Check parent
if (child.parent) {
  console.log("Parent:", child.parent.name);
}

// Access children
for (const child of parent.children) {
  console.log("Child:", child.name);
}
```

---

## Selection System

Track which meshes are selected in the scene.

### Basic Usage

```typescript
const scene = new Scene();

// Select a single mesh
scene.selection.select(mesh);

// Add to selection (multi-select)
scene.selection.add(mesh2);

// Remove from selection
scene.selection.remove(mesh);

// Toggle selection
scene.selection.toggle(mesh);

// Clear all selections
scene.selection.clear();
```

### Querying Selection

```typescript
// Check if a mesh is selected
if (scene.selection.isSelected(mesh)) {
  console.log("Selected!");
}

// Get all selected meshes
const selected = scene.selection.getSelected();

// Get primary selection (first selected)
const primary = scene.selection.getPrimary();

// Check if there's a selection
if (scene.selection.hasSelection()) {
  console.log("Something is selected");
}
```

### Selection Events

```typescript
// Listen for selection changes
scene.selection.onChange = (selected) => {
  console.log("Selection changed:", selected.map(m => m.name));
  
  // Update UI, highlight objects, etc.
};
```

### Integration with Mouse Events

```typescript
canvas.addEventListener("click", (e) => {
  const mesh = raycastMesh(scene, e.clientX, e.clientY);
  
  if (mesh) {
    if (e.shiftKey) {
      scene.selection.add(mesh); // Multi-select
    } else {
      scene.selection.select(mesh); // Single select
    }
  } else {
    scene.selection.clear(); // Click empty space
  }
});
```

---

## Gizmo Manipulation

Interactive gizmos for transforming selected objects.

### Gizmo Modes

The gizmo supports three transformation modes:

```typescript
scene.gizmo.mode = "translate"; // Move objects
scene.gizmo.mode = "rotate";    // Rotate objects
scene.gizmo.mode = "scale";     // Scale objects
```

### Setting the Target

The gizmo automatically targets the primary selected mesh:

```typescript
scene.selection.select(mesh);
// scene.gizmo now automatically targets 'mesh'

// Or manually set target
scene.gizmo.setTarget(mesh);
```

### Drag Operations

```typescript
// Start dragging on an axis
scene.gizmo.startDrag("x", scene.camera, [mouseX, mouseY, 0]);

// Update drag (call on mousemove)
scene.gizmo.updateDrag(scene.camera, [mouseX, mouseY, 0]);

// End drag (call on mouseup)
scene.gizmo.endDrag();

// Check if dragging
if (scene.gizmo.isDragging()) {
  console.log("Active axis:", scene.gizmo.getActiveAxis());
}
```

### Axis Constraints

Operations can be constrained to specific axes:

- `"x"` - X-axis only
- `"y"` - Y-axis only  
- `"z"` - Z-axis only
- `"xyz"` - All axes (uniform scale, or screen-space translation)

### Keyboard Shortcuts (Example)

```typescript
document.addEventListener("keydown", (e) => {
  if (e.key === "g") scene.gizmo.mode = "translate";
  if (e.key === "r") scene.gizmo.mode = "rotate";
  if (e.key === "s") scene.gizmo.mode = "scale";
  
  // Axis locking
  if (e.key === "x") startAxisDrag("x");
  if (e.key === "y") startAxisDrag("y");
  if (e.key === "z") startAxisDrag("z");
});
```

### Rendering the Gizmo

Get visual data for rendering:

```typescript
const gizmoGeometry = scene.gizmo.getGizmoGeometry(scene.camera);

if (gizmoGeometry) {
  const { position, size, mode, activeAxis, axes } = gizmoGeometry;
  
  // Render gizmo handles at position
  // - Red handle along axes.x
  // - Green handle along axes.y
  // - Blue handle along axes.z
  // - Highlight activeAxis
}
```

---

## Complete Example

Here's a full example putting everything together:

```typescript
import {
  Engine,
  Scene,
  loadFBX,
  Material,
  Camera,
} from "./index";

async function main() {
  // Setup
  const canvas = document.querySelector("canvas") as HTMLCanvasElement;
  const engine = await Engine.create({ canvas });
  const scene = new Scene();

  // Load FBX
  const response = await fetch("car.fbx");
  const buffer = await response.arrayBuffer();
  const meshes = await loadFBX(buffer, "car");
  scene.add(...meshes);

  // Setup camera
  scene.camera.position = [5, 3, 5];
  scene.camera.lookAt([0, 0, 0]);

  // Selection on click
  canvas.addEventListener("click", (e) => {
    const mesh = raycastMesh(scene, e.clientX, e.clientY);
    
    if (mesh) {
      if (e.shiftKey) {
        scene.selection.add(mesh);
      } else {
        scene.selection.select(mesh);
      }
      scene.invalidate();
    }
  });

  // Gizmo controls
  let isDragging = false;

  document.addEventListener("keydown", (e) => {
    if (e.key === "g") scene.gizmo.mode = "translate";
    if (e.key === "r") scene.gizmo.mode = "rotate";
    if (e.key === "s") scene.gizmo.mode = "scale";
  });

  canvas.addEventListener("mousedown", (e) => {
    const axis = pickGizmoAxis(scene, e.clientX, e.clientY);
    if (axis) {
      scene.gizmo.startDrag(axis, scene.camera, [e.clientX, e.clientY, 0]);
      isDragging = true;
    }
  });

  canvas.addEventListener("mousemove", (e) => {
    if (isDragging) {
      scene.gizmo.updateDrag(scene.camera, [e.clientX, e.clientY, 0]);
      scene.invalidate();
    }
  });

  canvas.addEventListener("mouseup", () => {
    if (isDragging) {
      scene.gizmo.endDrag();
      isDragging = false;
    }
  });

  // Hierarchy UI
  buildHierarchyPanel(scene, meshes);

  // Start rendering
  await engine.setScene(scene);
  engine.start();
}

function buildHierarchyPanel(scene: Scene, meshes: Mesh[]) {
  const panel = document.createElement("div");
  panel.style.cssText = `
    position: fixed;
    top: 10px;
    left: 10px;
    background: rgba(0,0,0,0.8);
    color: white;
    padding: 10px;
    max-height: 80vh;
    overflow-y: auto;
  `;

  function addMeshToPanel(mesh: Mesh, indent: number = 0) {
    const item = document.createElement("div");
    item.style.paddingLeft = `${indent * 15}px`;
    item.style.cursor = "pointer";
    item.textContent = mesh.name;

    item.addEventListener("click", () => {
      scene.selection.select(mesh);
    });

    panel.appendChild(item);

    for (const child of mesh.children) {
      addMeshToPanel(child, indent + 1);
    }
  }

  for (const mesh of meshes) {
    addMeshToPanel(mesh);
  }

  document.body.appendChild(panel);
}

main();
```

---

## API Reference

### Mesh

```typescript
class Mesh {
  parent: Mesh | null;
  children: Mesh[];
  transform: Mat4; // Local transform
  
  add(...children: Mesh[]): void;
  remove(child: Mesh): void;
  getWorldTransform(): Mat4;
  traverse(fn: (mesh: Mesh) => void): void;
  getAllMeshes(): Mesh[];
}
```

### Selection

```typescript
class Selection {
  onChange: ((selected: Mesh[]) => void) | null;
  
  select(mesh: Mesh): void;
  add(mesh: Mesh): void;
  remove(mesh: Mesh): void;
  toggle(mesh: Mesh): void;
  clear(): void;
  isSelected(mesh: Mesh): boolean;
  getSelected(): Mesh[];
  getPrimary(): Mesh | null;
  hasSelection(): boolean;
}
```

### Gizmo

```typescript
class Gizmo {
  mode: "translate" | "rotate" | "scale";
  
  setTarget(mesh: Mesh | null): void;
  getTarget(): Mesh | null;
  startDrag(axis: "x" | "y" | "z" | "xyz", camera: Camera, screenPos: Vec3): void;
  updateDrag(camera: Camera, screenPos: Vec3): void;
  endDrag(): void;
  isDragging(): boolean;
  getActiveAxis(): "x" | "y" | "z" | "xyz" | null;
  getGizmoGeometry(camera: Camera): GizmoGeometry | null;
}
```

### Scene

```typescript
class Scene {
  meshes: Mesh[]; // Root meshes
  selection: Selection;
  gizmo: Gizmo;
  
  add(...meshes: Mesh[]): void;
  remove(mesh: Mesh): void;
  getAllMeshes(): Mesh[];
  findByName(name: string): Mesh | null;
}
```

---

## Tips and Best Practices

1. **Transform Updates**: Call `scene.invalidate()` after modifying transforms to trigger a re-render.

2. **Hierarchy Design**: Keep hierarchies shallow when possible for better performance.

3. **Selection Events**: Use `selection.onChange` to update UI when selection changes.

4. **Gizmo Target**: The gizmo automatically targets the first selected mesh. For multi-selection editing, implement custom logic.

5. **World vs Local**: Remember that `mesh.transform` is local to the parent. Use `getWorldTransform()` for world-space operations.

6. **FBX Compatibility**: Test your FBX files - different exporters may produce different results. FBX 2020 format is recommended.

---

## Troubleshooting

### FBX file won't load

- Check the file format (binary or ASCII FBX 2011+)
- Verify the file isn't corrupted
- Check the browser console for detailed error messages

### Hierarchy not displaying correctly

- Verify parent-child relationships with `mesh.traverse()`
- Check transform matrices are valid
- Ensure you're calling `getWorldTransform()` for rendering

### Gizmo not responding

- Verify a mesh is selected
- Check that the camera is properly configured
- Implement proper ray-plane intersection for your camera system

### Selection not working

- Make sure you're calling `scene.invalidate()` after selection changes
- Verify raycasting is implemented correctly
- Check that meshes have valid geometry

---

## Future Enhancements

Planned features for future versions:

- [ ] Texture support in FBX loader
- [ ] Animation playback
- [ ] Skinned mesh support
- [ ] Ray-based mesh picking helper
- [ ] Visual gizmo rendering
- [ ] Undo/redo for transforms
- [ ] Multi-object gizmo editing
- [ ] Snap-to-grid support
- [ ] Transform constraints (lock axes, etc.)
