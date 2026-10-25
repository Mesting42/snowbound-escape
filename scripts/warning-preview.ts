/** 复用正式警告状态与SVG图标的离线尺寸对照；不访问浏览器或冒充HUD截图。 */
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { avalancheWarning } from "../src/systems/avalanche-warning";
import { icon } from "../src/ui/icons";

const gaps = [300, 150, 100, 50];
const panels: string[] = [];
for (const [row, mobile] of [false, true].entries()) {
  for (const [col, gap] of gaps.entries()) {
    const state = avalancheWarning("adventure", 0, "playing", gap);
    const size = (mobile ? 22 : 24) * state.scale;
    const warning = icon("warning").replace(
      "viewBox=",
      `width="${size}" height="${size}" viewBox=`,
    );
    panels.push(
      `<g transform="translate(${20 + col * 275} ${100 + row * 230})"><rect width="260" height="208" rx="12" fill="#eff2e6"/><text x="16" y="28" font-size="14" font-weight="700">${mobile ? "横屏手机" : "桌面"} · 雪崩 ${gap} 米</text><text x="16" y="64" font-size="11">晨光松林</text><text x="16" y="108" font-size="${mobile ? 33 : 44}" font-weight="900">845</text><text x="100" y="108" font-size="12">米</text><text x="16" y="130" font-size="10">122 公里 / 时</text><g transform="translate(${164 - size / 2} ${88 - size / 2})" fill="#c2382d" stroke="#fff5e8" stroke-width="0.6">${warning}</g><text x="16" y="170" font-size="12">${gap >= 200 ? "小尺寸、静止" : `放大 ${state.scale.toFixed(2)}倍 · 晃动 ±${state.tilt.toFixed(1)}°`}</text><text x="16" y="192" font-size="11">${gap >= 200 ? "保持常驻" : `摆动周期 ${state.period.toFixed(2)} 秒`}</text></g>`,
    );
  }
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="575"><rect width="100%" height="100%" fill="#bedbd7"/><g font-family="Microsoft YaHei,sans-serif" fill="#173f49"><text x="24" y="38" font-size="25" font-weight="700">左上角雪崩警告 · 离线尺寸与状态对照</text><text x="24" y="69" font-size="14">正式SVG与距离参数；静态对照不展示晃动，不代表浏览器布局截图或FPS验证。</text>${panels.join("")}</g></svg>`;
await writeFile("docs/screenshots/avalanche-warning.svg", svg);
if (process.argv[2]) {
  const sharp = createRequire(import.meta.url)(process.argv[2]);
  await sharp(Buffer.from(svg))
    .png()
    .toFile("docs/screenshots/avalanche-warning.png");
}
console.log("离线警告状态对照已生成");
