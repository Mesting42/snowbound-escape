import type * as THREE from "three";

/** 模型只依赖部件和材质工厂；离线检查可注入无纹理工厂，复用正式几何。 */
export interface ModelFactory {
  part: (
    parent: THREE.Object3D,
    color: string,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    shape?: "sphere" | "box" | "capsule",
  ) => THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  material: (
    color: string,
    roughness?: number,
    metalness?: number,
  ) => THREE.MeshStandardMaterial;
}
