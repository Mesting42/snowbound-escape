import type { GameEvent, InputFrame, Player, Stats } from "../core/types";
import { RIDES } from "../data/config";
import { clamp } from "../core/math";
import { Terrain } from "./terrain";
import { gradeLanding, rotateInAir } from "./rotation";
import { settleLanding } from "./score";
import { RIDER_CLEARANCE, sweepPlatformCeiling } from "./platform-contact";
import { hasPassenger, leaveRide, PASSENGER_EFFECTS } from "./passengers";
import { ABILITIES } from "../data/abilities";
import { activeAbility, rideSpeedLimit } from "./abilities";
import {
  updateSailDescent,
  sailDescentActive,
  sailDescentGravity,
  limitSailDescent,
} from "./sail-landing";

export function createPlayer(terrain: Terrain, x = 0): Player {
  return {
    x,
    y: terrain.height(x),
    vx: 16,
    vy: 0,
    angle: Math.atan(terrain.slope(x)),
    omega: 0,
    grounded: true,
    route: "main",
    airTime: 0,
    airRotation: 0,
    fall: 0,
    protection: 2,
    ride: "ski",
    passengers: [],
    ability: 0,
    sailDescent: 0,
    cooldown: 0,
    boost: 0,
    pose: 0,
    lastLanding: "",
    landingAge: 5,
  };
}
export function crash(p: Player, stats: Stats, events: GameEvent[]) {
  if (p.protection > 0 || p.fall > 0) return;
  stats.crashes++;
  stats.combo = 0;
  stats.perfectStreak = 0;
  p.vx = Math.max(6, p.vx * 0.42);
  p.fall = 1.7;
  p.airRotation = 0;
  p.omega = 0;
  leaveRide(p);
  events.push({ type: "crash", text: "摔倒了 · 按一次跳跃帮助起身" });
}
export function updatePhysics(
  p: Player,
  terrain: Terrain,
  stats: Stats,
  input: InputFrame,
  dt: number,
  assist: boolean,
): GameEvent[] {
  const events: GameEvent[] = [];
  const previousAbility = p.ability;
  p.protection = Math.max(0, p.protection - dt);
  p.cooldown = Math.max(0, p.cooldown - dt);
  p.ability = Math.max(0, p.ability - dt);
  updateSailDescent(p, previousAbility, dt);
  p.boost = Math.max(0, p.boost - dt);
  p.landingAge += dt;
  const oldX = p.x,
    oldY = p.y;
  if (p.fall > 0) {
    p.fall -= dt;
    if (input.jump) p.fall = Math.min(p.fall, 0.25);
    if (p.fall <= 0) {
      p.fall = 0;
      p.protection = 2.3;
      p.vx = Math.max(13, p.vx);
      events.push({ type: "recover", text: "重新出发" });
    }
  }
  // 同行持续到碰撞或换乘；只递减上方的主动技能、冷却和加速时间。
  if (input.ability && p.ride !== "ski" && p.cooldown === 0 && p.fall === 0) {
    const rule = ABILITIES[p.ride];
    p.ability = rule.duration;
    p.sailDescent = 0;
    p.cooldown = rule.cooldown;
    stats.abilities = (stats.abilities ?? 0) + 1;
    p.vx = Math.min(p.vx + rule.launchSpeed, rideSpeedLimit(p));
    if (rule.lift > 0 && !p.grounded) p.vy = Math.max(rule.lift, p.vy);
    events.push({ type: "ability", ride: p.ride, text: RIDES[p.ride].ability });
  }
  const surface = terrain.surface(p.x, p.route);
  const ride = RIDES[p.ride];
  const ability = activeAbility(p);
  if (input.jump && p.grounded && p.fall <= 0) {
    p.grounded = false;
    p.vy = ride.jump + clamp(surface.slope * p.vx, -2.5, 1.5);
    p.angle = Math.atan(surface.slope);
    p.omega = 0;
    p.airRotation = 0;
    p.airTime = 0;
    p.y += 0.04;
    stats.jumps++;
    events.push({ type: "jump" });
  }
  const acceleration =
    p.fall > 0
      ? 1.5
      : p.grounded
        ? 2.3 -
          surface.slope * 17 -
          p.vx *
            0.065 *
            (hasPassenger(p, "otter")
              ? PASSENGER_EFFECTS.otter.dragFactor
              : 1) *
            (ability?.dragFactor ?? 1)
        : 0.45;
  const cap = rideSpeedLimit(p);
  // 技能结束后逐渐回落到巡航，避免直接砍掉速度造成视觉顿挫。
  p.vx =
    p.vx > cap
      ? Math.max(cap, p.vx - 12 * dt)
      : clamp(
          p.vx +
            (acceleration + (ability?.acceleration ?? (p.boost > 0 ? 4 : 0))) *
              dt,
          5,
          cap,
        );
  p.x += p.vx * dt;
  // 与主雪道等高、切线连续的连接入口可直接滑上；中段和台底没有此接入权限。
  if (p.grounded && p.route === "main" && terrain.crossesBranchEntry(oldX, p.x))
    p.route = "upper";
  if (p.grounded && p.route === "upper" && terrain.branchGap(p.x)) {
    p.grounded = false;
    p.airTime = 0;
    p.airRotation = 0;
    p.omega = 0;
    // 保留桥边的切线速度，真正落向下层或跳过缺口；不能直接吸到下层地面。
    p.vy = surface.slope * p.vx;
  }
  if (p.grounded) {
    const next = terrain.surface(p.x, p.route);
    p.y = next.y;
    p.vy = next.slope * p.vx;
    p.angle += (Math.atan(next.slope) - p.angle) * Math.min(1, dt * 25);
    // 高速越过弧形跳台时，按切线惯性离地。
    if (
      surface.slope > 0.08 &&
      next.slope < surface.slope - 0.016 &&
      p.vx > 24 &&
      p.fall === 0
    ) {
      p.grounded = false;
      p.vy = Math.max(5, surface.slope * p.vx);
      p.airTime = 0;
      p.airRotation = 0;
      p.omega = 0;
    }
    if (p.route === "upper" && next.route === "main") {
      stats.branches++;
      stats.score += 300;
      p.route = "main";
      events.push({ type: "notice", text: "高台路线完成 +300" });
    }
  } else {
    p.airTime += dt;
    const gliding = !!ability && ability.lift > 0;
    // 雪鸮仅减缓下降，不提高起跳高度；与主动张帆组合时也只乘一次系数。
    const descent =
      p.vy < 0 && hasPassenger(p, "owl")
        ? PASSENGER_EFFECTS.owl.descentGravityFactor
        : 1;
    const recovering = sailDescentActive(p);
    const gravity = gliding
      ? ability!.gravity
      : recovering
        ? sailDescentGravity(p)
        : 18;
    p.vy -= gravity * descent * dt;
    if (gliding) p.vy = Math.max(ability!.fallLimit, p.vy);
    if (recovering) {
      const upperAhead = terrain.branchHeight(p.x);
      // 从台面上方靠近则对齐上层接触坡面；台下沿主路，绝不吸到高台。
      const approaching =
        upperAhead !== null && oldY >= upperAhead
          ? terrain.surface(p.x, "upper")
          : terrain.surface(p.x);
      limitSailDescent(p, approaching);
    }
    p.y += p.vy * dt;
    rotateInAir(p, input.held && p.fall === 0, terrain.slope(p.x), dt, assist);
    const ceiling = sweepPlatformCeiling(
      terrain,
      { x: oldX, y: oldY },
      p,
      RIDER_CLEARANCE[p.ride],
    );
    if (ceiling) {
      p.y = ceiling.footY;
      p.vy = Math.min(0, ceiling.slope * p.vx - 0.2);
      // 头部碰撞仅中止上升与旋转；不调用crash，不追加摔倒或碰撞奖励。
      p.omega = 0;
      p.airRotation = 0;
      p.angle = Math.atan(terrain.slope(p.x));
    }
    // 每个 1/120 秒扫过新旧位置；只能从上方落入上层平台，避免穿墙吸附。
    const upper = terrain.branchHeight(p.x),
      oldUpper = terrain.branchHeight(oldX);
    let landing = terrain.surface(p.x);
    if (
      upper !== null &&
      oldY >= (oldUpper ?? upper) - 0.05 &&
      p.y <= upper &&
      p.vy <= 0
    )
      landing = terrain.surface(p.x, "upper");
    if (
      p.y <= landing.y &&
      oldY >= terrain.surface(oldX, landing.route).y - 0.2 &&
      p.vy <= landing.slope * p.vx + 1
    ) {
      const impact = Math.abs(p.vy - landing.slope * p.vx);
      const grade =
        p.fall > 0 ? "crash" : gradeLanding(p, landing.slope, impact);
      const reward = settleLanding(p, stats, grade);
      p.y = landing.y;
      p.grounded = true;
      p.sailDescent = 0;
      p.route = landing.route;
      p.airTime = 0;
      p.lastLanding = grade;
      p.landingAge = 0;
      if (grade === "crash") crash(p, stats, events);
      else {
        if (grade === "stumble") p.vx *= 0.8;
        if (grade === "perfect") {
          p.boost = 1.1;
          p.vx = Math.min(p.vx + 1.3, Math.max(cap, ride.cruise + 3));
        }
        const name =
          { perfect: "精准落地", normal: "平稳落地", stumble: "踉跄落地" }[
            grade
          ] ?? "";
        events.push({
          type: "land",
          text: `${reward.flips ? `${reward.flips} 圈后空翻 · ` : ""}${name}${reward.points ? ` +${reward.points}` : ""}`,
          value: grade === "perfect" ? 1 : 0,
        });
      }
      p.angle = Math.atan(landing.slope);
      p.omega = 0;
      p.airRotation = 0;
    }
    // 极端边界的保底接触只用于恢复，仍然承担摔倒代价。
    if (p.y < terrain.height(p.x) - 3) {
      crash(p, stats, events);
      p.sailDescent = 0;
      p.y = terrain.height(p.x);
      p.grounded = true;
      p.route = "main";
    }
  }
  const dx = p.x - oldX;
  stats.distance = p.x;
  stats.score += dx * 0.25;
  stats.rideDistance[p.ride] += dx;
  stats.comboTime = Math.max(0, stats.comboTime - dt);
  if (!stats.comboTime) stats.combo = 0;
  if (p.vx > 24) stats.speedTime += dt;
  return events;
}
