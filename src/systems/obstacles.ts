import type { Entity, GameEvent, Player, Stats } from "../core/types";
import { RIDES } from "../data/config";
import { crash } from "./physics";
import { canBreakObstacle } from "./obstacle-rules";
import { clamp, lerp } from "../core/math";
import {
  boardPassenger,
  consumeYakShield,
  enterRide,
  isAnimal,
  isVehicle,
  leaveRide,
  PASSENGER_EFFECTS,
} from "./passengers";

/** 扫掠路线 x，避免高速时跨过物体；used 在碰撞当帧写入，禁止重复撞击和刷分。 */
export function interact(
  entities: Entity[],
  p: Player,
  oldX: number,
  stats: Stats,
  oldY = p.y,
): GameEvent[] {
  const events: GameEvent[] = [];
  for (const entity of entities) {
    if (entity.used) continue;
    const moving = entity.kind === "ride" && entity.escape;
    const from = oldX - (moving ? moving.previousX : entity.x);
    const to = p.x - entity.x;
    if (Math.max(from, to) < -1.1 || Math.min(from, to) > 1.6) continue;
    // 使用双方相对运动扫掠，避免高速追上时因为动物也移动而跨过接入判定。
    const at =
      moving && Math.abs(to - from) > 1e-8
        ? clamp(-from / (to - from), 0, 1)
        : 1;
    const altitude = moving
      ? lerp(oldY, p.y, at) - lerp(moving.previousY, entity.y, at)
      : p.y - entity.y;
    if (entity.kind === "coin" && Math.abs(altitude + 0.8) < 1.8) {
      entity.used = true;
      stats.coins++;
      stats.score += 15;
      if (p.ride === "bike" || p.ride === "sail") stats.vehicleCoins++;
      events.push({ type: "coin" });
    } else if (
      entity.kind === "ride" &&
      Math.abs(altitude) < 3.2 &&
      p.fall === 0
    ) {
      const incoming = entity.ride;
      if (!incoming) continue;
      if (isVehicle(p.ride) && isAnimal(incoming)) {
        if (!boardPassenger(p, incoming)) continue;
        entity.used = true;
        // 乘客独立于驾驶状态：不改主动技能、冷却或保护时间。
        stats.rides++;
        stats.score += 100;
        events.push({
          type: "passenger",
          ride: incoming,
          text: `${RIDES[incoming].name}上车 · ${PASSENGER_EFFECTS[incoming].name}生效 · ${p.passengers.length}/3`,
        });
        continue;
      }
      // 取消旧的到期换乘门槛：不同动物/载具自然换乘，同种不消费、不重置技能。
      if (incoming === p.ride) continue;
      entity.used = true;
      enterRide(p, incoming);
      stats.rides++;
      stats.score += 100;
      events.push({
        type: "ride",
        ride: incoming,
        sourceId: entity.id,
        text: `${RIDES[p.ride].name} · E / 能力键${RIDES[p.ride].ability}`,
      });
    } else if (entity.kind === "obstacle") {
      // 上层断桥由地形缺口负责接触，实体只承担警示和断木美术，不能变成假墙。
      if (entity.route === "upper" && entity.obstacle === "bridge") {
        entity.used = true;
        continue;
      }
      const o = entity.obstacle;
      const height =
        o === "ice"
          ? 2.8
          : o === "rock"
            ? 1.25
            : o === "fall"
              ? 2.4
              : o === "fence"
                ? 1.25
                : 0.85;
      const hit =
        o === "arch"
          ? altitude > 0.65 && altitude < 3.5
          : altitude > -1.2 && altitude < height;
      if (!hit) continue;
      entity.used = true;
      if (canBreakObstacle(o, p.ride, entity.route)) {
        stats.score += 65;
        const powered = p.ability > 0 && p.fall === 0;
        p.vx *= powered && p.ride === "yak" ? 0.995 : 0.97;
        events.push({
          type: "break",
          ride: p.ride,
          powered,
          position: { x: entity.x, y: entity.y },
          text: powered && p.ride === "yak" ? "冲锋破木 +65" : "破障前进 +65",
        });
      } else if (p.ride !== "ski" && p.protection <= 0) {
        if (consumeYakShield(p)) {
          events.push({
            type: "notice",
            text: "岩角挡下一次撞击后离队 · 载具继续前进",
          });
          continue;
        }
        const vehicle = isVehicle(p.ride),
          carrying = p.passengers.length > 0;
        leaveRide(p);
        p.vx *= 0.78;
        p.protection = 2;
        events.push({
          type: "notice",
          text: vehicle
            ? `载具受损${carrying ? " · 乘客已离队" : ""} · 已回到双板`
            : "伙伴替你挡下撞击 · 已回到双板",
        });
      } else crash(p, stats, events);
    }
  }
  return events;
}
