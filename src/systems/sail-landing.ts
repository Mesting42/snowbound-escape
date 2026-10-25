import type { Player, Surface } from "../core/types";
import { smooth } from "../core/math";

/** 收帆缓降独立于技能：最多4s，前0.65s平顺恢复重力，不提供抬升、加速或免伤。 */
export const SAIL_DESCENT = {
  duration: 4,
  gravityTransition: 0.65,
  normalSpeed: 12,
} as const;

export function sailDescentActive(p: Player) {
  return (
    p.ride === "sail" &&
    p.sailDescent > 0 &&
    !p.grounded &&
    p.fall === 0 &&
    p.ability === 0
  );
}

/** 技能仅在腾空结束的边沿启动一次，不能在后续每帧/下一次跳跃重新刷新。 */
export function updateSailDescent(
  p: Player,
  previousAbility: number,
  dt: number,
) {
  p.sailDescent = Math.max(0, p.sailDescent - dt);
  if (p.ride !== "sail" || p.grounded || p.fall > 0) {
    p.sailDescent = 0;
    return;
  }
  if (previousAbility > 0 && p.ability === 0)
    p.sailDescent = SAIL_DESCENT.duration;
}

export function sailDescentGravity(p: Player) {
  const elapsed = SAIL_DESCENT.duration - p.sailDescent;
  return 3.2 + (18 - 3.2) * smooth(elapsed / SAIL_DESCENT.gravityTransition);
}

/**
 * 用相对于接触坡面的法向下落速度限幅，不把沿坡高速滑行误当垂直撞击。
 * 只限制本次收帆下降的速度，不修改角度/角速度、落地评分或碰撞保护。
 * 限值始终向下，不能借上坡坡度产生新的抬升。
 */
export function limitSailDescent(p: Player, surface: Surface) {
  const minimum = Math.min(
    -2,
    surface.slope * p.vx -
      SAIL_DESCENT.normalSpeed * Math.hypot(1, surface.slope),
  );
  p.vy = Math.max(p.vy, minimum);
}
