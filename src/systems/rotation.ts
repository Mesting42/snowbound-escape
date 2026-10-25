import type { Player } from "../core/types";
import { angleDelta, clamp } from "../core/math";
import { RIDES } from "../data/config";

/** angle 保留连续角，airRotation 只累计主动后空翻；归一化仅用于姿态比较。 */
export function rotateInAir(
  p: Player,
  held: boolean,
  slope: number,
  dt: number,
  assist: boolean,
) {
  const previous = p.angle;
  if (held && p.airTime > 0.12)
    p.omega +=
      (8.8 / RIDES[p.ride].mass ** 0.3 - p.omega) * Math.min(1, dt * 9);
  else {
    const target = Math.atan(slope);
    const error = angleDelta(p.angle, target);
    // 松手是有限角速度的阻尼弹簧，危险姿态仍需要时间回正。
    p.omega += (-error * (assist ? 15 : 10) - p.omega * 5.5) * dt;
  }
  p.omega = clamp(p.omega, -4, 10);
  p.angle += p.omega * dt;
  p.airRotation = Math.max(0, p.airRotation + p.angle - previous);
}
export function gradeLanding(p: Player, slope: number, impact: number) {
  const error = Math.abs(angleDelta(p.angle, Math.atan(slope)));
  if (error > 1.35 || impact > 24) return "crash";
  if (error > 0.58 || Math.abs(p.omega) > 5.8 || impact > 17) return "stumble";
  if (error < 0.28 && Math.abs(p.omega) < 3.5 && impact < 14) return "perfect";
  return "normal";
}
