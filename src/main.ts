import "./style.css";
import { Game } from "./core/game";
import { Storage } from "./systems/storage";
import { Input } from "./systems/input";
import { Audio } from "./systems/audio";
import { World } from "./render/world";
import { PoseSampler } from "./render/sampling";
import { avalancheFeedback } from "./systems/avalanche-feedback";
import { UI } from "./ui/ui";
import { STEP } from "./data/config";

const canvas = document.querySelector<HTMLCanvasElement>("#world")!;
const storage = new Storage(),
  game = new Game(storage),
  audio = new Audio(storage.data.settings);
try {
  const world = new World(
    canvas,
    storage.data.outfit,
    storage.data.ski,
    storage.data.settings.quality,
  );
  const poseSampler = new PoseSampler();
  const input = new Input(
    canvas,
    () => game.phase === "playing",
    () => game.pause(),
  );
  const ui = new UI(document.getElementById("ui")!, game, audio, input, world);
  const diagnostics = document.createElement("script");
  diagnostics.type = "application/json";
  diagnostics.id = "snow-diagnostics";
  document.body.append(diagnostics);
  game.onEvent = (event) => ui.event(event);
  canvas.addEventListener("pointerdown", () => audio.unlock(), { once: true });
  window.addEventListener("keydown", () => audio.unlock(), { once: true });
  const orientationCheck = () => {
    if (innerWidth < innerHeight) {
      input.clear();
      game.pause();
    }
  };
  window.addEventListener("resize", orientationCheck);
  let previous = performance.now(),
    accumulator = 0,
    time = 0,
    diagnosticClock = 0;
  function frame(now: number) {
    const realDt = Math.max(0, (now - previous) / 1000);
    previous = now;
    const dt = Math.min(realDt, 0.05);
    time += dt;
    accumulator += dt;
    orientationCheck();
    let first = true;
    let frameInput = { jump: false, held: input.held, ability: false };
    // 每帧最多追赶 6 个固定步，切后台不会制造补帧雪崩或技能消耗。
    while (accumulator >= STEP) {
      if (first) frameInput = input.consume();
      poseSampler.capture(game.player);
      game.update(
        STEP,
        first
          ? frameInput
          : { jump: false, held: frameInput.held, ability: false },
      );
      accumulator -= STEP;
      first = false;
    }
    world.render(
      game,
      time,
      realDt > 0.2 ? dt : realDt,
      storage.data.settings,
      poseSampler.sample(
        game.player,
        accumulator / STEP,
        game.phase === "playing",
      ),
      game.phase === "playing" ? accumulator / STEP : 1,
    );
    audio.update(
      dt,
      game.player,
      game.avalanche.danger(game.player.x),
      game.region,
      game.phase === "playing" || game.phase === "intro",
      game.phase === "won" || game.phase === "lost",
      avalancheFeedback(game.mode, game.tutorialStep, game.phase, game.gap)
        .rumble,
    );
    ui.update(dt);
    requestAnimationFrame(frame);
    diagnosticClock += dt;
    if (diagnosticClock > 0.08) {
      diagnostics.textContent = JSON.stringify(readDiagnostics());
      diagnosticClock = 0;
    }
  }
  requestAnimationFrame(frame);
  // 只读诊断供交接与性能验证，不暴露改写分数、跳关或直接胜利的接口。
  function readDiagnostics() {
    return {
      phase: game.phase,
      tutorialStep: game.tutorialStep,
      mode: game.mode,
      player: { ...game.player, passengers: [...game.player.passengers] },
      stats: structuredClone(game.stats),
      gap: game.gap,
      chaseEnabled: game.chaseEnabled,
      avalancheX: game.avalanche.x,
      avalancheFeedback: avalancheFeedback(
        game.mode,
        game.tutorialStep,
        game.phase,
        game.gap,
      ),
      elapsed: game.elapsed,
      seed: game.seed,
      fps: world.fps,
      draws: world.draws,
      triangles: world.triangles,
      renderQuality: world.renderQuality,
      landingFeedback: world.landingFeedback,
      abilityFeedback: world.abilityFeedback,
      loadedEntities: game.entities.length,
      memoryGeometries: world.renderer.info.memory.geometries,
      nextObstacles: game.entities
        .filter((e) => !e.used && e.kind === "obstacle" && e.x > game.player.x)
        .slice(0, 4)
        .map((e) => ({ x: e.x, y: e.y, kind: e.obstacle })),
      branch: game.terrain.branchHeight(game.player.x),
      saved: storage.data.checkpoint?.x ?? null,
    };
  }
  Object.defineProperty(window, "snowDiagnostics", { value: readDiagnostics });
} catch (error) {
  document.getElementById("ui")!.innerHTML =
    `<main class="dialog"><h2>雪山暂时无法展开</h2><p class="note">浏览器未能启动三维绘图。请开启硬件加速，或使用支持 WebGL 的浏览器重新打开。</p><button class="primary full" onclick="location.reload()">重新打开雪山</button></main>`;
  console.error(error);
}
