import type { Mode, Phase } from "../core/types";
import { clamp, smooth } from "../core/math";
import { hasAvalanche } from "./avalanche-feedback";

/** 红色标志仅使用真实距离；200m开始增强，100m近险，50m以内达到上限。 */
export const WARNING_RANGE = { start: 200, near: 100, critical: 50 } as const;
export function avalancheWarning(
  mode: Mode,
  tutorialStep: number,
  phase: Phase,
  gap: number,
) {
  const enabled =
    hasAvalanche(mode, tutorialStep) &&
    (phase === "intro" || phase === "playing" || phase === "paused");
  const distance = Number.isNaN(gap) ? Infinity : Math.max(0, gap);
  const strength = enabled
    ? smooth(
        clamp(
          (WARNING_RANGE.start - distance) /
            (WARNING_RANGE.start - WARNING_RANGE.critical),
          0,
          1,
        ),
      )
    : 0;
  return {
    enabled,
    level:
      distance <= WARNING_RANGE.critical
        ? "critical"
        : distance <= WARNING_RANGE.near
          ? "near"
          : distance < WARNING_RANGE.start
            ? "approaching"
            : "far",
    approaching: enabled && strength > 0,
    moving: enabled && strength > 0 && phase === "playing",
    // 分离缩放和摆动节点，避免两个transform相互覆盖；全部参数有上限。
    scale: 1 + strength * 0.75,
    tilt: strength * 9,
    sway: strength * 1.25,
    period: clamp(1.2 - strength * 0.65, 0.55, 1.2),
  };
}
