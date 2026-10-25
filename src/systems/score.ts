import type { Player, Stats } from "../core/types";
export function createStats(): Stats {
  return {
    abilities: 0,
    distance: 0,
    score: 0,
    coins: 0,
    flips: 0,
    perfect: 0,
    perfectStreak: 0,
    bestStreak: 0,
    crashes: 0,
    combo: 0,
    bestCombo: 0,
    comboTime: 0,
    rides: 0,
    rideDistance: { ski: 0, otter: 0, yak: 0, owl: 0, bike: 0, sail: 0 },
    branches: 0,
    dangerTime: 0,
    speedTime: 0,
    vehicleCoins: 0,
    jumps: 0,
  };
}
/** 一次腾空只在落地调用一次；向下取整的连续角避免 2π 回绕重复奖励。 */
export function settleLanding(
  p: Player,
  stats: Stats,
  grade: string,
): { flips: number; points: number } {
  const flips = Math.floor((p.airRotation + 0.12) / (2 * Math.PI));
  if (grade === "crash") {
    stats.combo = 0;
    stats.perfectStreak = 0;
    return { flips: 0, points: 0 };
  }
  if (grade === "stumble") {
    stats.perfectStreak = 0;
    stats.combo = Math.max(0, stats.combo - 1);
  } else if (grade === "perfect") {
    stats.perfect++;
    stats.perfectStreak++;
    stats.bestStreak = Math.max(stats.bestStreak, stats.perfectStreak);
  } else stats.perfectStreak = 0;
  stats.flips += flips;
  if (flips || grade === "perfect") {
    stats.combo++;
    stats.comboTime = 7;
    stats.bestCombo = Math.max(stats.bestCombo, stats.combo);
  }
  const multiplier = Math.min(4, 1 + Math.floor(stats.combo / 3));
  const points = Math.round(
    (flips * 180 + (grade === "perfect" ? 85 : 20)) *
      multiplier *
      (grade === "stumble" ? 0.5 : 1),
  );
  stats.score += points;
  p.airRotation = 0;
  return { flips, points };
}
export function metric(stats: Stats, key: string): number {
  if (key === "otter") return stats.rideDistance.otter;
  if (key === "mixed")
    return stats.flips > 0 && stats.perfect > 0 && stats.rides > 0
      ? stats.score
      : 0;
  return Number((stats as unknown as Record<string, number>)[key] ?? 0);
}
