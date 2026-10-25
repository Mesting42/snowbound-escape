/** 离线检查真实模型的几何和颜色；不访问浏览器，不冒充游戏实拍或GPU验证。 */
import * as THREE from "three";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import {
  makeObstacle,
  updateObstacleAppearance,
} from "../src/render/obstacle-models";
import type { ObstacleKind, Ride } from "../src/core/types";

const cases: {
  name: string;
  kind: ObstacleKind;
  ride?: Ride;
  upper?: boolean;
}[] = [
  { name: "岩石 · 厚重封闭体", kind: "rock" },
  { name: "冰柱 · 坚硬尖棱", kind: "ice" },
  { name: "倒木 · 普通滑雪", kind: "log" },
  { name: "倒木 · 牦牛/机车", kind: "log", ride: "yak" },
  { name: "木栅栏 · 镂空横梁", kind: "fence" },
  { name: "洞口 · 拱形入口", kind: "arch" },
  { name: "断桥 · 真正缺口", kind: "bridge", upper: true },
  { name: "落冰 · 下落棱块", kind: "fall" },
  { name: "断木堆 · 可破坏木材", kind: "bridge", ride: "bike" },
];
const W = 1080,
  H = 910,
  cellW = 344,
  cellH = 250;
const sun = new THREE.Vector3(-0.3, 0.8, 0.6).normalize();
const cells: string[] = [];
for (const [i, item] of cases.entries()) {
  const e = {
    obstacle: item.kind,
    route: item.upper ? ("upper" as const) : ("main" as const),
  };
  const g = makeObstacle(e);
  updateObstacleAppearance(g, e, item.ride ?? "ski", 0.9);
  g.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(g),
    center = bounds.getCenter(new THREE.Vector3());
  const extent = bounds.getSize(new THREE.Vector3());
  const frameWidth = Math.max(
    4.2,
    extent.x * 1.3,
    extent.y * (cellW / 185) * 1.25,
  );
  const frameHeight = (frameWidth * 185) / cellW;
  const camera = new THREE.OrthographicCamera(
    -frameWidth / 2,
    frameWidth / 2,
    frameHeight / 2,
    -frameHeight / 2,
    0.1,
    100,
  );
  camera.position.set(center.x + 0.6, center.y + 6, 38);
  camera.lookAt(center.x, center.y, 0);
  camera.updateMatrixWorld();
  const triangles: { depth: number; path: string }[] = [];
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const geometry = o.geometry as THREE.BufferGeometry,
      p = geometry.getAttribute("position"),
      index = geometry.index;
    const count = index ? index.count : p.count;
    for (let n = 0; n < count; n += 3) {
      const vertices = [0, 1, 2].map((k) =>
        new THREE.Vector3()
          .fromBufferAttribute(p, index ? index.getX(n + k) : n + k)
          .applyMatrix4(o.matrixWorld),
      );
      const normal = new THREE.Vector3()
        .subVectors(vertices[1], vertices[0])
        .cross(new THREE.Vector3().subVectors(vertices[2], vertices[0]))
        .normalize();
      const centroid = vertices[0]
        .clone()
        .add(vertices[1])
        .add(vertices[2])
        .multiplyScalar(1 / 3);
      if (normal.dot(camera.position.clone().sub(centroid)) <= 0) continue;
      const projected = vertices.map((v) => v.clone().project(camera));
      const color = (o.material as THREE.MeshStandardMaterial).color
        .clone()
        .multiplyScalar(0.65 + 0.35 * Math.max(0, normal.dot(sun)))
        .getHexString();
      const points = projected
        .map(
          (v) =>
            `${(((v.x + 1) * cellW) / 2).toFixed(2)},${(((1 - v.y) * 185) / 2 + 52).toFixed(2)}`,
        )
        .join(" ");
      triangles.push({
        depth: projected.reduce((sum, v) => sum + v.z, 0) / 3,
        path: `<polygon points="${points}" fill="#${color}" stroke="#${color}" stroke-width="0.25"/>`,
      });
    }
  });
  triangles.sort((a, b) => b.depth - a.depth);
  const x = 12 + (i % 3) * 356,
    y = 105 + Math.floor(i / 3) * 260;
  cells.push(
    `<g transform="translate(${x} ${y})"><rect width="${cellW}" height="${cellH}" rx="12" fill="#f2f3e9"/><text x="18" y="29" font-size="17" font-weight="700">${item.name}</text>${triangles.map((t) => t.path).join("")}</g>`,
  );
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#bedbd7"/><g font-family="Microsoft YaHei, sans-serif" fill="#173f49"><text x="26" y="42" font-size="27" font-weight="700">障碍造型与配色对照</text><text x="26" y="73" font-size="15">游戏模型离线投影，各格独立取景；仅对照形体与基础颜色，不代表实时场景或帧率验收。</text>${cells.join("")}</g></svg>`;
await writeFile("docs/screenshots/obstacle-models.svg", svg);
// 使用工作区已配置的图像库栅格化静态SVG；不是浏览器截图。
const require = createRequire(import.meta.url);
const sharpPath = process.argv[2];
if (sharpPath) {
  const sharp = require(sharpPath);
  await sharp(Buffer.from(svg))
    .png()
    .toFile("docs/screenshots/obstacle-models.png");
  console.log("离线模型对照图已写入 docs/screenshots/obstacle-models.png");
} else
  console.log(
    "SVG已生成；可传入本机sharp模块路径输出PNG。正式游戏不依赖此图像库。",
  );
