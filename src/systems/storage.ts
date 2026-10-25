import type { SaveData, Stats, Ride } from "../core/types";
import { MISSIONS } from "../data/config";

const KEY = "snowbound.escape.save.v1";
export function freshSave(): SaveData {
  return {
    version: 1,
    wallet: 0,
    records: { adventure: 0, endless: 0, score: 0 },
    stars: {},
    claimed: [],
    totals: {},
    outfits: ["sunrise"],
    skis: ["wood"],
    outfit: "sunrise",
    ski: "wood",
    discovered: ["ski"],
    settings: {
      music: 0.3,
      sound: 0.65,
      shake: true,
      particles: true,
      flash: false,
      quality: "auto",
    },
    tutorial: false,
    checkpoint: null,
    settled: [],
    assist: false,
  };
}
export class Storage {
  data = freshSave();
  warning = "";
  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          parsed.version !== 1 ||
          typeof parsed.wallet !== "number" ||
          !["claimed", "outfits", "skis", "discovered", "settled"].every((k) =>
            Array.isArray(parsed[k]),
          ) ||
          !["totals", "records", "stars", "settings"].every(
            (k) =>
              parsed[k] &&
              typeof parsed[k] === "object" &&
              !Array.isArray(parsed[k]),
          )
        )
          throw new Error("存档格式不兼容");
        this.data = {
          ...freshSave(),
          ...parsed,
          settings: { ...freshSave().settings, ...parsed.settings },
        };
        if (!Number.isFinite(this.data.wallet) || this.data.wallet < 0)
          throw new Error("奖励数据损坏");
        if (
          this.data.checkpoint &&
          (!Number.isFinite(this.data.checkpoint.x) ||
            !this.data.checkpoint.stats?.rideDistance)
        )
          this.data.checkpoint = null;
      }
    } catch {
      this.warning = "本地存档无法读取，已安全开启新旅程。";
      this.data = freshSave();
    }
  }
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      this.warning = "浏览器未允许本地保存，本次旅程仍可正常游玩。";
    }
  }
  discover(ride: Ride) {
    if (!this.data.discovered.includes(ride)) {
      this.data.discovered.push(ride);
      this.save();
    }
  }
  /** 结算事务用唯一 runId 去重；中途检查点只保存，不提前发放奖励。 */
  settle(
    runId: string,
    stats: Stats,
    won: boolean,
    mode: string,
    challengeId?: string,
    stars = 0,
  ): number {
    if (this.data.settled.includes(runId)) return 0;
    this.data.settled.push(runId);
    this.data.settled = this.data.settled.slice(-80);
    const totals = this.data.totals;
    for (const key of [
      "distance",
      "flips",
      "perfect",
      "coins",
      "rides",
      "branches",
      "vehicleCoins",
    ] as const)
      totals[key] = (totals[key] ?? 0) + stats[key];
    totals.otter = (totals.otter ?? 0) + stats.rideDistance.otter;
    totals.bestCombo = Math.max(totals.bestCombo ?? 0, stats.bestCombo);
    if (won && mode === "adventure") totals.wins = (totals.wins ?? 0) + 1;
    const earned =
      stats.coins +
      Math.floor(stats.distance / 150) +
      (won ? (mode === "adventure" ? 150 : 25) : 0);
    this.data.wallet += earned;
    this.data.records.score = Math.max(
      this.data.records.score,
      Math.round(stats.score),
    );
    if (mode === "endless")
      this.data.records.endless = Math.max(
        this.data.records.endless,
        Math.floor(stats.distance),
      );
    if (mode === "adventure") {
      this.data.records.adventure = Math.max(
        this.data.records.adventure,
        Math.floor(stats.distance),
      );
      this.data.checkpoint = null;
    }
    if (challengeId)
      this.data.stars[challengeId] = Math.max(
        this.data.stars[challengeId] ?? 0,
        stars,
      );
    this.save();
    return earned;
  }
  claim(id: string): boolean {
    const mission = MISSIONS.find((m) => m.id === id);
    if (
      !mission ||
      this.data.claimed.includes(id) ||
      (this.data.totals[mission.metric] ?? 0) < mission.target
    )
      return false;
    this.data.wallet += mission.reward;
    this.data.claimed.push(id);
    this.save();
    return true;
  }
}
