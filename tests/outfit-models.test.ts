import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { parseHTML } from "linkedom";
import { Skier } from "../src/render/models";
import { COSTUME_SLOTS, createCostume } from "../src/render/skier-appearance";
import { inspectionFactory, visibleMetrics } from "../scripts/model-inspection";
import { OUTFITS } from "../src/data/config";
import { createPlayer } from "../src/systems/physics";
import { Terrain } from "../src/systems/terrain";
import { enterRide, ANIMALS, boardPassenger } from "../src/systems/passengers";
import { Storage, freshSave } from "../src/systems/storage";
import { Game } from "../src/core/game";
import { UI } from "../src/ui/ui";
import type { World } from "../src/render/world";
import type { Audio } from "../src/systems/audio";
import type { Input } from "../src/systems/input";
import type { Ride } from "../src/core/types";

const factory = inspectionFactory();
function meshes(root: THREE.Object3D) {
  const result: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) result.push(o);
  });
  return result;
}
/** 哈希只读顶点及变换，不含颜色；证明服装各部位确实有独立形体。 */
function shapeHash(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const hash = createHash("sha256");
  for (const mesh of meshes(root)) {
    hash.update(JSON.stringify(mesh.matrixWorld.elements));
    hash.update(
      Buffer.from(mesh.geometry.getAttribute("position").array.buffer),
    );
  }
  return hash.digest("hex");
}

test("四套外观的帽子、衣身和衣物轮廓各不相同，改变几何而非仅换色", () => {
  const costumes = OUTFITS.map((o) => createCostume(o.id, factory));
  for (const slot of ["head", "body", "armL", "legL", "shinL"] as const) {
    const hashes = costumes.map((c) => shapeHash(c.parts[slot]));
    if (slot === "head" || slot === "body")
      assert.equal(new Set(hashes).size, 4, slot);
    else assert.ok(new Set(hashes).size >= 2, slot);
  }
  assert.equal(costumes[2].tails.length, 2);
  assert.ok(
    costumes.filter((_, i) => i !== 2).every((c) => c.tails.length === 0),
  );
});

test("衣物实例共享缓冲和材质，但围巾、衣摆、关节变换互相独立", () => {
  for (const outfit of OUTFITS) {
    const a = createCostume(outfit.id, factory),
      b = createCostume(outfit.id, factory);
    for (const slot of COSTUME_SLOTS) {
      assert.notEqual(a.parts[slot], b.parts[slot]);
      const ma = meshes(a.parts[slot]),
        mb = meshes(b.parts[slot]);
      assert.equal(ma.length, mb.length);
      ma.forEach((m, i) => {
        assert.equal(m.geometry, mb[i].geometry);
        assert.equal(m.material, mb[i].material);
      });
    }
    a.scarf.rotation.z = 1;
    assert.equal(Math.abs(b.scarf.rotation.z), 0);
    a.tails.forEach((t) => (t.rotation.z = 1));
    assert.ok(b.tails.every((t) => t.rotation.z === 0));
  }
});

test("连续衣身朝外且正面可见，不依赖双面材质掩盖反向三角形", () => {
  for (const outfit of OUTFITS) {
    const costume = createCostume(outfit.id, factory);
    costume.parts.body.updateMatrixWorld(true);
    const shell = meshes(costume.parts.body).find(
      (m) =>
        (m.material as THREE.MeshStandardMaterial).color.getHexString() ===
        outfit.color.slice(1),
    )!;
    assert.ok(shell);
    assert.equal(
      (shell.material as THREE.MeshStandardMaterial).side,
      THREE.FrontSide,
    );
    for (const sign of [-1, 1]) {
      const ray = new THREE.Raycaster(
        new THREE.Vector3(sign * 2, 0.28, 0.08),
        new THREE.Vector3(-sign, 0, 0),
      );
      const hit = ray.intersectObject(shell)[0];
      assert.ok(hit, `${outfit.id} front/back surface`);
      assert.ok(hit.face!.normal.x * sign > 0);
    }
  }
});

test("连续切换200次不残留衣物，不重建载具乘客，换回初始外观后形体与材质完全恢复", () => {
  const model = new Skier("sunrise", "wood", factory);
  const initial = shapeHash(model.rig.root),
    rides = [...model.rides.values()],
    passengers = model.passengers;
  const materials = meshes(model.rig.root).map((m) =>
    (m.material as THREE.MeshStandardMaterial).color.getHex(),
  );
  for (let i = 0; i < 200; i++) {
    const id = OUTFITS[i % 4].id;
    model.setStyle(id, i % 2 ? "ice" : "wood");
    for (const key of COSTUME_SLOTS)
      assert.equal(
        model.rig[key].children.filter((c) => c.name === `costume-${key}`)
          .length,
        1,
      );
    assert.equal(
      model.body.children.filter((c) => c.name === "costume-scarf").length,
      1,
    );
  }
  model.setStyle("sunrise", "wood");
  assert.equal(shapeHash(model.rig.root), initial);
  assert.deepEqual(
    meshes(model.rig.root).map((m) =>
      (m.material as THREE.MeshStandardMaterial).color.getHex(),
    ),
    materials,
  );
  assert.deepEqual([...model.rides.values()], rides);
  assert.equal(model.passengers, passengers);
  model.setStyle("invalid-id", "invalid-id");
  assert.equal(model.outfit, "sunrise");
  assert.equal(model.ski, "wood");
});

test("四套服装沿用原肢段/身高，全部骑乘、能力、空翻与落地姿态保持有限值且不修改物理状态", () => {
  for (const outfit of OUTFITS) {
    const model = new Skier(outfit.id, "wood", factory);
    assert.equal(model.head.position.y, 0.83);
    assert.equal(model.foreL.position.y, -0.44);
    assert.equal(model.shinL.position.y, -0.47);
    for (const ride of [
      "ski",
      "otter",
      "yak",
      "owl",
      "bike",
      "sail",
    ] as Ride[]) {
      const p = createPlayer(new Terrain(52));
      if (ride !== "ski") enterRide(p, ride);
      if (ride === "bike" || ride === "sail")
        for (const a of ANIMALS) boardPassenger(p, a);
      for (const pose of [
        "ground",
        "jump",
        "flip",
        "landing",
        "stumble",
        "ability",
        "recovery",
        "fall",
        "won",
      ]) {
        p.grounded = !["jump", "flip", "recovery"].includes(pose);
        p.vx = 40;
        p.airTime = 0.3;
        p.omega = pose === "flip" ? 8.8 : 0;
        p.ability = pose === "ability" ? 1.5 : 0;
        p.sailDescent = pose === "recovery" && ride === "sail" ? 2 : 0;
        p.landingAge = ["landing", "stumble"].includes(pose) ? 0.12 : 9;
        p.lastLanding = pose === "stumble" ? "stumble" : "perfect";
        p.fall = pose === "fall" ? 1 : 0;
        const before = JSON.stringify(p);
        model.animate(p, 2.1, pose === "won");
        model.root.updateMatrixWorld(true);
        assert.equal(JSON.stringify(p), before);
        model.root.traverseVisible((o) =>
          assert.ok(
            o.matrixWorld.elements.every(Number.isFinite),
            `${outfit.id}:${ride}:${pose}:${o.name}`,
          ),
        );
        for (const pole of model.rig.poles)
          assert.equal(pole.visible, ride === "ski");
        // 手套与衣袖始终可见，不再用子节点索引批量隐藏细节。
        for (const fore of [model.foreL, model.foreR])
          assert.equal(fore.getObjectByName("traveler-glove")!.visible, true);
        const scarf = model.body.getObjectByName("costume-scarf")!;
        const snapshot = [...scarf.matrix.elements];
        model.animate(p, 2.1, pose === "won");
        model.root.updateMatrixWorld(true);
        assert.deepEqual(
          scarf.matrix.elements,
          snapshot,
          "相同模拟时间不会累积衣物变换",
        );
        assert.deepEqual(model.root.scale.toArray(), [1, 1, 1]);
      }
    }
    const p = createPlayer(new Terrain(52));
    model.animate(p, 0);
    const metrics = visibleMetrics(model.root);
    assert.ok(metrics.meshes <= 80, JSON.stringify(metrics));
    assert.ok(metrics.triangles < 23000, JSON.stringify(metrics));
  }
});

test("商店读取原存档记录，试览不扣费不解锁，已购装备不重复收费，购买仍用原价格", () => {
  const save = freshSave();
  save.wallet = 500;
  save.outfits = ["sunrise", "forest", "glacier"];
  save.outfit = "glacier";
  save.skis = ["wood", "ice"];
  save.ski = "ice";
  let raw = JSON.stringify(save);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => raw,
      setItem: (_: string, value: string) => {
        raw = value;
      },
    },
  });
  const { document } = parseHTML(
    '<html><body><div id="ui"></div></body></html>',
  );
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: document,
  });
  const storage = new Storage(),
    g = new Game(storage),
    world = {} as World;
  assert.deepEqual(storage.data, save);
  const ui = new UI(
    document.getElementById("ui")! as unknown as HTMLElement,
    g,
    { unlock() {}, event() {} } as unknown as Audio,
    { clear() {} } as unknown as Input,
    world,
  );
  const controls = ui as unknown as {
    action(action: string, id?: string): void;
  };
  controls.action("page", "closet");
  assert.equal(world.previewOutfit, "glacier");
  const before = JSON.stringify(storage.data);
  controls.action("preview", "dusk");
  assert.equal(world.previewOutfit, "dusk");
  assert.equal(JSON.stringify(storage.data), before);
  controls.action("buy", "forest");
  assert.equal(storage.data.wallet, 500);
  assert.equal(storage.data.outfit, "forest");
  controls.action("buy", "dusk");
  assert.equal(storage.data.wallet, 180);
  assert.deepEqual(storage.data.outfits, [
    "sunrise",
    "forest",
    "glacier",
    "dusk",
  ]);
  controls.action("buy", "dusk");
  assert.equal(storage.data.wallet, 180);
  assert.equal(new Storage().data.outfit, "dusk");
  assert.deepEqual(new Storage().data.skis, ["wood", "ice"]);
  assert.equal(new Storage().data.ski, "ice");
});
