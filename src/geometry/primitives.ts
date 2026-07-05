import { Geometry } from "../core/Mesh";

/** UV sphere. */
export function sphereGeometry(radius = 1, widthSegments = 48, heightSegments = 32): Geometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let y = 0; y <= heightSegments; y++) {
    const v = y / heightSegments;
    const theta = v * Math.PI;
    for (let x = 0; x <= widthSegments; x++) {
      const u = x / widthSegments;
      const phi = u * Math.PI * 2;
      const nx = Math.sin(theta) * Math.cos(phi);
      const ny = Math.cos(theta);
      const nz = Math.sin(theta) * Math.sin(phi);
      positions.push(nx * radius, ny * radius, nz * radius);
      normals.push(nx, ny, nz);
      uvs.push(u, v);
    }
  }
  const row = widthSegments + 1;
  for (let y = 0; y < heightSegments; y++) {
    for (let x = 0; x < widthSegments; x++) {
      const a = y * row + x;
      const b = a + row;
      // CCW seen from outside so geometric normals face outward
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  return toGeometry(positions, normals, uvs, indices);
}

/** Ground plane on XZ, centered at origin, facing +Y. */
export function planeGeometry(width = 10, depth = 10): Geometry {
  const w = width / 2;
  const d = depth / 2;
  return toGeometry(
    [-w, 0, -d, w, 0, -d, w, 0, d, -w, 0, d],
    [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    [0, 0, 1, 0, 1, 1, 0, 1],
    [0, 2, 1, 0, 3, 2],
  );
}

/** Axis-aligned box with flat-shaded faces. */
export function boxGeometry(sx = 1, sy = 1, sz = 1): Geometry {
  const x = sx / 2, y = sy / 2, z = sz / 2;
  const faces: { n: number[]; corners: number[][] }[] = [
    { n: [0, 0, 1], corners: [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]] },
    { n: [0, 0, -1], corners: [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]] },
    { n: [1, 0, 0], corners: [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]] },
    { n: [-1, 0, 0], corners: [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]] },
    { n: [0, 1, 0], corners: [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]] },
    { n: [0, -1, 0], corners: [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]] },
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  faces.forEach((f, fi) => {
    const base = fi * 4;
    for (let i = 0; i < 4; i++) {
      positions.push(...f.corners[i]);
      normals.push(...f.n);
      uvs.push(i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return toGeometry(positions, normals, uvs, indices);
}

function toGeometry(positions: number[], normals: number[], uvs: number[], indices: number[]): Geometry {
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
}
