import type {
  Challenge,
  GameEvent,
  InputFrame,
  Mode,
  Phase,
  Player,
  Stats,
} from "./types";
import { ADVENTURE_LENGTH, CHALLENGES, REGION_LENGTH } from "../data/config";
import { Terrain, MODULE } from "../systems/terrain";
import { createPlayer, updatePhysics } from "../systems/physics";
import { createStats, metric } from "../systems/score";
import { Avalanche } from "../systems/avalanche";
import { hasAvalanche } from "../systems/avalanche-feedback";
import {
  updateEscapingAnimals,
  retireEscapingAnimals,
} from "../systems/escaping-animals";
import { interact } from "../systems/obstacles";
import { vehicleCompanions } from "../systems/vehicle-companions";
import { isVehicle } from "../systems/passengers";
import { Storage } from "../systems/storage";
import type { Entity } from "./types";

export class Game {
  phase: Phase = "menu";
  mode: Mode = "adventure";
  terrain = new Terrain(52);
  player = createPlayer(this.terrain);
  stats: Stats = createStats();
  avalanche = new Avalanche(0);
  entities: Entity[] = [];
  elapsed = 0;
  intro = 0;
  seed = 52;
  region = 0;
  challenge?: Challenge;
  runId = "";
  earned = 0;
  stars = 0;
  reason = "";
  resumePhase: Phase = "playing";
  tutorialStep = 0;
  private tutorialBase = createStats();
  private tutorialStartX = 0;
  private loaded = new Set<number>();
  private checkpointAt = 0;
  onEvent: (event: GameEvent) => void = () => {};
  onPhase: () => void = () => {};
  constructor(public storage: Storage) {
    this.fill();
  }
  get end() {
    return this.mode === "adventure"
      ? ADVENTURE_LENGTH
      : this.mode === "tutorial"
        ? Infinity
        : (this.challenge?.distance ?? Infinity);
  }
  get gap() {
    return this.player.x - this.avalanche.x;
  }
  get chaseEnabled() {
    return hasAvalanche(this.mode, this.tutorialStep);
  }
  get progress() {
    return this.challenge
      ? metric(this.stats, this.challenge.metric)
      : this.player.x;
  }
  get target() {
    return this.challenge?.target ?? this.end;
  }
  start(mode: Mode, id?: string, resume = false) {
    this.mode = mode;
    this.challenge =
      mode === "challenge" ? CHALLENGES.find((c) => c.id === id) : undefined;
    const cp = resume ? this.storage.data.checkpoint : null;
    this.seed =
      mode === "tutorial" ? 52 : (cp?.seed ?? Math.floor(Math.random() * 1e7));
    this.terrain = new Terrain(this.seed, mode === "tutorial");
    this.player = createPlayer(this.terrain, cp?.x ?? 0);
    this.stats = cp
      ? { ...createStats(), ...structuredClone(cp.stats) }
      : createStats();
    this.tutorialStep = 0;
    this.tutorialBase = createStats();
    this.tutorialStartX = 0;
    this.avalanche = new Avalanche(this.player.x, id === "c8");
    this.elapsed = 0;
    this.intro = cp ? 1.2 : 2.5;
    this.region = cp?.region ?? 0;
    this.checkpointAt = Math.floor(this.player.x / 1000) * 1000;
    this.loaded.clear();
    this.entities = [];
    this.fill();
    this.earned = 0;
    this.stars = 0;
    this.reason = "";
    if (cp)
      for (const entity of this.entities)
        if (entity.x <= cp.x + 1.6) entity.used = true;
    this.runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (this.challenge?.starter) {
      this.player.ride = this.challenge.starter;

      this.stats.rides++;
      this.storage.discover(this.player.ride);
    }
    this.phase = "intro";
    this.onPhase();
  }
  private fill() {
    const n = Math.floor(this.player.x / MODULE);
    for (let i = Math.max(0, n - 1); i <= n + 3; i++)
      if (!this.loaded.has(i)) {
        const generated = this.terrain.entities(i);
        this.entities.push(
          ...(this.mode === "tutorial"
            ? generated.filter(
                (e) => e.kind !== "ride" && e.kind !== "obstacle",
              )
            : this.challenge?.id === "c8"
              ? generated.filter((e) => e.kind !== "ride")
              : generated),
        );
        this.loaded.add(i);
      }
    this.entities = this.entities.filter((e) => e.x > this.player.x - 100);
    for (const i of this.loaded) if (i < n - 2) this.loaded.delete(i);
  }
  pause() {
    if (this.phase === "playing" || this.phase === "intro") {
      this.resumePhase = this.phase;
      this.phase = "paused";
      this.onPhase();
    }
  }
  resume() {
    if (this.phase === "paused") {
      this.phase = this.resumePhase;
      this.onPhase();
    }
  }
  menu() {
    this.phase = "menu";
    this.onPhase();
  }
  update(dt: number, input: InputFrame) {
    if (this.phase === "intro") {
      this.intro -= dt;
      if (this.intro <= 0) {
        this.phase = "playing";
        this.onPhase();
      }
      return;
    }
    if (this.phase !== "playing") return;
    this.elapsed += dt;
    const oldX = this.player.x,
      oldY = this.player.y;
    updateEscapingAnimals(this.entities, this.terrain, dt);
    const events = updatePhysics(
      this.player,
      this.terrain,
      this.stats,
      input,
      dt,
      this.storage.data.assist,
    );
    if (this.chaseEnabled && this.mode !== "tutorial")
      this.avalanche.update(dt, this.elapsed, this.player.x);
    // 先退出已被雪浪追上的动物，再判定接入，不能在同一帧从雪崩里捞出伙伴。
    retireEscapingAnimals(
      this.entities,
      this.chaseEnabled ? this.avalanche.x : null,
      this.player.x,
    );
    events.push(
      ...interact(this.entities, this.player, oldX, this.stats, oldY),
    );
    for (const event of events) {
      if (
        event.type === "ride" &&
        event.ride &&
        isVehicle(event.ride) &&
        event.sourceId
      )
        this.entities.push(
          ...vehicleCompanions(
            this.player,
            this.terrain,
            this.entities,
            event.sourceId,
          ),
        );
      if (event.type === "ride" || event.type === "passenger")
        this.storage.discover(event.ride ?? this.player.ride);
      this.onEvent(event);
    }
    if (this.chaseEnabled && this.mode !== "tutorial") {
      if (this.gap < 100 && this.player.vx > 24) this.stats.dangerTime += dt;
      if (this.gap <= 2) {
        this.finish(false, "雪浪追上了你");
        return;
      }
    }
    if (this.mode === "tutorial") {
      this.updateTutorial(dt);
      if (this.phase !== "playing") return;
    }
    const zone = Math.floor(this.player.x / REGION_LENGTH);
    // 冒险终点恰为第三段边界，不能在胜利当帧循环回晨光松林。
    const nextRegion = this.mode === "endless" ? zone % 3 : Math.min(2, zone);
    if (nextRegion !== this.region) {
      this.region = nextRegion;
      this.onEvent({ type: "region" });
    }
    if (
      this.mode === "adventure" &&
      this.player.x - this.checkpointAt >= 1000 &&
      this.player.x % MODULE > 5 &&
      this.player.x % MODULE < 24 &&
      this.player.grounded &&
      this.player.fall === 0 &&
      this.player.route === "main"
    ) {
      this.checkpointAt = this.player.x;
      // 从安全路段重建普通滑雪状态，旧输入、腾空角、伙伴能力都不写入恢复状态。
      this.storage.data.checkpoint = {
        x: this.player.x,
        seed: this.seed,
        stats: structuredClone(this.stats),
        region: this.region,
      };
      this.storage.save();
      this.onEvent({ type: "notice", text: "已记录安全出发点" });
    }
    if (
      this.challenge?.maxCrashes !== undefined &&
      this.stats.crashes > this.challenge.maxCrashes
    ) {
      this.finish(false, "碰撞次数超过挑战限制");
      return;
    }
    if (this.player.x >= this.end) {
      const success = !this.challenge || this.progress >= this.challenge.target;
      this.finish(
        success,
        success ? "山脚见，我们做到了" : "到达终点，目标尚未完成",
      );
      return;
    }
    this.fill();
  }
  /** 教学由实际达成驱动，未完成只重练本段，绝不靠滑到固定里程自动过关。 */
  private updateTutorial(dt: number) {
    const s = this.stats,
      b = this.tutorialBase;
    const passed = [
      s.jumps > b.jumps,
      s.flips > b.flips,
      s.perfect > b.perfect,
      this.player.x - this.tutorialStartX > 140 && this.player.vx > 20,
      s.abilities > b.abilities,
      s.branches > b.branches,
    ][this.tutorialStep];
    if (passed) {
      this.tutorialStep++;
      this.tutorialBase = structuredClone(s);
      this.tutorialStartX = this.player.x;
      if (this.tutorialStep >= 6) {
        this.finish(true, "六项雪道练习已完成");
        return;
      }
      if (this.tutorialStep === 3)
        this.avalanche = new Avalanche(this.player.x);
      if (this.tutorialStep === 4 || this.tutorialStep === 5) {
        this.player.ride = "owl";

        this.player.cooldown = 0;
        this.player.ability = 0;
        this.player.boost = 0;
        this.storage.discover("owl");
        this.onEvent({ type: "ride", text: "云翎来陪你练习 · 能力键可以展翼" });
      }
      this.onEvent({
        type: "notice",
        text: `练习 ${this.tutorialStep + 1} / 6 · 上一步已完成`,
      });
    }
    if (this.tutorialStep === 3)
      this.avalanche.update(dt, this.elapsed, this.player.x);
    if (
      this.player.x - this.tutorialStartX > 650 ||
      (this.tutorialStep === 3 && this.gap < 5)
    ) {
      const x = Math.floor(this.tutorialStartX / MODULE) * MODULE + 8;
      this.player = createPlayer(this.terrain, x);
      this.tutorialStartX = x;
      this.avalanche = new Avalanche(x);
      this.loaded.clear();
      this.entities = [];
      this.fill();
      if (this.tutorialStep >= 4) {
        this.player.ride = "owl";
      }
      this.onEvent({
        type: "notice",
        text: "回到本段安全起点 · 已完成的练习会保留",
      });
      this.onPhase();
    }
  }
  finish(won: boolean, reason: string) {
    if (this.phase === "won" || this.phase === "lost") return;
    this.phase = won ? "won" : "lost";
    this.reason = reason;
    if (won && this.challenge) {
      if (this.challenge.maxCrashes !== undefined)
        this.stars =
          this.stats.crashes === 0 ? 3 : this.stats.crashes <= 1 ? 2 : 1;
      else {
        const value =
          this.challenge.id === "c1" ? this.stats.score : this.progress;
        this.stars = this.challenge.thresholds.filter((t) => value >= t).length;
      }
    }
    if (this.mode === "tutorial") {
      this.storage.data.tutorial = won;
      this.storage.save();
    } else
      this.earned = this.storage.settle(
        this.runId,
        this.stats,
        won,
        this.mode,
        this.challenge?.id,
        this.stars,
      );
    this.onEvent({ type: won ? "win" : "lose" });
    this.onPhase();
  }
}
