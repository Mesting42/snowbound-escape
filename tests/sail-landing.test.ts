import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import type { Entity } from "../src/core/types";
import { Terrain, MODULE } from "../src/systems/terrain";
import { createPlayer, updatePhysics } from "../src/systems/physics";
import { createStats } from "../src/systems/score";
import {
  enterRide,
  leaveRide,
  boardPassenger,
} from "../src/systems/passengers";
import { SAIL_DESCENT, sailDescentActive } from "../src/systems/sail-landing";
import { activeAbility, rideSpeedLimit } from "../src/systems/abilities";
import { interact } from "../src/systems/obstacles";
import { Game } from "../src/core/game";
import { Storage, freshSave } from "../src/systems/storage";
import { AbilityVisual } from "../src/render/ability-visual";
import { animateRide } from "../src/render/ride-animation";
import { makeSailGeometry } from "../src/render/sail-geometry";

const idle = { jump: false, held: false, ability: false },
  dt = 1 / 120;
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
function recoveryPlayer(t = flat()) {
  const p = createPlayer(t, 100);
  enterRide(p, "sail");
  p.grounded = false;
  p.y += 2;
  p.protection = 0;
  p.sailDescent = 2;
  p.ability = 0;
  p.cooldown = 2;
  return p;
}

test("原复现的八个无障碍误判路段正常落地保留雪橇和乘客，不依赖碰撞保护", () => {
  for (const [seed, start] of [
    [1, 0],
    [1, 960],
    [1, 1000],
    [1, 1960],
    [1, 4640],
    [7, 1400],
    [7, 3480],
    [7, 3520],
  ]) {
    const t = new Terrain(seed),
      p = createPlayer(t, start),
      s = createStats();
    enterRide(p, "sail");
    boardPassenger(p, "otter");
    p.vx = 38;
    p.protection = 0;
    p.grounded = false;
    p.y += 2;
    p.vy = -1;
    let recovered = false;
    for (let i = 0; i < 1800; i++) {
      const events = updatePhysics(
        p,
        t,
        s,
        { ...idle, ability: i === 0 },
        dt,
        false,
      );
      recovered ||= p.sailDescent > 0;
      assert.equal(
        events.some((e) => e.type === "crash"),
        false,
        `seed=${seed}, start=${start}`,
      );
      assert.equal(p.protection, 0, "缓降不能新增免伤");
      if (p.grounded) break;
    }
    assert.ok(p.grounded);
    assert.ok(recovered);
    assert.equal(p.ride, "sail");
    assert.deepEqual(p.passengers, ["otter"]);
    assert.equal(p.sailDescent, 0);
    assert.equal(s.crashes, 0);
    assert.ok(["perfect", "normal"].includes(p.lastLanding));
  }
});

test("主动技能到时才启动单次缓降，重力平顺，无额外加速/抬升/冷却刷新", () => {
  const t = flat(),
    p = recoveryPlayer(t),
    s = createStats();
  p.ability = dt / 2;
  p.sailDescent = 0;
  p.vy = -2.6;
  p.vx = 40;
  p.y = 30;
  const cooldown = p.cooldown;
  updatePhysics(p, t, s, { ...idle, ability: true }, dt, false);
  assert.equal(p.ability, 0);
  assert.equal(activeAbility(p), null);
  assert.equal(p.sailDescent, SAIL_DESCENT.duration);
  assert.ok(p.vy < -2.6 && p.vy > -2.7, "重力恢复不应突然增加18m/s²");
  assert.ok(p.vx < 40);
  assert.equal(rideSpeedLimit(p), 32);
  assert.ok(p.cooldown < cooldown);
  assert.equal(s.abilities, 0);
  const previous = p.sailDescent;
  updatePhysics(p, t, s, idle, dt, false);
  assert.ok(p.sailDescent < previous);
  assert.ok(p.vy < 0);
});

test("缓降有4秒上限，不会永久悬浮；着地之后普通跳跃不会重新触发", () => {
  const t = flat(),
    p = recoveryPlayer(t),
    s = createStats();
  p.y = 150;
  p.sailDescent = SAIL_DESCENT.duration;
  p.vy = -1;
  for (let i = 0; i < 120 * 5; i++) updatePhysics(p, t, s, idle, dt, false);
  assert.equal(p.sailDescent, 0);
  assert.ok(!p.grounded);
  assert.ok(p.vy < -20);
  const normal = recoveryPlayer(t);
  normal.y = 0.03;
  normal.vy = -5;
  updatePhysics(normal, t, createStats(), idle, dt, false);
  assert.ok(normal.grounded);
  assert.equal(normal.sailDescent, 0);
  updatePhysics(normal, t, createStats(), { ...idle, jump: true }, dt, false);
  assert.equal(normal.grounded, false);
  assert.equal(normal.sailDescent, 0);
});

test("危险姿态和高速旋转仍有原代价，缓降不覆盖落地评分", () => {
  for (const pose of ["wrong-angle", "fast-spin"] as const) {
    const t = flat(),
      p = recoveryPlayer(t),
      s = createStats();
    p.y = 0.01;
    p.vy = -5;
    p.angle = pose === "wrong-angle" ? 2 : 0;
    p.omega = pose === "fast-spin" ? 8 : 0;
    updatePhysics(p, t, s, idle, dt, false);
    assert.ok(p.grounded);
    if (pose === "wrong-angle") {
      assert.equal(s.crashes, 1);
      assert.equal(p.ride, "ski");
    } else assert.equal(p.lastLanding, "stumble");
  }
});

test("缓降仍会撞到真实岩石/冰柱/落冰并失去雪橇，牦牛的一次护航规则不扩张", () => {
  for (const obstacle of ["rock", "ice", "fall"] as const) {
    const t = flat(),
      p = recoveryPlayer(t),
      s = createStats();
    p.y = 0.2;
    p.vy = -1;
    const e: Entity = {
      id: obstacle,
      kind: "obstacle",
      obstacle,
      x: p.x,
      y: 0,
      route: "main",
      used: false,
    };
    interact([e], p, p.x - 0.2, s);
    assert.equal(p.ride, "ski");
    assert.equal(p.sailDescent, 0);
    assert.equal(e.used, true);
  }
});

test("换乘、损毁、重新开局清除缓降；暂停冻结，恢复继续消耗", () => {
  const p = recoveryPlayer();
  enterRide(p, "bike");
  assert.equal(p.sailDescent, 0);
  p.sailDescent = 2;
  leaveRide(p);
  assert.equal(p.sailDescent, 0);
  const g = new Game(new Storage());
  g.start("endless");
  g.phase = "playing";
  g.player = recoveryPlayer(g.terrain);
  g.entities = [];
  g.pause();
  const before = JSON.stringify(g.player);
  for (let i = 0; i < 120; i++) g.update(dt, idle);
  assert.equal(JSON.stringify(g.player), before);
  g.resume();
  g.update(dt, idle);
  assert.ok(g.player.sailDescent < 2);
  g.start("endless");
  assert.equal(g.player.sailDescent, 0);
});

test("上层正常落台清除缓降，平台下方仍不能借缓降穿上台面", () => {
  const t = new Terrain(19),
    x = MODULE + 125;
  const above = recoveryPlayer(t);
  above.x = x;
  above.y = t.branchHeight(x)! + 0.03;
  above.vy = -5;
  above.angle = Math.atan(t.surface(x, "upper").slope);
  for (let i = 0; i < 30 && !above.grounded; i++)
    updatePhysics(above, t, createStats(), idle, dt, false);
  assert.ok(above.grounded);
  assert.equal(above.route, "upper");
  assert.equal(above.sailDescent, 0);
  const below = recoveryPlayer(t);
  below.x = x;
  below.y = t.height(x);
  below.vy = 8;
  for (let i = 0; i < 90; i++) {
    updatePhysics(below, t, createStats(), idle, dt, false);
    assert.equal(below.route, "main");
    assert.ok(below.y < t.branchHeight(below.x)!);
  }
});

test("收帆缓降不显示增压特效，帆面保留有限收帆姿态并在接地后恢复", () => {
  const p = recoveryPlayer(),
    visual = new AbilityVisual();
  assert.ok(sailDescentActive(p));
  visual.update(p, 1, p, 0, 0, freshSave().settings, "playing", "test");
  assert.equal(visual.diagnostics.active, false);
  assert.equal(visual.root.visible, false);
  const group = new THREE.Group(),
    sail = new THREE.Mesh(makeSailGeometry(), new THREE.MeshBasicMaterial());
  sail.name = "ability-sail";
  group.add(sail);
  animateRide(
    group,
    "sail",
    1,
    false,
    true,
    p.sailDescent / SAIL_DESCENT.duration,
  );
  assert.ok(
    sail.morphTargetInfluences![0] > 0 && sail.morphTargetInfluences![0] < 0.35,
  );
  animateRide(group, "sail", 1, false, true, 0);
  assert.equal(sail.morphTargetInfluences![0], 0);
});
