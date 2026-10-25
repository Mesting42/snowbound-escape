import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * 静态车体/乘坐姿态按材质合并，保留法线、UV、米制比例和根节点。
 * 仅用于不再有肢体运动的模型；野外奔跑与骑乘动物仍保留原骨骼。
 */
export function batchStaticModel(root: THREE.Group) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
    const geometry = o.geometry
      .clone()
      .applyMatrix4(
        new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld),
      );
    if (!groups.has(o.material)) groups.set(o.material, []);
    groups.get(o.material)!.push(geometry);
  });
  root.clear();
  for (const [material, geometries] of groups) {
    const merged = mergeGeometries(geometries, false);
    if (!merged) throw new Error("静态载具模型的几何属性不一致");
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    // 只释放合并所用的临时克隆，不释放全局共享源网格与材质。
    for (const geometry of geometries) geometry.dispose();
  }
  return root;
}
