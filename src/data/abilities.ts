import type { Ride } from "../core/types";

export type AbilityRide = Exclude<Ride, "ski">;
/** 技能持续时间和冷却保持原值；加速度m/s²、速度增量m/s、重力m/s²。 */
export interface AbilityRule {
  duration: number;
  cooldown: number;
  acceleration: number;
  speedBonus: number;
  launchSpeed: number;
  dragFactor: number;
  gravity: number;
  fallLimit: number;
  lift: number;
}
export const ABILITIES: Record<AbilityRide, AbilityRule> = {
  otter: {
    duration: 2.8,
    cooldown: 6,
    acceleration: 8,
    speedBonus: 8,
    launchSpeed: 1.5,
    dragFactor: 0.55,
    gravity: 18,
    fallLimit: 0,
    lift: 0,
  },
  yak: {
    duration: 2.8,
    cooldown: 6,
    acceleration: 9,
    speedBonus: 7,
    launchSpeed: 2,
    dragFactor: 1,
    gravity: 18,
    fallLimit: 0,
    lift: 0,
  },
  owl: {
    duration: 3.8,
    cooldown: 6,
    acceleration: 4.5,
    speedBonus: 6,
    launchSpeed: 1,
    dragFactor: 1,
    gravity: 2.8,
    fallLimit: -2,
    lift: 4.5,
  },
  bike: {
    duration: 2.8,
    cooldown: 6,
    acceleration: 12,
    speedBonus: 10,
    launchSpeed: 2.5,
    dragFactor: 1,
    gravity: 18,
    fallLimit: 0,
    lift: 0,
  },
  sail: {
    duration: 3.8,
    cooldown: 6,
    acceleration: 8.5,
    speedBonus: 9,
    launchSpeed: 2,
    dragFactor: 1,
    gravity: 3.2,
    fallLimit: -2.6,
    lift: 4,
  },
};
