import * as THREE from "three";
import { OUTFITS } from "../data/config";
import type { ModelFactory } from "./model-factory";
import { batchStaticModel } from "./static-model";

export const COSTUME_SLOTS = [
  "body",
  "head",
  "armL",
  "armR",
  "foreL",
  "foreR",
  "legL",
  "legR",
  "shinL",
  "shinR",
] as const;
export type CostumeSlot = (typeof COSTUME_SLOTS)[number];
export type CostumeParts = Record<CostumeSlot, THREE.Group>;
export interface Costume {
  id: string;
  parts: CostumeParts;
  scarf: THREE.Group;
  tails: THREE.Group[];
}

/** 一套衣物只制作一次。克隆只复制节点，几何/材质共享，换装不重新上传网格。 */
const templates = new WeakMap<ModelFactory, Map<string, Costume>>();
const C = {
  trim: "#f2dfb8",
  dark: "#284751",
  leather: "#a8784c",
  metal: "#c9d5cd",
};

/** 椭圆截面缝合为连续衣身，避免球体叠加造成腰部鼓包。坐标沿用原人物米制骨架。 */
function garment(
  parent: THREE.Group,
  factory: ModelFactory,
  color: string,
  rings: readonly (readonly [number, number, number])[],
  centerX = 0,
) {
  const segments = 16,
    positions: number[] = [],
    indices: number[] = [];
  for (const [y, rx, rz] of rings)
    for (let j = 0; j <= segments; j++) {
      const angle = (j / segments) * Math.PI * 2;
      positions.push(centerX + Math.cos(angle) * rx, y, Math.sin(angle) * rz);
    }
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < segments; j++) {
      const a = i * (segments + 1) + j,
        b = a + segments + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  // 封口单独添加中心点，避免衣领与下摆成为可见空壳。
  for (const row of [0, rings.length - 1]) {
    const start = positions.length / 3;
    positions.push(centerX, rings[row][0], 0);
    for (let j = 0; j < segments; j++) {
      const a = row * (segments + 1) + j;
      if (row === 0) indices.push(start, a, a + 1);
      else indices.push(start, a + 1, a);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      new Array((positions.length / 3) * 2).fill(0),
      2,
    ),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, factory.material(color));
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.userData.costumeSource = true;
  parent.add(mesh);
  return mesh;
}

/** 绑带、拉链和缝线使用圆滑细杆；跨接坐标均在当前关节局部空间。 */
function strap(
  g: THREE.Group,
  f: ModelFactory,
  color: string,
  from: number[],
  to: number[],
  width = 0.025,
) {
  const a = new THREE.Vector3(...from),
    b = new THREE.Vector3(...to);
  const direction = b.clone().sub(a),
    middle = a.clone().add(b).multiplyScalar(0.5);
  const m = f.part(
    g,
    color,
    middle.x,
    middle.y,
    middle.z,
    width,
    direction.length() / 2,
    width,
    "capsule",
  );
  m.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  return m;
}

function pack(g: THREE.Group, f: ModelFactory, kind: string) {
  const p = f.part;
  if (kind === "glacier") {
    // 邮包贴在人物可见侧；包带绕前胸通过，避免把单肩包画成背后的普通行囊。
    p(g, "#b58b58", -0.08, -0.04, 0.34, 0.22, 0.22, 0.11);
    p(g, "#e4c18b", -0.06, 0.075, 0.421, 0.36, 0.16, 0.035, "box");
    p(g, C.dark, -0.05, 0.015, 0.448, 0.06, 0.08, 0.02, "box");
    strap(g, f, C.leather, [0.14, 0.56, -0.24], [0.23, 0.25, 0]);
    strap(g, f, C.leather, [0.23, 0.25, 0], [-0.04, 0.04, 0.43], 0.045);
    p(g, C.trim, -0.18, -0.09, 0.45, 0.1, 0.065, 0.018, "box");
    return;
  }
  const forest = kind === "forest",
    dusk = kind === "dusk";
  const color = forest ? "#b89962" : dusk ? "#6b4d69" : "#38606a";
  p(
    g,
    color,
    -0.27,
    0.22,
    0,
    forest ? 0.17 : 0.13,
    forest ? 0.34 : 0.25,
    forest ? 0.29 : 0.23,
  );
  p(
    g,
    forest ? "#d2bc87" : C.leather,
    -0.402,
    0.39,
    0,
    0.09,
    0.13,
    forest ? 0.27 : 0.22,
  );
  for (const sign of [-1, 1]) {
    const z = sign * 0.19;
    strap(g, f, C.dark, [-0.18, 0.49, z], [0.18, 0.44, z], 0.035);
    strap(g, f, C.dark, [0.18, 0.44, z], [0.215, 0.03, z], 0.033);
    p(g, C.metal, 0.23, 0.21, z, 0.025, 0.07, 0.045, "box");
    if (forest) {
      p(g, "#836f4c", -0.28, 0.1, sign * 0.29, 0.13, 0.16, 0.09);
      p(g, C.trim, -0.31, 0.33, sign * 0.29, 0.035, 0.12, 0.045, "box");
    }
  }
  if (dusk) {
    p(g, "#d6a979", -0.29, 0.49, 0, 0.11, 0.1, 0.32);
    for (const z of [-0.19, 0.19])
      p(g, C.dark, -0.4, 0.49, z, 0.025, 0.17, 0.035, "box");
    p(g, "#ba885f", -0.34, 0.07, 0.21, 0.085, 0.13, 0.08);
  } else if (!forest) {
    p(g, "#679393", -0.37, 0.14, 0.02, 0.065, 0.13, 0.17);
    p(g, C.trim, -0.426, 0.18, 0.05, 0.015, 0.045, 0.07, "box");
  }
}

function hat(g: THREE.Group, f: ModelFactory, id: string, color: string) {
  const p = f.part;
  if (id === "forest") {
    // 连帽只包后脑、头顶和两侧，脸前保持敞口，护目镜与鼻子不会被整球遮住。
    p(g, "#3c6656", -0.115, 0.075, 0, 0.19, 0.255, 0.258);
    for (const z of [-0.235, 0.235]) {
      p(g, color, -0.005, 0.015, z, 0.16, 0.21, 0.055);
      strap(g, f, C.trim, [0.13, 0.2, z], [0.14, -0.1, z], 0.023);
    }
    p(g, color, 0.02, 0.22, 0, 0.24, 0.085, 0.265);
    p(g, "#294f46", 0.22, 0.205, 0, 0.12, 0.035, 0.25);
    return;
  }
  if (id === "glacier") {
    p(g, "#315e79", -0.02, 0.16, 0, 0.25, 0.145, 0.24);
    p(g, "#cfdfd9", -0.005, 0.1, 0, 0.254, 0.04, 0.245);
    p(g, "#315e79", 0.22, 0.13, 0, 0.18, 0.045, 0.245);
    for (const z of [-0.218, 0.218]) {
      p(g, "#315e79", -0.075, -0.04, z, 0.13, 0.16, 0.065);
      p(g, "#dbcdb3", -0.065, -0.075, z * 1.18, 0.08, 0.095, 0.025);
    }
    p(g, "#f0c975", 0.215, 0.22, 0, 0.025, 0.045, 0.065, "box");
    return;
  }
  const dusk = id === "dusk",
    wool = dusk ? "#9e587e" : "#f5d18b";
  p(
    g,
    wool,
    -0.035,
    dusk ? 0.18 : 0.15,
    0,
    dusk ? 0.265 : 0.25,
    dusk ? 0.205 : 0.17,
    0.245,
  );
  p(g, dusk ? "#d396aa" : "#e8b96c", -0.025, 0.09, 0, 0.265, 0.065, 0.251);
  p(
    g,
    dusk ? "#eed7c5" : "#f6e5bd",
    -0.08,
    dusk ? 0.38 : 0.32,
    0,
    0.085,
    0.085,
    0.085,
  );
  // 大于像素级的针织分区，保持原屏幕尺寸下的边缘清晰。
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    strap(
      g,
      f,
      dusk ? "#d396aa" : "#e8b96c",
      [-0.025 + 0.257 * Math.cos(a), 0.055, 0.248 * Math.sin(a)],
      [-0.025 + 0.257 * Math.cos(a), 0.125, 0.248 * Math.sin(a)],
      0.012,
    );
  }
}

function makeTemplate(id: string, f: ModelFactory): Costume {
  const style = OUTFITS.find((o) => o.id === id) ?? OUTFITS[0],
    color = style.color;
  const parts = Object.fromEntries(
    COSTUME_SLOTS.map((k) => [k, new THREE.Group()]),
  ) as CostumeParts;
  for (const key of COSTUME_SLOTS) parts[key].name = `costume-${key}`;
  const { body, head } = parts,
    p = f.part;
  const forest = id === "forest",
    glacier = id === "glacier",
    dusk = id === "dusk";
  const hem = glacier ? -0.19 : forest ? -0.2 : -0.12;
  garment(body, f, color, [
    [hem, 0.2, 0.255],
    [0, 0.235, 0.275],
    [0.28, dusk ? 0.255 : 0.235, dusk ? 0.3 : 0.275],
    [0.46, 0.2, 0.255],
    [0.58, 0.11, 0.145],
  ]);
  // 衣身正面朝 +x，拉链、口袋、翻领须同时在侧视和三分之四视角可读。
  strap(body, f, C.trim, [0.15, 0.51, 0], [0.24, 0.02, 0], 0.022);
  p(body, C.metal, 0.253, 0.35, 0, 0.02, 0.05, 0.028, "box");
  for (const sign of [-1, 1]) {
    const z = sign * 0.21;
    p(
      body,
      forest ? "#73947b" : glacier ? "#70b6c8" : dusk ? "#cd879f" : "#f69a6a",
      0.13,
      0.13,
      z,
      0.14,
      0.12,
      0.065,
    );
    strap(
      body,
      f,
      C.trim,
      [0.13, 0.22, z * 1.17],
      [0.2, 0.13, z * 1.17],
      0.014,
    );
    if (forest) p(body, "#315b4d", 0.02, 0.47, sign * 0.245, 0.19, 0.09, 0.105);
  }
  p(body, dusk ? "#e6cdb3" : C.dark, 0, 0.57, 0, 0.16, 0.08, 0.18);
  if (dusk) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      p(
        body,
        i % 2 ? "#e6cdb3" : "#f3dfca",
        Math.cos(a) * 0.14,
        0.56,
        Math.sin(a) * 0.19,
        0.08,
        0.07,
        0.085,
      );
    }
    for (const y of [0.04, 0.25, 0.43])
      for (const sign of [-1, 1])
        strap(
          body,
          f,
          "#9f577c",
          [-0.05, y, sign * 0.28],
          [0.17, y, sign * 0.25],
          0.015,
        );
  }
  if (glacier) {
    for (const z of [-0.12, 0.12]) {
      const lapel = p(body, "#b9dde0", 0.2, 0.4, z, 0.045, 0.22, 0.12, "box");
      lapel.rotation.x = z > 0 ? -0.45 : 0.45;
    }
    for (const y of [0.22, 0.07, -0.09])
      p(body, C.trim, 0.239, y, 0.07, 0.022, 0.025, 0.025);
    p(body, C.leather, 0, -0.02, 0, 0.245, 0.035, 0.278);
  }
  pack(body, f, id);
  hat(head, f, id, color);

  const tails: THREE.Group[] = [];
  for (const side of ["L", "R"] as const) {
    const arm = parts[`arm${side}`],
      fore = parts[`fore${side}`],
      leg = parts[`leg${side}`],
      shin = parts[`shin${side}`];
    const sleeve = dusk ? 0.175 : forest ? 0.16 : 0.15;
    p(arm, color, 0, -0.205, 0, sleeve, 0.24, sleeve, "capsule");
    p(arm, color, 0, -0.015, 0, sleeve * 0.72, 0.12, sleeve * 0.72);
    p(fore, color, 0, -0.17, 0, sleeve * 0.88, 0.22, sleeve * 0.88, "capsule");
    p(fore, C.dark, 0, -0.32, 0, 0.1, 0.065, 0.102);
    p(fore, C.trim, 0.005, -0.292, 0, 0.099, 0.018, 0.103);
    p(
      fore,
      forest ? "#315b4d" : style.pants,
      -0.04,
      -0.035,
      0,
      0.065,
      0.09,
      0.09,
    );
    p(leg, style.pants, 0, -0.235, 0, 0.16, 0.235, 0.16, "capsule");
    p(shin, style.pants, 0, -0.16, 0, 0.145, 0.2, 0.145, "capsule");
    p(shin, C.dark, 0.045, -0.02, 0, 0.075, 0.085, 0.095);
    if (glacier) {
      // 两片衣摆分别随大腿运动，分叉在髋部；不以完整硬筒跨接两腿。
      const tail = new THREE.Group();
      tail.name = `coat-tail-${side}`;
      tail.position.x = -0.065;
      garment(
        tail,
        f,
        color,
        [
          [-0.32, 0.16, 0.15],
          [-0.08, 0.205, 0.17],
          [0.07, 0.18, 0.18],
        ],
        -0.01,
      );
      strap(
        tail,
        f,
        "#78b5c8",
        [-0.14, -0.29, 0.13],
        [-0.17, 0.01, 0.15],
        0.016,
      );
      leg.add(tail);
      tails.push(tail);
      // 邮差的高筒靴与普通鞋帮有明显高度差。
      p(shin, "#3c586b", 0.025, -0.24, 0, 0.115, 0.17, 0.11);
    }
  }

  const scarf = new THREE.Group();
  scarf.name = "costume-scarf";
  scarf.position.set(-0.12, 0.52, 0.07);
  const scarfColor = dusk
    ? "#e6c2aa"
    : forest
      ? "#c8b87d"
      : glacier
        ? "#dbdfc9"
        : "#f3ca6a";
  p(body, scarfColor, 0.01, 0.57, 0, 0.18, 0.055, 0.19);
  const length = id === "sunrise" ? 0.79 : glacier ? 0.48 : 0.32;
  p(scarf, scarfColor, -length / 2, 0, 0, length, 0.105, 0.045, "box");
  for (let i = 0; i < 3; i++)
    p(
      scarf,
      scarfColor,
      -length - 0.025,
      -0.03 + i * 0.03,
      0,
      0.08,
      0.015,
      0.04,
      "box",
    );

  // 先分离有动画的衣摆，其他同关节细节按材质合并。只释放本次制作的独有衣身源几何。
  for (const tail of tails) tail.removeFromParent();
  for (const g of [...Object.values(parts), scarf, ...tails]) {
    const own: THREE.BufferGeometry[] = [];
    g.traverse((o) => {
      if (o instanceof THREE.Mesh && o.userData.costumeSource)
        own.push(o.geometry);
    });
    batchStaticModel(g);
    for (const geometry of own) geometry.dispose();
  }
  if (tails.length) {
    parts.legL.add(tails[0]);
    parts.legR.add(tails[1]);
  }
  return { id: style.id, parts, scarf, tails };
}

/** 独立节点与动画状态，底层缓冲共享；预览来回切换不会堆积衣服或影响另一个角色。 */
export function createCostume(id: string, factory: ModelFactory): Costume {
  const resolved = OUTFITS.find((o) => o.id === id)?.id ?? OUTFITS[0].id;
  let cache = templates.get(factory);
  if (!cache) templates.set(factory, (cache = new Map()));
  if (!cache.has(resolved))
    cache.set(resolved, makeTemplate(resolved, factory));
  const template = cache.get(resolved)!;
  const parts = Object.fromEntries(
    COSTUME_SLOTS.map((k) => [k, template.parts[k].clone(true)]),
  ) as CostumeParts;
  return {
    id: resolved,
    parts,
    scarf: template.scarf.clone(true),
    tails: [
      parts.legL.getObjectByName("coat-tail-L"),
      parts.legR.getObjectByName("coat-tail-R"),
    ].filter((o): o is THREE.Group => o instanceof THREE.Group),
  };
}
