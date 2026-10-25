/** 四套正式人物模型离线检查；不访问浏览器，不代表 WebGL 实拍或 FPS 验收。 */
import * as THREE from "three";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { Skier } from "../src/render/models";
import { OUTFITS } from "../src/data/config";
import { createPlayer } from "../src/systems/physics";
import { Terrain } from "../src/systems/terrain";
import { enterRide } from "../src/systems/passengers";
import {
  inspectionFactory,
  projectModel,
  visibleMetrics,
} from "./model-inspection";

const factory = inspectionFactory(),
  rows: string[] = [],
  metrics: object[] = [];
const width = 344,
  height = 306;
const modes = ["side", "front", "back", "ride"] as const;
const labels = ["滑行侧面", "正面与关节", "背面行囊", "骑乘姿态"];
for (const [column, outfit] of OUTFITS.entries()) {
  const model = new Skier(outfit.id, "wood", factory),
    p = createPlayer(new Terrain(52));
  p.grounded = true;
  p.vx = 28;
  for (const [row, mode] of modes.entries()) {
    if (mode === "ride") enterRide(p, column % 2 ? "sail" : "bike");
    model.animate(p, 1.15);
    if (mode === "front" || mode === "back")
      for (const pole of model.rig.poles) pole.visible = false;
    const span = mode === "ride" ? 5.5 : 3.35;
    const camera = new THREE.OrthographicCamera(
      -span / 2,
      span / 2,
      (span * height) / width / 2,
      (-span * height) / width / 2,
      0.1,
      100,
    );
    const target =
      mode === "ride"
        ? new THREE.Vector3(-0.35, 1.6, 0)
        : new THREE.Vector3(-0.07, 1.28, 0);
    const offset =
      mode === "front"
        ? new THREE.Vector3(14, 3.5, 11)
        : mode === "back"
          ? new THREE.Vector3(-13, 3, 10)
          : new THREE.Vector3(0, 2.5, 22);
    camera.position.copy(target).add(offset);
    camera.lookAt(target);
    const projection = projectModel(model.root, camera, width, height);
    rows.push(
      `<g transform="translate(${24 + column * 356} ${145 + row * 335})"><rect width="${width}" height="327" rx="14" fill="${row % 2 ? "#e2eeea" : "#f2f1e6"}"/><text x="16" y="26" font-size="15" fill="#4a6a6d">${labels[row]}</text><g transform="translate(0 20)">${projection}</g></g>`,
    );
    metrics.push({
      outfit: outfit.id,
      pose: mode,
      ...visibleMetrics(model.root),
      rootScale: model.root.scale.toArray(),
      source: "offline-geometry-only",
    });
  }
  rows.push(
    `<text x="${24 + column * 356}" y="105" font-size="24" font-weight="700">${outfit.name}</text><text x="${24 + column * 356}" y="128" font-size="13" fill="#4a6a6d">${outfit.detail}</text>`,
  );
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1460" height="1510"><rect width="100%" height="100%" fill="#bedbd7"/><g font-family="Microsoft YaHei,sans-serif" fill="#173f49"><text x="24" y="40" font-size="29" font-weight="700">雪境疾行 · 四套旅行者模型</text><text x="24" y="67" font-size="15">正式几何离线投影 · 侧面 / 正面 / 背面 / 骑乘 · 近似光照，非浏览器实拍</text>${rows.join("")}</g></svg>`;
await writeFile("docs/screenshots/outfit-models.svg", svg);
await writeFile("docs/outfit-models.json", JSON.stringify(metrics, null, 2));
if (process.argv[2]) {
  const sharp = createRequire(import.meta.url)(process.argv[2]);
  await sharp(Buffer.from(svg))
    .png()
    .toFile("docs/screenshots/outfit-models.png");
  const overview = svg
    .replace('height="1510"', 'height="482"')
    .replace("侧面 / 正面 / 背面 / 骑乘", "四套滑行侧面");
  await sharp(Buffer.from(overview))
    .png()
    .toFile("docs/screenshots/outfit-overview.png");
}
console.log(JSON.stringify(metrics, null, 2));
