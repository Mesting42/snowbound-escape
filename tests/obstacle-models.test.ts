import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import type { Entity, ObstacleKind, Ride } from "../src/core/types";
import { canBreakObstacle } from "../src/systems/obstacle-rules";
import {
  makeObstacle,
  OBSTACLE_COLORS,
  updateObstacleAppearance,
} from "../src/render/obstacle-models";
import { interact } from "../src/systems/obstacles";
import { Terrain } from "../src/systems/terrain";
import { createPlayer } from "../src/systems/physics";
import { createStats } from "../src/systems/score";

test("实体颜色和实际破障共享规则：只有牦牛/机车能撞开主路木障", () => {
  for (const kind of [
    "rock",
    "log",
    "fence",
    "ice",
    "arch",
    "bridge",
    "fall",
  ] as ObstacleKind[]) {
    for (const ride of [
      "ski",
      "otter",
      "yak",
      "owl",
      "bike",
      "sail",
    ] as Ride[]) {
      const allowed =
        ["log", "fence", "bridge"].includes(kind) &&
        ["yak", "bike"].includes(ride);
      assert.equal(canBreakObstacle(kind, ride), allowed);
      const t = new Terrain(52),
        p = createPlayer(t, 100),
        s = createStats();
      p.ride = ride;
      p.protection = 0; // 关闭出发保护，实际验证碰撞而不是初始免伤。
      const e: Entity = {
        id: "test",
        kind: "obstacle",
        obstacle: kind,
        x: 100,
        y: p.y,
        route: "main",
        used: false,
      };
      interact([e], p, 99, s);
      if (allowed) {
        assert.equal(p.ride, ride);
        assert.equal(s.score, 65);
      } else if (kind === "arch") {
        assert.equal(p.ride, ride);
        assert.equal(e.used, false);
      } else if (ride === "ski") assert.equal(s.crashes, 1);
      else {
        assert.equal(p.ride, "ski");
        assert.equal(s.score, 0);
      }
    }
  }
});

test("木障变色可逆且复用几何，石块和真正缺口绝不显示可破坏色", () => {
  for (const kind of ["log", "fence", "bridge"] as const) {
    const e = { obstacle: kind, route: "main" as const },
      g = makeObstacle(e);
    const edges = g.userData.breakEdges as THREE.Mesh[];
    const ids = edges.map((m) => m.geometry.uuid);
    assert.ok(edges.length > 0);
    updateObstacleAppearance(g, e, "yak", 0);
    assert.equal(g.userData.canBreak, true);
    for (const m of edges)
      assert.equal(
        `#${(m.material as THREE.MeshStandardMaterial).color.getHexString()}`,
        OBSTACLE_COLORS.breakEdge,
      );
    updateObstacleAppearance(g, e, "owl", 0);
    assert.equal(g.userData.canBreak, false);
    assert.deepEqual(
      edges.map((m) => m.geometry.uuid),
      ids,
    );
    for (const m of edges)
      assert.equal(
        `#${(m.material as THREE.MeshStandardMaterial).color.getHexString()}`,
        OBSTACLE_COLORS.jumpEdge,
      );
  }
  for (const e of [
    { obstacle: "rock" as const, route: "main" as const },
    { obstacle: "bridge" as const, route: "upper" as const },
  ]) {
    const g = makeObstacle(e);
    updateObstacleAppearance(g, e, "bike", 0);
    assert.equal(g.userData.canBreak, false);
  }
});

test("拱门真实几何留出入口，地面通过而腾空仍按原规则碰撞", () => {
  const g = makeObstacle({ obstacle: "arch", route: "main" });
  g.updateMatrixWorld(true);
  const ray = (x: number, y: number) =>
    new THREE.Raycaster(
      new THREE.Vector3(x, y, 8),
      new THREE.Vector3(0, 0, -1),
    ).intersectObject(g, true);
  assert.equal(ray(0, 1.3).length, 0);
  assert.ok(ray(3.2, 1.3).length > 0);
  assert.ok(ray(0, 3.13).length > 0);
  const p = createPlayer(new Terrain(52), 100),
    s = createStats();
  const ground = p.y;
  p.protection = 0;
  p.y += 1;
  interact(
    [
      {
        id: "arch",
        kind: "obstacle",
        obstacle: "arch",
        route: "main",
        x: 100,
        y: ground,
        used: false,
      },
    ],
    p,
    99,
    s,
  );
  assert.equal(s.crashes, 1);
});

test("上层断桥模型不覆盖六米缺口，落冰只移动已标记的冰块", () => {
  const gap = makeObstacle({ obstacle: "bridge", route: "upper" });
  gap.updateMatrixWorld(true);
  assert.equal(
    new THREE.Raycaster(
      new THREE.Vector3(3, 0.1, 8),
      new THREE.Vector3(0, 0, -1),
    ).intersectObject(gap, true).length,
    0,
  );
  const e = { obstacle: "fall" as const, route: "main" as const },
    g = makeObstacle(e);
  const shelf = g.getObjectByName("fall-rear-shelf")!;
  const shelfY = shelf.position.y;
  updateObstacleAppearance(g, e, "ski", 0.1);
  const positions = (g.userData.fallingPieces as THREE.Mesh[]).map(
    (m) => m.position.y,
  );
  updateObstacleAppearance(g, e, "ski", 0.1);
  assert.deepEqual(
    (g.userData.fallingPieces as THREE.Mesh[]).map((m) => m.position.y),
    positions,
  );
  assert.equal(shelf.position.y, shelfY);
});
