import { icon } from "./icons";
import type { avalancheWarning } from "../systems/avalanche-warning";

export const avalancheWarningMarkup = () =>
  `<div class="avalanche-warning" id="hud-warning" role="img" aria-label="雪崩危险" hidden><span class="warning-scale"><span class="warning-wobble">${icon("warning")}</span></span></div>`;

/** HUD只同步变量和状态，动画交给CSS，不新增计时器或每帧DOM重建。 */
export function updateAvalancheWarning(
  element: HTMLElement,
  state: ReturnType<typeof avalancheWarning>,
  distance: string,
) {
  element.hidden = !state.enabled;
  element.style.display = state.enabled ? "grid" : "none";
  element.dataset.level = state.level;
  element.classList.toggle("approaching", state.approaching);
  element.style.setProperty("--warning-scale", state.scale.toFixed(4));
  element.style.setProperty("--warning-tilt", `${state.tilt.toFixed(3)}deg`);
  element.style.setProperty("--warning-sway", `${state.sway.toFixed(3)}px`);
  element.style.setProperty("--warning-period", `${state.period.toFixed(3)}s`);
  element.style.setProperty(
    "--warning-play-state",
    state.moving ? "running" : "paused",
  );
  element.setAttribute(
    "aria-label",
    `雪崩危险，距离${distance}${state.level === "near" || state.level === "critical" ? "，雪浪临近" : ""}`,
  );
}
