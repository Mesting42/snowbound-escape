/** 正式模型、形变与技能特效的离线几何投影；不访问浏览器，不代表实拍或FPS。 */
import * as THREE from "three";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { makeRide, type part } from "../src/render/models";
import { animateRide } from "../src/render/ride-animation";
import { AbilityVisual } from "../src/render/ability-visual";
import { createPlayer } from "../src/systems/physics";
import { Terrain } from "../src/systems/terrain";
import { enterRide } from "../src/systems/passengers";
import { freshSave } from "../src/systems/storage";
import type { AbilityRide } from "../src/data/abilities";

const geometries = {
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
  const mesh = new THREE.Mesh(geometries[shape], materials.get(color));
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
};
const cases: { ride: AbilityRide; title: string; impact?: boolean }[] = [
  { ride: "bike", title: "机车 · 尾焰增压" },
  { ride: "sail", title: "风帆 · 鼓帆气流" },
  { ride: "yak", title: "牦牛 · 低头冲锋" },
  { ride: "otter", title: "雪獭 · 贴雪冲刺" },
  { ride: "owl", title: "雪鸮 · 展翼滑翔" },
  { ride: "yak", title: "木障破坏 · 实例碎木", impact: true },
];
const w = 366,
  h = 264,
  panels: string[] = [],
  metrics: object[] = [];
const sun = new THREE.Vector3(-0.3, 0.8, 0.6).normalize();
for (const [index, item] of cases.entries()) {
  const p = createPlayer(new Terrain(52));
  enterRide(p, item.ride);
  p.y = 0;
  p.x = 0;
  p.ability = 1;
  p.grounded = item.ride !== "owl";
  const group = new THREE.Group(),
    model = makeRide(item.ride, draw),
    visual = new AbilityVisual();
  animateRide(model, item.ride, 0.8, true, true);
  visual.update(p, 0.6, p, 0, 0, freshSave().settings, "playing", "preview");
  if (item.impact)
    visual.event(
      { type: "break", powered: true, position: { x: 1.25, y: 0 } },
      0.6,
    );
  visual.update(p, 0.8, p, 0, 0, freshSave().settings, "playing", "preview");
  group.add(model, visual.root, visual.burstsRoot);
  group.updateMatrixWorld(true);
  const camera = new THREE.OrthographicCamera(-4.7, 4.7, 3.2, -3.2, 0.1, 100);
  camera.position.set(-1.3, 7.3, 38);
  camera.lookAt(-1.3, 1.3, 0);
  camera.updateMatrixWorld();
  const shapes: { depth: number; svg: string }[] = [];
  let meshes = 0,
    triangles = 0;
  const project = (v: THREE.Vector3) => {
    const p = v.clone().project(camera);
    return { x: ((p.x + 1) * w) / 2, y: ((1 - p.y) * h) / 2 + 32, z: p.z };
  };
  group.traverseVisible((o) => {
    if (o instanceof THREE.Mesh) {
      meshes++;
      const g = o.geometry as THREE.BufferGeometry,
        position = g.getAttribute("position"),
        indices = g.index;
      const material = o.material as THREE.MeshStandardMaterial,
        count = indices ? indices.count : position.count;
      const instances = o instanceof THREE.InstancedMesh ? o.count : 1;
      for (let instance = 0; instance < instances; instance++) {
        const matrix = o.matrixWorld.clone();
        if (o instanceof THREE.InstancedMesh) {
          const local = new THREE.Matrix4();
          o.getMatrixAt(instance, local);
          matrix.multiply(local);
        }
        for (let n = 0; n < count; n += 3) {
          const v = [0, 1, 2].map((k) =>
            o
              .getVertexPosition(
                indices ? indices.getX(n + k) : n + k,
                new THREE.Vector3(),
              )
              .applyMatrix4(matrix),
          );
          const normal = new THREE.Vector3()
            .subVectors(v[1], v[0])
            .cross(new THREE.Vector3().subVectors(v[2], v[0]))
            .normalize();
          const centroid = v[0]
            .clone()
            .add(v[1])
            .add(v[2])
            .multiplyScalar(1 / 3);
          triangles++;
          if (
            material.side !== THREE.DoubleSide &&
            normal.dot(camera.position.clone().sub(centroid)) <= 0
          )
            continue;
          const points = v.map(project);
          const shade =
            material instanceof THREE.MeshBasicMaterial
              ? 1
              : 0.65 + Math.max(0, normal.dot(sun)) * 0.35;
          const color = material.color
            .clone()
            .multiplyScalar(shade)
            .getHexString();
          shapes.push({
            depth: points.reduce((sum, a) => sum + a.z, 0) / 3,
            svg: `<polygon points="${points.map((a) => `${a.x.toFixed(2)},${a.y.toFixed(2)}`).join(" ")}" fill="#${color}" opacity="${material.opacity}"/>`,
          });
        }
      }
    } else if (o instanceof THREE.Points) {
      const positions = o.geometry.getAttribute("position"),
        material = o.material as THREE.PointsMaterial;
      const count = Math.min(positions.count, o.geometry.drawRange.count);
      for (let i = 0; i < count; i++) {
        const a = project(
          new THREE.Vector3()
            .fromBufferAttribute(positions, i)
            .applyMatrix4(o.matrixWorld),
        );
        shapes.push({
          depth: a.z,
          svg: `<circle cx="${a.x}" cy="${a.y}" r="${(material.size * h) / 12.8}" fill="#${material.color.getHexString()}" opacity="${material.opacity}"/>`,
        });
      }
    }
  });
  shapes.sort((a, b) => b.depth - a.depth);
  panels.push(
    `<g transform="translate(${16 + (index % 3) * 380} ${105 + Math.floor(index / 3) * 294})"><rect width="${w}" height="280" rx="12" fill="#bfdcd9"/><text x="14" y="28" font-size="18" font-weight="700">${item.title}</text>${shapes.map((s) => s.svg).join("")}<text x="14" y="265" font-size="11">真实状态与几何 · 静态时刻</text></g>`,
  );
  metrics.push({
    ride: item.ride,
    impact: !!item.impact,
    ...visual.diagnostics,
    visibleMeshes: meshes,
    triangles,
    source: "offline-geometry-only",
  });
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1156" height="710"><rect width="100%" height="100%" fill="#eef1e5"/><g font-family="Microsoft YaHei,sans-serif" fill="#173f49"><text x="24" y="40" font-size="26" font-weight="700">五种技能与破木反馈 · 正式几何离线检查</text><text x="24" y="72" font-size="14">复用正式技能状态、模型、帆面形变和特效；略去人物与纹理，不代表浏览器实拍、动态手感或帧率。</text>${panels.join("")}</g></svg>`;
await writeFile("docs/screenshots/ability-effects.svg", svg);
await writeFile("docs/ability-visuals.json", JSON.stringify(metrics, null, 2));
if (process.argv[2]) {
  const sharp = createRequire(import.meta.url)(process.argv[2]);
  await sharp(Buffer.from(svg))
    .png()
    .toFile("docs/screenshots/ability-effects.png");
}
console.log(JSON.stringify(metrics));
