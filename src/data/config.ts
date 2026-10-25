import type { Challenge, Ride } from "../core/types";

export const ADVENTURE_LENGTH = 18000;
export const REGION_LENGTH = 6000;
export const STEP = 1 / 120;
export const REGIONS = [
  {
    name: "晨光松林",
    subtitle: "从第一缕阳光出发",
    sky: "#bbdcd9",
    fog: "#bededb",
    snow: "#f2f4df",
    accent: "#e5a56e",
    light: "#fff0cc",
  },
  {
    name: "冰川峡谷",
    subtitle: "在蓝色冰川之间飞跃",
    sky: "#7caabd",
    fog: "#9ac9d7",
    snow: "#d5f1f6",
    accent: "#5daec4",
    light: "#dbf6ff",
  },
  {
    name: "暮色雪原",
    subtitle: "山脚的灯，为你亮着",
    sky: "#b4b8d4",
    fog: "#c7c5dc",
    snow: "#eeebfa",
    accent: "#e79a88",
    light: "#ffd3ad",
  },
];
/** 所有骑乘参数在这里声明；退出时统一回到 ski，能力不会泄漏到其他状态。 */
export const RIDES: Record<
  Ride,
  {
    name: string;
    detail: string;
    ability: string;
    jump: number;
    mass: number;
    cruise: number;
    color: string;
  }
> = {
  ski: {
    name: "双板滑雪",
    detail: "顺坡提速，收身腾空，寻找下一处落点。",
    ability: "轻巧跃起",
    jump: 11.8,
    mass: 1,
    cruise: 28,
    color: "#ee794c",
  },
  otter: {
    name: "雪獭 · 团团",
    detail:
      "发动贴雪冲刺时明显提速、进一步减小阻力，身后卷起集中雪浪；轻快地跃过倒木。",
    ability: "贴雪冲刺",
    jump: 11.8,
    mass: 0.85,
    cruise: 30,
    color: "#ba8e6f",
  },
  yak: {
    name: "冰原牦牛 · 岩角",
    detail:
      "低头冲锋并明显提速，破木时碎片飞散、速度损失更小；仍只撞开木质障碍，岩石与冰壁需避让。",
    ability: "破障冲锋",
    jump: 9.8,
    mass: 1.5,
    cruise: 29,
    color: "#78695c",
  },
  owl: {
    name: "雪鸮 · 云翎",
    detail:
      "发动后双翼展开并带出气流，空中抬升、减缓下坠；技能结束后恢复正常下降。",
    ability: "展翼滑翔",
    jump: 11.8,
    mass: 0.9,
    cruise: 29,
    color: "#eee8d9",
  },
  bike: {
    name: "雪地机车 · 赤狐",
    detail:
      "引擎增压时尾部喷火、短时强力提速；抵抗轻型障碍，空翻更沉，后座可接上三种动物。",
    ability: "引擎增压",
    jump: 10.4,
    mass: 1.65,
    cruise: 35,
    color: "#df6545",
  },
  sail: {
    name: "风帆雪橇 · 逐风",
    detail:
      "张帆时地面提速、空中滑翔，收帆后平顺下降；可搭载三种动物，能力键仍用于张帆。",
    ability: "乘风张帆",
    jump: 10.8,
    mass: 1.2,
    cruise: 32,
    color: "#d5ad65",
  },
};
export const CHALLENGES: Challenge[] = [
  {
    id: "c1",
    title: "第一道雪痕",
    subtitle: "抵达 900 米处的路标",
    distance: 900,
    metric: "distance",
    target: 900,
    thresholds: [0, 1100, 2000],
  },
  {
    id: "c2",
    title: "翻过晴空",
    subtitle: "成功落地结算 3 次后空翻",
    distance: 1300,
    metric: "flips",
    target: 3,
    thresholds: [3, 5, 7],
  },
  {
    id: "c3",
    title: "轻落如雪",
    subtitle: "连续完成 3 次精准落地",
    distance: 1400,
    metric: "bestStreak",
    target: 3,
    thresholds: [3, 4, 6],
  },
  {
    id: "c4",
    title: "团团的旅途",
    subtitle: "与雪獭共同滑行 450 米",
    distance: 1100,
    metric: "otter",
    target: 450,
    thresholds: [450, 600, 720],
    starter: "otter",
  },
  {
    id: "c5",
    title: "赤狐快递",
    subtitle: "驾驶载具收集 10 枚雪晶",
    distance: 1200,
    metric: "vehicleCoins",
    target: 10,
    thresholds: [10, 16, 22],
    starter: "bike",
  },
  {
    id: "c6",
    title: "无痕穿林",
    subtitle: "至多碰撞 2 次，抵达 1200 米",
    distance: 1200,
    metric: "distance",
    target: 1200,
    thresholds: [2, 1, 0],
    maxCrashes: 2,
  },
  {
    id: "c7",
    title: "云上的近路",
    subtitle: "完整通过 2 段上方奖励路线",
    distance: 2000,
    metric: "branches",
    target: 2,
    thresholds: [2, 3, 4],
    starter: "owl",
  },
  {
    id: "c8",
    title: "雪浪之前",
    subtitle: "在雪崩 100 米内，以高速坚持 8 秒",
    distance: 1100,
    metric: "dangerTime",
    target: 8,
    thresholds: [8, 12, 16],
  },
  {
    id: "c9",
    title: "山间自由式",
    subtitle: "完成空翻、精准落地与伙伴协作，技巧分达 2800",
    distance: 1700,
    metric: "mixed",
    target: 2800,
    thresholds: [2800, 4200, 6000],
    starter: "sail",
  },
];
export const MISSIONS = [
  { id: "m1", title: "第一程", metric: "distance", target: 1500, reward: 70 },
  {
    id: "m2",
    title: "雪山旅人",
    metric: "distance",
    target: 15000,
    reward: 180,
  },
  { id: "m3", title: "空中的弧线", metric: "flips", target: 5, reward: 90 },
  { id: "m4", title: "翻越云层", metric: "flips", target: 30, reward: 180 },
  { id: "m5", title: "轻盈脚步", metric: "perfect", target: 8, reward: 100 },
  { id: "m6", title: "雪晶收藏家", metric: "coins", target: 60, reward: 100 },
  { id: "m7", title: "山间朋友", metric: "rides", target: 5, reward: 100 },
  { id: "m8", title: "雪獭同路", metric: "otter", target: 1000, reward: 120 },
  {
    id: "m9",
    title: "追风骑士",
    metric: "vehicleCoins",
    target: 40,
    reward: 130,
  },
  {
    id: "m10",
    title: "另一条风景",
    metric: "branches",
    target: 5,
    reward: 140,
  },
  { id: "m11", title: "稳住节奏", metric: "bestCombo", target: 5, reward: 140 },
  { id: "m12", title: "山脚见", metric: "wins", target: 1, reward: 250 },
];
export const OUTFITS = [
  {
    id: "sunrise",
    name: "晨光旅人",
    color: "#ed784e",
    pants: "#284b53",
    price: 0,
    detail: "短款冲锋衣 · 长围巾",
  },
  {
    id: "forest",
    name: "松林向导",
    color: "#507d66",
    pants: "#334d55",
    price: 160,
    detail: "连帽外套 · 双肩行囊",
  },
  {
    id: "glacier",
    name: "冰川邮差",
    color: "#4a9ebc",
    pants: "#293e60",
    price: 240,
    detail: "长款风衣 · 斜挎邮包",
  },
  {
    id: "dusk",
    name: "落日巡游",
    color: "#ba6686",
    pants: "#493c59",
    price: 320,
    detail: "绒领夹克 · 毛线帽",
  },
];
export const SKIS = [
  { id: "wood", name: "白蜡木双板", color: "#ba8553", price: 0 },
  { id: "ice", name: "冰蓝竞速板", color: "#4aacc5", price: 120 },
  { id: "sun", name: "落日燕尾板", color: "#e56c4f", price: 200 },
];
