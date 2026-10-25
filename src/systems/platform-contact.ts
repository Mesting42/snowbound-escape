import type { Ride } from "../core/types";
import { BRANCH_THICKNESS, type Terrain } from "./terrain";
import { lerp } from "../core/math";

/** 自足点到头部的接触高度（米）；骑乘形体使用对应包络，不依赖渲染模型。 */
export const RIDER_CLEARANCE: Record<Ride, number> = {
  ski: 2.05,
  otter: 2.2,
  yak: 3.05,
  owl: 2.05,
  bike: 2.35,
  sail: 2.25,
};
interface Position {
  x: number;
  y: number;
}

/**
 * 扫过本物理步的头部路径，平台当作有厚度的实体而非只从上方着陆的单向面。
 * 只处理从下方进入/已轻微重叠的情形，从台面上起跳、从上方落下不受影响。
 * 固定步通常仅1至2个采样，异常大步也按0.2m细分，真实断桥不产生虚构天花板。
 */
export function sweepPlatformCeiling(
  terrain: Terrain,
  from: Position,
  to: Position,
  height: number,
) {
  const steps = Math.max(1, Math.ceil(Math.abs(to.x - from.x) / 0.2));
  for (let i = 0; i < steps; i++) {
    const a = i / steps,
      b = (i + 1) / steps;
    const ax = lerp(from.x, to.x, a),
      bx = lerp(from.x, to.x, b);
    const ay = lerp(from.y, to.y, a),
      by = lerp(from.y, to.y, b);
    const before = terrain.branchHeight(ax),
      after = terrain.branchHeight(bx);
    if (after === null) continue;
    const bottom = after - BRANCH_THICKNESS;
    // 若前一采样在真实缺口中，使用新接触边缘的底面，不把缺口误当连续实体。
    const oldBottom = (before ?? after) - BRANCH_THICKNESS;
    const oldHead = ay + height,
      head = by + height;
    const fromBelow = ay < oldBottom - 0.01;
    const closing = head - bottom > oldHead - oldBottom;
    if (fromBelow && closing && head >= bottom - 0.015) {
      const finalUpper = terrain.branchHeight(to.x);
      const ceiling =
        finalUpper === null ? bottom : finalUpper - BRANCH_THICKNESS;
      return {
        // 低入口与主路合并处不能把角色挤进地面；仍禁止足点穿到台面上。
        footY: Math.max(terrain.height(to.x), ceiling - height - 0.02),
        slope: terrain.surface(bx, "upper").slope,
      };
    }
  }
  return null;
}
