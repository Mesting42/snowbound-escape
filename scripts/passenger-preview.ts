/** 正式载具/乘客几何的离线投影；不访问浏览器，不代表实拍或GPU帧率验收。 */
import * as THREE from "three";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { makeRide, type part } from "../src/render/models";
import { PassengerModels } from "../src/render/passenger-models";
import { createPlayer } from "../src/systems/physics";
import { Terrain } from "../src/systems/terrain";
import { ANIMALS, boardPassenger, enterRide } from "../src/systems/passengers";

const geometry = {
  sphere: new THREE.SphereGeometry(1, 14, 10),
  box: new THREE.BoxGeometry(1, 1, 1),
  capsule: new THREE.CapsuleGeometry(0.5, 1, 4, 10),
};
const materials = new Map<string, THREE.MeshStandardMaterial>();
const draw: typeof part = (
  parent,
  color,
  x,
  y,
  z,
  sx,
  sy,
  sz,
  shape = "sphere",
) => {
  if (!materials.has(color))
    materials.set(color, new THREE.MeshStandardMaterial({ color }));
  const mesh = new THREE.Mesh(geometry[shape], materials.get(color));
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
};
const sun = new THREE.Vector3(-0.3, 0.8, 0.6).normalize();
const rows: string[] = [],
  metrics: object[] = [];
for (const [i, ride] of (["bike", "sail"] as const).entries()) {
  const g = new THREE.Group(),
    carrier = makeRide(ride, draw);
  const passengers = new PassengerModels((r) => makeRide(r, draw));
  const p = createPlayer(new Terrain(52));
  enterRide(p, ride);
  for (const a of ANIMALS) boardPassenger(p, a);
  passengers.update(p, 1);
  g.add(carrier, passengers.root);
  g.updateMatrixWorld(true);
  const camera = new THREE.OrthographicCamera(-3.5, 3.5, 1.7, -1.7, 0.1, 100);
  camera.position.set(-0.85, 7.4, 38);
  camera.lookAt(-0.85, 1.4, 0);
  camera.updateMatrixWorld();
  const triangles: { depth: number; path: string }[] = [];
  let meshes = 0,
    count = 0;
  g.traverseVisible((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    meshes++;
    const geo = o.geometry as THREE.BufferGeometry,
      pos = geo.getAttribute("position"),
      index = geo.index;
    const vertices = index ? index.count : pos.count;
    count += vertices / 3;
    for (let n = 0; n < vertices; n += 3) {
      const v = [0, 1, 2].map((k) =>
        new THREE.Vector3()
          .fromBufferAttribute(pos, index ? index.getX(n + k) : n + k)
          .applyMatrix4(o.matrixWorld),
      );
      const normal = new THREE.Vector3()
        .subVectors(v[1], v[0])
        .cross(new THREE.Vector3().subVectors(v[2], v[0]))
        .normalize();
      const center = v[0]
        .clone()
        .add(v[1])
        .add(v[2])
        .multiplyScalar(1 / 3);
      if (normal.dot(camera.position.clone().sub(center)) <= 0) continue;
      const projected = v.map((a) => a.project(camera));
      const color = (o.material as THREE.MeshStandardMaterial).color
        .clone()
        .multiplyScalar(0.65 + 0.35 * Math.max(0, normal.dot(sun)))
        .getHexString();
      triangles.push({
        depth: projected.reduce((s, a) => s + a.z, 0) / 3,
        path: `<polygon points="${projected.map((a) => `${((a.x + 1) * 490).toFixed(2)},${((1 - a.y) * 164 + 45).toFixed(2)}`).join(" ")}" fill="#${color}" stroke="#${color}" stroke-width="0.2"/>`,
      });
    }
  });
  triangles.sort((a, b) => b.depth - a.depth);
  const labels = [
    ["岩角 · 护航", -2, 2.3],
    ["团团 · 减阻", 0, 1.1],
    ["云翎 · 缓降", -1.1, 2.95],
    ["人物足点", 0, -0.2],
  ] as const;
  rows.push(
    `<g transform="translate(20 ${110 + i * 385})"><rect width="980" height="365" rx="14" fill="#eff2e6"/><text x="22" y="30" font-size="21" font-weight="700">${ride === "bike" ? "雪地机车" : "风帆雪橇"} · 三种乘客同时搭载</text>${triangles.map((t) => t.path).join("")}${labels
      .map(([name, x, y]) => {
        const a = new THREE.Vector3(x, y, 0).project(camera);
        return `<text x="${(a.x + 1) * 490}" y="${(1 - a.y) * 164 + 45}" text-anchor="middle" font-size="13" fill="#234e56">${name}</text>`;
      })
      .join("")}</g>`,
  );
  metrics.push({
    ride,
    visibleMeshes: meshes,
    triangles: count,
    passengers: p.passengers,
    playerScale: 1,
    source: "offline-geometry-only",
    longitudinalLength: new THREE.Box3()
      .setFromObject(carrier, true)
      .getSize(new THREE.Vector3()).x,
  });
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1020" height="900"><rect width="100%" height="100%" fill="#bedbd7"/><g font-family="Microsoft YaHei,sans-serif" fill="#173f49"><text x="24" y="40" font-size="27" font-weight="700">载具动物乘客 · 正式模型离线检查</text><text x="24" y="72" font-size="14">真实模型几何投影，略去人物与纹理；仅检查布局、比例和造型，不代表浏览器实拍或帧率。</text>${rows.join("")}</g></svg>`;
await writeFile("docs/screenshots/passenger-models.svg", svg);
await writeFile("docs/passenger-models.json", JSON.stringify(metrics, null, 2));
if (process.argv[2]) {
  const sharp = createRequire(import.meta.url)(process.argv[2]);
  await sharp(Buffer.from(svg))
    .png()
    .toFile("docs/screenshots/passenger-models.png");
}
console.log(JSON.stringify(metrics));
