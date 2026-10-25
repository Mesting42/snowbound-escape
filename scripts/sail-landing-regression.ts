/** 无障碍、无空翻输入的正式滑翔落地回归，不调用胜负设置或修改落地评分。 */
import { writeFile } from "node:fs/promises";
import { Terrain } from "../src/systems/terrain";
import { createPlayer, updatePhysics } from "../src/systems/physics";
import { createStats } from "../src/systems/score";
import { enterRide } from "../src/systems/passengers";

const failures: object[] = [],
  seeds = [1, 7, 19, 52, 135, 71829];
const grades: Record<string, number> = {};
let landings = 0,
  main = 0,
  upper = 0,
  recovered = 0,
  maxRecovery = 0;
for (const seed of seeds)
  for (const speed of [22, 38, 41])
    for (let start = 0; start < 5000; start += 40) {
      const t = new Terrain(seed),
        p = createPlayer(t, start),
        s = createStats();
      enterRide(p, "sail");
      p.vx = speed;
      p.protection = 0;
      p.grounded = false;
      p.y += 2;
      p.vy = -1;
      let buffered = false;
      for (let i = 0; i < 1800; i++) {
        updatePhysics(
          p,
          t,
          s,
          { jump: false, held: false, ability: i === 0 },
          1 / 120,
          false,
        );
        buffered ||= p.sailDescent > 0;
        maxRecovery = Math.max(maxRecovery, p.sailDescent);
        if (p.grounded) {
          landings++;
          if (p.route === "upper") upper++;
          else main++;
          if (buffered) recovered++;
          grades[p.lastLanding] = (grades[p.lastLanding] ?? 0) + 1;
          if (
            (s.crashes > 0 || p.ride !== "sail" || p.sailDescent !== 0) &&
            failures.length < 20
          )
            failures.push({
              seed,
              speed,
              start,
              seconds: (i + 1) / 120,
              x: p.x,
              grade: p.lastLanding,
              ride: p.ride,
              crashes: s.crashes,
              recovery: p.sailDescent,
            });
          break;
        }
        if (i === 1799) failures.push({ seed, speed, start, timeout: true });
      }
    }
const result = {
  cases: seeds.length * 3 * 125,
  landings,
  main,
  upper,
  recovered,
  maxRecovery,
  grades,
  failures,
  evidence: "formal-physics-no-obstacles-no-flips-no-rendering",
};
await writeFile(
  "docs/sail-landing-regression.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
