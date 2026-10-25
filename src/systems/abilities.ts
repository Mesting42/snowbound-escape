import type { Player } from "../core/types";
import { ABILITIES } from "../data/abilities";
import { RIDES } from "../data/config";
import { smooth } from "../core/math";

/** 唯一有效状态：换乘/碰撞已清理ability，摔倒和双板不能残留主动技能。 */
export function activeAbility(p: Player) {
  return p.ride !== "ski" && p.ability > 0 && p.fall === 0
    ? ABILITIES[p.ride]
    : null;
}
export function rideSpeedLimit(p: Player) {
  return (
    RIDES[p.ride].cruise +
    (activeAbility(p)?.speedBonus ?? (p.boost > 0 ? 5 : 0))
  );
}
/** 呈现强度从真实剩余时间推导，进出各0.15s，无独立动画计时器。 */
export function abilityIntensity(p: Player) {
  const rule = activeAbility(p);
  return rule
    ? Math.min(
        smooth((rule.duration - p.ability) / 0.15),
        smooth(p.ability / 0.15),
      )
    : 0;
}
