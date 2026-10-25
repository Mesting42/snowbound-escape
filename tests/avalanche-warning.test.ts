import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { readFileSync } from "node:fs";
import { avalancheWarning } from "../src/systems/avalanche-warning";
import { Game } from "../src/core/game";
import { Storage } from "../src/systems/storage";
import { UI } from "../src/ui/ui";
import type { Audio } from "../src/systems/audio";
import type { Input } from "../src/systems/input";
import type { World } from "../src/render/world";

Object.defineProperty(globalThis, "localStorage", {
  value: { getItem: () => null, setItem: () => {} },
});

test("正式模式远处常驻静止红标，200/100/50m连续增强并在近处封顶", () => {
  for (const mode of ["adventure", "endless", "challenge"] as const) {
    let previous = 1;
    for (const gap of [10000, 240, 200, 199.9, 150, 100, 75, 50, 25, 0, -20]) {
      const state = avalancheWarning(mode, 0, "playing", gap);
      assert.ok(state.enabled);
      assert.ok(state.scale >= previous && state.scale <= 1.75);
      assert.ok(state.tilt >= 0 && state.tilt <= 9);
      assert.ok(state.sway >= 0 && state.sway <= 1.25);
      assert.ok(state.period >= 0.55 && state.period <= 1.2);
      assert.equal(state.moving, gap < 200);
      previous = state.scale;
    }
    assert.equal(avalancheWarning(mode, 0, "playing", 100).level, "near");
    assert.equal(avalancheWarning(mode, 0, "playing", 50).level, "critical");
    assert.equal(avalancheWarning(mode, 0, "playing", 240).scale, 1);
    assert.ok(avalancheWarning(mode, 0, "playing", 199.99).scale < 1.00001);
  }
});

test("暂停及开场不推进晃动，非追逐教学/菜单/结算关闭；恢复重新按真实距离决定", () => {
  const playing = avalancheWarning("adventure", 0, "playing", 30);
  for (const phase of ["intro", "paused"] as const) {
    const stopped = avalancheWarning("adventure", 0, phase, 30);
    assert.ok(stopped.enabled);
    assert.equal(stopped.moving, false);
    assert.equal(stopped.scale, playing.scale);
  }
  for (const phase of ["menu", "won", "lost"] as const)
    assert.equal(avalancheWarning("adventure", 0, phase, 30).enabled, false);
  assert.equal(avalancheWarning("tutorial", 0, "playing", 30).enabled, false);
  assert.equal(avalancheWarning("tutorial", 3, "playing", 30).moving, true);
  assert.equal(avalancheWarning("adventure", 0, "playing", 400).moving, false);
});

test("最大摆动和缩放仍留在预留方框内，桌面/窄横屏都不会因图标放大挤动文字", () => {
  const max = avalancheWarning("adventure", 0, "playing", 0);
  for (const [icon, reserved] of [
    [24, 56],
    [22, 50],
  ]) {
    const angle = (max.tilt * Math.PI) / 180;
    const envelope =
      icon * max.scale * (Math.cos(angle) + Math.sin(angle)) +
      max.sway * max.scale * 2;
    assert.ok(envelope < reserved, `${icon}px警告超出${reserved}px保留空间`);
  }
  const css = readFileSync(
    new URL("../src/style.css", import.meta.url),
    "utf8",
  );
  assert.match(css, /\.warning-scale\s*\{[^}]*transition:\s*transform/s);
  assert.match(
    css,
    /prefers-reduced-motion: reduce[\s\S]*\.warning-wobble\s*\{\s*animation:\s*none !important/s,
  );
});

test("正式HUD在远/近/远、教学切模式、暂停继续和重开时恢复正确警告，无额外按钮", () => {
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
  const warning = () => document.getElementById("hud-warning")!;
  g.start("tutorial");
  assert.equal(warning().hidden, true);
  for (const mode of ["adventure", "endless", "challenge"] as const) {
    g.start(mode, "c1");
    g.phase = "playing";
    for (const gap of [400, 150, 75, 25, 400]) {
      g.avalanche.x = g.player.x - gap;
      ui.update(0.2);
      assert.equal(warning().hidden, false);
      assert.equal(warning().classList.contains("approaching"), gap < 200);
      assert.equal(
        warning().style.getPropertyValue("--warning-play-state"),
        gap < 200 ? "running" : "paused",
      );
      assert.match(
        warning().getAttribute("aria-label")!,
        new RegExp(`${gap}米`),
      );
      assert.equal(warning().querySelector("button"), null);
      assert.equal(warning().closest(".hud-left") !== null, true);
    }
    g.avalanche.x = g.player.x - 30;
    ui.update(0.2);
    g.pause();
    assert.equal(document.getElementById("hud-warning"), null);
    g.resume();
    assert.equal(warning().dataset.level, "critical");
    assert.equal(
      warning().style.getPropertyValue("--warning-play-state"),
      "running",
    );
    g.start(mode, "c1");
    assert.equal(warning().dataset.level, "far");
    assert.equal(warning().style.getPropertyValue("--warning-scale"), "1.0000");
  }
});
