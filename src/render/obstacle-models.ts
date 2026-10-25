import * as THREE from "three";
import type { Entity, Ride } from "../core/types";
import { canBreakObstacle } from "../systems/obstacle-rules";

/** 障碍的实体造型语言；不生成文字、箭头、悬浮标签或额外HUD。 */
export const OBSTACLE_COLORS = {
  solid: "#4d6874",
  ice: "#5798b3",
  iceFacet: "#b9e3e4",
  wood: "#a0784c",
  woodLight: "#bd8656",
  cut: "#e0ba7e",
  split: "#493d32",
  jumpEdge: "#da7956",
  breakEdge: "#b8dda0",
  passage: "#4b8a71",
  snow: "#e3eade",
} as const;

const box = new THREE.BoxGeometry(1, 1, 1);
const stone = new THREE.DodecahedronGeometry(1, 0);
const log = new THREE.CylinderGeometry(0.4, 0.45, 2.9, 12);
const cut = new THREE.CylinderGeometry(0.35, 0.35, 0.025, 16);
const ring = new THREE.TorusGeometry(0.25, 0.018, 4, 16);
const ice = new THREE.ConeGeometry(0.62, 2.8, 5);

/** 单轮廓倒U形，不用遮住入口的实心墙假装洞口。 */
function archGeometry(outer: number, inner: number) {
  const s = new THREE.Shape();
  s.moveTo(-outer, 0);
  s.lineTo(-outer, 2.55);
  s.quadraticCurveTo(-outer, 4.15, 0, 4.15);
  s.quadraticCurveTo(outer, 4.15, outer, 2.55);
  s.lineTo(outer, 0);
  s.lineTo(inner, 0);
  s.lineTo(inner, 2.4);
  s.quadraticCurveTo(inner, 3.35, 0, 3.35);
  s.quadraticCurveTo(-inner, 3.35, -inner, 2.4);
  s.lineTo(-inner, 0);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, {
    depth: 0.65,
    bevelEnabled: false,
    curveSegments: 10,
  });
}
const arch = archGeometry(3.6, 2.9);
const fallbackMaterials = new Map<string, THREE.MeshStandardMaterial>();
type MaterialFactory = (color: string) => THREE.Material;
const fallbackMaterial: MaterialFactory = (color) => {
  if (!fallbackMaterials.has(color))
    fallbackMaterials.set(
      color,
      new THREE.MeshStandardMaterial({ color, roughness: 0.84 }),
    );
  return fallbackMaterials.get(color)!;
};
type Obstacle = Pick<Entity, "obstacle" | "route">;

/** 几何体全局复用；材质工厂由世界注入，本模块也可脱离浏览器检查造型。 */
export function makeObstacle(
  e: Obstacle,
  mat: MaterialFactory = fallbackMaterial,
) {
  const g = new THREE.Group();
  g.name = `obstacle-${e.obstacle}-${e.route}`;
  const C = OBSTACLE_COLORS;
  const edges: THREE.Mesh[] = [],
    falling: THREE.Mesh[] = [];
  const piece = (
    name: string,
    color: string,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    geometry: THREE.BufferGeometry = box,
  ) => {
    const m = new THREE.Mesh(geometry, mat(color));
    m.name = name;
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const edge = (
    name: string,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ) => {
    const m = piece(name, C.jumpEdge, x, y, z, sx, sy, sz);
    edges.push(m);
    return m;
  };
  switch (e.obstacle) {
    case "rock": {
      // 深色、多棱、厚重的封闭体；积雪仅覆盖顶端，不再把石头盖成雪包。
      const body = piece(
        "solid-rock",
        C.solid,
        0,
        0.57,
        0,
        1.12,
        0.76,
        0.9,
        stone,
      );
      body.rotation.set(0.15, 0.35, -0.15);
      piece(
        "rock-top-snow",
        C.snow,
        -0.13,
        1.12,
        -0.05,
        0.55,
        0.12,
        0.5,
        stone,
      );
      for (const x of [-0.37, 0.12])
        piece(
          "rock-painted-edge",
          C.jumpEdge,
          x,
          0.54,
          0.85,
          0.18,
          0.46,
          0.05,
        ).rotation.z = -0.4;
      break;
    }
    case "log": {
      const firstPart = g.children.length;
      const body = piece("wood-log", C.wood, 0, 0.43, 0, 1, 1, 1, log);
      body.rotation.x = Math.PI / 2;
      const end = piece("log-cut-face", C.cut, 0, 0.43, 1.47, 1, 1, 1, cut);
      end.rotation.x = Math.PI / 2;
      piece("log-growth-ring", C.wood, 0, 0.43, 1.49, 1, 1, 1, ring);
      piece(
        "log-split",
        C.split,
        0.06,
        0.49,
        1.52,
        0.045,
        0.52,
        0.025,
      ).rotation.z = -0.28;
      piece(
        "log-split-branch",
        C.split,
        0.14,
        0.47,
        1.53,
        0.2,
        0.035,
        0.025,
      ).rotation.z = 0.42;
      // 局部护漆随当前破障能力变色，木材本体始终保留暖色、树皮和切面。
      for (const z of [-0.9, 0.9])
        edge("log-edge", -0.02, 0.78, z, 0.55, 0.12, 0.17);
      piece(
        "log-broken-twig",
        C.woodLight,
        -0.3,
        0.75,
        -0.15,
        0.14,
        0.4,
        0.14,
      ).rotation.z = 0.45;
      // 斜横在雪道上，侧视能同时看到树皮与切面，避免只剩一个像石块的圆盘。
      const timber = new THREE.Group();
      for (const child of g.children.slice(firstPart)) timber.add(child);
      timber.rotation.y = Math.PI / 4;
      g.add(timber);
      break;
    }
    case "fence": {
      // 横梁朝侧视镜头展开，区别于封闭石块和头顶通道。
      for (const x of [-1.05, 1.05]) {
        piece("fence-post", C.wood, x, 0.65, 0, 0.19, 1.3, 0.22);
        edge("fence-post-tip", x, 1.22, 0.02, 0.23, 0.16, 0.26);
      }
      for (const y of [0.43, 0.95]) {
        piece(
          "fence-split-left",
          C.woodLight,
          -0.61,
          y,
          0.12,
          1.25,
          0.17,
          0.16,
        ).rotation.z = 0.025;
        piece(
          "fence-split-right",
          C.woodLight,
          0.65,
          y - 0.035,
          0.12,
          1.15,
          0.17,
          0.16,
        ).rotation.z = -0.04;
        piece(
          "fence-exposed-cut",
          C.cut,
          0.045,
          y,
          0.22,
          0.09,
          0.13,
          0.035,
        ).rotation.z = 0.15;
      }
      break;
    }
    case "ice": {
      const body = piece("solid-ice-spire", C.ice, 0, 1.4, 0, 1, 1, 1, ice);
      body.rotation.y = 0.3;
      piece(
        "ice-side-shard",
        C.ice,
        -0.45,
        0.65,
        -0.15,
        0.65,
        0.47,
        0.65,
        ice,
      ).rotation.z = 0.22;
      piece(
        "ice-cut-facet",
        C.iceFacet,
        -0.12,
        1.18,
        0.49,
        0.075,
        1.45,
        0.04,
      ).rotation.z = 0.06;
      for (const x of [-0.25, 0.15])
        piece(
          "ice-painted-base",
          C.jumpEdge,
          x,
          0.3,
          0.57,
          0.12,
          0.34,
          0.05,
        ).rotation.z = -0.35;
      break;
    }
    case "arch": {
      // 支撑退到雪道后侧；大开口、绿色内缘和横向檐口共同表达从下方穿过。
      piece("open-arch", C.solid, 0, 0, -2.2, 1, 1, 1, arch);
      piece("arch-lintel", C.passage, 0, 3.13, -0.8, 5.7, 0.17, 2.7);
      piece("arch-snow-cap", C.snow, 0, 4.0, -1.5, 4.8, 0.15, 1.4);
      for (const x of [-3.2, 3.2]) {
        piece("arch-inner-edge", C.passage, x, 1.15, -1.48, 0.23, 2.3, 0.07);
        piece("arch-foot", C.solid, x, 0.12, -2, 0.95, 0.24, 1.1);
      }
      break;
    }
    case "bridge": {
      if (e.route === "upper") {
        // 缺口仍是实际地形剔除；断头竖起并染珊瑚色，不能与可撞碎木堆混淆。
        for (const [x, tilt] of [
          [-0.4, -0.3],
          [6.4, 0.3],
        ] as const) {
          piece(
            "gap-broken-end",
            C.wood,
            x,
            -0.15,
            0,
            0.7,
            0.25,
            2.2,
          ).rotation.z = tilt;
          piece(
            "gap-painted-end",
            C.jumpEdge,
            x,
            0.04,
            0.9,
            0.6,
            0.16,
            0.18,
          ).rotation.z = tilt;
          piece(
            "gap-splinter",
            C.cut,
            x,
            0.22,
            0.45,
            0.14,
            0.6,
            0.14,
          ).rotation.z = tilt * 2;
        }
      } else {
        for (let i = 0; i < 5; i++) {
          const x = (i - 2) * 0.32;
          piece(
            "loose-broken-board",
            i % 2 ? C.wood : C.woodLight,
            x,
            0.2 + (i % 2) * 0.2,
            0,
            0.27,
            0.24,
            2.4,
          ).rotation.z = i % 2 ? -0.4 : 0.28;
          edge("board-edge", x, 0.33 + (i % 2) * 0.2, 0.98, 0.25, 0.09, 0.3);
        }
        piece(
          "broken-crossbeam",
          C.wood,
          0.5,
          0.45,
          0,
          0.18,
          0.9,
          2.5,
        ).rotation.z = -0.45;
      }
      break;
    }
    case "fall": {
      piece("fall-rear-shelf", C.solid, 0, 4.4, -1.6, 2.7, 0.35, 1.2);
      for (let i = 0; i < 3; i++) {
        const chunk = piece(
          "falling-solid-chunk",
          i % 2 ? C.ice : C.solid,
          i * 0.55 - 0.55,
          1.5 + i * 0.7,
          0,
          0.45,
          0.55,
          0.42,
          stone,
        );
        chunk.rotation.z = i * 0.7;
        falling.push(chunk);
      }
      for (const x of [-0.65, 0.65])
        piece(
          "fall-painted-foot",
          C.jumpEdge,
          x,
          0.2,
          0.3,
          0.18,
          0.4,
          0.18,
        ).rotation.z = -0.3;
      break;
    }
  }
  g.userData.breakEdges = edges;
  g.userData.fallingPieces = falling;
  g.userData.materialFactory = mat;
  updateObstacleAppearance(g, e, "ski", 0);
  return g;
}

/** 仅更新材质引用和落冰动画；不创建几何体，不改变障碍位置、碰撞或路线。 */
export function updateObstacleAppearance(
  g: THREE.Group,
  e: Obstacle,
  ride: Ride,
  time: number,
) {
  const breakable = canBreakObstacle(e.obstacle, ride, e.route);
  if (g.userData.canBreak !== breakable) {
    const mat = g.userData.materialFactory as MaterialFactory;
    for (const edge of g.userData.breakEdges as THREE.Mesh[])
      edge.material = mat(
        breakable ? OBSTACLE_COLORS.breakEdge : OBSTACLE_COLORS.jumpEdge,
      );
    g.userData.canBreak = breakable;
  }
  (g.userData.fallingPieces as THREE.Mesh[]).forEach((chunk, i) => {
    chunk.position.y =
      0.55 + ((((i * 0.8 + 3.2 - time * 1.5) % 3.2) + 3.2) % 3.2);
  });
}
