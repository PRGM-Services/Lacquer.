import { Scene } from "../core/Scene";

/**
 * Binned SAH bounding volume hierarchy over the world-space triangles of a
 * scene, flattened into GPU-friendly typed arrays.
 *
 * GPU layout (all Float32/Uint32 views over the same buffers):
 *  - nodes: 8 floats per node
 *      [minX, minY, minZ, leftFirst(bits), maxX, maxY, maxZ, count(bits)]
 *    count > 0  -> leaf, triangles [leftFirst, leftFirst + count)
 *    count == 0 -> inner node, children at leftFirst and leftFirst + 1
 *  - triangles: 32 floats per triangle
 *      v0.xyz meshIndex | v1.xyz 0 | v2.xyz 0 |
 *      n0.xyz u0 | n1.xyz u1 | n2.xyz u2 |
 *      v0v.x v1v.y v2v.z 0 | (spare vec4)
 *    (vertex uv.v components are packed in the 7th vec4)
 */
export interface BVHResult {
  nodes: Float32Array;
  nodeCount: number;
  triangles: Float32Array;
  triangleCount: number;
  /** meshIndex -> mesh order used for material/decal indexing. */
  meshCount: number;
}

const FLOATS_PER_TRI = 32;
const BINS = 12;

export function buildSceneBVH(scene: Scene): BVHResult {
  // ---- 1. Gather world-space triangle soup -------------------------------
  interface Tri {
    cx: number; cy: number; cz: number; // centroid
    minx: number; miny: number; minz: number;
    maxx: number; maxy: number; maxz: number;
    data: Float32Array; // FLOATS_PER_TRI
  }
  const tris: Tri[] = [];

  // Flattened traversal order — must match the mesh-info indexing in the
  // backends, which use the same scene.getAllMeshes() enumeration.
  const allMeshes = scene.getAllMeshes();
  allMeshes.forEach((mesh, meshIndex) => {
    if (!scene.isMeshRenderable(mesh) || mesh.geometry.indices.length === 0) return;
    const g = mesh.worldGeometry();
    const idx = g.indices;
    for (let t = 0; t < idx.length; t += 3) {
      const ia = idx[t], ib = idx[t + 1], ic = idx[t + 2];
      const d = new Float32Array(FLOATS_PER_TRI);
      const px = [g.positions[ia * 3], g.positions[ib * 3], g.positions[ic * 3]];
      const py = [g.positions[ia * 3 + 1], g.positions[ib * 3 + 1], g.positions[ic * 3 + 1]];
      const pz = [g.positions[ia * 3 + 2], g.positions[ib * 3 + 2], g.positions[ic * 3 + 2]];
      // positions + meshIndex
      d[0] = px[0]; d[1] = py[0]; d[2] = pz[0]; d[3] = meshIndex; // read via u32 in shader after round
      d[4] = px[1]; d[5] = py[1]; d[6] = pz[1]; d[7] = 0;
      d[8] = px[2]; d[9] = py[2]; d[10] = pz[2]; d[11] = 0;
      // normals + uv.u
      for (let v = 0; v < 3; v++) {
        const vi = [ia, ib, ic][v];
        d[12 + v * 4] = g.normals[vi * 3];
        d[13 + v * 4] = g.normals[vi * 3 + 1];
        d[14 + v * 4] = g.normals[vi * 3 + 2];
        d[15 + v * 4] = g.uvs.length ? g.uvs[vi * 2] : 0;
      }
      // uv.v for the three vertices
      d[24] = g.uvs.length ? g.uvs[ia * 2 + 1] : 0;
      d[25] = g.uvs.length ? g.uvs[ib * 2 + 1] : 0;
      d[26] = g.uvs.length ? g.uvs[ic * 2 + 1] : 0;
      d[27] = 0;

      const minx = Math.min(px[0], px[1], px[2]);
      const miny = Math.min(py[0], py[1], py[2]);
      const minz = Math.min(pz[0], pz[1], pz[2]);
      const maxx = Math.max(px[0], px[1], px[2]);
      const maxy = Math.max(py[0], py[1], py[2]);
      const maxz = Math.max(pz[0], pz[1], pz[2]);
      tris.push({
        cx: (minx + maxx) / 2, cy: (miny + maxy) / 2, cz: (minz + maxz) / 2,
        minx, miny, minz, maxx, maxy, maxz,
        data: d,
      });
    }
  });

  const triCount = tris.length;
  if (triCount === 0) {
    return {
      nodes: new Float32Array(8),
      nodeCount: 1,
      triangles: new Float32Array(0),
      triangleCount: 0,
      meshCount: allMeshes.length,
    };
  }

  // ---- 2. Binned SAH build over an index array ---------------------------
  const order = new Uint32Array(triCount);
  for (let i = 0; i < triCount; i++) order[i] = i;

  // Worst case 2N-1 nodes.
  const nodes = new Float32Array((2 * triCount) * 8);
  const nodesU32 = new Uint32Array(nodes.buffer);
  let nodeCount = 0;

  const newNode = (): number => nodeCount++;

  interface Range { first: number; count: number; nodeIndex: number }
  const stack: Range[] = [];
  const rootIndex = newNode();
  stack.push({ first: 0, count: triCount, nodeIndex: rootIndex });

  const LEAF_SIZE = 4;

  while (stack.length) {
    const { first, count, nodeIndex } = stack.pop()!;

    // Bounds of this range (geometry and centroids).
    let minx = Infinity, miny = Infinity, minz = Infinity;
    let maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
    let cminx = Infinity, cminy = Infinity, cminz = Infinity;
    let cmaxx = -Infinity, cmaxy = -Infinity, cmaxz = -Infinity;
    for (let i = first; i < first + count; i++) {
      const tr = tris[order[i]];
      minx = Math.min(minx, tr.minx); miny = Math.min(miny, tr.miny); minz = Math.min(minz, tr.minz);
      maxx = Math.max(maxx, tr.maxx); maxy = Math.max(maxy, tr.maxy); maxz = Math.max(maxz, tr.maxz);
      cminx = Math.min(cminx, tr.cx); cminy = Math.min(cminy, tr.cy); cminz = Math.min(cminz, tr.cz);
      cmaxx = Math.max(cmaxx, tr.cx); cmaxy = Math.max(cmaxy, tr.cy); cmaxz = Math.max(cmaxz, tr.cz);
    }

    const base = nodeIndex * 8;
    nodes[base] = minx; nodes[base + 1] = miny; nodes[base + 2] = minz;
    nodes[base + 4] = maxx; nodes[base + 5] = maxy; nodes[base + 6] = maxz;

    const makeLeaf = () => {
      nodesU32[base + 3] = first;
      nodesU32[base + 7] = count;
    };

    if (count <= LEAF_SIZE) {
      makeLeaf();
      continue;
    }

    // Pick the widest centroid axis and bin.
    const ext = [cmaxx - cminx, cmaxy - cminy, cmaxz - cminz];
    const axis = ext[0] > ext[1] ? (ext[0] > ext[2] ? 0 : 2) : (ext[1] > ext[2] ? 1 : 2);
    const cmin = [cminx, cminy, cminz][axis];
    const extent = ext[axis];
    if (extent < 1e-12) {
      makeLeaf();
      continue;
    }

    const binMin = new Float32Array(BINS * 3).fill(Infinity);
    const binMax = new Float32Array(BINS * 3).fill(-Infinity);
    const binCount = new Uint32Array(BINS);
    const getCentroid = (tr: Tri) => (axis === 0 ? tr.cx : axis === 1 ? tr.cy : tr.cz);

    for (let i = first; i < first + count; i++) {
      const tr = tris[order[i]];
      let b = Math.floor(((getCentroid(tr) - cmin) / extent) * BINS);
      if (b >= BINS) b = BINS - 1;
      if (b < 0) b = 0;
      binCount[b]++;
      binMin[b * 3] = Math.min(binMin[b * 3], tr.minx);
      binMin[b * 3 + 1] = Math.min(binMin[b * 3 + 1], tr.miny);
      binMin[b * 3 + 2] = Math.min(binMin[b * 3 + 2], tr.minz);
      binMax[b * 3] = Math.max(binMax[b * 3], tr.maxx);
      binMax[b * 3 + 1] = Math.max(binMax[b * 3 + 1], tr.maxy);
      binMax[b * 3 + 2] = Math.max(binMax[b * 3 + 2], tr.maxz);
    }

    // Sweep to find the cheapest split by surface-area heuristic.
    const area = (mnx: number, mny: number, mnz: number, mxx: number, mxy: number, mxz: number) => {
      const dx = Math.max(0, mxx - mnx), dy = Math.max(0, mxy - mny), dz = Math.max(0, mxz - mnz);
      return 2 * (dx * dy + dy * dz + dz * dx);
    };

    let bestCost = Infinity;
    let bestSplit = -1;
    for (let split = 1; split < BINS; split++) {
      let lc = 0, rc = 0;
      let lmnx = Infinity, lmny = Infinity, lmnz = Infinity, lmxx = -Infinity, lmxy = -Infinity, lmxz = -Infinity;
      let rmnx = Infinity, rmny = Infinity, rmnz = Infinity, rmxx = -Infinity, rmxy = -Infinity, rmxz = -Infinity;
      for (let b = 0; b < split; b++) {
        if (!binCount[b]) continue;
        lc += binCount[b];
        lmnx = Math.min(lmnx, binMin[b * 3]); lmny = Math.min(lmny, binMin[b * 3 + 1]); lmnz = Math.min(lmnz, binMin[b * 3 + 2]);
        lmxx = Math.max(lmxx, binMax[b * 3]); lmxy = Math.max(lmxy, binMax[b * 3 + 1]); lmxz = Math.max(lmxz, binMax[b * 3 + 2]);
      }
      for (let b = split; b < BINS; b++) {
        if (!binCount[b]) continue;
        rc += binCount[b];
        rmnx = Math.min(rmnx, binMin[b * 3]); rmny = Math.min(rmny, binMin[b * 3 + 1]); rmnz = Math.min(rmnz, binMin[b * 3 + 2]);
        rmxx = Math.max(rmxx, binMax[b * 3]); rmxy = Math.max(rmxy, binMax[b * 3 + 1]); rmxz = Math.max(rmxz, binMax[b * 3 + 2]);
      }
      if (lc === 0 || rc === 0) continue;
      const cost =
        lc * area(lmnx, lmny, lmnz, lmxx, lmxy, lmxz) +
        rc * area(rmnx, rmny, rmnz, rmxx, rmxy, rmxz);
      if (cost < bestCost) {
        bestCost = cost;
        bestSplit = split;
      }
    }

    if (bestSplit < 0) {
      makeLeaf();
      continue;
    }

    // In-place partition of the order array around the chosen bin split.
    const splitPos = cmin + (extent * bestSplit) / BINS;
    let i = first;
    let j = first + count - 1;
    while (i <= j) {
      if (getCentroid(tris[order[i]]) < splitPos) {
        i++;
      } else {
        const tmp = order[i];
        order[i] = order[j];
        order[j] = tmp;
        j--;
      }
    }
    let leftCount = i - first;
    if (leftCount === 0 || leftCount === count) {
      // Degenerate partition (identical centroids) — split down the middle.
      leftCount = count >> 1;
    }

    const leftChild = newNode();
    const rightChild = newNode();
    // Children are allocated back-to-back but not guaranteed adjacent when
    // popped from a stack, so allocate both before recursing and store left.
    nodesU32[base + 3] = leftChild;
    nodesU32[base + 7] = 0;
    // Right child must be leftChild + 1 for the shader's layout.
    if (rightChild !== leftChild + 1) {
      throw new Error("BVH internal error: non-contiguous children");
    }
    stack.push({ first, count: leftCount, nodeIndex: leftChild });
    stack.push({ first: first + leftCount, count: count - leftCount, nodeIndex: rightChild });
  }

  // ---- 3. Emit triangles in BVH order ------------------------------------
  const triangles = new Float32Array(triCount * FLOATS_PER_TRI);
  const trianglesU32 = new Uint32Array(triangles.buffer);
  for (let i = 0; i < triCount; i++) {
    triangles.set(tris[order[i]].data, i * FLOATS_PER_TRI);
    // meshIndex travels as a raw u32, not a float, so shaders can bitcast.
    trianglesU32[i * FLOATS_PER_TRI + 3] = tris[order[i]].data[3];
  }

  return {
    nodes: nodes.slice(0, nodeCount * 8),
    nodeCount,
    triangles,
    triangleCount: triCount,
    meshCount: allMeshes.length,
  };
}
