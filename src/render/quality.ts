import type { Settings } from "../core/types";
import { clamp } from "../core/math";

/**
 * 清晰度预算与 Three.js 解耦，便于独立验证降级顺序。
 * pixelRatio 是每个 CSS 像素的采样倍率，不会改变镜头、人物尺寸或碰撞。
 */
export class RenderQuality {
  private mode: Settings["quality"] = "auto";
  private ratio = 1.5;
  private ceiling = 1.75;
  private reducedEffects = false;
  private healthyWindows = 0;

  /** 设备像素比不是桌面超采样的上限；普通屏幕也能改善细小人物边缘。 */
  configure(mode: Settings["quality"], width: number, height: number) {
    if (mode !== this.mode) {
      this.mode = mode;
      this.ratio = 1.5;
      this.reducedEffects = false;
      this.healthyWindows = 0;
    }
    const budget = mode === "high" ? 6_000_000 : 4_000_000;
    // 大屏限制额外采样开销；最低仍保留一个 CSS 像素对应一个真实渲染像素。
    this.ceiling = Math.max(
      1,
      Math.min(
        mode === "high" ? 2 : 1.75,
        Math.sqrt(budget / Math.max(1, width * height)),
      ),
    );
    this.ratio = clamp(this.ratio, 1, this.ceiling);
  }

  /** 每两秒一个实际帧率窗口；先降背景效果，再降低分辨率，恢复需连续余量。 */
  observe(fps: number) {
    if (this.mode !== "auto" || !Number.isFinite(fps) || fps <= 0) return;
    if (fps < 60) {
      this.healthyWindows = 0;
      if (!this.reducedEffects) this.reducedEffects = true;
      else this.ratio = Math.max(1, this.ratio - 0.125);
    } else if (fps > 80) {
      if (++this.healthyWindows >= 4) {
        this.ratio = Math.min(this.ceiling, this.ratio + 0.0625);
        if (this.ratio >= 1.5 && fps > 100) this.reducedEffects = false;
        this.healthyWindows = 0;
      }
    } else this.healthyWindows = 0;
  }

  get pixelRatio() {
    return this.mode === "low"
      ? 1
      : this.mode === "high"
        ? this.ceiling
        : this.ratio;
  }
  get shadows() {
    return (
      this.mode === "high" || (this.mode === "auto" && !this.reducedEffects)
    );
  }
  get particleCount() {
    return this.mode === "low" ? 45 : this.reducedEffects ? 90 : 180;
  }
}
