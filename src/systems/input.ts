import type { InputFrame } from "../core/types";

/** 只使用 Pointer Events；同一触控不会再被 touchstart/click 重复消费。 */
export class Input {
  held = false;
  private jump = false;
  private ability = false;
  private pointer: number | null = null;
  constructor(
    canvas: HTMLCanvasElement,
    private active: () => boolean,
    pause: () => void,
  ) {
    window.addEventListener("keydown", (e) => {
      if ((e.target as HTMLElement)?.matches("input,select,textarea")) return;
      if (["Space", "ArrowUp", "KeyE", "Escape"].includes(e.code))
        e.preventDefault();
      if (e.repeat) return;
      if (e.code === "Escape") {
        this.clear();
        pause();
        return;
      }
      if (!active()) return;
      if (e.code === "Space" || e.code === "ArrowUp") this.press();
      if (e.code === "KeyE") this.useAbility();
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space" || e.code === "ArrowUp") this.held = false;
    });
    canvas.addEventListener("pointerdown", (e) => {
      if (!active() || e.button !== 0 || this.pointer !== null) return;
      e.preventDefault();
      this.pointer = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      this.press();
    });
    const release = (e: PointerEvent) => {
      if (this.pointer === e.pointerId) {
        this.pointer = null;
        this.held = false;
      }
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", () => this.clear());
    canvas.addEventListener("lostpointercapture", () => {
      this.held = false;
      this.pointer = null;
    });
    window.addEventListener("blur", () => {
      this.clear();
      pause();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.clear();
        pause();
      }
    });
  }
  press() {
    if (!this.held) this.jump = true;
    this.held = true;
  }
  useAbility() {
    if (this.active()) this.ability = true;
  }
  consume(): InputFrame {
    const frame = { jump: this.jump, held: this.held, ability: this.ability };
    this.jump = false;
    this.ability = false;
    return frame;
  }
  clear() {
    this.held = false;
    this.jump = false;
    this.ability = false;
    this.pointer = null;
  }
}
