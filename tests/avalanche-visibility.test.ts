import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import * as THREE from "three";
import {
  avalancheFeedback,
  hasAvalanche,
} from "../src/systems/avalanche-feedback";
import { AvalancheVisual } from "../src/render/avalanche-visual";
import {
  placeScenery,
  sceneryMaterial,
  SCENERY_DEPTH,
  sceneryGroundHeight,
} from "../src/render/scenery";
import { Game } from "../src/core/game";
import { Storage } from "../src/systems/storage";
import { UI } from "../src/ui/ui";
import type { Input } from "../src/systems/input";
import type { Audio } from "../src/systems/audio";
import type { World } from "../src/render/world";

// 此处只渲染应用自己的DOM单元测试，不访问本地服务或浏览器页面。
let saved: string | null = null;
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: () => saved,
    setItem: (_: string, s: string) => {
      saved = s;
    },
  },
});
const idle = { jump: false, held: false, ability: false };

test("正式模式始终启用追逐，远处仍有反馈；越接近越强，终点和菜单关闭", () => {
  for (const mode of ["adventure", "endless", "challenge"] as const) {
    assert.equal(hasAvalanche(mode, 0), true);
    for (const phase of ["intro", "playing", "paused"] as const) {
      const far = avalancheFeedback(mode, 0, phase, 1000);
      const near = avalancheFeedback(mode, 0, phase, 40);
      assert.equal(far.enabled, true);
      assert.ok(far.mist > 0 && far.rumble > 0);
      assert.ok(near.mist > far.mist && near.rumble > far.rumble);
      assert.ok(near.light < far.light);
      assert.equal(near.urgent, true);
    }
    assert.equal(avalancheFeedback(mode, 0, "menu", 50).enabled, false);
    assert.equal(avalancheFeedback(mode, 0, "won", 50).mist, 0);
  }
  assert.equal(hasAvalanche("tutorial", 0), false);
  assert.equal(hasAvalanche("tutorial", 3), true);
});

test("HUD从教学隐藏切到冒险/无尽、重试、暂停继续均显示距离与状态", () => {
  const { document } = parseHTML(
    '<!doctype html><html><body><div id="ui"></div></body></html>',
  );
  Object.defineProperty(globalThis, "document", {
    value: document,
    configurable: true,
  });
  saved = null;
  const g = new Game(new Storage());
  const ui = new UI(
    document.getElementById("ui")! as unknown as HTMLElement,
    g,
    { unlock() {}, event() {} } as unknown as Audio,
    { clear() {} } as unknown as Input,
    {} as World,
  );
  const meter = () => document.getElementById("danger")!;
  g.start("tutorial");
  assert.equal(meter().hidden, true);
  g.tutorialStep = 3;
  ui.update(0.2);
  assert.equal(meter().hidden, false);
  for (const mode of ["adventure", "endless"] as const) {
    g.start(mode);
    assert.equal(meter().hidden, false);
    assert.equal(meter().style.display, "block");
    assert.equal(meter().dataset.chase, "active");
    assert.equal(document.getElementById("hud-gap")!.textContent, "240 米");
    assert.equal(
      document.getElementById("hud-chase-status")!.textContent,
      "身后推进",
    );
    for (let i = 0; i < 310; i++) g.update(1 / 120, idle);
    g.pause();
    assert.equal(document.getElementById("danger"), null);
    g.resume();
    assert.equal(meter().hidden, false);
    g.start(mode); // 重试清理旧教学/暂停状态。
    assert.equal(meter().dataset.chase, "active");
  }
});

test("冒险与无尽的雪崩实际推进、暂停冻结，玩家停滞最终被追上并判负", () => {
  for (const mode of ["adventure", "endless"] as const) {
    saved = null;
    const g = new Game(new Storage());
    g.start(mode);
    for (let i = 0; i < 305; i++) g.update(1 / 120, idle);
    const from = g.avalanche.x;
    for (let i = 0; i < 120; i++) g.update(1 / 120, idle);
    assert.ok(g.avalanche.x > from);
    g.pause();
    const frozen = g.avalanche.x;
    for (let i = 0; i < 120; i++) g.update(1 / 120, idle);
    assert.equal(g.avalanche.x, frozen);
    g.resume();
    // 单元测试制造持续低速，并不通过接口直接设置失败或推进雪崩位置。
    for (let i = 0; i < 120 * 45 && g.phase === "playing"; i++) {
      g.player.vx = 0;
      g.update(1 / 120, idle);
    }
    assert.equal(g.phase, "lost");
    assert.equal(g.reason, "雪浪追上了你");
    assert.ok(g.gap <= 2);
  }
});

test("雪浪实体前沿不超过真实x；雪雾只覆盖左侧18%，不修改追逐坐标", () => {
  const visual = new AvalancheVisual();
  const feedback = avalancheFeedback("adventure", 0, "playing", 240);
  visual.update(feedback, 5, 48, 24);
  visual.front.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(visual.front);
  assert.ok(bounds.max.x <= 0.0001);
  assert.equal(visual.front.position.x, 0);
  assert.equal(visual.mist.scale.x, 48 * 0.18);
  assert.ok(visual.mist.position.x + visual.mist.scale.x / 2 < -48 * 0.3);
  const y = visual.front.children[0].position.y;
  visual.update(feedback, 5, 48, 24);
  assert.equal(visual.front.children[0].position.y, y); // 同模拟时间即暂停。
  visual.update(avalancheFeedback("adventure", 0, "menu", 40), 5, 48, 24);
  assert.equal(visual.front.visible, false);
  assert.equal(visual.mist.visible, false);
});

test("背景装饰统一退后、淡化、禁阴影且不污染真实障碍材质", () => {
  const source = new THREE.MeshStandardMaterial({ color: "#4d6874" });
  const before = source.color.getHexString();
  for (let region = 0; region < 3; region++) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), source);
    mesh.castShadow = true;
    const scenery = placeScenery(mesh, 0, 0, -2, region);
    scenery.updateMatrixWorld(true);
    assert.equal(scenery.position.z, -18);
    assert.ok(new THREE.Box3().setFromObject(scenery).max.z < -12);
    assert.equal(mesh.castShadow, false);
    assert.equal(mesh.receiveShadow, false);
    assert.notEqual(mesh.material, source);
    assert.equal(sceneryMaterial(source, region), mesh.material);
    assert.ok(
      mesh.material.color.getHSL({ h: 0, s: 0, l: 0 }).l >
        source.color.getHSL({ h: 0, s: 0, l: 0 }).l,
    );
  }
  assert.equal(source.color.getHexString(), before);
  for (const depth of Object.values(SCENERY_DEPTH)) assert.ok(depth <= -24);
  assert.equal(sceneryGroundHeight(0, 10, -10), 9.2);
  assert.equal(sceneryGroundHeight(0, 10, -45), 5.5);
  const mid = sceneryGroundHeight(0, 10, -27.5);
  assert.ok(mid > 5.5 && mid < 9.2);
});
