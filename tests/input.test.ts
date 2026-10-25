import { test } from "node:test";
import assert from "node:assert/strict";
import { Input } from "../src/systems/input";

function setup() {
  const win = new EventTarget(),
    doc = new EventTarget();
  Object.defineProperty(globalThis, "window", {
    value: win,
    configurable: true,
  });
  Object.defineProperty(globalThis, "document", {
    value: doc,
    configurable: true,
  });
  const canvas = new EventTarget() as EventTarget & {
    setPointerCapture: () => void;
  };
  canvas.setPointerCapture = () => {};
  let paused = 0;
  const input = new Input(
    canvas as unknown as HTMLCanvasElement,
    () => true,
    () => {
      paused++;
    },
  );
  const send = (
    target: EventTarget,
    name: string,
    values: Record<string, unknown>,
  ) => {
    const event = new Event(name, { cancelable: true });
    for (const [key, value] of Object.entries(values))
      Object.defineProperty(event, key, { value });
    if (name.startsWith("key"))
      Object.defineProperty(event, "target", {
        value: { matches: () => false },
      });
    target.dispatchEvent(event);
  };
  return { win, doc, canvas, input, send, getPaused: () => paused };
}
test("空格自动重复不制造额外起跳，松开后下一次按下才触发", () => {
  const t = setup();
  t.send(t.win, "keydown", { code: "Space", repeat: false });
  assert.equal(t.input.consume().jump, true);
  t.send(t.win, "keydown", { code: "Space", repeat: true });
  assert.equal(t.input.consume().jump, false);
  assert.equal(t.input.held, true);
  t.send(t.win, "keyup", { code: "Space" });
  t.send(t.win, "keydown", { code: "Space", repeat: false });
  assert.equal(t.input.consume().jump, true);
});
test("同一触控的 pointerdown/touchstart/click 只消费一次，副触控不重复起跳", () => {
  const t = setup();
  t.send(t.canvas, "pointerdown", { button: 0, pointerId: 1 });
  assert.equal(t.input.consume().jump, true);
  t.send(t.canvas, "touchstart", {});
  t.send(t.canvas, "click", {});
  t.send(t.canvas, "pointerdown", { button: 0, pointerId: 2 });
  assert.equal(t.input.consume().jump, false);
  t.send(t.canvas, "pointerup", { pointerId: 1 });
  assert.equal(t.input.held, false);
});
test("触摸取消与失焦清理按住、未消费跳跃和能力", () => {
  const t = setup();
  t.send(t.canvas, "pointerdown", { button: 0, pointerId: 1 });
  t.input.useAbility();
  t.send(t.canvas, "pointercancel", {});
  assert.deepEqual(t.input.consume(), {
    jump: false,
    held: false,
    ability: false,
  });
  t.send(t.win, "keydown", { code: "Space", repeat: false });
  t.send(t.win, "blur", {});
  assert.equal(t.getPaused(), 1);
  assert.equal(t.input.held, false);
  assert.equal(t.input.consume().jump, false);
});
