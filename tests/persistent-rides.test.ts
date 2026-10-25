import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import type { Ride, Entity } from "../src/core/types";
import { RIDES } from "../src/data/config";
import { Terrain } from "../src/systems/terrain";
import { createPlayer, updatePhysics } from "../src/systems/physics";
import { createStats } from "../src/systems/score";
import { enterRide, boardPassenger, ANIMALS } from "../src/systems/passengers";
import { interact } from "../src/systems/obstacles";
import { Game } from "../src/core/game";
import { Storage } from "../src/systems/storage";
import { UI } from "../src/ui/ui";
import type { Audio } from "../src/systems/audio";
import type { Input } from "../src/systems/input";
import type { World } from "../src/render/world";

Object.defineProperty(globalThis, "localStorage", {
  value: { getItem: () => null, setItem: () => {} },
});
const rides: Ride[] = ["otter", "yak", "owl", "bike", "sail"];
const idle = { jump: false, held: false, ability: false },
  step = 1 / 120;
function flatTerrain() {
  // 隔离同行生命周期，排除随机跳台/障碍造成的正常碰撞退出；仍调用正式物理。
  const t = new Terrain(52);
  t.height = () => 0;
  t.slope = () => 0;
  t.branchHeight = () => null;
  t.crossesBranchEntry = () => false;
  return t;
}

test("五种骑乘超过原时限仍持续同行，乘客不超时离队，无计时字段或时长配置", () => {
  for (const ride of rides) {
    const t = flatTerrain(),
      p = createPlayer(t),
      s = createStats();
    enterRide(p, ride);
    if (ride === "bike" || ride === "sail")
      for (const a of ANIMALS) boardPassenger(p, a);
    const crew = [...p.passengers];
    const events = [];
    for (let i = 0; i < 120 * 120; i++)
      events.push(...updatePhysics(p, t, s, idle, step, false));
    assert.equal(p.ride, ride);
    assert.deepEqual(p.passengers, crew);
    assert.equal(s.crashes, 0);
    assert.ok(p.x > 2000);
    assert.equal(
      events.some(
        (e) => e.text?.includes("同行结束") || e.text?.includes("到期"),
      ),
      false,
    );
    assert.equal("rideTime" in p, false);
    assert.equal("duration" in RIDES[ride], false);
  }
});

test("主动技能持续时间和6秒冷却仍有效，到时只结束技能并可再次发动", () => {
  for (const ride of rides) {
    const t = flatTerrain(),
      p = createPlayer(t),
      s = createStats();
    enterRide(p, ride);
    const first = updatePhysics(
      p,
      t,
      s,
      { ...idle, ability: true },
      step,
      false,
    );
    assert.equal(first.filter((e) => e.type === "ability").length, 1);
    assert.equal(p.cooldown, 6);
    const duration = p.ability;
    for (let i = 0; i < 120 * 4; i++) updatePhysics(p, t, s, idle, step, false);
    assert.equal(p.ability, 0);
    assert.ok(p.cooldown > 0);
    assert.equal(p.ride, ride);
    assert.ok(duration > 0 && duration <= 3.8);
    const blocked = updatePhysics(
      p,
      t,
      s,
      { ...idle, ability: true },
      step,
      false,
    );
    assert.equal(
      blocked.some((e) => e.type === "ability"),
      false,
    );
    for (let i = 0; i < 120 * 3; i++) updatePhysics(p, t, s, idle, step, false);
    assert.equal(p.cooldown, 0);
    assert.equal(
      updatePhysics(p, t, s, { ...idle, ability: true }, step, false).some(
        (e) => e.type === "ability",
      ),
      true,
    );
    assert.equal(s.abilities, 2);
  }
});

test("不同动物立即换乘并清理旧能力，同种不消费实体、不刷新技能或奖励", () => {
  const t = flatTerrain(),
    p = createPlayer(t, 100),
    s = createStats();
  for (const current of ANIMALS)
    for (const next of ANIMALS) {
      enterRide(p, current);
      p.ability = 1;
      p.cooldown = 4;
      p.boost = 1;
      const e: Entity = {
        id: `${current}:${next}`,
        x: p.x,
        y: p.y,
        kind: "ride",
        ride: next,
        route: "main",
        used: false,
      };
      const before = JSON.stringify([p, s]);
      const events = interact([e], p, p.x - 0.2, s);
      if (current === next) {
        assert.equal(events.length, 0);
        assert.equal(e.used, false);
        assert.equal(JSON.stringify([p, s]), before);
      } else {
        assert.equal(e.used, true);
        assert.equal(p.ride, next);
        assert.equal(p.ability, 0);
        assert.equal(p.cooldown, 0);
        assert.equal(p.boost, 0);
        assert.equal(events[0].ride, next);
        const score = s.score;
        assert.equal(interact([e], p, p.x - 0.2, s).length, 0);
        assert.equal(s.score, score);
      }
    }
});

test("五种骑乘HUD移除同行秒数及进度条，技能冷却和载具三席正常呈现", () => {
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
  for (const ride of rides) {
    enterRide(g.player, ride);
    g.player.cooldown = 3.2;
    if (ride === "bike" || ride === "sail")
      for (const a of ANIMALS) boardPassenger(g.player, a);
    ui.update(0.2);
    const hud = document.getElementById("hud-ride")!;
    assert.match(hud.textContent!, new RegExp(RIDES[ride].ability));
    assert.doesNotMatch(hud.textContent!, /秒|即将离开|到期/);
    assert.equal(hud.querySelector("i, [style*=width]"), null);
    assert.equal(
      hud.querySelectorAll(".passenger-seat.occupied").length,
      ride === "bike" || ride === "sail" ? 3 : 0,
    );
    assert.equal(document.querySelector("#ability small")!.textContent, "4秒");
  }
});

test("图鉴说明去掉同行时长、到期预警和燃料限制，保留主动技能冷却说明", () => {
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
  // 直接调用本组件的模板方法，只测试源码生成DOM，不访问任何浏览器页面。
  const guide = ui as unknown as { guideRide: Ride; guide(): string };
  for (const ride of rides) {
    guide.guideRide = ride;
    const { document: sheet } = parseHTML(
      `<html><body>${guide.guide()}</body></html>`,
    );
    assert.match(sheet.body.textContent!, /持续同行/);
    assert.match(sheet.body.textContent!, /冷却 6 秒/);
    assert.doesNotMatch(
      sheet.body.textContent!,
      /同行约|到期|燃料有限|结束前.*预警/,
    );
  }
});
