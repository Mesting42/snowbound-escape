import { test } from "node:test";
import assert from "node:assert/strict";
import { RenderQuality } from "../src/render/quality";
import { PoseSampler } from "../src/render/sampling";

test("普通桌面也有超采样；流畅模式不再低于原生CSS像素", () => {
  const q = new RenderQuality();
  q.configure("auto", 1280, 720);
  assert.equal(q.pixelRatio, 1.5);
  q.configure("low", 1280, 720);
  assert.equal(q.pixelRatio, 1);
  assert.equal(q.shadows, false);
  q.configure("high", 1280, 720);
  assert.equal(q.pixelRatio, 2);
});

test("低帧率先降低背景效果，再降低采样且保留原生分辨率", () => {
  const q = new RenderQuality();
  q.configure("auto", 1280, 720);
  q.observe(56);
  assert.equal(q.pixelRatio, 1.5);
  assert.equal(q.shadows, false);
  assert.equal(q.particleCount, 90);
  q.observe(56);
  assert.ok(q.pixelRatio < 1.5);
  for (let i = 0; i < 30; i++) q.observe(30);
  assert.equal(q.pixelRatio, 1);
});

test("画质恢复需要连续余量，大屏限制额外采样的像素预算", () => {
  const q = new RenderQuality();
  q.configure("auto", 1280, 720);
  q.observe(50);
  q.observe(50);
  const reduced = q.pixelRatio;
  q.observe(165);
  assert.equal(q.pixelRatio, reduced);
  q.observe(65); // 中断连续恢复窗口。
  for (let i = 0; i < 3; i++) q.observe(165);
  assert.equal(q.pixelRatio, reduced);
  q.observe(165);
  assert.ok(q.pixelRatio > reduced);
  q.configure("auto", 3840, 2160);
  assert.equal(q.pixelRatio, 1);
});

test("高刷新呈现插值平滑相邻物理样本，且不改写物理姿态", () => {
  const sampler = new PoseSampler();
  sampler.capture({ x: 100, y: 5, angle: 0 });
  const current = { x: 100.3, y: 5.1, angle: 0.1 };
  const copy = { ...current };
  const view = sampler.sample(current, 0.5, true);
  assert.equal(view.x, 100.15);
  assert.equal(view.y, 5.05);
  assert.ok(Math.abs(view.angle - 0.05) < 1e-10);
  assert.deepEqual(current, copy);
});

test("教学重练、暂停和角度归一化不会插值出飞移或整圈旋转", () => {
  const sampler = new PoseSampler();
  sampler.capture({ x: 650, y: -45, angle: Math.PI - 0.01 });
  assert.equal(sampler.sample({ x: 8, y: 0, angle: 0 }, 0.5, true).x, 8);
  sampler.capture({ x: 10, y: 0, angle: Math.PI - 0.01 });
  const current = { x: 10.2, y: 0, angle: -Math.PI + 0.01 };
  assert.ok(
    Math.abs(sampler.sample(current, 0.5, true).angle - Math.PI) < 1e-10,
  );
  assert.equal(sampler.sample(current, 0.2, false).x, current.x);
});

test("60至240Hz显示在120Hz模拟之间呈现连续高速轨迹", () => {
  const step = 1 / 120;
  for (const refresh of [60, 90, 165, 240]) {
    const sampler = new PoseSampler();
    const player = { x: 0, y: 0, angle: 0 };
    let accumulator = 0;
    for (let frame = 1; frame <= refresh * 3; frame++) {
      accumulator += 1 / refresh;
      while (accumulator >= step) {
        sampler.capture(player);
        player.x += 38 * step;
        accumulator -= step;
      }
      const shown = sampler.sample(player, accumulator / step, true);
      if (frame / refresh > step)
        assert.ok(Math.abs(shown.x - 38 * (frame / refresh - step)) < 1e-8);
    }
  }
});
