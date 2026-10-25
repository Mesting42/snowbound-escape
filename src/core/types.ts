/** 世界采用米、秒和弧度；x 沿路线向右增长，y 向上，z 仅用于美术景深。 */
export type Mode = "adventure" | "endless" | "challenge" | "tutorial";
export type Phase = "menu" | "intro" | "playing" | "paused" | "won" | "lost";
export type Ride = "ski" | "otter" | "yak" | "owl" | "bike" | "sail";
export type Animal = "otter" | "yak" | "owl";
export type ObstacleKind =
  "rock" | "log" | "fence" | "ice" | "arch" | "bridge" | "fall";
export interface Surface {
  y: number;
  slope: number;
  route: "main" | "upper";
}
export interface Entity {
  id: string;
  x: number;
  y: number;
  kind: "coin" | "ride" | "obstacle" | "sign";
  ride?: Ride;
  obstacle?: ObstacleKind;
  route: "main" | "upper";
  used: boolean;
  /** 未接入动物的运行态；只在当前局内存在，检查点重建时清理。 */
  escape?: {
    previousX: number;
    previousY: number;
    speed: number;
    vy: number;
    grounded: boolean;
    age: number;
  };
}
export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  omega: number;
  grounded: boolean;
  route: "main" | "upper";
  airTime: number;
  airRotation: number;
  fall: number;
  protection: number;
  ride: Ride;
  /** 当前载具乘客，每种至多一只；离开载具时统一清空，不进入检查点。 */
  passengers: Animal[];
  ability: number;
  /** 张帆在空中结束后的单次收帆缓降，接地/换乘/损毁清空，不计入主动技能。 */
  sailDescent: number;
  cooldown: number;
  boost: number;
  pose: number;
  lastLanding: string;
  landingAge: number;
}
export interface Stats {
  abilities: number;
  distance: number;
  score: number;
  coins: number;
  flips: number;
  perfect: number;
  perfectStreak: number;
  bestStreak: number;
  crashes: number;
  combo: number;
  bestCombo: number;
  comboTime: number;
  rides: number;
  rideDistance: Record<Ride, number>;
  branches: number;
  dangerTime: number;
  speedTime: number;
  vehicleCoins: number;
  jumps: number;
}
export interface Checkpoint {
  x: number;
  seed: number;
  stats: Stats;
  region: number;
}
export interface Settings {
  music: number;
  sound: number;
  shake: boolean;
  particles: boolean;
  flash: boolean;
  quality: "auto" | "high" | "low";
}
export interface SaveData {
  version: number;
  wallet: number;
  records: { adventure: number; endless: number; score: number };
  stars: Record<string, number>;
  claimed: string[];
  totals: Record<string, number>;
  outfits: string[];
  skis: string[];
  outfit: string;
  ski: string;
  discovered: Ride[];
  settings: Settings;
  tutorial: boolean;
  checkpoint: Checkpoint | null;
  settled: string[];
  assist: boolean;
}
export interface Challenge {
  id: string;
  title: string;
  subtitle: string;
  distance: number;
  metric: string;
  target: number;
  thresholds: [number, number, number];
  maxCrashes?: number;
  starter?: Ride;
}
export type GameEvent = {
  type:
    | "jump"
    | "land"
    | "crash"
    | "recover"
    | "coin"
    | "ride"
    | "passenger"
    | "ability"
    | "break"
    | "region"
    | "win"
    | "lose"
    | "notice";
  text?: string;
  value?: number;
  /** 明确本次发现的对象，避免同一步上车/换乘后读取到最后一个骑乘。 */
  ride?: Ride;
  /** 已消费的来源实体，用于一次性的后续相遇，不从渲染帧生成实体。 */
  sourceId?: string;
  /** 真实碰撞位置与技能状态，供碎木/声音读取，不从当前镜头反推碰撞。 */
  position?: { x: number; y: number };
  powered?: boolean;
};
export interface InputFrame {
  jump: boolean;
  held: boolean;
  ability: boolean;
}
