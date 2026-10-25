import type * as THREE from "three";
import type { Ride } from "../core/types";

/** 只设定绝对姿态，不逐帧累加；同一模拟时间重复绘制或暂停不会漂移。 */
export function animateRide(
  g: THREE.Group,
  ride: Ride,
  time: number,
  active: boolean,
  moving = false,
  recovery = 0,
) {
  if (ride === "owl") {
    g.rotation.z = active ? 0.04 : 0;
    for (const s of [-1, 1]) {
      const wing = g.getObjectByName(`wing${s}`);
      if (wing)
        wing.rotation.x =
          s *
          (active
            ? -0.08 + Math.sin(time * 6) * 0.08
            : Math.sin(time * (moving ? 8 : 4)) * (moving ? 0.4 : 0.22));
      if (wing) {
        // 侧视镜头下向后掠翼，展开轮廓仍可见，避免完全沿z轴展开后被压成一条线。
        wing.rotation.y = active ? -s * 0.65 : 0;
        wing.position.y = active ? 0.15 : 0;
      }
    }
  }
  if (ride === "otter" || ride === "yak") {
    g.rotation.z =
      (active ? -0.055 : 0) + Math.sin(time * (active ? 15 : 9)) * 0.02;
    const head = g.getObjectByName("charge-head");
    if (head) head.rotation.z = active ? -0.24 : 0;
    for (let i = 0; i < (ride === "yak" ? 4 : 2); i++) {
      const leg = g.getObjectByName(`runLeg${i}`);
      const phase =
        ride === "yak" ? (i === 0 || i === 3 ? 0 : Math.PI) : i * Math.PI;
      if (leg)
        leg.rotation.z = moving
          ? Math.sin(time * (active ? 17 : 11) + phase) * (active ? 0.7 : 0.55)
          : 0;
    }
  }
  if (ride === "sail") {
    const sail = g.getObjectByName("ability-sail") as THREE.Mesh | undefined;
    if (sail) {
      const pressure = active ? 1 : recovery * 0.35;
      sail.rotation.y = active ? -0.17 + Math.sin(time * 9) * 0.07 : 0;
      if (sail.morphTargetInfluences)
        sail.morphTargetInfluences[0] =
          pressure * (0.85 + Math.sin(time * 10) * 0.15);
    }
  }
}
