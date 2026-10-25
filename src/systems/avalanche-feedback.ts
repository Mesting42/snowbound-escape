import type { Mode, Phase } from "../core/types";
import { clamp } from "../core/math";

/** 追逐规则、HUD、声音与美术共用开关，避免教学隐藏状态泄漏到正式模式。 */
export function hasAvalanche(mode: Mode, tutorialStep: number) {
  return mode !== "tutorial" || tutorialStep === 3;
}

/** 环境反馈是远处雪崩扬起的雪雾，不表示碰撞前沿的位置。 */
export function avalancheFeedback(
  mode: Mode,
  tutorialStep: number,
  phase: Phase,
  gap: number,
) {
  const enabled =
    hasAvalanche(mode, tutorialStep) && phase !== "menu" && phase !== "won";
  const proximity = clamp(1 - Math.max(0, gap) / 320, 0, 1);
  return {
    enabled,
    gap: Math.max(0, gap),
    urgent: enabled && gap < 100,
    proximity: enabled ? proximity : 0,
    mist: enabled ? 0.09 + proximity * 0.22 : 0,
    rumble: enabled ? 0.014 + proximity * 0.15 : 0,
    light: enabled ? 1 - proximity * 0.09 : 1,
    status: gap < 100 ? "雪浪临近" : gap < 220 ? "正在逼近" : "身后推进",
  };
}
