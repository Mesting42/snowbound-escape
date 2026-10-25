import type { Entity, Player } from "../core/types";
import { ANIMALS, isVehicle } from "./passengers";
import type { Terrain } from "./terrain";

/**
 * 载具一次性相遇：空席对应的动物从前方视野外进入，随后使用正式逃跑模拟。
 * 为新载具提供一次前方相遇，动物随后按正式速度逃跑，必须追近才能接入。
 * 不重复放置附近同种动物，不直接送入席位；来源used保证只触发一次。
 */
export function vehicleCompanions(
  p: Player,
  terrain: Terrain,
  entities: Entity[],
  sourceId: string,
): Entity[] {
  if (!isVehicle(p.ride)) return [];
  return ANIMALS.flatMap((animal, i) => {
    const id = `${sourceId}:companion:${animal}`;
    if (
      p.passengers.includes(animal) ||
      entities.some(
        (e) =>
          e.id === id ||
          (!e.used &&
            e.kind === "ride" &&
            e.ride === animal &&
            e.route === "main" &&
            e.x > p.x &&
            e.x < p.x + 210),
      )
    )
      return [];
    const x = p.x + 105 + i * 25;
    return [
      {
        id,
        kind: "ride" as const,
        ride: animal,
        x,
        y: terrain.height(x),
        route: "main" as const,
        used: false,
      },
    ];
  });
}
