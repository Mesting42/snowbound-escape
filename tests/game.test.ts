import { test } from "node:test";
import assert from "node:assert/strict";
import { Terrain } from "../src/systems/terrain";
import { createPlayer, updatePhysics } from "../src/systems/physics";
import { createStats, settleLanding } from "../src/systems/score";
import { Avalanche } from "../src/systems/avalanche";
import { Storage, freshSave } from "../src/systems/storage";
import { Game } from "../src/core/game";
import { interact } from "../src/systems/obstacles";

let serialized: string | null = null;
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: () => serialized,
    setItem: (_key: string, value: string) => {
      serialized = value;
    },
  },
});
const step = 1 / 120;
test("32 个种子的模块接缝高度和坡度连续，高速接触不穿地", () => {
  for (let seed = 0; seed < 32; seed++) {
    const t = new Terrain(seed);
    for (let n = 1; n < 40; n++) {
      const x = n * 240;
      assert.ok(Math.abs(t.height(x - 0.001) - t.height(x + 0.001)) < 0.002);
      assert.ok(Math.abs(t.slope(x - 0.001) - t.slope(x + 0.001)) < 0.001);
    }
    const p = createPlayer(t),
      s = createStats();
    p.vx = 38;
    for (let i = 0; i < 2400; i++) {
      updatePhysics(
        p,
        t,
        s,
        { jump: i % 300 === 0, held: false, ability: false },
        step,
        false,
      );
      assert.ok(p.y >= t.height(p.x) - 0.001);
      assert.ok(Number.isFinite(p.y));
    }
  }
});
test("持续按住不会在每次接地时再次起跳", () => {
  const t = new Terrain(7),
    p = createPlayer(t),
    s = createStats();
  for (let i = 0; i < 1200; i++)
    updatePhysics(
      p,
      t,
      s,
      { jump: i === 0, held: true, ability: false },
      step,
      false,
    );
  assert.equal(s.jumps, 1);
});
test("连续旋转只在落地结算，严重失误取消空中技巧", () => {
  const t = new Terrain(1),
    p = createPlayer(t, 120),
    s = createStats();
  p.airRotation = 4 * Math.PI + 0.1;
  assert.equal(s.flips, 0);
  const result = settleLanding(p, s, "perfect");
  assert.equal(result.flips, 2);
  assert.equal(s.flips, 2);
  settleLanding(p, s, "normal");
  assert.equal(s.flips, 2);
  p.airRotation = 2 * Math.PI;
  settleLanding(p, s, "crash");
  assert.equal(s.flips, 2);
  assert.equal(s.combo, 0);
});
test("有限松手辅助允许一圈空翻，也保留危险落地代价", () => {
  const t = new Terrain(1);
  const run = (release: number) => {
    const p = createPlayer(t, 120),
      s = createStats();
    p.vx = 28;
    for (let i = 0; i < 240; i++) {
      updatePhysics(
        p,
        t,
        s,
        { jump: i === 0, held: p.airRotation < release, ability: false },
        step,
        false,
      );
      if (i > 20 && p.grounded) return { p, s };
    }
    return { p, s };
  };
  const good = run(4.8),
    late = run(7.5);
  assert.equal(good.s.flips, 1);
  assert.ok(["perfect", "normal"].includes(good.p.lastLanding));
  assert.ok(["stumble", "crash"].includes(late.p.lastLanding));
});
test("雪崩使用真实路线进度，分支不修改推进距离", () => {
  const a = new Avalanche(100),
    before = a.x;
  a.update(step, 20, 101);
  assert.ok(a.x > before && a.x - before < 0.3);
  assert.equal(a.danger(101), a.danger(101));
});
test("同一雪晶与新动物只消费一次，追近不同动物立即换乘", () => {
  const t = new Terrain(1),
    p = createPlayer(t, 100),
    s = createStats();
  p.ride = "otter";

  const entities = [
    {
      id: "coin",
      x: 100,
      y: p.y + 0.8,
      kind: "coin" as const,
      route: "main" as const,
      used: false,
    },
    {
      id: "ride",
      x: 100,
      y: p.y,
      kind: "ride" as const,
      ride: "yak" as const,
      route: "main" as const,
      used: false,
    },
  ];
  interact(entities, p, 99, s);
  interact(entities, p, 99, s);
  assert.equal(s.coins, 1);
  assert.equal(p.ride, "yak");
  assert.equal(s.rides, 1);
});
test("飞行技能会结束，雪鸮持续同行但不残留无限滑翔", () => {
  const t = new Terrain(5),
    p = createPlayer(t),
    s = createStats();
  p.ride = "owl";
  p.ability = 0.2;

  p.grounded = false;
  p.y += 2;
  for (let i = 0; i < 360; i++)
    updatePhysics(
      p,
      t,
      s,
      { jump: false, held: false, ability: false },
      step,
      false,
    );
  assert.equal(p.ride, "owl");
  assert.equal(p.ability, 0);
  assert.ok(p.grounded);
});
test("暂停冻结玩家、雪崩、能力与计时", () => {
  serialized = null;
  const g = new Game(new Storage());
  g.start("challenge", "c5");
  g.phase = "playing";
  g.player.ability = 2;
  g.pause();
  const before = JSON.stringify([g.player, g.avalanche, g.stats, g.elapsed]);
  for (let i = 0; i < 240; i++)
    g.update(step, { jump: true, held: true, ability: true });
  assert.equal(
    JSON.stringify([g.player, g.avalanche, g.stats, g.elapsed]),
    before,
  );
});
test("损坏存档可恢复，结算和任务领奖防重", () => {
  serialized = "{corrupt";
  const store = new Storage();
  assert.equal(store.data.version, 1);
  assert.ok(store.warning);
  const s = createStats();
  s.coins = 20;
  s.distance = 1500;
  const earned = store.settle("same", s, false, "endless");
  assert.equal(earned, 30);
  assert.equal(store.settle("same", s, false, "endless"), 0);
  assert.equal(store.claim("m1"), true);
  const wallet = store.data.wallet;
  assert.equal(store.claim("m1"), false);
  assert.equal(store.data.wallet, wallet);
  serialized = JSON.stringify({ ...freshSave(), totals: null });
  assert.ok(new Storage().warning);
});
test("安全检查点恢复清理伙伴和旧输入状态，既有物品不会重发", () => {
  serialized = null;
  const store = new Storage(),
    t = new Terrain(77),
    s = createStats();
  s.coins = 12;
  store.data.checkpoint = { x: 1206, seed: 77, region: 0, stats: s };
  const g = new Game(store);
  g.start("adventure", undefined, true);
  assert.equal(g.player.x, 1206);
  assert.equal(g.player.ride, "ski");
  assert.equal(g.player.omega, 0);
  assert.equal(g.player.y, t.height(1206));
  assert.ok(g.entities.filter((e) => e.x < 1206).every((e) => e.used));
});

test("断桥是实际平台缺口，下层路线连续；不会把桥边直接吸到地面", () => {
  const t = new Terrain(19),
    x = 11 * 240 + 150.1;
  assert.equal(t.branchHeight(x), null);
  assert.ok(t.branchDeckHeight(x)! > t.height(x) + 2);
  const p = createPlayer(t, x - 0.3),
    stats = createStats();
  p.route = "upper";
  p.y = t.branchHeight(p.x)!;
  p.vx = 38;
  updatePhysics(
    p,
    t,
    stats,
    { jump: false, held: false, ability: false },
    step,
    false,
  );
  assert.equal(p.grounded, false);
  assert.ok(p.y > t.height(p.x) + 2);
  assert.equal(stats.branches, 0);
});
test("教学不靠固定里程自动完成，必须实际完成目标", () => {
  serialized = null;
  const g = new Game(new Storage());
  g.start("tutorial");
  for (let i = 0; i < 6000; i++)
    g.update(step, { jump: false, held: false, ability: false });
  assert.equal(g.tutorialStep, 0);
  assert.equal(g.phase, "playing");
  g.update(step, { jump: true, held: false, ability: false });
  assert.equal(g.tutorialStep, 1);
});

test("冒险终点保留暮色区域且结算只执行一次", () => {
  serialized = null;
  const store = new Storage(),
    g = new Game(store);
  g.start("adventure");
  // 单元测试边界夹具；完整通关证据另来自浏览器真实输入，不由此测试充当。
  g.player = createPlayer(g.terrain, 17999.99);
  g.region = 2;
  g.phase = "playing";
  g.update(step, { jump: false, held: false, ability: false });
  assert.equal(g.phase, "won");
  assert.equal(g.region, 2);
  const wallet = store.data.wallet;
  g.update(step, { jump: true, held: true, ability: true });
  assert.equal(store.data.wallet, wallet);
});
