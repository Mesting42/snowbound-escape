import fs from "node:fs/promises";
import path from "node:path";
// 仅构建时获取开源字体子集；正式游玩使用项目内本地字体，无网络依赖。
const root = path.resolve(import.meta.dirname, "..");
async function files(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory()
          ? files(path.join(dir, e.name))
          : [path.join(dir, e.name)],
      ),
    )
  ).flat();
}
let source = await fs.readFile(path.join(root, "index.html"), "utf8");
for (const file of await files(path.join(root, "src")))
  source += await fs.readFile(file, "utf8");
const chars = [...new Set(source.match(/[\u3000-\u9fff]/g))].join("");
const css = await (
  await fetch(
    "https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;600;800;900&display=swap&text=" +
      encodeURIComponent(chars),
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      },
    },
  )
).text();
const matches = [
  ...css.matchAll(/font-weight: ([\d ]+);[\s\S]*?url\((https[^)]+)\)/g),
];
if (!matches.length) throw new Error(css.slice(0, 300));
await fs.mkdir(path.join(root, "public/fonts"), { recursive: true });
for (const match of matches)
  await fs.writeFile(
    path.join(root, `public/fonts/snow-${match[1].replaceAll(" ", "-")}.woff2`),
    Buffer.from(await (await fetch(match[2])).arrayBuffer()),
  );
// 已交付的许可无需重复下载；断网也不会破坏现有许可文件。
const licensePath = path.join(root, "public/fonts/OFL.txt");
try {
  await fs.access(licensePath);
} catch {
  const response = await fetch(
    "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/LICENSE",
  );
  if (!response.ok) throw new Error("无法取得字体许可，请保留现有素材");
  await fs.writeFile(licensePath, await response.text());
}
console.log(
  `已保存 ${chars.length} 字符，字重 ${matches.map((m) => m[1]).join(", ")}。`,
);
