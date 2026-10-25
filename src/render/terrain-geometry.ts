import * as THREE from "three";
import { REGIONS, REGION_LENGTH } from "../data/config";
import { BRANCH_THICKNESS, type Terrain } from "../systems/terrain";

/**
 * 主雪道的积雪实体向下延伸，遮住远山下方网格。
 * 深度不增加纵向细分，只延长已有侧壁；不是可碰撞表面。
 */
export const SNOW_BODY_DEPTH = 256;

/** 可在不启动WebGL的情况下检查表面、侧壁、接缝和真实桥缺口。 */
export function makeTerrainGeometry(
  terrain: Terrain,
  start: number,
  length: number,
  originX = 0,
  originY = 0,
  branch = false,
) {
  const g = new THREE.BufferGeometry();
  const vertices: number[] = [],
    colors: number[] = [],
    indices: number[] = [],
    uvs: number[] = [];
  const count = Math.ceil(length);
  const region = Math.floor(Math.max(0, start) / REGION_LENGTH) % 3;
  const snow = new THREE.Color(REGIONS[region].snow);
  // 侧面仍是积雪颜色，避免深侧壁形成大面积青色或拉长的三角渐变。
  const side = snow
    .clone()
    .lerp(new THREE.Color(region === 1 ? "#b7dce6" : "#d4dfd5"), 0.18);
  // 主路前缘复制一列顶点，表面和侧壁分别计算法线，深侧壁不会拉歪雪面光照。
  const depths = branch ? [-2.4, -1.2, 0, 0.8, 0.8] : [-45, -10, 0, 8, 8, 8.15];
  const width = depths.length;
  for (let i = 0; i <= count; i++) {
    const x = start + (i * length) / count;
    const h = branch
      ? (terrain.branchDeckHeight(x) ?? terrain.height(x))
      : terrain.height(x);
    for (let j = 0; j < width; j++) {
      const wall = branch ? j === 4 : j >= 4;
      const offset = branch
        ? j === 4
          ? -BRANCH_THICKNESS
          : j === 1
            ? 0.06
            : 0
        : j === 0
          ? -4.5 + Math.sin(x / 8) * 0.5
          : j === 1
            ? -0.8
            : j === 5
              ? -SNOW_BODY_DEPTH
              : 0;
      vertices.push(x - originX, h + offset - originY, depths[j]);
      // 以实际米制高度展开侧壁，纹理重复而非把一条雪纹拉到屏幕底部。
      uvs.push(x / 8, wall ? offset / 8 : depths[j] / 8);
      const color = wall
        ? side
        : snow.clone().multiplyScalar(0.96 + Math.sin(x / 3) * 0.025);
      colors.push(color.r, color.g, color.b);
      if (
        i < count &&
        j < width - 1 &&
        (branch || j !== 3) &&
        (!branch || !terrain.branchGap(x + length / count / 2))
      ) {
        const a = i * width + j;
        // 外侧朝向：雪面法线向上，前侧积雪法线朝镜头，避免依赖双面反转补光。
        indices.push(a, a + 1, a + width, a + 1, a + width + 1, a + width);
      }
    }
  }
  g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
