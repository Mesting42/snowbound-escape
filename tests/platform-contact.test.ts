import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Terrain,
  MODULE,
  BRANCH_START,
  BRANCH_END,
  BRANCH_THICKNESS,
} from "../src/systems/terrain";
import {
  RIDER_CLEARANCE,
  sweepPlatformCeiling,
} from "../src/systems/platform-contact";
import { createPlayer, updatePhysics } from "../src/systems/physics";
import { createStats } from "../src/systems/score";
import type { Ride } from "../src/core/types";

const step = 1 / 120,
  idle = { jump: false, held: false, ability: false };
const rides: Ride[] = ["ski", "otter", "yak", "owl", "bike", "sail"];

test("所有骑乘在连接坡道入口无需跳跃自动接入，接触高度连续", () => {
  const entry = MODULE + BRANCH_START;
  for (const seed of [1, 19, 52, 135, 71829])
    for (const ride of rides)
      for (const speed of [8, 22, 38]) {
        const t = new Terrain(seed),
          p = createPlayer(t, entry - 0.08),
          s = createStats();
        p.ride = ride;

        p.vx = speed;
        let entered = false;
        for (let i = 0; i < 100 && p.x < entry + 3; i++) {
          const oldY = p.y;
          updatePhysics(p, t, s, idle, step, false);
          if (p.route === "upper") {
            entered = true;
            assert.ok(Math.abs(p.y - t.branchHeight(p.x)!) < 1e-8);
            assert.ok(
              Math.abs(p.y - oldY) < 0.18,
              `入口瞬移 seed=${seed}, ride=${ride}`,
            );
          }
        }
        assert.ok(
          entered,
          `未自动接入 seed=${seed}, ride=${ride}, speed=${speed}`,
        );
        assert.equal(s.jumps, 0);
        assert.equal(s.crashes, 0);
      }
});

test("平台中段下方起跳撞台底后回落，不穿到顶面，不额外计摔倒", () => {
  const start = 3 * MODULE + 125;
  for (const ride of rides) {
    const t = new Terrain(52),
      p = createPlayer(t, start),
      s = createStats();
    p.ride = ride;

    p.vx = 18;
    p.protection = 0;
    let stopped = false;
    for (let i = 0; i < 110; i++) {
      const oldVy = p.vy;
      updatePhysics(p, t, s, { ...idle, jump: i === 0 }, step, false);
      const upper = t.branchHeight(p.x)!;
      assert.equal(p.route, "main", `${ride}从下面接入了台面`);
      assert.ok(p.y < upper - BRANCH_THICKNESS, `${ride}足点穿过台底`);
      if (oldVy > 1 && p.vy <= 0 && !p.grounded) stopped = true;
      if (
        upper - BRANCH_THICKNESS >
        t.height(p.x) + RIDER_CLEARANCE[ride] + 0.02
      )
        assert.ok(
          p.y + RIDER_CLEARANCE[ride] <= upper - BRANCH_THICKNESS + 1e-6,
        );
    }
    assert.ok(stopped, `${ride}没有停止上升`);
    assert.equal(s.crashes, 0);
    assert.equal(p.fall, 0);
    assert.equal(s.branches, 0);
    assert.equal(s.flips, 0);
  }
});

test("高速上升和空翻也不能穿过实体台底，碰头清理未落地旋转", () => {
  const t = new Terrain(19),
    p = createPlayer(t, MODULE + 125),
    s = createStats();
  p.grounded = false;
  p.vy = 80;
  p.vx = 38;
  p.airRotation = 7;
  p.omega = 8;
  updatePhysics(p, t, s, { ...idle, held: true }, 0.1, false);
  assert.equal(p.route, "main");
  assert.ok(p.vy <= 0);
  assert.ok(
    p.y + RIDER_CLEARANCE.ski < t.branchHeight(p.x)! - BRANCH_THICKNESS,
  );
  assert.equal(p.airRotation, 0);
  assert.equal(p.omega, 0);
  assert.equal(s.crashes, 0);
});

test("从上方落到平台仍正常结算，不被台底误挡", () => {
  const t = new Terrain(19),
    p = createPlayer(t, MODULE + 125),
    s = createStats();
  p.y = t.branchHeight(p.x)! + 0.05;
  p.angle = Math.atan(t.surface(p.x, "upper").slope);
  p.grounded = false;
  p.vy = -5;
  p.vx = 18;
  for (let i = 0; i < 30 && !p.grounded; i++)
    updatePhysics(p, t, s, idle, step, false);
  assert.equal(p.grounded, true);
  assert.equal(p.route, "upper");
  assert.ok(Math.abs(p.y - t.branchHeight(p.x)!) < 1e-8);
  assert.equal(s.crashes, 0);
});

test("真实断桥没有隐形台底，平台中段没有从主路自动吸附入口", () => {
  const t = new Terrain(19),
    x = 11 * MODULE + 153,
    y = t.height(x);
  assert.equal(
    sweepPlatformCeiling(
      t,
      { x, y },
      { x: x + 0.1, y: y + 8 },
      RIDER_CLEARANCE.ski,
    ),
    null,
  );
  assert.equal(t.crossesBranchEntry(MODULE + 120, MODULE + 121), false);
  assert.equal(t.crossesBranchEntry(MODULE + 83.9, MODULE + 84.1), true);
  assert.equal(t.crossesBranchEntry(83.9, 84.1), false);
});

test("不跳跃也能完整滑入再汇合，分支奖励只结算一次", () => {
  for (const seed of [1, 19, 52, 135])
    for (const ride of rides) {
      const t = new Terrain(seed),
        p = createPlayer(t, MODULE + BRANCH_START - 0.1),
        s = createStats();
      p.ride = ride;

      p.vx = 18;
      for (let i = 0; i < 1600 && p.x < MODULE + BRANCH_END + 5; i++)
        updatePhysics(p, t, s, idle, step, false);
      assert.equal(p.route, "main", `${seed}/${ride}未汇合`);
      assert.equal(s.branches, 1, `${seed}/${ride}分支结算次数不对`);
      assert.equal(s.jumps, 0);
      assert.equal(s.crashes, 0);
    }
});
