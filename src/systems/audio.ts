import type { Settings, GameEvent, Player } from "../core/types";
import { abilitySound } from "./ability-sound";

/** 本地 WebAudio 合成原创声音，无外部音频请求；首次手势后解锁浏览器音频。 */
export class Audio {
  private ctx?: AudioContext;
  private master?: GainNode;
  private music?: GainNode;
  private fx?: GainNode;
  private wind?: GainNode;
  private snow?: GainNode;
  private rumble?: GainNode;
  private engine?: OscillatorNode;
  private motor?: GainNode;
  private clock = 0;
  private note = 0;
  settings: Settings;
  constructor(settings: Settings) {
    this.settings = settings;
  }
  unlock() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = (this.ctx = new AudioContext());
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);
    this.music = ctx.createGain();
    this.music.connect(this.master);
    this.fx = ctx.createGain();
    this.fx.connect(this.master);
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate),
      data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const makeNoise = (frequency: number) => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = frequency;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.fx!);
      source.start();
      return gain;
    };
    this.wind = makeNoise(650);
    this.snow = makeNoise(1800);
    this.rumble = makeNoise(120);
    this.engine = ctx.createOscillator();
    this.engine.type = "sawtooth";
    this.motor = ctx.createGain();
    this.motor.gain.value = 0;
    this.engine.connect(this.motor);
    this.motor.connect(this.fx);
    this.engine.start();
  }
  private tone(
    f: number,
    duration: number,
    volume: number,
    type: OscillatorType = "sine",
    musical = false,
  ) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(),
      g = this.ctx.createGain(),
      now = this.ctx.currentTime;
    o.type = type;
    o.frequency.setValueAtTime(f, now);
    o.frequency.exponentialRampToValueAtTime(
      Math.max(30, f * 0.8),
      now + duration,
    );
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(volume, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    o.connect(g);
    g.connect((musical ? this.music : this.fx)!);
    o.start();
    o.stop(now + duration + 0.02);
  }
  event(event: GameEvent) {
    if (event.type === "break") {
      this.tone(92, 0.17, event.powered ? 0.16 : 0.1, "triangle");
      this.tone(210, 0.11, 0.08, "sawtooth");
    }
    if (event.type === "coin") this.tone(1050, 0.13, 0.08);
    if (event.type === "jump") this.tone(320, 0.2, 0.1, "triangle");
    if (event.type === "land")
      this.tone(
        event.value ? 740 : 160,
        0.25,
        0.13,
        event.value ? "sine" : "triangle",
      );
    if (event.type === "crash") this.tone(80, 0.45, 0.24, "sawtooth");
    if (event.type === "recover") this.tone(440, 0.3, 0.12);
    if (event.type === "ride" || event.type === "passenger") {
      this.tone(540, 0.35, 0.12, "triangle");
      this.tone(810, 0.5, 0.08);
    }
    if (event.type === "ability") {
      const frequency =
        event.ride === "bike"
          ? 105
          : event.ride === "yak"
            ? 145
            : event.ride === "otter"
              ? 310
              : 490;
      this.tone(
        frequency,
        0.3,
        0.12,
        event.ride === "bike" || event.ride === "yak" ? "triangle" : "sine",
      );
      this.tone(frequency * 1.5, 0.45, 0.07);
    }
    if (event.type === "win")
      [523, 659, 784, 1046].forEach((n, i) =>
        setTimeout(() => this.tone(n, 0.7, 0.12, "triangle"), i * 150),
      );
    if (event.type === "lose") this.tone(120, 1, 0.16, "triangle");
  }
  update(
    dt: number,
    p: Player,
    danger: number,
    region: number,
    active: boolean,
    terminal = false,
    avalancheRumble = 0,
  ) {
    if (!this.ctx || !this.music || !this.fx) return;
    this.music.gain.value = active ? this.settings.music : 0;
    this.fx.gain.value = active || terminal ? this.settings.sound : 0;
    const t = this.ctx.currentTime;
    const ability = abilitySound(p);
    this.rumble!.gain.setTargetAtTime(active ? avalancheRumble : 0, t, 0.35);
    this.wind!.gain.setTargetAtTime(
      active ? 0.035 + danger * 0.18 + p.vx * 0.001 + ability.wind : 0,
      t,
      0.2,
    );
    this.snow!.gain.setTargetAtTime(
      active && p.grounded ? 0.025 + p.vx * 0.001 + ability.snow : 0,
      t,
      0.15,
    );
    this.engine!.frequency.setTargetAtTime(ability.engineHz, t, 0.15);
    this.motor!.gain.setTargetAtTime(active ? ability.engineGain : 0, t, 0.1);
    if (!active) return;
    this.clock += dt;
    if (this.clock > (danger > 0.7 ? 0.24 : 0.48)) {
      this.clock = 0;
      const melody = [0, 7, 12, 14, 12, 7, 4, 7, 0, 7, 11, 14, 11, 7, 2, 7];
      const n =
        melody[this.note++ % melody.length] +
        (region === 1 ? -2 : region === 2 ? -5 : 0);
      this.tone(220 * 2 ** (n / 12), 0.7, 0.085, "sine", true);
      if (this.note % 4 === 0)
        this.tone(110 * 2 ** (n / 12), 1.5, 0.045, "triangle", true);
    }
  }
}
