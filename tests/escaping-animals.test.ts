import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import type { Entity, Ride } from "../src/core/types";
import { Terrain, BRANCH_START, MODULE } from "../src/systems/terrain";
import {
  ANIMAL_ESCAPE_SPEED,
  updateEscapingAnimals,
  retireEscapingAnimals,
} from "../src/systems/escaping-animals";
import { createPlayer } from "../src/systems/physics";
import { createStats } from "../src/systems/score";
import { interact } from "../src/systems/obstacles";
import { Game } from "../src/core/game";
import { Storage } from "../src/systems/storage";
import { animateRide } from "../src/render/models";
import { RIDES } from "../src/data/config";

const step = 1 / 120;
const idle = { jump: false, held: false, ability: false };
const terrain = new Terrain(52);
function animal(ride: Ride, x = 100): Entity {
  return {
    id: `test:${ride}:${x}`,
    kind: "ride",
    ride,
    x,
    y: terrain.height(x),
    route: "main",
    used: false,
  };
}

test("三种动物持续前进且慢于双板巡航，地面动物贴坡，雪鸮低飞", () => {
  for (const ride of ["otter", "yak", "owl"] as const) {
    const e = animal(ride, 100);
    for (let i = 0; i < 120; i++) updateEscapingAnimals([e], terrain, step);
    assert.ok(Math.abs(e.x - 100 - ANIMAL_ESCAPE_SPEED[ride]) < 1e-8);
    assert.ok(e.escape!.speed < RIDES.ski.cruise);
    assert.ok(
      Math.abs(e.y - terrain.height(e.x)) <= (ride === "owl" ? 0.18 : 1e-8),
    );
    assert.ok(
      Math.abs(e.escape!.previousX - (e.x - e.escape!.speed * step)) < 1e-8,
    );
  }
});

test("车辆、其他实体和已接入动物保持原位，不创建逃跑状态", () => {
  const entities: Entity[] = [
    animal("bike"),
    animal("sail"),
    { ...animal("otter"), used: true },
    { ...animal("otter"), kind: "coin" },
    { ...animal("yak"), kind: "obstacle", obstacle: "rock" },
  ];
  const before = JSON.stringify(entities);
  updateEscapingAnimals(entities, terrain, 1);
  assert.equal(JSON.stringify(entities), before);
});

test("地面动物自动滑入连接坡道，遇到前方岩石起跳，不消费玩家障碍", () => {
  for (const ride of ["otter", "yak"] as const) {
    const e = animal(ride, MODULE + BRANCH_START - 0.08);
    updateEscapingAnimals([e], terrain, step);
    assert.equal(e.route, "upper");
    assert.equal(e.y, terrain.branchHeight(e.x));
    const runner = animal(ride, 100);
    const rock: Entity = {
      id: "rock",
      kind: "obstacle",
      obstacle: "rock",
      x: 110,
      y: terrain.height(110),
      route: "main",
      used: false,
    };
    let overRock = false,
      landed = false;
    for (let i = 0; i < 240; i++) {
      updateEscapingAnimals([runner, rock], terrain, step);
      if (Math.abs(runner.x - rock.x) < 0.2)
        overRock = runner.y > rock.y + 1.25;
      if (runner.x > 125 && runner.escape!.grounded) landed = true;
      assert.ok(runner.y >= terrain.height(runner.x) - 1e-8);
    }
    assert.ok(overRock, `${ride}未越过岩石`);
    assert.ok(landed);
    assert.equal(rock.used, false);
  }
});

test("追近当前真实位置自动接入一次，经过出生点不会提前接入", () => {
  const e = animal("otter", 100);
  // 连续推进到出生点之外；相对扫掠只保存最近一个物理步。
  for (let i = 0; i < 120; i++) updateEscapingAnimals([e], terrain, step);
  const p = createPlayer(terrain, 100),
    s = createStats();
  assert.equal(interact([e], p, 99, s).length, 0);
  p.x = e.x;
  p.y = e.y;
  assert.equal(
    interact([e], p, e.x - 0.5, s).filter((v) => v.type === "ride").length,
    1,
  );
  assert.equal(p.ride, "otter");
  assert.equal(s.rides, 1);
  const score = s.score;
  assert.equal(interact([e], p, e.x - 0.5, s).length, 0);
  assert.equal(s.score, score);
});

test("双方高速追越扫掠仍能接入，垂直不接近不能接入，同种不重复接入", () => {
  const e = animal("yak", 100);
  updateEscapingAnimals([e], terrain, 0.5);
  const p = createPlayer(terrain, 115),
    s = createStats();
  p.y = e.y;
  assert.equal(
    interact([e], p, 95, s, e.escape!.previousY).filter(
      (v) => v.type === "ride",
    ).length,
    1,
  );
  const far = animal("owl", p.x);
  updateEscapingAnimals([far], terrain, step);
  p.ride = "ski";
  p.y = far.y + 10;
  assert.equal(interact([far], p, p.x - 1, s, p.y).length, 0);
  p.y = far.y;
  p.ride = "owl";

  assert.equal(interact([far], p, p.x - 1, s, p.y).length, 0);
  assert.equal(far.used, false);
});

test("地面动物在平台下避障起跳也会碰到台底，不从下方穿到台面", () => {
  for (const ride of ["otter", "yak"] as const) {
    const e = animal(ride, 3 * MODULE + 125);
    const obstacle: Entity = {
      id: "under-platform",
      kind: "obstacle",
      obstacle: "ice",
      x: e.x + 9,
      y: terrain.height(e.x + 9),
      route: "main",
      used: false,
    };
    let airborne = false,
      stopped = false;
    for (let i = 0; i < 150; i++) {
      const oldVy = e.escape?.vy ?? 0;
      updateEscapingAnimals([e, obstacle], terrain, step);
      airborne ||= !e.escape!.grounded;
      stopped ||= oldVy > 1 && e.escape!.vy <= 0 && !e.escape!.grounded;
      assert.equal(e.route, "main");
      assert.ok(e.y < terrain.branchHeight(e.x)!);
    }
    assert.ok(airborne);
    assert.ok(stopped);
  }
});

test("雪浪追上的动物先退出，不再可接入、不发奖励；车辆与前方动物保留", () => {
  const caught = animal("yak", 100),
    ahead = animal("owl", 130),
    vehicle = animal("bike", 100);
  retireEscapingAnimals([caught, ahead, vehicle], 101, 102);
  assert.equal(caught.used, true);
  assert.equal(ahead.used, false);
  assert.equal(vehicle.used, false);
  const p = createPlayer(terrain, 101),
    s = createStats();
  assert.equal(interact([caught], p, 99, s).length, 0);
  assert.equal(s.rides, 0);
  assert.equal(s.score, 0);
  const distant = animal("otter", 1400);
  retireEscapingAnimals([distant], null, 100);
  assert.equal(distant.used, true);
});

test("开场和暂停冻结动物位置及动作时间，恢复后继续；重开重建运行态", () => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => null, setItem: () => {} },
  });
  const g = new Game(new Storage());
  g.start("adventure");
  const e = animal("otter", 200);
  g.entities = [e];
  const initial = JSON.stringify(e);
  g.update(step, idle);
  assert.equal(JSON.stringify(e), initial);
  g.phase = "playing";
  g.update(step, idle);
  assert.ok(e.x > 200);
  g.pause();
  const paused = JSON.stringify(e);
  for (let i = 0; i < 240; i++) g.update(step, idle);
  assert.equal(JSON.stringify(e), paused);
  g.resume();
  g.update(step, idle);
  assert.ok(e.x > JSON.parse(paused).x);
  g.start("adventure");
  assert.ok(g.entities.every((v) => !v.escape));
});

test("正式更新先吞没后接入，阻止同帧从雪浪中获取动物", () => {
  const g = new Game(new Storage());
  g.start("endless");
  g.phase = "playing";
  const e = animal("yak", 100);
  g.player = createPlayer(g.terrain, 100);
  e.y = g.player.y;
  g.entities = [e];
  g.avalanche.x = 101;
  g.update(step, idle);
  assert.equal(e.used, true);
  assert.equal(g.stats.rides, 0);
});

test("奔跑使用交替肢体与镜像振翅，同一模拟时间重复绘制不会继续推进动画", () => {
  for (const ride of ["otter", "yak", "owl"] as const) {
    // 只验证动画作用于骨骼，不依赖WebGL或浏览器纹理加载。
    const root = new THREE.Group();
    const names =
      ride === "owl"
        ? ["wing-1", "wing1"]
        : ["runLeg0", "runLeg1", "runLeg2", "runLeg3"];
    for (const name of names) {
      const limb = new THREE.Group();
      limb.name = name;
      root.add(limb);
    }
    animateRide(root, ride, 0.1, false, true);
    const a = root.children[0].rotation.toArray();
    const angle = ride === "owl" ? "x" : "z";
    assert.ok(Math.abs(root.children[0].rotation[angle]) > 0.05);
    assert.ok(
      Math.abs(
        root.children[0].rotation[angle] + root.children[1].rotation[angle],
      ) < 1e-8,
    );
    animateRide(root, ride, 0.1, false, true);
    assert.deepEqual(root.children[0].rotation.toArray(), a);
    animateRide(root, ride, 0.3, false, true);
    assert.notDeepEqual(root.children[0].rotation.toArray(), a);
  }
});
