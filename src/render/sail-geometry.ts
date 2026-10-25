import * as THREE from "three";

/** 共享带鼓帆形变的帆面，形变权重在每个Mesh实例上，互不污染拾取模型。 */
export function makeSailGeometry() {
  const size = 10,
    positions: number[] = [],
    deltas: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  const lookup: number[][] = [];
  for (let i = 0; i <= size; i++) {
    lookup[i] = [];
    for (let j = 0; j <= size - i; j++) {
      const a = i / size,
        b = j / size,
        c = 1 - a - b;
      lookup[i][j] = positions.length / 3;
      positions.push(-1.9 * b, 2.7 * a + 0.3 * b, 0);
      deltas.push(0, 0, a * b * c * 27 * 0.55);
      uvs.push(b, a);
    }
  }
  for (let i = 0; i < size; i++)
    for (let j = 0; j < size - i; j++) {
      indices.push(lookup[i][j], lookup[i + 1][j], lookup[i][j + 1]);
      if (j < size - i - 1)
        indices.push(lookup[i + 1][j], lookup[i + 1][j + 1], lookup[i][j + 1]);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  g.morphTargetsRelative = true;
  g.morphAttributes.position = [new THREE.Float32BufferAttribute(deltas, 3)];
  // 形变法线也预计算一次，鼓帆时光照随弧面变化，不逐帧重算法线。
  const inflated = g.clone();
  const vertices = inflated.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < vertices.count; i++) vertices.setZ(i, deltas[i * 3 + 2]);
  inflated.computeVertexNormals();
  const normal = g.getAttribute("normal"),
    inflatedNormal = inflated.getAttribute("normal");
  const normalDeltas = new Float32Array(normal.count * 3);
  for (let i = 0; i < normalDeltas.length; i++)
    normalDeltas[i] = inflatedNormal.array[i] - normal.array[i];
  g.morphAttributes.normal = [new THREE.BufferAttribute(normalDeltas, 3)];
  inflated.dispose();
  return g;
}
