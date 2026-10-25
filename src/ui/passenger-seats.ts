import type { Player } from "../core/types";
import {
  ANIMALS,
  hasPassenger,
  isVehicle,
  PASSENGER_EFFECTS,
} from "../systems/passengers";
import { RIDES } from "../data/config";

/** 不可点击的席位状态，空位与有效加成并列，不增加驾驶操作。 */
export function passengerSeats(p: Player) {
  if (!isVehicle(p.ride)) return "";
  return `<section class="passenger-seats" aria-label="动物乘客 ${p.passengers.length}/3">${ANIMALS.map(
    (animal) => {
      const occupied = hasPassenger(p, animal);
      return `<span class="passenger-seat${occupied ? " occupied" : ""}" data-animal="${animal}"><b>${RIDES[animal].name.split(" · ")[1]}</b><small>${occupied ? PASSENGER_EFFECTS[animal].name : "空位"}</small></span>`;
    },
  ).join("")}</section>`;
}
