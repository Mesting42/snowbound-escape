import { angleDelta, clamp, lerp } from "../core/math";

/** 只读呈现姿态：米制坐标和弧度，不携带物理或奖励状态。 */
export interface RenderPose {
  x: number;
  y: number;
  angle: number;
}

/**
 * 120Hz 固定模拟与显示刷新率之间的插值。
 * 只在前后物理样本间呈现，最多滞后一个固定步；绝不写回玩家状态。
 */
export class PoseSampler {
  private previous: RenderPose = { x: 0, y: 0, angle: 0 };
  private sampled: RenderPose = { x: 0, y: 0, angle: 0 };
  private ready = false;

  /** 每个固定物理步之前调用，多个追赶步只保留最后一对相邻样本。 */
  capture(pose: RenderPose) {
    this.previous.x = pose.x;
    this.previous.y = pose.y;
    this.previous.angle = pose.angle;
    this.ready = true;
  }

  sample(pose: RenderPose, alpha: number, playing: boolean): RenderPose {
    // 教学重练/检查点迁移必须立即到位；暂停与菜单也直接采用当前姿态。
    const continuous =
      this.ready &&
      playing &&
      Math.abs(pose.x - this.previous.x) < 4 &&
      Math.abs(pose.y - this.previous.y) < 4;
    const t = continuous ? clamp(alpha, 0, 1) : 1;
    this.sampled.x = lerp(this.previous.x, pose.x, t);
    this.sampled.y = lerp(this.previous.y, pose.y, t);
    // 落地可能把连续角归一化，沿最短弧插值，避免在 2π 边界突然转一整圈。
    this.sampled.angle = continuous
      ? this.previous.angle + angleDelta(pose.angle, this.previous.angle) * t
      : pose.angle;
    return this.sampled;
  }
}
