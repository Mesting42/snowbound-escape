import type { Animal, Player, Ride } from "../core/types";

/** 被动参数独立于主动技能，单种只生效一次，乘客不受同行时限约束。 */
export const PASSENGER_EFFECTS = {
  otter: { name: "减阻", dragFactor: 0.8 },
  yak: { name: "护航", shieldHits: 1 },
  owl: { name: "缓降", descentGravityFactor: 0.75 },
} as const;
export const ANIMALS: readonly Animal[] = ["otter", "yak", "owl"];
export const MAX_PASSENGERS = 3;
export function isAnimal(ride: Ride | undefined): ride is Animal {
  return ride === "otter" || ride === "yak" || ride === "owl";
}
export function isVehicle(ride: Ride) {
  return ride === "bike" || ride === "sail";
}
export function hasPassenger(p: Player, animal: Animal) {
  return isVehicle(p.ride) && p.passengers.includes(animal);
}
export function boardPassenger(p: Player, animal: Animal) {
  if (
    !isVehicle(p.ride) ||
    p.fall > 0 ||
    p.passengers.length >= MAX_PASSENGERS ||
    p.passengers.includes(animal)
  )
    return false;
  p.passengers.push(animal);
  return true;
}

/** 所有普通换乘共用：原骑乘动物随行，车辆之间保留乘客，其余切换清空。 */
export function enterRide(p: Player, ride: Ride) {
  const carried = isVehicle(ride)
    ? isAnimal(p.ride)
      ? [p.ride]
      : isVehicle(p.ride)
        ? p.passengers
        : []
    : [];
  p.passengers = [...new Set(carried)] as Animal[];
  p.ride = ride;
  p.ability = p.cooldown = p.boost = p.sailDescent = 0;
  p.vx = Math.max(22, p.vx);
  p.protection = 1.2;
}

/** 碰撞、严重摔倒退出共用，不能残留乘客或载具增压。 */
export function leaveRide(p: Player) {
  p.ride = "ski";
  p.ability = p.cooldown = p.boost = p.sailDescent = 0;
  p.passengers = [];
}

/** 仅在一次本应损毁载具的障碍撞击中调用；离队即消耗这次保护。 */
export function consumeYakShield(p: Player) {
  if (!hasPassenger(p, "yak")) return false;
  p.passengers = p.passengers.filter((a) => a !== "yak");
  p.vx *= 0.9;
  p.protection = Math.max(p.protection, 1.2);
  return true;
}
