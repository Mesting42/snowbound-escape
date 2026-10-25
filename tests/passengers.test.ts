import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { parseHTML } from "linkedom";
import type { Animal, Entity, Ride } from "../src/core/types";
import { Terrain } from "../src/systems/terrain";
import { vehicleCompanions } from "../src/systems/vehicle-companions";
import { batchStaticModel } from "../src/render/static-model";
import { createPlayer, crash, updatePhysics } from "../src/systems/physics";
import { createStats } from "../src/systems/score";
import { interact } from "../src/systems/obstacles";
import {
  ANIMALS,
  boardPassenger,
  enterRide,
  hasPassenger,
  leaveRide,
  PASSENGER_EFFECTS,
} from "../src/systems/passengers";
import { Game } from "../src/core/game";
import { Storage } from "../src/systems/storage";
import { UI } from "../src/ui/ui";
import type { Audio } from "../src/systems/audio";
import type { Input } from "../src/systems/input";
import type { World } from "../src/render/world";
import { makeRide, type part } from "../src/render/models";
import {
  PassengerModels,
  PASSENGER_SEATS,
} from "../src/render/passenger-models";

const t = new Terrain(52),
  dt = 1 / 120;
const idle = { jump: false, held: false, ability: false };
Object.defineProperty(globalThis, "localStorage", {
  value: { getItem: () => null, setItem: () => {} },
});
function entity(ride: Ride, x: number, y = t.height(x)): Entity {
  return {
    id: `${ride}:${x}`,
    kind: "ride",
    ride,
    x,
    y,
    route: "main",
    used: false,
  };
}
function obstacle(
  kind: Entity["obstacle"],
  x: number,
  y = t.height(x),
): Entity {
  return {
    id: `${kind}:${x}`,
    kind: "obstacle",
    obstacle: kind,
    x,
    y,
    route: "main",
    used: false,
  };
}

test("两种载具均能接满三种动物，乘客上车不替换驾驶、不刷新技能冷却或保护", () => {
  for (const ride of ["bike", "sail"] as const) {
    const p = createPlayer(t, 100),
      s = createStats();
    enterRide(p, ride);

    p.ability = 1.4;
    p.cooldown = 3;
    p.boost = 1;
    p.protection = 0.4;
    const driving = [p.ride, p.ability, p.cooldown, p.boost, p.protection];
    for (const a of ANIMALS) {
      const e = entity(a, p.x, p.y);
      const events = interact([e], p, p.x - 0.2, s);
      assert.equal(events[0].type, "passenger");
      assert.equal(events[0].ride, a);
      assert.equal(e.used, true);
      assert.deepEqual(
        [p.ride, p.ability, p.cooldown, p.boost, p.protection],
        driving,
      );
    }
    assert.deepEqual(p.passengers, ANIMALS);
    assert.equal(s.rides, 3);
    assert.equal(s.score, 300);
    const duplicate = entity("yak", p.x, p.y);
    assert.equal(interact([duplicate], p, p.x - 0.2, s).length, 0);
    assert.equal(duplicate.used, false);
    assert.equal(s.rides, 3);
  }
});

test("移动动物使用相对扫掠上车，同一实体不能重复获取奖励", () => {
  const p = createPlayer(t, 115),
    s = createStats();
  enterRide(p, "sail");
  const e = entity("otter", 110, p.y);
  e.escape = {
    previousX: 100,
    previousY: p.y,
    speed: 20,
    vy: 0,
    grounded: true,
    age: 1,
  };
  assert.equal(interact([e], p, 95, s, p.y)[0].type, "passenger");
  assert.equal(interact([e], p, 95, s, p.y).length, 0);
  assert.equal(s.score, 100);
  assert.equal(s.rides, 1);
});

test("骑乘动物可立即随行登车，换车保留席位", () => {
  for (const a of ANIMALS)
    for (const vehicle of ["bike", "sail"] as const) {
      const p = createPlayer(t, 100),
        s = createStats();
      enterRide(p, a);

      interact([entity(vehicle, p.x, p.y)], p, 99, s);
      assert.equal(p.ride, vehicle);
      assert.deepEqual(p.passengers, [a]);
      const other = vehicle === "bike" ? "sail" : "bike";
      interact([entity(other, p.x, p.y)], p, 99, s);
      assert.equal(p.ride, other);
      assert.deepEqual(p.passengers, [a]);
      assert.equal(boardPassenger(p, a), false);
    }
});

test("同种乘客不重复上车，摔倒和高度不符不能接人", () => {
  const p = createPlayer(t, 100),
    s = createStats();
  enterRide(p, "bike");
  boardPassenger(p, "otter");

  for (const setup of [
    () => {},
    () => {
      p.fall = 1;
    },
    () => {
      p.fall = 0;
      p.y += 10;
    },
  ]) {
    setup();
    const e = entity("otter", p.x);
    assert.equal(interact([e], p, 99, s).length, 0);
    assert.equal(e.used, false);
  }
  const noVehicle = createPlayer(t, 100);
  assert.equal(boardPassenger(noVehicle, "owl"), false);
});

test("雪獭乘客减少实际滑行阻力，不改变巡航上限或主动技能", () => {
  const plain = createPlayer(t, 100);
  enterRide(plain, "bike");
  plain.vx = 28;
  const carried = structuredClone(plain);
  boardPassenger(carried, "otter");
  updatePhysics(plain, t, createStats(), idle, dt, false);
  updatePhysics(carried, t, createStats(), idle, dt, false);
  assert.ok(carried.vx > plain.vx);
  assert.ok(
    Math.abs(
      carried.vx -
        plain.vx -
        28 * 0.065 * (1 - PASSENGER_EFFECTS.otter.dragFactor) * dt,
    ) < 1e-9,
  );
  for (let i = 0; i < 1200; i++)
    updatePhysics(carried, t, createStats(), idle, dt, false);
  assert.ok(carried.vx <= 35);
});

test("雪鸮只减缓下降，上升阶段一致，与张帆组合不会获得无限悬浮", () => {
  for (const vehicle of ["bike", "sail"] as const)
    for (const ability of [0, 2])
      for (const vy of [-1, 5]) {
        const plain = createPlayer(t, 100);
        enterRide(plain, vehicle);
        plain.grounded = false;
        plain.y += 50;
        plain.vy = vy;
        plain.ability = ability;
        const carried = structuredClone(plain);
        boardPassenger(carried, "owl");
        updatePhysics(plain, t, createStats(), idle, dt, false);
        updatePhysics(carried, t, createStats(), idle, dt, false);
        if (vy < 0) {
          assert.ok(carried.vy > plain.vy);
          assert.ok(carried.vy < 0);
        } else assert.equal(carried.vy, plain.vy);
        for (let i = 0; i < 2400 && !carried.grounded; i++)
          updatePhysics(carried, t, createStats(), idle, dt, false);
        assert.ok(carried.grounded);
      }
});

test("载满动物时能力键仍发动对应载具技能，乘客不被切换或消耗", () => {
  for (const vehicle of ["bike", "sail"] as const) {
    const p = createPlayer(t, 100);
    enterRide(p, vehicle);
    for (const a of ANIMALS) boardPassenger(p, a);
    const events = updatePhysics(
      p,
      t,
      createStats(),
      { ...idle, ability: true },
      dt,
      false,
    );
    assert.equal(
      events.find((e) => e.type === "ability")?.text,
      vehicle === "bike" ? "引擎增压" : "乘风张帆",
    );
    assert.deepEqual(p.passengers, ANIMALS);
    assert.equal(p.cooldown, 6);
  }
});

test("牦牛只抵挡一次损毁撞击，保留其他乘客和载具技能；第二次撞击正常退出", () => {
  const p = createPlayer(t, 100),
    s = createStats();
  enterRide(p, "bike");
  for (const a of ANIMALS) boardPassenger(p, a);
  p.protection = 0;
  p.ability = 1;
  p.cooldown = 3;
  const rock = obstacle("rock", p.x, p.y);
  interact([rock], p, 99, s);
  assert.equal(p.ride, "bike");
  assert.deepEqual(p.passengers, ["otter", "owl"]);
  assert.equal(p.ability, 1);
  assert.equal(p.cooldown, 3);
  assert.equal(s.crashes, 0);
  assert.equal(interact([rock], p, 99, s).length, 0);
  p.protection = 0;
  interact([obstacle("ice", p.x, p.y)], p, 99, s);
  assert.equal(p.ride, "ski");
  assert.deepEqual(p.passengers, []);
  assert.equal(p.ability, 0);
  assert.equal(p.cooldown, 0);
  assert.equal(p.boost, 0);
});

test("机车破木、上车保护期和上层真实桥缺口不会白白消耗牦牛保护", () => {
  const p = createPlayer(t, 100),
    s = createStats();
  enterRide(p, "bike");
  boardPassenger(p, "yak");
  p.protection = 0;
  interact([obstacle("log", p.x, p.y)], p, 99, s);
  assert.ok(hasPassenger(p, "yak"));
  assert.equal(s.score, 65);
  p.protection = 1;
  interact([obstacle("ice", p.x, p.y)], p, 99, s);
  assert.ok(hasPassenger(p, "yak"));
  interact([{ ...obstacle("bridge", p.x, p.y), route: "upper" }], p, 99, s);
  assert.ok(hasPassenger(p, "yak"));
});

test("主动离车与严重摔倒统一清空乘客和所有加成", () => {
  for (const exit of ["leave", "crash"] as const) {
    const p = createPlayer(t, 100);
    enterRide(p, "sail");
    for (const a of ANIMALS) boardPassenger(p, a);

    p.ability = 2;
    p.cooldown = 3;
    p.boost = 2;
    p.protection = 0;
    if (exit === "crash") crash(p, createStats(), []);
    else leaveRide(p);
    assert.equal(p.ride, "ski");
    assert.deepEqual(p.passengers, []);
    assert.equal(p.ability, 0);
    assert.equal(p.cooldown, 0);
    assert.equal(p.boost, 0);
    assert.equal(hasPassenger(p, "owl"), false);
  }
});

test("正式游戏发现动物乘客、暂停冻结、恢复及重开均保持独立状态", () => {
  const g = new Game(new Storage());
  g.start("endless");
  g.phase = "playing";
  enterRide(g.player, "bike");
  g.entities = ANIMALS.map((a) => entity(a, g.player.x + 0.3, g.player.y));
  g.update(dt, idle);
  assert.deepEqual(g.player.passengers, ANIMALS);
  assert.ok(ANIMALS.every((a) => g.storage.data.discovered.includes(a)));
  g.pause();
  const before = JSON.stringify(g.player);
  for (let i = 0; i < 120; i++) g.update(dt, { ...idle, ability: true });
  assert.equal(JSON.stringify(g.player), before);
  g.resume();
  g.update(dt, idle);
  assert.deepEqual(g.player.passengers, ANIMALS);
  assert.ok(g.player.x > JSON.parse(before).x);
  g.start("adventure");
  assert.deepEqual(g.player.passengers, []);
});

test("正式HUD同时显示三个席位与加成，牦牛离队立刻空出席位，驾驶能力仍显示", () => {
  const { document } = parseHTML(
    '<html><body><div id="ui"></div></body></html>',
  );
  Object.defineProperty(globalThis, "document", {
    value: document,
    configurable: true,
  });
  const g = new Game(new Storage());
  const ui = new UI(
    document.getElementById("ui")! as unknown as HTMLElement,
    g,
    { unlock() {}, event() {} } as unknown as Audio,
    { clear() {} } as unknown as Input,
    {} as World,
  );
  g.start("endless");
  g.phase = "playing";
  enterRide(g.player, "sail");
  for (const a of ANIMALS) boardPassenger(g.player, a);
  ui.update(0.2);
  assert.equal(document.querySelectorAll(".passenger-seat.occupied").length, 3);
  assert.match(document.getElementById("hud-ride")!.textContent!, /乘风张帆/);
  assert.match(
    document.querySelector('[data-animal="owl"]')!.textContent!,
    /缓降/,
  );
  g.player.passengers = ["otter", "owl"];
  ui.update(0.2);
  assert.match(
    document.querySelector('[data-animal="yak"]')!.textContent!,
    /空位/,
  );
  leaveRide(g.player);
  ui.update(0.2);
  assert.equal(document.querySelectorAll(".passenger-seat").length, 0);
});

// 与正式模型相同的几何和尺寸，只使用无纹理材质，避免测试依赖浏览器与WebGL。
const geometries = {
  sphere: new THREE.SphereGeometry(1, 14, 10),
  box: new THREE.BoxGeometry(1, 1, 1),
  capsule: new THREE.CapsuleGeometry(0.5, 1, 4, 10),
};
const draw: typeof part = (
  parent,
  color,
  x,
  y,
  z,
  sx,
  sy,
  sz,
  shape = "sphere",
) => {
  const mesh = new THREE.Mesh(
    geometries[shape],
    new THREE.MeshStandardMaterial({ color }),
  );
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
};

test("三种乘客各有固定位置，雪鸮正确栖坐，模型复用、暂停与离队不会残影", () => {
  const passengers = new PassengerModels((ride) => makeRide(ride, draw));
  const p = createPlayer(t);
  enterRide(p, "sail");
  for (const a of ANIMALS) boardPassenger(p, a);
  passengers.update(p, 1);
  assert.equal(passengers.root.children.length, 3);
  for (const a of ANIMALS) {
    const model = passengers.models.get(a)!;
    assert.deepEqual(model.parent!.position.toArray(), [...PASSENGER_SEATS[a]]);
    assert.ok(model.parent!.visible);
    const bounds = new THREE.Box3().setFromObject(model.parent!);
    assert.ok(bounds.max.y < (a === "owl" ? 3 : 2.5), `${a}高度偏移重复计算`);
  }
  const transforms = passengers.root.toJSON();
  passengers.update(p, 1);
  assert.deepEqual(passengers.root.toJSON(), transforms);
  p.passengers = ["owl"];
  passengers.update(p, 2);
  assert.equal(passengers.models.get("yak")!.parent!.visible, false);
  leaveRide(p);
  passengers.update(p, 3);
  assert.equal(passengers.root.visible, false);
  assert.equal(passengers.root.children.length, 3);
});

test("载具相遇在前方视野外提供可追上的动物，已有席位与附近同种不重复生成", () => {
  const p = createPlayer(t, 100);
  enterRide(p, "bike");
  const crew = vehicleCompanions(p, t, [], "vehicle-a");
  assert.equal(crew.length, 3);
  assert.ok(
    crew.every(
      (e) =>
        e.x > p.x + 100 &&
        e.x <= p.x + 155 &&
        e.y === t.height(e.x) &&
        !e.escape,
    ),
  );
  assert.equal(vehicleCompanions(p, t, crew, "vehicle-a").length, 0);
  boardPassenger(p, "yak");
  const nearby = entity("owl", p.x + 180);
  assert.deepEqual(
    vehicleCompanions(p, t, [nearby], "vehicle-b").map((e) => e.ride),
    ["otter"],
  );
  const before = JSON.stringify([p.ability, p.cooldown, p.passengers]);
  vehicleCompanions(p, t, [], "vehicle-c");
  assert.equal(JSON.stringify([p.ability, p.cooldown, p.passengers]), before);
});

test("正式拾取载具仅生成一次前方相遇，原实体used阻止重复刷出动物", () => {
  const g = new Game(new Storage());
  g.start("endless");
  g.phase = "playing";
  g.entities = [entity("sail", g.player.x + 0.3, g.player.y)];
  const source = g.entities[0].id;
  g.update(dt, idle);
  const created = g.entities.filter((e) =>
    e.id.startsWith(`${source}:companion:`),
  );
  assert.equal(created.length, 3);
  assert.equal(g.player.passengers.length, 0);
  for (let i = 0; i < 20; i++) g.update(dt, idle);
  assert.equal(
    g.entities.filter((e) => e.id.startsWith(`${source}:companion:`)).length,
    3,
  );
  assert.ok(created.every((e) => e.escape && e.x > e.escape.previousX));
});

test("两种正式载具与图鉴改为紧凑座舱，保留三席、驾驶原点和比例", () => {
  for (const ride of ["bike", "sail"] as const) {
    const model = makeRide(ride, draw),
      deck = model.getObjectByName("passenger-deck")!;
    assert.ok(deck);
    const bounds = new THREE.Box3().setFromObject(deck);
    assert.ok(bounds.min.x < PASSENGER_SEATS.yak[0] - 0.7);
    assert.ok(bounds.max.x > PASSENGER_SEATS.otter[0] + 0.7);
    const full = new THREE.Box3().setFromObject(model, true);
    assert.ok(full.max.x - full.min.x <= 4.8, "座舱再次被拉成长车");
    assert.ok(bounds.max.z - bounds.min.z >= 2.7, "没有利用车体纵深容纳动物");
    assert.deepEqual(model.position.toArray(), [0, 0, 0]);
    assert.deepEqual(model.scale.toArray(), [1, 1, 1]);
  }
});

test("三席利用纵深错位，原尺寸模型有独立空间，雪鸮栖在前排上方", () => {
  const passengers = new PassengerModels((ride) => makeRide(ride, draw));
  const p = createPlayer(t);
  enterRide(p, "bike");
  for (const a of ANIMALS) boardPassenger(p, a);
  passengers.update(p, 0);
  const bounds = Object.fromEntries(
    ANIMALS.map((a) => [
      a,
      new THREE.Box3().setFromObject(passengers.models.get(a)!.parent!, true),
    ]),
  ) as Record<Animal, THREE.Box3>;
  assert.ok(bounds.yak.max.z < bounds.otter.min.z, "牦牛和雪獭没有前后排错开");
  assert.ok(bounds.owl.min.y > bounds.otter.max.y, "雪鸮栖杆过低，与雪獭重叠");
  for (const a of ANIMALS) {
    assert.deepEqual(passengers.models.get(a)!.scale.toArray(), [1, 1, 1]);
    assert.deepEqual(
      passengers.models.get(a)!.parent!.scale.toArray(),
      [1, 1, 1],
    );
  }
});

test("静态合并减少绘制部件且保持世界包络、三角形、UV及共享源几何", () => {
  const root = new THREE.Group(),
    shared = new THREE.BoxGeometry(1, 1, 1);
  const red = new THREE.MeshStandardMaterial({ color: "red" });
  const blue = new THREE.MeshStandardMaterial({ color: "blue" });
  for (let i = 0; i < 3; i++) {
    const mesh = new THREE.Mesh(shared, i < 2 ? red : blue);
    mesh.position.set(i * 1.5, i * 0.2, 0);
    root.add(mesh);
  }
  root.position.set(3, 1, -1);
  root.rotation.z = 0.3;
  // 精确顶点包络：合并后的粗略局部AABB在旋转时会更宽，不能拿它判断形体变形。
  const before = new THREE.Box3().setFromObject(root, true);
  const sourcePosition = Array.from(shared.getAttribute("position").array);
  batchStaticModel(root);
  assert.equal(root.children.length, 2);
  const after = new THREE.Box3().setFromObject(root, true);
  assert.ok(before.min.distanceTo(after.min) < 1e-6);
  assert.ok(before.max.distanceTo(after.max) < 1e-6);
  const meshes = root.children as THREE.Mesh[];
  assert.equal(
    meshes.reduce((n, m) => n + m.geometry.index!.count, 0),
    3 * shared.index!.count,
  );
  assert.ok(
    meshes.every(
      (m) => m.geometry.hasAttribute("uv") && m.geometry.hasAttribute("normal"),
    ),
  );
  assert.deepEqual(
    Array.from(shared.getAttribute("position").array),
    sourcePosition,
  );
});

test("乘客模型缓存复用合并几何，但各实例席位与动画可见性相互独立", () => {
  let created = 0;
  const factory = (ride: Ride) => {
    created++;
    return makeRide(ride, draw);
  };
  const first = new PassengerModels(factory),
    second = new PassengerModels(factory);
  assert.equal(created, 3);
  for (const a of ANIMALS) {
    assert.notEqual(first.models.get(a), second.models.get(a));
    assert.equal(
      (first.models.get(a)!.children[0] as THREE.Mesh).geometry,
      (second.models.get(a)!.children[0] as THREE.Mesh).geometry,
    );
  }
  const p = createPlayer(t);
  enterRide(p, "bike");
  boardPassenger(p, "owl");
  first.update(p, 1);
  assert.equal(first.models.get("owl")!.parent!.visible, true);
  assert.equal(second.models.get("owl")!.parent!.visible, false);
});
