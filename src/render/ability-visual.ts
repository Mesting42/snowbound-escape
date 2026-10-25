import * as THREE from "three";
import type { GameEvent, Phase, Player, Settings } from "../core/types";
import type { RenderPose } from "./sampling";
import { abilityIntensity, activeAbility } from "../systems/abilities";
import { random } from "../core/math";

const BURST_SLOTS = 4,
  CHIPS_PER_BURST = 12,
  BURST_LIFE = 0.65;
interface Burst {
  x: number;
  y: number;
  at: number;
  powered: boolean;
}

/** 短、低的积雪带，沿路线后方展开，避免覆盖前方障碍和骑手面部。 */
function snowRibbon() {
  const positions: number[] = [],
    indices: number[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12,
      x = -3.3 + t * 3.7;
    const y = Math.sin(t * Math.PI) * 0.5;
    positions.push(x, y, 0, x, y + Math.sin(t * Math.PI) * 0.18 + 0.025, 0);
    if (i < 12) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  return g;
}

/**
 * 无纹理/无DOM的真实技能表现。火焰、气流、雪带在低画质或关闭粒子时仍保留。
 * 额外雪粉与烟气使用固定48点；破木使用4组×12个实例，长局不增建网格。
 * 所有位置与寿命取模拟时间，暂停不推进；状态不回写物理或奖励。
 */
export class AbilityVisual {
  root = new THREE.Group();
  burstsRoot = new THREE.Group();
  private flame = new THREE.Group();
  private outer: THREE.Mesh;
  private inner: THREE.Mesh;
  private wind: THREE.Mesh;
  private snow = new THREE.Group();
  private dust: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private chips: THREE.InstancedMesh;
  private burstSnow: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private bursts: (Burst | null)[] = Array.from(
    { length: BURST_SLOTS },
    () => null,
  );
  private cursor = 0;
  private run = "";
  private ride = "ski";
  private dummy = new THREE.Object3D();
  private state = {
    active: false,
    flame: false,
    wind: false,
    snow: false,
    dust: 0,
    chips: 0,
  };
  constructor() {
    this.root.name = "ability-effects";
    this.burstsRoot.name = "wood-impact-effects";
    const cone = new THREE.ConeGeometry(1, 1, 8);
    this.outer = new THREE.Mesh(
      cone,
      new THREE.MeshBasicMaterial({ color: "#ff8839", toneMapped: false }),
    );
    this.inner = new THREE.Mesh(
      cone,
      new THREE.MeshBasicMaterial({ color: "#fff0ae", toneMapped: false }),
    );
    for (const f of [this.outer, this.inner]) {
      f.rotation.z = Math.PI / 2;
      this.flame.add(f);
    }
    this.flame.position.set(-3.05, 0.45, 1.5);
    this.root.add(this.flame);
    const lines: number[] = [],
      windIndices: number[] = [];
    for (const z of [-1.6, 1.6])
      for (let lane = 0; lane < 3; lane++)
        for (let j = 0; j < 7; j++) {
          const x = -0.5 - j * 0.38;
          const y = lane * 0.23 + Math.sin(j * 0.4) * 0.15;
          const start = lines.length / 3;
          lines.push(
            x,
            y,
            z,
            x - 0.25,
            y + 0.035,
            z,
            x,
            y + 0.045,
            z,
            x - 0.25,
            y + 0.08,
            z,
          );
          windIndices.push(
            start,
            start + 1,
            start + 2,
            start + 1,
            start + 3,
            start + 2,
          );
        }
    const windGeo = new THREE.BufferGeometry();
    windGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(lines, 3),
    );
    windGeo.setIndex(windIndices);
    this.wind = new THREE.Mesh(
      windGeo,
      new THREE.MeshBasicMaterial({
        color: "#83c4cf",
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.root.add(this.wind);
    const ribbon = snowRibbon();
    for (let i = 0; i < 3; i++) {
      const sheet = new THREE.Mesh(
        ribbon,
        new THREE.MeshBasicMaterial({
          color: i % 2 ? "#d1e9ed" : "#fff9e7",
          transparent: true,
          opacity: 0.7 - i * 0.12,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      sheet.position.set(-i * 0.25, 0.08, 1.45 + i * 0.12);
      this.snow.add(sheet);
    }
    this.root.add(this.snow);
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(48 * 3), 3),
    );
    this.dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({
        color: "#f3f6e8",
        size: 0.14,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      }),
    );
    this.root.add(this.dust);
    this.chips = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: "#b77b48" }),
      BURST_SLOTS * CHIPS_PER_BURST,
    );
    this.chips.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.chips.frustumCulled = false;
    this.burstsRoot.add(this.chips);
    const burstGeo = new THREE.BufferGeometry();
    burstGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array(BURST_SLOTS * CHIPS_PER_BURST * 3),
        3,
      ),
    );
    this.burstSnow = new THREE.Points(
      burstGeo,
      new THREE.PointsMaterial({
        color: "#fffae9",
        size: 0.18,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      }),
    );
    this.burstSnow.frustumCulled = false;
    this.burstsRoot.add(this.burstSnow);
    this.root.visible = this.burstsRoot.visible = false;
  }
  event(event: GameEvent, time: number) {
    if (event.type !== "break" || !event.position) return;
    this.bursts[this.cursor] = {
      ...event.position,
      at: time,
      powered: !!event.powered,
    };
    this.cursor = (this.cursor + 1) % BURST_SLOTS;
  }
  reset() {
    this.bursts.fill(null);
    this.cursor = 0;
    this.root.visible = this.burstsRoot.visible = false;
  }
  update(
    p: Player,
    time: number,
    pose: RenderPose,
    originX: number,
    originY: number,
    settings: Settings,
    phase: Phase,
    run: string,
    particleBudget = 180,
  ) {
    if (this.run !== run || this.ride !== p.ride) {
      this.reset();
      this.run = run;
      this.ride = p.ride;
    }
    const visible = phase === "playing" || phase === "paused";
    const active = visible && !!activeAbility(p);
    const strength = abilityIntensity(p);
    this.root.visible = active;
    this.root.position.set(pose.x - originX, pose.y - originY + 0.02, 0.35);
    this.root.rotation.z = pose.angle;
    this.flame.visible = active && p.ride === "bike";
    this.wind.visible = active && (p.ride === "owl" || p.ride === "sail");
    this.wind.position.y = p.ride === "owl" ? 2.3 : 1.1;
    this.wind.scale.x = 0.8 + strength * 0.3 + Math.sin(time * 8) * 0.04;
    this.snow.visible = active && p.grounded && p.ride !== "owl";
    this.snow.scale.y = (p.ride === "yak" ? 1.5 : 0.8) * strength;
    for (let i = 0; i < this.snow.children.length; i++)
      this.snow.children[i].position.x =
        -i * 0.25 + Math.sin(time * 14 + i) * 0.12;
    const flameLength = (1.35 + Math.sin(time * 37) * 0.22) * strength;
    this.outer.scale.set(0.18 * strength, flameLength, 0.18 * strength);
    this.outer.position.x = -flameLength / 2;
    this.inner.scale.set(
      0.095 * strength,
      flameLength * 0.65,
      0.095 * strength,
    );
    this.inner.position.set(-flameLength * 0.32, 0, 0.075);
    const count =
      active && settings.particles
        ? particleBudget < 180 || settings.quality === "low"
          ? 18
          : 48
        : 0;
    this.dust.visible = count > 0;
    const dust = this.dust.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    this.dust.material.color.set(p.ride === "bike" ? "#d3c7b5" : "#f6fae9");
    for (let i = 0; i < count; i++) {
      const age = (time * (1.1 + random(22, i)) + random(41, i)) % 1;
      const bike = p.ride === "bike";
      dust.setXYZ(
        i,
        (bike ? -3.2 : -0.5) - age * 2.4,
        (bike ? 0.5 : p.ride === "owl" ? 2.15 : 0.08) +
          Math.sin(age * Math.PI) * 0.7,
        1.55 + (random(51, i) - 0.5) * 0.8,
      );
    }
    dust.needsUpdate = true;
    this.dust.geometry.setDrawRange(0, count);
    let used = 0;
    const impactSnow = this.burstSnow.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    const perBurst = !settings.particles
      ? 4
      : particleBudget < 180 || settings.quality === "low"
        ? 6
        : CHIPS_PER_BURST;
    for (let slot = 0; slot < BURST_SLOTS; slot++) {
      const burst = this.bursts[slot];
      if (!burst) continue;
      const age = time - burst.at;
      if (age < 0 || age >= BURST_LIFE) {
        this.bursts[slot] = null;
        continue;
      }
      const fade = Math.min(1, (BURST_LIFE - age) / 0.18),
        power = burst.powered ? 1.2 : 1;
      for (let i = 0; i < perBurst; i++) {
        const id = slot * CHIPS_PER_BURST + i;
        const x = burst.x - originX + (random(67, id) - 0.35) * age * 6 * power;
        const y =
          burst.y -
          originY +
          0.5 +
          (1.8 + random(99, id) * 3) * age -
          5 * age * age;
        this.dummy.position.set(x, y, 1.3 + (random(81, id) - 0.5) * age * 3);
        this.dummy.rotation.set(age * (6 + i), age * 5, age * 9);
        this.dummy.scale.set(
          0.08 * fade,
          (0.2 + random(83, id) * 0.2) * fade,
          0.07 * fade,
        );
        this.dummy.updateMatrix();
        this.chips.setMatrixAt(used, this.dummy.matrix);
        impactSnow.setXYZ(used, x - age * 0.6, y - 0.2, 1.6);
        used++;
      }
    }
    this.chips.count = used;
    this.chips.instanceMatrix.needsUpdate = true;
    impactSnow.needsUpdate = true;
    this.burstSnow.geometry.setDrawRange(0, settings.particles ? used : 0);
    this.burstsRoot.visible = visible && used > 0;
    this.state = {
      active,
      flame: this.flame.visible,
      wind: this.wind.visible,
      snow: this.snow.visible,
      dust: count,
      chips: used,
    };
  }
  get diagnostics() {
    return {
      ...this.state,
      burstCapacity: BURST_SLOTS,
      chipCapacity: BURST_SLOTS * CHIPS_PER_BURST,
    };
  }
}
