import type { Entity, Ride } from "../core/types";

/** 破障能力由碰撞与美术共同读取，避免看起来可撞、实际却会摔倒。 */
export function canBreakObstacle(
  obstacle: Entity["obstacle"],
  ride: Ride,
  route: Entity["route"] = "main",
) {
  if (route === "upper" && obstacle === "bridge") return false;
  return (
    (ride === "yak" || ride === "bike") &&
    (obstacle === "log" || obstacle === "fence" || obstacle === "bridge")
  );
}
