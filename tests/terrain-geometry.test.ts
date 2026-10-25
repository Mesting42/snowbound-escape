import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Terrain } from "../src/systems/terrain";
import {
  makeTerrainGeometry,
  SNOW_BODY_DEPTH,
} from "../src/render/terrain-geometry";

const snowMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

test("主雪道侧壁延伸到256米，顶面高度不变且不增加三角形数量", () => {
  const t = new Terrain(52),
    g = makeTerrainGeometry(t, 480, 120);
  const p = g.getAttribute("position"),
    n = g.getAttribute("normal");
  assert.equal(g.index!.count, 120 * 4 * 6);
  assert.equal(p.count, 121 * 6);
  for (let i = 0; i <= 120; i++) {
    assert.ok(Math.abs(p.getY(i * 6 + 2) - t.height(480 + i)) < 1e-4);
    assert.ok(
      Math.abs(p.getY(i * 6 + 5) - t.height(480 + i) + SNOW_BODY_DEPTH) < 1e-4,
    );
    // 顶面与深侧壁使用分离法线，不让巨大侧面改变滑行雪面的朝向。
    assert.ok(n.getY(i * 6 + 3) > 0.7);
    assert.ok(Math.abs(n.getZ(i * 6 + 4)) > 0.9);
  }
});

test("相邻路段的积雪侧壁及UV接缝连续，局部原点变换不产生底部裂缝", () => {
  const t = new Terrain(135);
  for (const origin of [0, 480, 12000]) {
    const start = origin + 120;
    const a = makeTerrainGeometry(t, start, 120, origin, t.height(origin));
    const b = makeTerrainGeometry(
      t,
      start + 120,
      120,
      origin,
      t.height(origin),
    );
    for (const name of ["position", "uv"] as const) {
      const x = a.getAttribute(name),
        y = b.getAttribute(name);
      for (let j = 0; j < 6; j++) {
        assert.equal(x.getX(120 * 6 + j), y.getX(j));
        assert.equal(x.getY(120 * 6 + j), y.getY(j));
        if (name === "position") assert.equal(x.getZ(120 * 6 + j), y.getZ(j));
      }
    }
    a.dispose();
    b.dispose();
  }
});

test("桌面/手机/高窗口的下半视野射线被连续山体覆盖，不再穿透到远山", () => {
  for (const seed of [52, 3559244]) {
    const t = new Terrain(seed);
    for (const playerX of [500, 6500, 12500]) {
      const group = new THREE.Group();
      const n = Math.floor(playerX / 120);
      for (let k = n - 1; k <= n + 2; k++)
        group.add(
          new THREE.Mesh(makeTerrainGeometry(t, k * 120, 120), snowMaterial),
        );
      group.updateMatrixWorld(true);
      for (const [w, h] of [
        [1440, 900],
        [844, 390],
        [1024, 768],
        [390, 844],
      ]) {
        const aspect = w / h,
          size = Math.max(27.5, 48 / aspect);
        for (const air of [0, 5]) {
          const viewX = playerX + 10,
            viewY = t.height(playerX) + 4 + air;
          const camera = new THREE.OrthographicCamera(
            (-size * aspect) / 2,
            (size * aspect) / 2,
            size / 2,
            -size / 2,
            0.1,
            300,
          );
          camera.position.set(viewX, viewY + 6, 38);
          camera.lookAt(viewX + 1, viewY, 0);
          camera.updateMatrixWorld(true);
          for (const y of [-0.8, -0.98])
            for (const x of [-0.97, -0.5, 0, 0.5, 0.97]) {
              const ray = new THREE.Raycaster();
              ray.setFromCamera(new THREE.Vector2(x, y), camera);
              assert.ok(
                ray.intersectObject(group, true).length > 0,
                `下方缺口: seed=${seed}, x=${playerX}, viewport=${w}x${h}, air=${air}, ndc=${x},${y}`,
              );
            }
        }
      }
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    }
  }
});

test("加深仅作用于主山体，上层断桥依然真实挖空且主路连续", () => {
  const t = new Terrain(52),
    base = 11 * 240,
    x = base + 153;
  const upperGeometry = makeTerrainGeometry(t, base + 84, 106, 0, 0, true);
  const upper = new THREE.Mesh(upperGeometry, snowMaterial);
  upper.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(
    new THREE.Vector3(x, t.height(x) + 50, 0),
    new THREE.Vector3(0, -1, 0),
  );
  assert.equal(ray.intersectObject(upper).length, 0);
  const main = new THREE.Mesh(
    makeTerrainGeometry(t, base + 120, 120),
    snowMaterial,
  );
  main.updateMatrixWorld(true);
  assert.ok(ray.intersectObject(main).length > 0);
  const p = upperGeometry.getAttribute("position");
  for (let i = 0; i < p.count; i += 5)
    assert.ok(Math.abs(p.getY(i + 3) - p.getY(i + 4) - 0.45) < 1e-4);
});
