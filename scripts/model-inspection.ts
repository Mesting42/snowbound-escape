import * as THREE from "three";
import type { ModelFactory } from "../src/render/model-factory";

/** 无 DOM/纹理加载的离线工厂，仅供测试与几何投影；不会替换游戏正式材质。 */
export function inspectionFactory(): ModelFactory {
  const geometries = {
    sphere: new THREE.SphereGeometry(1, 14, 10),
    box: new THREE.BoxGeometry(1, 1, 1),
    capsule: new THREE.CapsuleGeometry(0.5, 1, 4, 10),
  };
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const factory: ModelFactory = {
    material(color, roughness = 0.8, metalness = 0) {
      const key = `${color}:${roughness}:${metalness}`;
      if (!materials.has(key))
        materials.set(
          key,
          new THREE.MeshStandardMaterial({ color, roughness, metalness }),
        );
      return materials.get(key)!;
    },
    part(parent, color, x, y, z, sx, sy, sz, shape = "sphere") {
      const mesh = new THREE.Mesh(geometries[shape], factory.material(color));
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      parent.add(mesh);
      return mesh;
    },
  };
  return factory;
}

export function visibleMetrics(root: THREE.Object3D) {
  let meshes = 0,
    triangles = 0;
  const buffers = new Set<THREE.BufferGeometry>();
  root.traverseVisible((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    meshes++;
    triangles +=
      (o.geometry.index?.count ?? o.geometry.getAttribute("position").count) /
      3;
    buffers.add(o.geometry);
  });
  return { meshes, triangles, buffers: buffers.size };
}

/** CPU 三角面投影保留真实节点变换，采用近似漫反射；用于造型检查，不是 WebGL 截图。 */
export function projectModel(
  root: THREE.Object3D,
  camera: THREE.Camera,
  width: number,
  height: number,
  gray = false,
) {
  root.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const triangles: { depth: number; svg: string }[] = [];
  const sun = new THREE.Vector3(-0.4, 0.85, 0.65).normalize();
  root.traverseVisible((o) => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
    const geo = o.geometry,
      pos = geo.getAttribute("position"),
      normals = geo.getAttribute("normal"),
      index = geo.index;
    const count = index?.count ?? pos.count,
      normalMatrix = new THREE.Matrix3().getNormalMatrix(o.matrixWorld);
    for (let n = 0; n < count; n += 3) {
      const ids = [0, 1, 2].map((k) => (index ? index.getX(n + k) : n + k));
      const v = ids.map((i) =>
        new THREE.Vector3()
          .fromBufferAttribute(pos, i)
          .applyMatrix4(o.matrixWorld),
      );
      const normal = new THREE.Vector3()
        .subVectors(v[1], v[0])
        .cross(new THREE.Vector3().subVectors(v[2], v[0]));
      const center = v[0]
        .clone()
        .add(v[1])
        .add(v[2])
        .multiplyScalar(1 / 3);
      if (normal.dot(camera.position.clone().sub(center)) <= 0) continue;
      const smooth = ids
        .reduce(
          (sum, i) =>
            sum.add(new THREE.Vector3().fromBufferAttribute(normals, i)),
          new THREE.Vector3(),
        )
        .applyMatrix3(normalMatrix)
        .normalize();
      const material = o.material as THREE.MeshStandardMaterial;
      const color = (gray ? new THREE.Color("#49616b") : material.color.clone())
        .multiplyScalar(0.7 + 0.3 * Math.max(0, smooth.dot(sun)))
        .getHexString();
      const projected = v.map((a) => a.project(camera));
      const points = projected
        .map(
          (a) =>
            `${(((a.x + 1) * width) / 2).toFixed(2)},${(((1 - a.y) * height) / 2).toFixed(2)}`,
        )
        .join(" ");
      triangles.push({
        depth: projected.reduce((s, a) => s + a.z, 0) / 3,
        svg: `<polygon points="${points}" fill="#${color}" stroke="#${color}" stroke-width="0.3"/>`,
      });
    }
  });
  triangles.sort((a, b) => b.depth - a.depth);
  return triangles.map((t) => t.svg).join("");
}
