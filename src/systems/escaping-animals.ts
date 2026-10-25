import type { Entity, Animal } from "../core/types";
import { Terrain } from "./terrain";
import { sweepPlatformCeiling } from "./platform-contact";

export type { Animal } from "../core/types";
/** 逃跑速度独立于骑乘性能，低于正常双板巡航，玩家可自然追上。单位m/s。 */
export const ANIMAL_ESCAPE_SPEED: Record<Animal, number> = {
  otter: 20,
  yak: 18.5,
  owl: 21,
};
export function isEscapingAnimal(
  entity: Entity,
): entity is Entity & { ride: Animal } {
  return (
    entity.kind === "ride" &&
    (entity.ride === "otter" || entity.ride === "yak" || entity.ride === "owl")
  );
}

/** 真实位置随固定步推进；车辆、装饰、已接入动物不移动，不读取相机位置。 */
export function updateEscapingAnimals(
  entities: Entity[],
  terrain: Terrain,
  dt: number,
) {
  for (const e of entities) {
    if (e.used || !isEscapingAnimal(e)) continue;
    const m = (e.escape ??= {
      previousX: e.x,
      previousY: e.y,
      speed: ANIMAL_ESCAPE_SPEED[e.ride],
      vy: 0,
      grounded: true,
      age: 0,
    });
    m.previousX = e.x;
    m.previousY = e.y;
    m.age += dt;
    const oldSurface = terrain.surface(e.x, e.route);
    if (e.ride === "owl") {
      e.x += m.speed * dt;
      e.route = "main";
      // 模型自身已有2.15m飞行高度，此处只增加很小的翱翔起伏，不叠加整段高度。
      e.y = terrain.height(e.x) + Math.sin(m.age * 3 + e.x * 0.025) * 0.18;
      m.grounded = false;
      continue;
    }
    const obstacle =
      m.grounded &&
      entities.find(
        (o) =>
          !o.used &&
          o.kind === "obstacle" &&
          o.route === e.route &&
          o.obstacle !== "arch" &&
          o.x > e.x &&
          o.x - e.x < m.speed * 0.62,
      );
    if (obstacle) {
      m.grounded = false;
      m.vy =
        (obstacle.obstacle === "ice" || obstacle.obstacle === "fall"
          ? 11.5
          : 9) +
        oldSurface.slope * m.speed;
    }
    e.x += m.speed * dt;
    if (
      m.grounded &&
      e.route === "main" &&
      terrain.crossesBranchEntry(m.previousX, e.x)
    )
      e.route = "upper";
    if (m.grounded && e.route === "upper" && terrain.branchGap(e.x)) {
      m.grounded = false;
      m.vy = oldSurface.slope * m.speed;
    }
    if (m.grounded) {
      const surface = terrain.surface(e.x, e.route);
      e.y = surface.y;
      e.route = surface.route;
      m.vy = surface.slope * m.speed;
    } else {
      m.vy -= 18 * dt;
      e.y += m.vy * dt;
      const ceiling = sweepPlatformCeiling(
        terrain,
        { x: m.previousX, y: m.previousY },
        e,
        e.ride === "yak" ? 1.9 : 0.8,
      );
      if (ceiling) {
        e.y = ceiling.footY;
        m.vy = Math.min(0, ceiling.slope * m.speed);
      }
      const upper = terrain.branchHeight(e.x),
        oldUpper = terrain.branchHeight(m.previousX);
      let landing = terrain.surface(e.x);
      if (
        upper !== null &&
        m.previousY >= (oldUpper ?? upper) - 0.05 &&
        e.y <= upper &&
        m.vy <= 0
      )
        landing = terrain.surface(e.x, "upper");
      if (e.y <= landing.y && m.vy <= landing.slope * m.speed + 1) {
        e.y = landing.y;
        e.route = landing.route;
        m.grounded = true;
        m.vy = landing.slope * m.speed;
      }
    }
  }
}

/** 雪崩吞没或已跑出当前生成窗口的动物退出；绝不发放接入、雪晶或技巧奖励。 */
export function retireEscapingAnimals(
  entities: Entity[],
  avalancheX: number | null,
  playerX: number,
) {
  for (const e of entities) {
    if (e.used || !isEscapingAnimal(e)) continue;
    if ((avalancheX !== null && e.x <= avalancheX + 2) || e.x > playerX + 1200)
      e.used = true;
  }
}
