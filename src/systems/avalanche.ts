import { clamp } from "../core/math";
/** 雪崩与玩家共享路线 x；摄像机、分支高度、换乘都不参与距离计算。 */
export class Avalanche {
  x: number;
  speed = 20;
  constructor(
    start: number,
    public close = false,
  ) {
    this.x = start - (close ? 65 : 240);
    this.speed = close ? 23 : 20;
  }
  update(dt: number, elapsed: number, playerX: number) {
    const target = this.close ? 27.8 : Math.min(29.8, 21 + elapsed / 45);
    this.speed += (target - this.speed) * dt * 0.25;
    this.x += this.speed * dt;
    return playerX - this.x;
  }
  danger(playerX: number) {
    return clamp(1 - (playerX - this.x) / 220, 0, 1);
  }
}
