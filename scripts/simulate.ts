import { Game } from "../src/core/game";
import { Storage } from "../src/systems/storage";
import { STEP, CHALLENGES } from "../src/data/config";
import type { InputFrame } from "../src/core/types";

// 测试适配器只替换浏览器存储环境，所有路线推进和胜负均由正式模拟执行。
const memory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => memory.set(k, v),
  },
});

export function pilot(g: Game): InputFrame {
  const p = g.player,
    next = g.entities
      .filter(
        (e) =>
          !e.used &&
          e.kind === "obstacle" &&
          e.x > p.x - 1 &&
          e.obstacle !== "arch",
      )
      .sort((a, b) => a.x - b.x)[0];
  const d = next ? next.x - p.x : Infinity;
  const branchEntry =
    Math.floor(p.x / 240) % 2 === 1 && p.x % 240 > 74 && p.x % 240 < 81;
  const tricks = ["c2", "c3", "c9"].includes(g.challenge?.id ?? "");
  const jump =
    p.fall > 0.3 ||
    (p.grounded &&
      ((d < p.vx * 0.55 && d > 1) ||
        branchEntry ||
        (tricks && p.landingAge > 0.3 && d > 40)));
  const flip =
    g.challenge?.id === "c3"
      ? false
      : g.challenge?.id === "c9"
        ? g.stats.flips < 2
        : tricks || g.mode === "adventure";
  return {
    jump,
    held: !p.grounded && p.airRotation < 4.8 && flip,
    ability: p.ride !== "ski" && p.cooldown === 0,
  };
}
const runs: unknown[] = [];
let randomState = 71829;
Math.random = () => {
  randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
  return randomState / 4294967296;
};
for (const id of ["adventure", ...CHALLENGES.map((c) => c.id), "endless"]) {
  const g = new Game(new Storage());
  g.start(
    id === "adventure"
      ? "adventure"
      : id === "endless"
        ? "endless"
        : "challenge",
    id,
  );
  const limit = id === "endless" ? 3600 : 1000;
  let maxEntities = g.entities.length;
  let passengerPickups = 0,
    maxPassengers = 0;
  const passengerSpecies = new Set<string>();
  g.onEvent = (event) => {
    if (event.type === "passenger") {
      passengerPickups++;
      if (event.ride) passengerSpecies.add(event.ride);
    }
  };
  for (
    let i = 0;
    i < limit / STEP && (g.phase === "intro" || g.phase === "playing");
    i++
  ) {
    g.update(STEP, pilot(g));
    maxEntities = Math.max(maxEntities, g.entities.length);
    maxPassengers = Math.max(maxPassengers, g.player.passengers.length);
  }
  runs.push({
    id,
    seed: g.seed,
    phase: g.phase,
    elapsed: +g.elapsed.toFixed(1),
    distance: Math.floor(g.player.x),
    flips: g.stats.flips,
    perfect: g.stats.perfect,
    crashes: g.stats.crashes,
    branches: g.stats.branches,
    vehicleCoins: g.stats.vehicleCoins,
    progress: g.progress,
    gap: Math.round(g.gap),
    score: Math.round(g.stats.score),
    stars: g.stars,
    entities: g.entities.length,
    maxEntities,
    rides: g.stats.rides,
    rideDistance: g.stats.rideDistance,
    passengerPickups,
    passengerSpecies: [...passengerSpecies],
    maxPassengers,
    ride: g.player.ride,
    altitude: g.player.y - g.terrain.height(g.player.x),
  });
}
console.log(JSON.stringify(runs, null, 2));
