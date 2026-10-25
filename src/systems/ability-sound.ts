import type { Player } from "../core/types";
import { activeAbility } from "./abilities";

/** 声音预算取真实技能，不依赖渲染帧或特效开关；增益保持有界。 */
export function abilitySound(p: Player) {
  const active = !!activeAbility(p);
  return {
    engineHz: p.ride === "bike" ? 45 + p.vx * 2 + (active ? 65 : 0) : 35,
    engineGain: p.ride === "bike" ? (active ? 0.023 : 0.009) : 0,
    wind: active && (p.ride === "owl" || p.ride === "sail") ? 0.055 : 0,
    snow: active && p.grounded && p.ride !== "owl" ? 0.035 : 0,
  };
}
