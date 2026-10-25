import * as THREE from "three";
import type { Animal, Player, Ride } from "../core/types";
import { ANIMALS, isVehicle } from "../systems/passengers";
import type { part } from "./models";
import { batchStaticModel } from "./static-model";

type AnimalFactory = (ride: Ride) => THREE.Group;
const passengerTemplates = new WeakMap<
  AnimalFactory,
  Map<Animal, THREE.Group>
>();

/** 用纵深错排代替长队列；固定物种位置，上车顺序不影响轮廓和原有比例。 */
export const PASSENGER_SEATS: Record<
  Animal,
  readonly [number, number, number]
> = {
  otter: [-0.65, 0.33, 1.05],
  yak: [-1.7, 0.44, -0.55],
  owl: [-1.15, 1.95, 1],
};

/** 两种载具共用紧凑座舱，平台包在车体附近，拾取、图鉴与实际驾驶保持一致。 */
export function addPassengerSeats(parent: THREE.Group, draw: typeof part) {
  const deck = new THREE.Group();
  deck.name = "passenger-deck";
  parent.add(deck);
  draw(deck, "#a0784c", -1.05, 0.24, 0.05, 3.9, 0.16, 2.9, "box");
  for (const z of [-1.3, 1.4]) {
    draw(deck, "#5e7478", -0.95, 0.035, z, 4.1, 0.1, 0.12, "box");
    draw(deck, "#705a43", -1.65, 0.55, z, 2.4, 0.08, 0.08, "box");
    for (const x of [-2.75, -0.55])
      draw(deck, "#705a43", x, 0.43, z, 0.07, 0.24, 0.07, "box");
  }
  draw(deck, "#e8b77b", -0.65, 0.33, 1.05, 1.4, 0.04, 0.65, "box");
  // 雪鸮栖在前端横杆，使用收翼姿态，不叠加野外飞行的2.15m偏移。
  draw(deck, "#705a43", -1.15, 0.96, 1, 0.07, 1.32, 0.07, "box");
  draw(deck, "#bf9d6c", -1.15, 1.62, 1, 0.7, 0.08, 0.55, "box");
  return deck;
}

/** 仅创建三套可复用乘客骨骼；显示层不修改乘客列表、碰撞或奖励。 */
export class PassengerModels {
  root = new THREE.Group();
  models = new Map<Animal, THREE.Group>();
  constructor(makeAnimal: AnimalFactory) {
    this.root.name = "passengers";
    let templates = passengerTemplates.get(makeAnimal);
    if (!templates) {
      templates = new Map();
      passengerTemplates.set(makeAnimal, templates);
    }
    for (const animal of ANIMALS) {
      if (!templates.has(animal)) {
        const posed = makeAnimal(animal);
        posed.position.y = 0;
        // 乘坐姿态只设一次；合并后不再逐帧寻找静态鳍肢、腿和翅膀。
        for (let i = 0; i < (animal === "yak" ? 4 : 2); i++) {
          const limb = posed.getObjectByName(`runLeg${i}`);
          if (limb)
            limb.rotation.z = animal === "yak" ? (i % 2 ? -0.75 : 0.75) : -0.2;
        }
        if (animal === "owl")
          for (const sign of [-1, 1]) {
            const wing = posed.getObjectByName(`wing${sign}`);
            if (wing) {
              wing.rotation.x = -sign * 0.6;
              wing.scale.z = 0.55;
            }
          }
        templates.set(animal, batchStaticModel(posed));
      }
      const mount = new THREE.Group(),
        model = templates.get(animal)!.clone(true);
      mount.name = `passenger-${animal}`;
      mount.position.set(...PASSENGER_SEATS[animal]);
      model.position.y = 0;
      mount.add(model);
      mount.visible = false;
      this.root.add(mount);
      this.models.set(animal, model);
    }
  }
  update(p: Player, time: number) {
    this.root.visible = isVehicle(p.ride);
    for (const animal of ANIMALS) {
      const model = this.models.get(animal)!,
        mount = model.parent!;
      mount.visible = this.root.visible && p.passengers.includes(animal);
      if (!mount.visible) continue;
      // 乘客随车起伏，肢体收拢，不在座位上播放野外奔跑；模拟时间暂停即冻结。
      model.rotation.z = Math.sin(time * 5 + ANIMALS.indexOf(animal)) * 0.018;
    }
  }
}
