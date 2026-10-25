import * as THREE from "three";
import { REGIONS } from "../data/config";
import { clamp, lerp } from "../core/math";

/** 非碰撞装饰的纵深边界；玩家与真实障碍位于 z≈0，装饰不能回到通行带。 */
export const SCENERY_DEPTH = {
  tree: -24,
  rock: -26,
  cabin: -24,
  ice: -32,
  lift: -30,
} as const;
const cache = new Map<string, THREE.MeshStandardMaterial>();

/** 与雪道网格的远侧横截面一致，装饰退后后仍落在雪面上，不悬空。 */
export function sceneryGroundHeight(x: number, routeHeight: number, z: number) {
  const across = clamp((-z - 10) / 35, 0, 1);
  return routeHeight + lerp(-0.8, -4.5 + Math.sin(x / 8) * 0.5, across);
}

/** 背景独立的低对比材质，不改写障碍/建筑共用的源材质。 */
export function sceneryMaterial(source: THREE.Material, region: number) {
  const key = `${source.uuid}:${region}`;
  if (!cache.has(key)) {
    const original = source as THREE.MeshStandardMaterial;
    const result = new THREE.MeshStandardMaterial({
      color: (original.color?.clone() ?? new THREE.Color("#afc8ce")).lerp(
        new THREE.Color(REGIONS[region].fog),
        0.58,
      ),
      roughness: 1,
    });
    // 不把近景木纹、裂口或岩石凹凸复制到背景；大色块与远雾一起表达景深。
    cache.set(key, result);
  }
  return cache.get(key)!;
}

/** 所有装饰走同一入口，淡化并关闭投向玩家雪道的阴影，保留真实障碍阴影。 */
export function placeScenery(
  object: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  region: number,
) {
  object.position.set(x, y, Math.min(-18, z));
  object.userData.scenery = true;
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.material = Array.isArray(child.material)
      ? child.material.map((m) => sceneryMaterial(m, region))
      : sceneryMaterial(child.material, region);
    child.castShadow = false;
    child.receiveShadow = false;
  });
  return object;
}
