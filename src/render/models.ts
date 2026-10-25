import * as THREE from "three";
import { OUTFITS, SKIS } from "../data/config";
import { SkierRig } from "./skier-rig";
import type { ModelFactory } from "./model-factory";
import type { Player, Ride } from "../core/types";
import { addPassengerSeats, PassengerModels } from "./passenger-models";
import { batchStaticModel } from "./static-model";
import { animateRide } from "./ride-animation";
import { makeSailGeometry } from "./sail-geometry";
import { SAIL_DESCENT, sailDescentActive } from "../systems/sail-landing";
export { animateRide } from "./ride-animation";

const materials = new Map<string, THREE.MeshStandardMaterial>();
const textures = new Map<string, THREE.Texture>();
/** 本地原创纹理只加载一次，所有模型复用；不用远程素材接口。 */
export function texture(name: string) {
  if (!textures.has(name)) {
    const t = new THREE.TextureLoader().load(
      `${import.meta.env.BASE_URL}textures/${name}.png`,
    );
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    textures.set(name, t);
  }
  return textures.get(name)!;
}
const snowColors = new Set([
  "#f2f4df",
  "#e7ede0",
  "#e9eddf",
  "#e3eade",
  "#e7ebdd",
  "#f1f0de",
  "#d4edf0",
  "#e3eade",
  "#e9f1eb",
]);
const woodColors = new Set([
  "#705a43",
  "#795b48",
  "#997454",
  "#8c684c",
  "#977455",
  "#977757",
  "#bf9d6c",
  "#92775a",
  "#b19371",
  "#9e7b54",
  "#a0784c",
  "#bd8656",
]);
const stoneColors = new Set([
  "#718b8c",
  "#7d8d88",
  "#7d9ca4",
  "#6b9eae",
  "#83b9c9",
  "#a0ced7",
  "#4d6874",
]);
export function material(color: string, roughness = 0.8, metalness = 0) {
  const key = color + roughness + metalness;
  if (!materials.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    const kind = snowColors.has(color)
      ? "snow"
      : woodColors.has(color)
        ? "wood"
        : stoneColors.has(color)
          ? "stone"
          : null;
    if (kind) {
      m.map = texture(kind);
      m.bumpMap = m.map;
      m.bumpScale = kind === "snow" ? 0.035 : 0.045;
    }
    materials.set(key, m);
  }
  return materials.get(key)!;
}
const sphere = new THREE.SphereGeometry(1, 14, 10);
const box = new THREE.BoxGeometry(1, 1, 1);
const capsule = new THREE.CapsuleGeometry(0.5, 1, 4, 10);
let sharedSailGeometry: THREE.BufferGeometry | undefined;
export function part(
  parent: THREE.Object3D,
  color: string,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  shape: "sphere" | "box" | "capsule" = "sphere",
): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  const mesh = new THREE.Mesh(
    shape === "sphere" ? sphere : shape === "box" ? box : capsule,
    material(color),
  );
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
const skierFactory: ModelFactory = { part, material };
export class Skier {
  root = new THREE.Group();
  body: THREE.Group;
  head: THREE.Group;
  hip: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  foreL: THREE.Group;
  foreR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  shinL: THREE.Group;
  shinR: THREE.Group;
  rig: SkierRig;
  private factory: ModelFactory;
  skiL: THREE.Group;
  skiR: THREE.Group;
  rides = new Map<Ride, THREE.Group>();
  passengers: PassengerModels;
  outfit = "";
  ski = "";
  constructor(
    outfit = "sunrise",
    ski = "wood",
    factory: ModelFactory = skierFactory,
  ) {
    this.factory = factory;
    this.rig = new SkierRig(factory);
    // 现有动作继续驱动同一组关节；造型构建与骑乘/物理状态完全分离。
    this.root.add(this.rig.root);
    this.hip = this.rig.hip;
    this.body = this.rig.body;
    this.head = this.rig.head;
    this.armL = this.rig.armL;
    this.armR = this.rig.armR;
    this.foreL = this.rig.foreL;
    this.foreR = this.rig.foreR;
    this.legL = this.rig.legL;
    this.legR = this.rig.legR;
    this.shinL = this.rig.shinL;
    this.shinR = this.rig.shinR;
    this.skiL = this.makeSki();
    this.skiR = this.makeSki();
    this.root.add(this.skiL, this.skiR);
    this.skiL.position.z = 0.23;
    this.skiR.position.z = -0.23;
    for (const ride of ["otter", "yak", "owl", "bike", "sail"] as Ride[]) {
      const model = makeRide(ride, factory.part);
      this.root.add(model);
      model.visible = false;
      this.rides.set(ride, model);
    }
    this.passengers = new PassengerModels((ride) =>
      makeRide(ride, factory.part),
    );
    this.root.add(this.passengers.root);
    this.setStyle(outfit, ski);
  }
  makeSki() {
    const part = this.factory.part;
    const group = new THREE.Group();
    part(group, "#bd8656", 0, 0.045, 0, 2.55, 0.09, 0.16, "box");
    const tip = part(group, "#bd8656", 1.27, 0.1, 0, 0.24, 0.075, 0.08);
    tip.rotation.z = 0.3;
    part(group, "#f4e7c9", 0.3, 0.099, 0, 0.6, 0.015, 0.1, "box");
    part(group, "#354e55", -0.15, 0.105, 0, 0.28, 0.09, 0.15, "box");
    return group;
  }
  setStyle(outfit: string, ski: string) {
    const style = OUTFITS.find((o) => o.id === outfit) ?? OUTFITS[0];
    const gear = SKIS.find((s) => s.id === ski) ?? SKIS[0];
    if (this.outfit !== style.id) {
      this.rig.setOutfit(style.id);
      this.outfit = style.id;
    }
    if (this.ski !== gear.id) {
      // 板头和板身一起更新，固定器仍保留原来由脚部姿态驱动的索引。
      for (const board of [this.skiL, this.skiR])
        for (const index of [0, 1])
          (board.children[index] as THREE.Mesh).material =
            this.factory.material(gear.color);
      this.ski = gear.id;
    }
  }
  animate(p: Player, time: number, won = false) {
    this.passengers.update(p, time);
    const riding = p.ride !== "ski";
    for (const [ride, model] of this.rides) {
      model.visible = p.ride === ride;
      if (model.visible)
        animateRide(
          model,
          ride,
          time,
          p.ability > 0,
          p.vx > 1 && !won,
          sailDescentActive(p) ? p.sailDescent / SAIL_DESCENT.duration : 0,
        );
    }
    this.skiL.visible = this.skiR.visible = !riding || p.ride === "owl";
    const landingWindow = p.lastLanding === "stumble" ? 0.65 : 0.38;
    const landingBend =
      p.landingAge < landingWindow
        ? Math.sin((p.landingAge / landingWindow) * Math.PI) *
          (p.lastLanding === "stumble"
            ? 0.5
            : p.lastLanding === "perfect"
              ? 0.25
              : 0.33)
        : 0;
    const jumpStretch =
      !p.grounded && p.airTime < 0.16
        ? Math.sin((p.airTime / 0.16) * Math.PI) * 0.12
        : 0;
    const baseCrouch =
      p.fall > 0
        ? 0.5
        : p.grounded
          ? 0.22 + Math.min(0.18, p.vx / 150) + Math.sin(time * 7) * 0.025
          : 0.28;
    const crouch =
      baseCrouch +
      landingBend +
      (p.ability > 0 && (p.ride === "otter" || p.ride === "yak") ? 0.18 : 0);
    const seat =
      p.ride === "yak"
        ? 0.9
        : p.ride === "bike"
          ? 0.27
          : p.ride === "otter"
            ? 0.15
            : p.ride === "sail"
              ? 0.2
              : 0;
    this.hip.position.y = 1.06 - crouch * 0.5 + seat + jumpStretch;
    this.body.rotation.z =
      p.fall > 0 ? 1.25 : won ? -0.2 : -0.18 - (p.grounded ? p.vx / 180 : 0.1);
    this.head.rotation.z = -this.body.rotation.z * 0.5;
    if (p.lastLanding === "stumble" && p.landingAge < 0.65)
      this.body.rotation.z +=
        Math.sin(p.landingAge * 24) * 0.18 * (1 - p.landingAge / 0.65);
    this.legL.rotation.z = this.legR.rotation.z = -0.22 - crouch;
    this.shinL.rotation.z = this.shinR.rotation.z = crouch * 1.65;
    this.armL.rotation.z = this.armR.rotation.z = won
      ? 2.4
      : riding
        ? 0.85
        : p.grounded
          ? 0.15
          : p.omega > 3
            ? -0.85
            : 1.1;
    this.foreL.rotation.z = this.foreR.rotation.z = riding ? 0.3 : -0.55;
    if (riding) {
      const anchors: Record<
        Exclude<Ride, "ski">,
        [number, number, number, number]
      > = {
        otter: [0.38, 0.95, -0.85, 1.6],
        yak: [0.64, 1.82, -0.95, 1.9],
        owl: [0.12, 2.12, -0.1, 0.25],
        bike: [0.42, 1.22, -1.05, 1.85],
        sail: [0.5, 1.48, -0.55, 1.15],
      };
      const [hx, hy, thigh, knee] = anchors[p.ride as Exclude<Ride, "ski">];
      this.legL.rotation.z = this.legR.rotation.z = thigh;
      this.shinL.rotation.z = this.shinR.rotation.z = knee;
      this.root.updateMatrixWorld(true);
      for (const [arm, fore, z] of [
        [this.armL, this.foreL, 0.32],
        [this.armR, this.foreR, -0.32],
      ] as const) {
        const target = this.body.worldToLocal(
          this.root.localToWorld(new THREE.Vector3(hx, hy, z)),
        );
        const dx = target.x - arm.position.x,
          dy = target.y - arm.position.y;
        const distance = Math.min(0.815, Math.max(0.1, Math.hypot(dx, dy)));
        const elbow = Math.acos(
          THREE.MathUtils.clamp(
            (distance * distance - 0.44 ** 2 - 0.38 ** 2) / (2 * 0.44 * 0.38),
            -1,
            1,
          ),
        );
        arm.rotation.z =
          Math.atan2(dx, -dy) -
          Math.atan2(0.38 * Math.sin(elbow), 0.44 + 0.38 * Math.cos(elbow));
        fore.rotation.z = elbow;
      }
    }
    this.rig.animateClothing(time, p.vx, riding);
    this.body.position.y = 0.13 + jumpStretch * 0.25;
    if (!riding) {
      if (p.fall > 0) {
        this.legL.rotation.z = this.legR.rotation.z = -1.5;
        this.shinL.rotation.z = this.shinR.rotation.z = 2.4;
      }
      // 由腿段长度反算髋部高度，使下蹲、落地和摔倒时靴底始终接在固定器上。
      const thigh = this.legL.rotation.z,
        knee = this.shinL.rotation.z;
      this.hip.position.y =
        0.47 * Math.cos(thigh) + 0.44 * Math.cos(thigh + knee) + 0.18;
      const bindingX =
        0.47 * Math.sin(thigh) +
        0.44 * Math.sin(thigh + knee) +
        0.1 * Math.cos(thigh + knee);
      this.skiL.children[3].position.x = this.skiR.children[3].position.x =
        bindingX;
    }
    if (won) this.armL.rotation.z += Math.sin(time * 3) * 0.15;
  }
}

// 可注入不加载纹理的部件工厂，用同一正式几何做离线测试与投影检查。
const ridePart = part;
const vehicleTemplates = new Map<Ride, THREE.Group>();
export function makeRide(
  ride: Ride,
  part: typeof ridePart = ridePart,
): THREE.Group {
  const vehicle = ride === "bike" || ride === "sail";
  if (vehicle && part === ridePart && vehicleTemplates.has(ride))
    return vehicleTemplates.get(ride)!.clone(true);
  const g = new THREE.Group();
  if (ride === "otter") {
    part(g, "#a67d60", -0.2, 0.35, 0, 1.15, 0.35, 0.38);
    part(g, "#c5a083", 0.8, 0.53, 0, 0.42, 0.33, 0.35);
    part(g, "#e3cbb2", 1.03, 0.44, 0, 0.25, 0.16, 0.28);
    part(g, "#342f2b", 1.24, 0.48, 0, 0.07, 0.065, 0.08);
    part(g, "#946d53", -0.98, 0.2, 0, 0.8, 0.14, 0.19);
    for (const z of [-0.29, 0.29]) {
      part(g, "#44392e", 0.95, 0.64, z, 0.04, 0.05, 0.025);
      part(g, "#a87b5b", 0.65, 0.8, z, 0.105, 0.11, 0.06);
      // 鳍肢围绕身体侧面摆动，保持原模型尺寸和静止姿态。
      const flipper = new THREE.Group();
      flipper.name = `runLeg${z < 0 ? 0 : 1}`;
      flipper.position.set(0.25, 0.18, z * 1.6);
      g.add(flipper);
      part(flipper, "#8b674f", 0.11, -0.08, 0, 0.35, 0.09, 0.15);
    }
    part(g, "#e9f1eb", -0.2, 0.6, 0, 0.7, 0.09, 0.35);
  } else if (ride === "yak") {
    part(g, "#79695c", -0.05, 0.82, 0, 1.12, 0.72, 0.56);
    const head = new THREE.Group();
    head.name = "charge-head";
    head.position.set(0.8, 0.9, 0);
    g.add(head);
    part(head, "#ab9479", 0.1, 0.1, 0, 0.48, 0.5, 0.4);
    part(head, "#b3a18c", 0.44, -0.11, 0, 0.28, 0.21, 0.32);
    part(head, "#514c49", 0.1, 0.36, 0, 0.42, 0.19, 0.39);
    for (const z of [-0.42, 0.42]) {
      for (const x of [-0.6, 0.5]) {
        // 蹄与腿共用髋部枢轴，避免动画时蹄子留在原地。
        const leg = new THREE.Group();
        leg.name = `runLeg${(z < 0 ? 0 : 2) + (x < 0 ? 0 : 1)}`;
        leg.position.set(x, 0.55, z);
        g.add(leg);
        part(leg, "#67594f", 0, -0.25, 0, 0.15, 0.4, 0.14, "capsule");
        part(leg, "#3e403d", 0.03, -0.49, 0, 0.18, 0.12, 0.17);
      }
      const horn = part(
        head,
        "#e9d9b1",
        0,
        0.63,
        z,
        0.12,
        0.4,
        0.11,
        "capsule",
      );
      horn.rotation.x = z;
      part(head, "#1e282a", 0.32, 0.23, z * 0.85, 0.05, 0.055, 0.03);
    }
    part(g, "#e7ebdd", -0.2, 1.45, 0, 0.8, 0.13, 0.5);
  } else if (ride === "owl") {
    g.position.y = 2.15;
    part(g, "#eee9d9", 0, 0.15, 0, 0.5, 0.48, 0.32);
    part(g, "#f8f5e8", 0.31, 0.44, 0, 0.4, 0.32, 0.34);
    for (const z of [-0.19, 0.19]) {
      part(g, "#786a4a", 0.64, 0.49, z, 0.055, 0.085, 0.055);
      part(g, "#e0ad53", 0.69, 0.37, z * 0.1, 0.11, 0.06, 0.06);
    }
    for (const sign of [-1, 1]) {
      const wing = new THREE.Group();
      wing.name = `wing${sign}`;
      g.add(wing);
      for (let i = 0; i < 5; i++)
        part(
          wing,
          i % 2 ? "#cbd0c5" : "#eee9d9",
          -0.17 - i * 0.09,
          0.06,
          sign * (0.42 + i * 0.22),
          0.38 - i * 0.035,
          0.055,
          0.28,
        );
    }
  } else if (ride === "bike") {
    // 外侧排气口避开三席乘客与后座，喷火由独立技能表现层接续。
    part(
      g,
      "#35464b",
      -2.85,
      0.45,
      1.5,
      0.4,
      0.13,
      0.13,
      "capsule",
    ).rotation.z = Math.PI / 2;
    part(g, "#2e4249", -0.4, 0.24, 0, 1.8, 0.27, 0.65, "capsule");
    for (let i = 0; i < 7; i++)
      part(g, "#56666a", -0.98 + i * 0.2, 0.04, 0.4, 0.1, 0.11, 0.04, "box");
    part(g, "#dd6546", 0.14, 0.65, 0, 0.85, 0.35, 0.48);
    part(g, "#213941", -0.42, 0.8, 0, 0.63, 0.14, 0.37);
    part(g, "#f1d7ae", 0.83, 0.69, 0.25, 0.12, 0.13, 0.12);
    part(g, "#2d4b51", 0.4, 1, 0, 0.06, 0.55, 0.06, "box");
    part(g, "#485c61", 0.41, 1.22, 0, 0.08, 0.08, 0.8, "box");
    for (const z of [-0.49, 0.49])
      part(g, "#d6dfd9", 0.95, 0.08, z, 1.4, 0.09, 0.14, "box");
  } else if (ride === "sail") {
    part(g, "#a0784c", -0.1, 0.2, 0, 2, 0.16, 0.85, "box");
    for (const z of [-0.53, 0.53])
      part(g, "#5e7478", 0, 0.03, z, 2.7, 0.1, 0.14, "box");
    part(g, "#8c704d", 0.5, 1.6, 0, 0.06, 3.2, 0.06, "box");
    const sail = new THREE.Mesh(
      (sharedSailGeometry ??= makeSailGeometry()),
      Object.assign(material("#ebbd65", 0.9), { side: THREE.DoubleSide }),
    );
    sail.position.set(0.46, 0.5, 0.05);
    sail.name = "ability-sail";
    g.add(sail);
    part(g, "#d56e4b", -0.4, 1.2, 0.065, 1.4, 0.12, 0.02, "box");
  }
  if (vehicle) {
    addPassengerSeats(g, part);
    // 车体与后座分别合并，保留命名后座供几何检查；后续实例共享模板网格。
    const deck = g.getObjectByName("passenger-deck") as THREE.Group;
    const sail = g.getObjectByName("ability-sail");
    if (sail) g.remove(sail);
    g.remove(deck);
    batchStaticModel(g);
    batchStaticModel(deck);
    g.add(deck);
    if (sail) g.add(sail);
    if (part === ridePart) vehicleTemplates.set(ride, g.clone(true));
  }
  return g;
}

export function makePine(size = 1, snowy = true) {
  const g = new THREE.Group();
  part(g, "#705a43", 0, 1.3, 0, 0.25, 2.6, 0.25, "box");
  for (let i = 0; i < 4; i++) {
    const y = 1.4 + i * 0.78,
      radius = 1.65 - i * 0.32;
    const foliage = new THREE.Mesh(
      new THREE.ConeGeometry(radius, 2.2, 20),
      material(i % 2 ? "#31635f" : "#254e4b"),
    );
    // 受控不对称轮廓，不以完美同心圆锥代替自然树冠。
    const deform = (geo: THREE.BufferGeometry, amount: number) => {
      const a = geo.getAttribute("position");
      for (let k = 0; k < a.count; k++) {
        const x = a.getX(k),
          z = a.getZ(k),
          angle = Math.atan2(z, x);
        const f = 1 + Math.sin(angle * 3 + i * 1.7) * amount;
        a.setXYZ(
          k,
          x * f,
          a.getY(k) + Math.sin(angle * 2 + i) * amount * 0.35,
          z * f,
        );
      }
      geo.computeVertexNormals();
    };
    deform(foliage.geometry, 0.04);
    foliage.position.y = y + 0.8;
    g.add(foliage);
    foliage.castShadow = true;
    if (snowy) {
      const snow = new THREE.Mesh(
        new THREE.ConeGeometry(radius * 0.84, 1.65, 20),
        material("#e7ede0"),
      );
      snow.position.y = y + 1.1;
      deform(snow.geometry, 0.035);
      snow.position.x = Math.sin(i * 2) * 0.03;
      g.add(snow);
    }
  }
  g.scale.setScalar(size);
  return g;
}
export function makeCabin(refuge = false) {
  const g = new THREE.Group();
  const width = refuge ? 6 : 4;
  part(g, "#795b48", 0, 1.3, 0, width, 2.6, 3, "box");
  for (let i = 0; i < 7; i++)
    part(
      g,
      i % 2 ? "#997454" : "#8c684c",
      0,
      0.2 + i * 0.36,
      1.53,
      0.22,
      (width + 0.15) / 2,
      0.16,
      "capsule",
    ).rotation.z = Math.PI / 2;
  for (const side of [-1, 1]) {
    const roof = part(
      g,
      "#405b58",
      0,
      3.02,
      side * 0.88,
      width + 0.8,
      0.22,
      2.15,
      "box",
    );
    roof.rotation.x = side * 0.5;
    const snow = part(
      g,
      "#f1f0de",
      0,
      3.18,
      side * 0.88,
      width + 1,
      0.18,
      2.2,
      "box",
    );
    snow.rotation.x = side * 0.5;
    part(g, "#dcb371", side * (width * 0.3), 1.4, 1.54, 0.8, 0.8, 0.05, "box");
    part(g, "#7d5d40", side * width * 0.3, 1.4, 1.59, 0.06, 0.86, 0.03, "box");
  }
  part(g, "#3e5552", 0, 0.9, 1.56, 0.8, 1.8, 0.12, "box");
  part(g, "#e5bb78", 0.24, 0.9, 1.65, 0.06, 0.06, 0.06);
  part(g, "#9b8b7b", -1.1, 3.3, -0.3, 0.55, 1.8, 0.55, "box");
  if (refuge) {
    part(g, "#f0e6cf", 0, 2.2, 1.62, 2.6, 0.6, 0.08, "box");
    part(g, "#db704e", 0, 2.2, 1.69, 0.12, 0.38, 0.03, "box");
    part(g, "#db704e", 0, 2.2, 1.69, 0.4, 0.12, 0.03, "box");
  }
  return g;
}
