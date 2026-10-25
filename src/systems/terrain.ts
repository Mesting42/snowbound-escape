import type { Entity, Ride, Surface } from "../core/types";
import { random, smooth } from "../core/math";
import { REGION_LENGTH } from "../data/config";

export const MODULE = 240;
export const BRANCH_START = 84;
export const BRANCH_END = 190;
/** 平台雪面实体厚度，渲染与底部碰撞共用，避免出现两套台底高度。 */
export const BRANCH_THICKNESS = 0.45;
/** 连续解析高度场，渲染和碰撞共享同一函数；模块边界不会引入高度断裂。 */
export class Terrain {
  constructor(
    public seed: number,
    public gentle = false,
  ) {}
  height(x: number): number {
    const phase = random(this.seed, 712) * Math.PI * 2;
    const broad =
      Math.sin(x / 83 + phase) * 2.4 +
      Math.sin(x / 31) * 1.1 +
      Math.sin(x / 157 + 0.7 + phase) * 2.8;
    const n = Math.floor(x / MODULE),
      u = x - n * MODULE;
    const ramp =
      u > 48 && u < 82 ? Math.sin(((u - 48) / 34) * Math.PI) ** 2 * 1.6 : 0;
    const shape =
      (random(this.seed + 81, n) - 0.5) *
      3 *
      Math.sin((u / MODULE) * Math.PI) ** 2 *
      Math.sin((u / MODULE) * Math.PI * 2);
    return 3 - x * 0.075 + broad + ramp + shape;
  }
  slope(x: number): number {
    return (this.height(x + 0.12) - this.height(x - 0.12)) / 0.24;
  }
  hasBranch(n: number): boolean {
    return n >= 0 && n % 2 === 1;
  }
  /** 只在与主路等高的入口接入，不能把平台中段下方的人吸到上层。 */
  crossesBranchEntry(fromX: number, toX: number): boolean {
    const n = Math.floor(toX / MODULE);
    const entry = n * MODULE + BRANCH_START;
    return this.hasBranch(n) && fromX <= entry + 1e-6 && toX >= entry;
  }
  /** 可选高台上的 6m 断桥；下层雪道始终连续，未跳过也有安全退路。 */
  branchGap(x: number): boolean {
    const n = Math.floor(x / MODULE),
      u = x - n * MODULE;
    return n >= 11 && n % 4 === 3 && u >= 150 && u < 156;
  }
  branchHeight(x: number): number | null {
    return this.branchGap(x) ? null : this.branchDeckHeight(x);
  }
  branchDeckHeight(x: number): number | null {
    const n = Math.floor(x / MODULE),
      u = x - n * MODULE;
    if (!this.hasBranch(n) || u < BRANCH_START || u > BRANCH_END) return null;
    const rise = smooth((u - BRANCH_START) / 20),
      end = smooth((BRANCH_END - u) / 30);
    return (
      this.height(x) +
      (2.5 +
        1.5 *
          Math.sin(
            ((u - BRANCH_START) / (BRANCH_END - BRANCH_START)) * Math.PI,
          )) *
        rise *
        end
    );
  }
  surface(x: number, route: "main" | "upper" = "main"): Surface {
    const upper = route === "upper" ? this.branchHeight(x) : null;
    if (upper === null)
      return { y: this.height(x), slope: this.slope(x), route: "main" };
    const a = this.branchDeckHeight(x - 0.1) ?? this.height(x - 0.1),
      b = this.branchDeckHeight(x + 0.1) ?? this.height(x + 0.1);
    return { y: upper, slope: (b - a) / 0.2, route: "upper" };
  }
  /** 跳跃包络：所有主路障碍间隔至少 42m；伙伴从不成为必经条件。 */
  entities(n: number): Entity[] {
    if (n < 0) return [];
    const base = n * MODULE,
      result: Entity[] = [];
    const add = (
      kind: Entity["kind"],
      at: number,
      extra: Partial<Entity> = {},
    ) => {
      const x = base + at,
        route = extra.route ?? "main";
      result.push({
        id: `${this.seed}:${n}:${kind}:${at}`,
        x,
        y: this.surface(x, route).y,
        kind,
        route,
        used: false,
        ...extra,
      });
    };
    const kinds = [
      "rock",
      "log",
      "fence",
      "ice",
      "arch",
      "bridge",
      "fall",
    ] as const;
    if (!this.gentle || n > 1) {
      for (const [i, at] of (base > 9000
        ? [42, 134, 176, 218]
        : [42, 134, 218]
      ).entries()) {
        const region = Math.floor(base / REGION_LENGTH) % 3;
        let obstacle =
          kinds[
            Math.floor(random(this.seed + n * 11, i) * (region === 0 ? 3 : 7))
          ];
        if (n === 0 && at === 42) obstacle = "log";
        add("obstacle", at, { obstacle });
      }
    }
    // 雪晶弧线标记起跳与落点；地面收集线让新手也能获得奖励。
    for (const start of [12, 74, 163])
      for (let i = 0; i < 7; i++) {
        const at = start + i * 3.2,
          arc = start === 74 ? 1.1 + Math.sin((i / 6) * Math.PI) * 2.6 : 0.7;
        add("coin", at, { y: this.height(base + at) + arc });
      }
    if (this.hasBranch(n)) {
      add("sign", 60);
      if (n >= 11 && n % 4 === 3)
        add("obstacle", 150, {
          obstacle: "bridge",
          route: "upper",
          y: this.branchDeckHeight(base + 150)!,
        });
      for (let i = 0; i < 12; i++) {
        const at = 98 + i * 6;
        add("coin", at, {
          route: "upper",
          y: this.surface(base + at, "upper").y + 0.9,
        });
      }
    }
    if (n % 2 === 0 || n === 1) {
      const rides: Ride[] = ["otter", "yak", "owl", "bike", "sail"];
      const ride =
        rides[
          (Math.floor(n / 2) + Math.floor(random(this.seed, n) * 3)) %
            rides.length
        ];
      add("ride", 102, { ride });
    }
    return result;
  }
}
