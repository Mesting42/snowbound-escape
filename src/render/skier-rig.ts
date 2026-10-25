import * as THREE from "three";
import type { ModelFactory } from "./model-factory";
import {
  COSTUME_SLOTS,
  createCostume,
  type Costume,
  type CostumeParts,
} from "./skier-appearance";
import { batchStaticModel } from "./static-model";

/** 原身高/肢段长度和朝向均固定；外观层只改变衣物，物理系统不读取这些节点。 */
export class SkierRig {
  root = new THREE.Group();
  hip = new THREE.Group();
  body = new THREE.Group();
  head = new THREE.Group();
  armL = new THREE.Group();
  armR = new THREE.Group();
  foreL = new THREE.Group();
  foreR = new THREE.Group();
  legL = new THREE.Group();
  legR = new THREE.Group();
  shinL = new THREE.Group();
  shinR = new THREE.Group();
  poles: THREE.Group[] = [];
  private costume?: Costume;
  constructor(private factory: ModelFactory) {
    this.root.name = "traveler-rig";
    this.root.add(this.hip);
    this.hip.position.y = 1;
    this.hip.add(this.body);
    this.body.position.y = 0.13;
    this.body.add(this.head, this.armL, this.armR);
    this.head.position.set(0.08, 0.83, 0);
    this.armL.position.set(0.03, 0.5, 0.32);
    this.armR.position.set(0.03, 0.5, -0.32);
    this.armL.add(this.foreL);
    this.armR.add(this.foreR);
    this.foreL.position.y = this.foreR.position.y = -0.44;
    this.hip.add(this.legL, this.legR);
    this.legL.position.z = 0.19;
    this.legR.position.z = -0.19;
    this.legL.add(this.shinL);
    this.legR.add(this.shinR);
    this.shinL.position.y = this.shinR.position.y = -0.47;
    for (const key of COSTUME_SLOTS) this[key].name = key;
    this.addAnatomy();
  }

  private addAnatomy() {
    const f = this.factory,
      p = f.part,
      face = new THREE.Group();
    face.name = "traveler-face";
    this.head.add(face);
    p(face, "#e8b38d", 0.015, -0.005, 0, 0.23, 0.25, 0.22);
    // 鼻、下颌、耳与暖色脸颊保持旅行者的圆润轮廓，不扩大头部比例。
    p(face, "#ebbb95", 0.2, -0.08, 0, 0.105, 0.07, 0.065);
    p(face, "#df9f7c", 0.21, -0.085, 0.046, 0.04, 0.028, 0.032);
    p(face, "#d69a7b", 0.17, -0.15, 0, 0.055, 0.012, 0.055);
    for (const sign of [-1, 1]) {
      p(face, "#dfa17e", -0.04, -0.025, sign * 0.215, 0.065, 0.085, 0.043);
      p(face, "#f0bc9c", 0.11, -0.09, sign * 0.175, 0.075, 0.045, 0.03);
      p(face, "#3e4246", -0.12, 0.03, sign * 0.15, 0.07, 0.11, 0.06);
    }
    // 护目镜带绕后脑，框、镜片和反光独立着色，避免细节靠整头换色。
    p(face, "#284751", -0.01, 0.045, 0, 0.238, 0.045, 0.229);
    p(face, "#e7d8b7", 0.19, 0.038, 0, 0.11, 0.108, 0.239);
    p(face, "#203d4b", 0.23, 0.04, 0, 0.075, 0.087, 0.222);
    p(face, "#66b8c9", 0.258, 0.049, 0, 0.052, 0.068, 0.198);
    p(face, "#c2edf0", 0.278, 0.078, 0.08, 0.025, 0.012, 0.065);
    p(face, "#377f9b", 0.282, 0.02, -0.08, 0.024, 0.017, 0.073);
    batchStaticModel(face);
    for (const [index, fore] of [this.foreL, this.foreR].entries()) {
      const hand = new THREE.Group();
      hand.name = "traveler-glove";
      fore.add(hand);
      p(hand, "#263e49", 0, -0.4, 0, 0.105, 0.115, 0.105);
      p(hand, "#45616a", 0.04, -0.38, index ? -0.08 : 0.08, 0.065, 0.07, 0.055);
      p(hand, "#d2c09a", 0.075, -0.39, 0.03, 0.018, 0.06, 0.085, "box");
      batchStaticModel(hand);
      const pole = new THREE.Group();
      pole.name = "traveler-pole";
      fore.add(pole);
      p(
        pole,
        "#486570",
        -0.03,
        -0.86,
        0,
        0.025,
        1.05,
        0.025,
        "box",
      ).rotation.z = -0.25;
      p(pole, "#293f48", -0.16, -1.35, 0, 0.11, 0.025, 0.11);
      batchStaticModel(pole);
      this.poles.push(pole);
    }
    for (const shin of [this.shinL, this.shinR]) {
      const boot = new THREE.Group();
      boot.name = "traveler-boot";
      shin.add(boot);
      p(boot, "#2d4652", 0.1, -0.44, 0, 0.25, 0.15, 0.14);
      p(boot, "#203842", 0.11, -0.54, 0, 0.25, 0.043, 0.145);
      p(boot, "#496771", 0.025, -0.32, 0, 0.12, 0.14, 0.12);
      for (const y of [-0.31, -0.41]) {
        p(boot, "#d7d9c6", 0.127, y, 0, 0.028, 0.025, 0.215, "box");
        p(boot, "#c39a66", 0.13, y, 0.118, 0.045, 0.04, 0.025, "box");
      }
      batchStaticModel(boot);
    }
  }

  /** 替换明确的服装挂点，不以当前材质颜色识别部件，反复换装不会漏换袖子。 */
  setOutfit(id: string) {
    if (id === this.costume?.id) return;
    const next = createCostume(id, this.factory);
    if (next.id === this.costume?.id) return;
    if (this.costume) {
      for (const key of COSTUME_SLOTS)
        this[key].remove(this.costume.parts[key]);
      this.body.remove(this.costume.scarf);
    }
    this.costume = next;
    for (const key of COSTUME_SLOTS) this[key].add(next.parts[key]);
    this.body.add(next.scarf);
  }

  /** 所有偏移使用绝对值写入；暂停/反复切换不会累积旋转和拉伸。 */
  animateClothing(time: number, speed: number, riding: boolean) {
    const scarf = this.costume?.scarf;
    if (scarf) {
      scarf.rotation.z = -0.12 + Math.sin(time * 13) * 0.1;
      scarf.scale.x = Math.min(1.25, 0.85 + speed / 160);
    }
    this.costume?.tails.forEach((tail, i) => {
      tail.rotation.z =
        0.06 + Math.sin(time * 7 + i) * Math.min(0.07, speed / 800);
    });
    for (const pole of this.poles) pole.visible = !riding;
  }

  get outfit() {
    return this.costume?.id ?? "";
  }
  get clothing(): Readonly<CostumeParts> | undefined {
    return this.costume?.parts;
  }
}
