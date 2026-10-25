import { Terrain } from "../src/systems/terrain";
import { createPlayer, updatePhysics } from "../src/systems/physics";
import { createStats } from "../src/systems/score";
for (const threshold of [0, 4.4, 4.8, 5.2, 5.5, 5.8, 6]) {
  const t = new Terrain(1),
    p = createPlayer(t, 120),
    stats = createStats();
  p.vx = 28;
  for (let i = 0; i < 300; i++) {
    const events = updatePhysics(
      p,
      t,
      stats,
      {
        jump: i === 0,
        held: threshold > 0 && p.airRotation < threshold,
        ability: false,
      },
      1 / 120,
      false,
    );
    if (events.some((e) => e.type === "land" || e.type === "crash")) {
      console.log({
        threshold,
        t: i / 120,
        grade: p.lastLanding,
        flips: stats.flips,
        score: stats.score,
      });
      break;
    }
  }
}
