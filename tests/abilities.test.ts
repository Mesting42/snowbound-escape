import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ABILITIES, type AbilityRide } from "../src/data/abilities";
import { RIDES } from "../src/data/config";
import { createPlayer, updatePhysics } from "../src/systems/physics";
import {
  activeAbility,
  abilityIntensity,
  rideSpeedLimit,
} from "../src/systems/abilities";
import { abilitySound } from "../src/systems/ability-sound";
import { Terrain } from "../src/systems/terrain";
import { createStats } from "../src/systems/score";
import { enterRide, leaveRide } from "../src/systems/passengers";
import { interact } from "../src/systems/obstacles";
import { AbilityVisual } from "../src/render/ability-visual";
import { animateRide } from "../src/render/ride-animation";
import { makeSailGeometry } from "../src/render/sail-geometry";
import { freshSave, Storage } from "../src/systems/storage";
import { Game } from "../src/core/game";
import { UI } from "../src/ui/ui";
import type { Entity, GameEvent } from "../src/core/types";
import type { Audio } from "../src/systems/audio";
import type { Input } from "../src/systems/input";
import type { World } from "../src/render/world";
import { parseHTML } from "linkedom";

const rides = ["otter", "yak", "owl", "bike", "sail"] as const;
const idle = { jump: false, held: false, ability: false },
  step = 1 / 120;
const settings = freshSave().settings;
Object.defineProperty(globalThis, "localStorage", {
  value: { getItem: () => null, setItem: () => {} },
});
function flat() {
  const t = new Terrain(52);
  t.height = () => 0;
  t.slope = () => 0;
  t.branchHeight = () => null;
  t.crossesBranchEntry = () => false;
  return t;
}
function player(ride: AbilityRide) {
  const p = createPlayer(flat());
  enterRide(p, ride);
  p.vx = RIDES[ride].cruise;
  return p;
}

test("五种技能实际提速超过普通巡航，持续/冷却不变，超限速度在结束后平滑恢复", () => {
  for (const ride of rides) {
    const t = flat(),
      p = player(ride),
      baseline = structuredClone(p),
      s = createStats();
    updatePhysics(p, t, s, { ...idle, ability: true }, step, false);
    assert.equal(p.ability, ride === "owl" || ride === "sail" ? 3.8 : 2.8);
    assert.equal(p.cooldown, 6);
    assert.ok(p.vx > baseline.vx);
    for (let i = 0; i < 120; i++) {
      updatePhysics(p, t, s, idle, step, false);
      updatePhysics(baseline, t, createStats(), idle, step, false);
    }
    assert.ok(p.vx > baseline.vx + 3, `${ride}没有明显提速`);
    assert.ok(p.vx <= rideSpeedLimit(p) + 1e-8);
    const elapsed = ABILITIES[ride].duration;
    for (let i = 0; i < Math.ceil(elapsed * 120) + 180; i++) {
      const before = p.vx;
      updatePhysics(p, t, s, idle, step, false);
      if (!activeAbility(p))
        assert.ok(before - p.vx <= 12 * step + 1e-8, "技能结束发生瞬间断速");
    }
    assert.equal(p.ride, ride);
    assert.ok(p.vx <= RIDES[ride].cruise + 1e-8);
  }
});

test("雪鸮/风帆能力确实延长腾空，结束后恢复重力，不残留永久滑翔", () => {
  for (const ride of ["owl", "sail"] as const) {
    const t = flat(),
      p = player(ride),
      normal = structuredClone(p),
      s = createStats();
    for (const v of [p, normal]) {
      v.grounded = false;
      v.y = 4;
      v.vy = -1;
    }
    updatePhysics(p, t, s, { ...idle, ability: true }, step, false);
    assert.ok(p.vy > 3);
    for (let i = 0; i < 120; i++) {
      updatePhysics(p, t, s, idle, step, false);
      updatePhysics(normal, t, createStats(), idle, step, false);
    }
    assert.ok(p.y > normal.y + 2);
    for (let i = 0; i < 120 * 8 && !p.grounded; i++)
      updatePhysics(p, t, s, idle, step, false);
    assert.ok(p.grounded);
    assert.equal(p.ability, 0);
    assert.equal(p.ride, ride);
  }
});

test("牦牛冲锋破木速度损失更小，碎木事件只发一次并携带真实位置，不扩展破岩/冰权限", () => {
  for (const kind of [
    "log",
    "fence",
    "bridge",
    "rock",
    "ice",
    "fall",
  ] as const) {
    const p = player("yak"),
      s = createStats();
    p.x = 100;
    p.y = 0;
    p.protection = 0;
    p.ability = 2;
    const e: Entity = {
      id: kind,
      kind: "obstacle",
      obstacle: kind,
      x: p.x,
      y: p.y,
      route: "main",
      used: false,
    };
    const events = interact([e], p, 99, s);
    if (["log", "fence", "bridge"].includes(kind)) {
      assert.equal(p.ride, "yak");
      assert.ok(p.vx > RIDES.yak.cruise * 0.99);
      const impact = events.find((v) => v.type === "break")!;
      assert.deepEqual(impact.position, { x: 100, y: 0 });
      assert.equal(impact.powered, true);
      assert.equal(s.score, 65);
      assert.equal(interact([e], p, 99, s).length, 0);
    } else {
      assert.equal(p.ride, "ski");
      assert.equal(
        events.some((v) => v.type === "break"),
        false,
      );
    }
  }
});

test("技能视觉强度按真实时间推导，双板、摔倒或换乘不会泄漏主动状态", () => {
  for (const ride of rides) {
    const p = player(ride);
    p.ability = ABILITIES[ride].duration;
    assert.equal(abilityIntensity(p), 0);
    p.ability -= 0.2;
    assert.equal(abilityIntensity(p), 1);
    p.ability = 0.05;
    assert.ok(abilityIntensity(p) > 0 && abilityIntensity(p) < 1);
    p.fall = 1;
    assert.equal(activeAbility(p), null);
    p.fall = 0;
    leaveRide(p);
    assert.equal(abilityIntensity(p), 0);
  }
});

test("关闭粒子及低画质仍有喷火/气流/雪浪，附加粒子按照预算减量", () => {
  for (const ride of rides) {
    const p = player(ride),
      effect = new AbilityVisual();
    p.ability = 1;
    effect.update(
      p,
      1,
      p,
      0,
      0,
      { ...settings, quality: "low", particles: false },
      "playing",
      "test",
      90,
    );
    assert.ok(effect.root.visible);
    assert.equal(effect.diagnostics.dust, 0);
    assert.equal(effect.diagnostics.flame, ride === "bike");
    assert.equal(effect.diagnostics.wind, ride === "owl" || ride === "sail");
    assert.equal(effect.diagnostics.snow, ride !== "owl");
    effect.update(p, 1, p, 0, 0, settings, "playing", "test", 90);
    assert.equal(effect.diagnostics.dust, 18);
    effect.update(p, 1, p, 0, 0, settings, "playing", "test", 180);
    assert.equal(effect.diagnostics.dust, 48);
  }
});

test("技能表现暂停不移动，同一状态重复绘制不改物理，结束/换乘/菜单及时隐藏", () => {
  const p = player("bike"),
    effect = new AbilityVisual();
  p.ability = 1;
  const before = JSON.stringify(p);
  effect.update(p, 1, p, 0, 0, settings, "playing", "test");
  const snapshot = effect.root.toJSON();
  for (let i = 0; i < 10; i++)
    effect.update(p, 1, p, 0, 0, settings, "paused", "test");
  assert.deepEqual(effect.root.toJSON(), snapshot);
  assert.equal(JSON.stringify(p), before);
  p.ability = 0;
  effect.update(p, 1, p, 0, 0, settings, "playing", "test");
  assert.equal(effect.root.visible, false);
  enterRide(p, "sail");
  effect.update(p, 1, p, 0, 0, settings, "playing", "test");
  assert.equal(effect.diagnostics.flame, false);
  p.ability = 1;
  effect.update(p, 1, p, 0, 0, settings, "menu", "test");
  assert.equal(effect.root.visible, false);
});

test("破木特效池有界、坐标随局部原点校正、暂停冻结，到期和新局完全回收", () => {
  const p = player("yak"),
    effect = new AbilityVisual();
  p.ability = 1;
  effect.update(p, 1, p, 0, 0, settings, "playing", "test");
  const rootCount = effect.burstsRoot.children.length;
  const event: GameEvent = {
    type: "break",
    powered: true,
    position: { x: 240, y: -15 },
  };
  for (let i = 0; i < 100; i++) effect.event(event, 1);
  effect.update(p, 1.2, p, 240, -18, settings, "playing", "test");
  assert.equal(effect.diagnostics.chips, 48);
  assert.equal(effect.burstsRoot.children.length, rootCount);
  const mesh = effect.burstsRoot.children[0] as THREE.InstancedMesh,
    matrix = new THREE.Matrix4();
  mesh.getMatrixAt(0, matrix);
  assert.ok(Math.abs(matrix.elements[12]) < 2);
  assert.ok(matrix.elements[13] > 3);
  const snapshot = Array.from(mesh.instanceMatrix.array);
  effect.update(p, 1.2, p, 240, -18, settings, "paused", "test");
  assert.deepEqual(Array.from(mesh.instanceMatrix.array), snapshot);
  effect.update(p, 2, p, 240, -18, settings, "playing", "test");
  assert.equal(effect.diagnostics.chips, 0);
  effect.event(event, 2);
  effect.update(p, 2.1, p, 0, 0, settings, "playing", "new-run");
  assert.equal(effect.diagnostics.chips, 0);
});

test("牦牛低头、雪鸮展翼和风帆鼓起可恢复，形变实例不会污染共享网格", () => {
  const yak = new THREE.Group(),
    head = new THREE.Group();
  head.name = "charge-head";
  yak.add(head);
  animateRide(yak, "yak", 1, true, true);
  assert.ok(head.rotation.z < -0.1);
  animateRide(yak, "yak", 1, false, true);
  assert.equal(head.rotation.z, 0);
  const owl = new THREE.Group();
  for (const sign of [-1, 1]) {
    const wing = new THREE.Group();
    wing.name = `wing${sign}`;
    owl.add(wing);
  }
  animateRide(owl, "owl", 1, true, true);
  assert.ok(Math.abs(owl.children[0].rotation.x) < 0.17);
  const geometry = makeSailGeometry(),
    original = Array.from(geometry.getAttribute("position").array);
  const first = new THREE.Group(),
    sail = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  sail.name = "ability-sail";
  first.add(sail);
  const second = first.clone(true),
    other = second.getObjectByName("ability-sail") as THREE.Mesh;
  animateRide(first, "sail", 1, true);
  assert.ok(sail.morphTargetInfluences![0] > 0.6);
  assert.equal(other.morphTargetInfluences![0], 0);
  assert.equal(sail.geometry, other.geometry);
  assert.deepEqual(
    Array.from(geometry.getAttribute("position").array),
    original,
  );
  animateRide(first, "sail", 1, false);
  assert.equal(sail.morphTargetInfluences![0], 0);
  assert.equal(sail.rotation.y, 0);
});

test("实际技能声音随种类和状态变化，关闭技能后引擎/风声回到普通状态", () => {
  const p = player("bike"),
    normal = abilitySound(p);
  p.ability = 1;
  assert.ok(abilitySound(p).engineHz > normal.engineHz);
  assert.ok(abilitySound(p).engineGain > normal.engineGain);
  enterRide(p, "sail");
  p.ability = 1;
  assert.ok(abilitySound(p).wind > 0);
  assert.equal(abilitySound(p).engineGain, 0);
  leaveRide(p);
  assert.equal(abilitySound(p).wind, 0);
  assert.equal(abilitySound(p).engineGain, 0);
});

test("真实破木事件通过正式UI送达世界和音频，技能按钮发动中区别于普通冷却", () => {
  const { document } = parseHTML(
    '<html><body><div id="ui"></div></body></html>',
  );
  Object.defineProperty(globalThis, "document", {
    value: document,
    configurable: true,
  });
  const g = new Game(new Storage()),
    received: GameEvent[] = [],
    sounded: GameEvent[] = [];
  const ui = new UI(
    document.getElementById("ui")! as unknown as HTMLElement,
    g,
    {
      unlock() {},
      event(e: GameEvent) {
        sounded.push(e);
      },
    } as unknown as Audio,
    { clear() {} } as unknown as Input,
    {
      abilityEvent(e: GameEvent) {
        received.push(e);
      },
      impact() {},
      highlight() {},
    } as unknown as World,
  );
  g.start("endless");
  // 入口文件负责事件装配，测试沿用同一正式接线。
  g.onEvent = (event) => ui.event(event);
  g.phase = "playing";
  enterRide(g.player, "yak");
  g.player.ability = 1;
  g.player.cooldown = 4;
  ui.update(0.2);
  assert.equal(
    document.getElementById("ability")!.classList.contains("active"),
    true,
  );
  const e: Entity = {
    id: "wood",
    kind: "obstacle",
    obstacle: "log",
    x: g.player.x,
    y: g.player.y,
    route: "main",
    used: false,
  };
  g.entities = [e];
  g.update(step, idle);
  assert.equal(received.length, 1);
  assert.equal(received[0].type, "break");
  assert.ok(sounded.some((v) => v.type === "break"));
  g.update(step, idle);
  assert.equal(received.length, 1);
});
