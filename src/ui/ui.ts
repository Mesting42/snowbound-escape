import { Game } from "../core/game";
import { Audio } from "../systems/audio";
import { Input } from "../systems/input";
import {
  CHALLENGES,
  MISSIONS,
  OUTFITS,
  REGIONS,
  RIDES,
  SKIS,
} from "../data/config";
import type { Ride, GameEvent } from "../core/types";
import { clamp } from "../core/math";
import type { World } from "../render/world";
import { icon } from "./icons";
import { avalancheFeedback } from "../systems/avalanche-feedback";
import { passengerSeats } from "./passenger-seats";
import { avalancheWarning } from "../systems/avalanche-warning";
import {
  avalancheWarningMarkup,
  updateAvalancheWarning,
} from "./avalanche-warning";

type Page =
  | "home"
  | "modes"
  | "challenges"
  | "closet"
  | "guide"
  | "missions"
  | "settings";
const number = (n: number) => Math.floor(n).toLocaleString("zh-CN");
const stars = (n: number) =>
  Array.from({ length: 3 }, (_, i) =>
    icon("star", i < n ? "lit" : "unlit"),
  ).join("");
export class UI {
  page: Page = "home";
  private previous: Page = "home";
  private toastTime = 0;
  private toast = "";
  private timer = 0;
  private lastPhase = "";
  private closetTab: "outfits" | "skis" = "outfits";
  private guideRide: Ride = "otter";
  private hud?: HTMLElement;
  private selectedOutfit = "sunrise";
  private selectedSki = "wood";
  private message?: HTMLElement;
  private onboarding = false;
  constructor(
    private root: HTMLElement,
    private game: Game,
    private audio: Audio,
    private input: Input,
    private world: World,
  ) {
    game.onPhase = () => {
      input.clear();
      this.render();
    };
    root.addEventListener("click", (e) => {
      const button = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-action]",
      );
      if (!button || button.hasAttribute("disabled")) return;
      e.stopPropagation();
      audio.unlock();
      this.action(button.dataset.action!, button.dataset.id);
    });
    root.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      const key = target.dataset.volume as "music" | "sound";
      if (key) {
        game.storage.data.settings[key] = Number(target.value);
        game.storage.save();
      }
    });
    this.render();
    if (game.storage.warning) this.notify(game.storage.warning);
  }
  private button(text: string, action: string, type = "", id = "") {
    return `<button class="${type}" data-action="${action}" data-id="${id}"${action === "settings" ? ' aria-label="设置"' : action === "fullscreen" ? ' aria-label="切换全屏"' : action === "pause" ? ' aria-label="暂停"' : ""}>${text}</button>`;
  }
  private action(action: string, id?: string) {
    const save = this.game.storage.data;
    if (action === "adventure" && !save.tutorial) {
      this.onboarding = true;
      this.render();
      return;
    }
    if (action === "skip-tutorial") {
      this.onboarding = false;
      save.tutorial = true;
      this.game.storage.save();
      this.page = "home";
      this.game.start("adventure");
    }
    if (action === "tutorial") this.onboarding = false;
    if (
      [
        "adventure",
        "endless",
        "challenge",
        "tutorial",
        "continue",
        "retry",
      ].includes(action)
    ) {
      this.page = "home";
      this.world.previewRide = null;
      this.world.previewOutfit = null;
      this.world.previewSki = null;
    }
    if (action === "page") {
      this.page = id as Page;
      this.world.previewRide = this.page === "guide" ? this.guideRide : null;
      this.world.previewOutfit = null;
      this.world.previewSki = null;
      if (this.page === "closet") {
        this.selectedOutfit = save.outfit;
        this.selectedSki = save.ski;
        this.world.previewOutfit = save.outfit;
        this.world.previewSki = save.ski;
      }
      this.render();
    }
    if (action === "home") {
      this.game.menu();
      this.page = "home";
      this.world.previewRide = null;
      this.world.previewOutfit = null;
      this.world.previewSki = null;
      this.render();
    }
    if (action === "adventure") this.game.start("adventure");
    if (action === "endless") this.game.start("endless");
    if (action === "challenge") this.game.start("challenge", id);
    if (action === "tutorial") this.game.start("tutorial");
    if (action === "continue") this.game.start("adventure", undefined, true);
    if (action === "resume") {
      if (innerWidth < innerHeight) return;
      this.game.resume();
    }
    if (action === "pause") this.game.pause();
    if (action === "retry")
      this.game.start(this.game.mode, this.game.challenge?.id);
    if (action === "ability") this.input.useAbility();
    if (action === "settings") {
      this.previous = this.page;
      this.page = "settings";
      this.game.pause();
      this.render();
    }
    if (action === "back-settings") {
      this.page = this.previous;
      this.render();
    }
    if (action === "tab") {
      this.closetTab = id as "outfits" | "skis";
      this.render();
    }
    if (action === "buy") {
      const isOutfit = this.closetTab === "outfits";
      const item = (isOutfit ? OUTFITS : SKIS).find((i) => i.id === id)!;
      const owned = isOutfit ? save.outfits : save.skis;
      if (!owned.includes(id!)) {
        if (save.wallet < item.price) {
          this.notify("雪晶还差一点 · 完成任务可以获得更多");
          return;
        }
        save.wallet -= item.price;
        owned.push(id!);
      }
      // 模型生命周期由 World 统一管理，购买另一行时也立即切到实际装备预览。
      if (isOutfit) {
        save.outfit = id!;
        this.selectedOutfit = id!;
        this.world.previewOutfit = id!;
      } else {
        save.ski = id!;
        this.selectedSki = id!;
        this.world.previewSki = id!;
      }
      this.game.storage.save();
      this.render();
    }
    if (action === "preview") {
      if (this.closetTab === "outfits") {
        this.selectedOutfit = id!;
        this.world.previewOutfit = id!;
      } else {
        this.selectedSki = id!;
        this.world.previewSki = id!;
      }
      this.render();
    }
    if (action === "guide") {
      this.guideRide = id as Ride;
      this.world.previewRide = this.guideRide;
      this.render();
    }
    if (action === "claim") {
      if (this.game.storage.claim(id!)) {
        this.notify("任务奖励已领取");
        this.audio.event({ type: "coin" });
      }
      this.render();
    }
    if (action === "toggle") {
      if (id === "assist") save.assist = !save.assist;
      else {
        const key = id as "shake" | "particles" | "flash";
        save.settings[key] = !save.settings[key];
      }
      this.game.storage.save();
      this.render();
    }
    if (action === "quality") {
      save.settings.quality = id as "auto" | "high" | "low";
      this.game.storage.save();
      this.render();
    }
    if (action === "fullscreen") {
      if (document.fullscreenElement) void document.exitFullscreen();
      else if (document.documentElement.requestFullscreen)
        void document.documentElement
          .requestFullscreen()
          .catch(() => this.notify("当前浏览器不支持全屏，横屏仍可正常游玩"));
      else this.notify("当前浏览器不支持全屏，横屏仍可正常游玩");
    }
  }
  notify(text: string) {
    this.toast = text;
    this.toastTime = 3.5;
    if (this.message) {
      this.message.textContent = text;
      this.message.classList.add("show");
    }
  }
  event(event: GameEvent) {
    this.audio.event(event);
    if (event.type === "break")
      this.world.abilityEvent(event, this.game.elapsed);
    if (
      event.type === "land" &&
      event.value &&
      this.game.storage.data.settings.flash
    )
      this.world.highlight();
    if (event.text) this.notify(event.text);
    if (event.type === "region")
      this.notify(
        `进入${REGIONS[this.game.region].name} · ${REGIONS[this.game.region].subtitle}`,
      );
    if (event.type === "crash" || (event.type === "land" && event.value))
      this.world.impact();
  }
  private header(back = false) {
    return `<header class="topbar"><div class="brand">${icon("mountain")}<span>雪境疾行</span></div><nav>${back ? this.button(`${icon("back")} 返回营地`, "home", "text-button") : this.button(`${icon("flag")} 旅途任务`, "page", "text-button", "missions")}${this.button(icon("fullscreen"), "fullscreen", "icon-button", "")}${this.button(icon("gear"), "settings", "icon-button", "")}</nav></header>`;
  }
  private home() {
    const save = this.game.storage.data;
    return `${this.header()}<main class="home"><h1>雪境<br/><span>疾行</span><i class="title-line"></i></h1><p class="home-copy">风从山顶来。<br/>带上勇气，我们山脚见。</p><div class="home-actions">${this.button(`出发，去雪山 ${icon("arrow")}`, "page", "primary big", "modes")}${save.checkpoint ? this.button(`继续旅程 · ${number(save.checkpoint.x)} 米`, "continue", "continue") : ""}</div><div class="home-links">${this.button(`${icon("outfit")} 外观装备`, "page", "text-button", "closet")}${this.button(`${icon("book")} 山间伙伴`, "page", "text-button", "guide")}</div></main><div class="scene-caption"><span class="caption-rule"></span><b>晨光松林</b><span>海拔 3,260 米 · 营地出发点</span></div><footer class="home-footer"><div class="route-line"><span class="active">晨光松林</span><i></i><span>冰川峡谷</span><i></i><span>暮色雪原</span><i></i>${icon("flag")}</div><span class="desktop-hint">空格 / 点击跳跃 · 按住后空翻</span></footer>`;
  }
  private modes() {
    const record = this.game.storage.data.records;
    return `${this.header(true)}<main class="sheet mode-sheet"><h2>选择你的旅途</h2><p class="sub">每一道雪痕，都是新的风景。</p><button class="mode-row featured" data-action="adventure"><div class="mode-art mountain-art">${icon("mountain")}</div><div><h3>雪山逃生</h3><p>穿越三个区域，抵达山脚避难站</p><span>约 8–12 分钟 · 完整冒险</span></div>${icon("arrow")}</button><button class="mode-row" data-action="endless"><div class="mode-art wind-art">${icon("bolt")}</div><div><h3>无尽滑行</h3><p>沿着风，滑向更远的地方</p><span>最远纪录 ${number(record.endless)} 米</span></div>${icon("arrow")}</button><button class="mode-row" data-action="page" data-id="challenges"><div class="mode-art flag-art">${icon("flag")}</div><div><h3>雪道挑战</h3><p>九条专属雪道，练就山间好身手</p><span>已获 ${Object.values(this.game.storage.data.stars).reduce((a, b) => a + b, 0)} / 27 颗星</span></div>${icon("arrow")}</button><div class="sheet-foot">${this.button("先练一练 · 操作教学", "tutorial", "text-button")}${this.game.storage.data.checkpoint ? this.button("继续上次逃生", "continue", "text-button") : ""}</div></main>`;
  }
  private challenges() {
    return `${this.header(true)}<main class="sheet wide"><h2>九条雪道，九种好身手</h2><p class="sub">星光留在这里，进步带往下一程。</p><div class="challenge-grid">${CHALLENGES.map((c, i) => `<button class="challenge" data-action="challenge" data-id="${c.id}"><span class="trail-no">${String(i + 1).padStart(2, "0")}</span><h3>${c.title}</h3><p>${c.subtitle}</p><div class="challenge-bottom"><span class="stars">${stars(this.game.storage.data.stars[c.id] ?? 0)}</span><span>${number(c.distance)} 米 ${icon("arrow")}</span></div></button>`).join("")}</div></main>`;
  }
  private closet() {
    const save = this.game.storage.data,
      items = this.closetTab === "outfits" ? OUTFITS : SKIS;
    return `${this.header(true)}<main class="sheet wardrobe"><div class="section-top"><h2>整装，再出发</h2><span class="wallet">${icon("crystal")}${number(save.wallet)}</span></div><p class="sub">用旅途收获，换一身新的心情。</p><div class="tabs">${this.button("旅人衣橱", "tab", this.closetTab === "outfits" ? "selected" : "", "outfits")}${this.button("雪具工坊", "tab", this.closetTab === "skis" ? "selected" : "", "skis")}</div><div class="gear-list">${items
      .map((item) => {
        const owned = (
            this.closetTab === "outfits" ? save.outfits : save.skis
          ).includes(item.id),
          equipped =
            (this.closetTab === "outfits" ? save.outfit : save.ski) === item.id;
        const selected =
          (this.closetTab === "outfits"
            ? this.selectedOutfit
            : this.selectedSki) === item.id;
        return `<div class="gear ${selected ? "equipped" : ""}"><button class="gear-preview" data-action="preview" data-id="${item.id}" aria-label="试览${item.name}"><span class="gear-swatch" style="--gear:${item.color}">${icon(this.closetTab === "outfits" ? "outfit" : "bolt")}</span><span><b>${item.name}</b><small>${"detail" in item ? item.detail : "轻盈双板 · 原创涂装"} · 点击试览</small></span></button><button class="gear-equip" data-action="buy" data-id="${item.id}" ${equipped ? "disabled" : ""}>${equipped ? `${icon("check")} 已装备` : owned ? "装备" : `${icon("crystal")} ${item.price} 解锁`}</button></div>`;
      })
      .join(
        "",
      )}</div><p class="note">外观改变造型，基础能力始终平等。</p></main>`;
  }
  private guide() {
    const ride = RIDES[this.guideRide],
      seen = this.game.storage.data.discovered.includes(this.guideRide);
    return `${this.header(true)}<main class="sheet wardrobe"><h2>山间同行者</h2><p class="sub">有朋友的雪道，总能再远一点。</p><div class="guide-tabs">${(["otter", "yak", "owl", "bike", "sail"] as Ride[]).map((r) => this.button(RIDES[r].name.split(" · ")[0], "guide", this.guideRide === r ? "selected" : "", r)).join("")}</div><div class="guide-copy"><span class="discovered">${seen ? "已在旅途中相遇" : "等待你在雪道上发现"}</span><h3>${ride.name}</h3><p>${ride.detail}</p><div class="ability-detail">${icon("bolt")}<div><b>${ride.ability}</b><p>按 E 或能力按钮发动 · 冷却 6 秒<br/>持续同行，碰撞或换乘后离队</p></div></div><p class="note">追近动物自动接入。机车和风帆雪橇各可载三种动物：团团减阻、岩角挡一次损毁撞击、云翎减缓下降；能力键仍使用载具技能。骑着动物登车会一起上车，重复物种不重复接入。载具损毁后乘客离队，换车保留乘客；单独骑乘时追上另一种动物自动换乘。</p></div></main>`;
  }
  private missions() {
    const save = this.game.storage.data;
    return `${this.header(true)}<main class="sheet missions"><div class="section-top"><h2>沿途的小小成就</h2><span class="wallet">${icon("crystal")}${number(save.wallet)}</span></div><p class="sub">记录每一次出发，也奖励每一点进步。进度在旅程结算后更新。</p><div class="mission-list">${MISSIONS.map(
      (m) => {
        const progress = Math.min(m.target, save.totals[m.metric] ?? 0),
          claimed = save.claimed.includes(m.id),
          ready = progress >= m.target;
        return `<div class="mission"><div><b>${m.title}</b><div class="mission-progress"><span style="width:${(progress / m.target) * 100}%"></span></div><small>${number(progress)} / ${number(m.target)}</small></div><span class="reward">${icon("crystal")}${m.reward}</span><button data-action="claim" data-id="${m.id}" ${claimed || !ready ? "disabled" : ""}>${claimed ? "已领取" : ready ? "领取奖励" : "旅途中"}</button></div>`;
      },
    ).join("")}</div></main>`;
  }
  private settings() {
    const save = this.game.storage.data,
      s = save.settings;
    return `<div class="scrim"></div><main class="dialog settings"><div class="section-top"><h2>旅途设置</h2>${this.button(icon("back"), "back-settings", "icon-button")}</div><label class="slider-row"><span>背景音乐</span><input aria-label="背景音乐音量" type="range" min="0" max="1" step=".05" value="${s.music}" data-volume="music"/></label><label class="slider-row"><span>环境与音效</span><input aria-label="环境与音效音量" type="range" min="0" max="1" step=".05" value="${s.sound}" data-volume="sound"/></label><div class="setting-row"><span>画面质量</span><div class="segmented">${(["auto", "high", "low"] as const).map((q, i) => this.button(["自适应", "精细", "流畅"][i], "quality", s.quality === q ? "selected" : "", q)).join("")}</div></div>${[
      ["shake", "落地镜头震动", s.shake],
      ["particles", "雪粉与环境粒子", s.particles],
      ["flash", "技巧高光反馈", s.flash],
      ["assist", "加强松手姿态辅助", save.assist],
    ]
      .map(
        ([id, title, value]) =>
          `<div class="setting-row"><span>${title}</span><button class="switch ${value ? "on" : ""}" data-action="toggle" data-id="${id}" aria-label="${title}" aria-pressed="${value}"><i></i></button></div>`,
      )
      .join(
        "",
      )}<p class="note">空格 / 鼠标按下：跳跃<br/>空中按住：后空翻 · 松开：准备落地<br/>E：伙伴 / 载具能力 · Esc：暂停<br/>触屏：点击雪道跳跃，按住空翻</p>${this.game.phase === "menu" ? this.button("重新练习操作", "tutorial", "secondary full") : ""}</main>`;
  }
  private paused() {
    return `<div class="scrim"></div><main class="dialog pause"><div class="pause-mark">${icon("pause")}</div><h2>在雪地里歇一会儿</h2><p>雪浪也停住了。准备好，再一起出发。</p>${this.button(`继续滑行 ${icon("play")}`, "resume", "primary full")}${this.button("设置与操作", "settings", "secondary full")}<div class="dialog-links">${this.button("重新出发", "retry", "text-button")}${this.button("返回营地", "home", "text-button")}</div><small>安全检查点已自动保留</small></main>`;
  }
  private result() {
    const g = this.game,
      won = g.phase === "won";
    return `<div class="result-shade"></div><main class="result"><div class="result-stamp">${icon(won ? "flag" : "mountain")}</div><h1>${won ? (g.mode === "adventure" ? "山脚见。<br/>我们做到了。" : g.mode === "tutorial" ? "准备好了，<br/>去看更远的风景。" : "漂亮，<br/>这条雪道属于你。") : "歇一歇，<br/>再追一次风。"}</h1><p>${won ? (g.mode === "adventure" ? "避难站的灯亮着。你的雪山故事，有了温暖的结尾。" : "每次稳稳落地，都让下一次出发更从容。") : `${g.reason}。下一程，记得把勇气也带上。`}</p>${g.challenge ? `<div class="result-stars stars">${stars(g.stars)}</div>` : ""}<div class="results"><div><b>${number(g.stats.distance)}</b><span>滑行距离 / 米</span></div><div><b>${number(g.stats.score)}</b><span>旅途得分</span></div><div><b>${g.stats.flips}</b><span>成功空翻</span></div><div><b>${g.stats.perfect}</b><span>精准落地</span></div></div><div class="earned">${icon("crystal")}本程收获 <b>+${g.earned}</b> 雪晶</div><div class="result-actions">${this.button(won && g.mode === "tutorial" ? `正式出发 ${icon("arrow")}` : `再滑一程 ${icon("reset")}`, won && g.mode === "tutorial" ? "adventure" : "retry", "primary")}${this.button("返回营地", "home", "secondary")}</div></main>`;
  }
  private gameplay() {
    return `<div class="hud" id="hud"><div class="hud-left"><div class="hud-progress"><span class="region" id="hud-region"></span><div class="distance"><b id="hud-distance">0</b><span>米</span></div><div class="speed"><span id="hud-speed">0</span> 公里 / 时</div></div>${avalancheWarningMarkup()}</div><div class="route-progress"><div class="route-progress-fill" id="route-fill"></div><span>营地</span><span>松林</span><span>冰川</span><span>雪原</span>${icon("flag")}</div><div class="hud-right"><div class="score"><b id="hud-score">0</b><small>旅途得分</small></div>${this.button(icon("pause"), "pause", "pause-button")}</div><div class="avalanche-meter" id="danger"><div><span>雪崩距离</span><b id="hud-gap">240 米</b></div><small id="hud-chase-status">身后推进</small><div class="danger-track"><i id="danger-fill"></i></div></div><div class="goal" id="hud-goal"></div><div class="combo" id="hud-combo"></div><div class="ride-hud" id="hud-ride"></div><button class="ability-button" data-action="ability" id="ability" aria-label="使用伙伴或载具能力">${icon("bolt")}<span>能力</span><small>E</small></button><div class="control-hint" id="control-hint">点击 / 空格起跳 · 空中按住翻转 · 松开准备落地</div><div class="intro" id="intro"></div></div>`;
  }
  render() {
    const phase = this.game.phase;
    this.lastPhase = phase;
    this.hud = undefined;
    document.body.classList.toggle("in-game", phase !== "menu");
    let content: string;
    if (this.onboarding)
      content = `<div class="scrim"></div><main class="dialog pause"><div class="pause-mark">${icon("mountain")}</div><h2>出发前，认识一下雪道</h2><p>点击或空格起跳，空中按住后空翻。<br/>接近一圈时松开，准备稳稳落地。<br/>伙伴会自动接入，按 E / 能力键发动能力。<br/>沿连接坡道滑上高台，雪崩始终在身后推进。</p>${this.button("用半分钟，亲自试一试", "tutorial", "primary full")}${this.button("我准备好了，直接出发", "skip-tutorial", "text-button")}</main>`;
    else if (this.page === "settings") content = this.settings();
    else if (phase === "menu")
      content = (
        {
          home: () => this.home(),
          modes: () => this.modes(),
          challenges: () => this.challenges(),
          closet: () => this.closet(),
          guide: () => this.guide(),
          missions: () => this.missions(),
        }[this.page] ?? (() => this.home())
      )();
    else if (phase === "paused") content = this.paused();
    else if (phase === "won" || phase === "lost") content = this.result();
    else {
      content = this.gameplay();
      this.page = "home";
    }
    this.root.innerHTML =
      content + '<div class="toast" id="toast" role="status"></div>';
    this.hud = document.getElementById("hud") ?? undefined;
    this.message = document.getElementById("toast")!;
    if (this.toastTime > 0) {
      this.message.textContent = this.toast;
      this.message.classList.add("show");
    }
    if (this.hud) this.updateHUD();
  }
  update(dt: number) {
    this.toastTime = Math.max(0, this.toastTime - dt);
    if (!this.toastTime) this.message?.classList.remove("show");
    this.timer += dt;
    if (this.timer > 0.1) {
      this.timer = 0;
      this.updateHUD();
    }
  }
  private updateHUD() {
    if (!this.hud) return;
    const g = this.game,
      p = g.player,
      s = g.stats;
    const set = (id: string, value: string) => {
      const el = document.getElementById(id);
      if (el && el.textContent !== value) el.textContent = value;
    };
    set("hud-region", REGIONS[g.region].name);
    set("hud-distance", number(p.x));
    set("hud-speed", number(p.vx * 3.6));
    set("hud-score", number(s.score));
    const chase = avalancheFeedback(g.mode, g.tutorialStep, g.phase, g.gap);
    updateAvalancheWarning(
      document.getElementById("hud-warning")!,
      avalancheWarning(g.mode, g.tutorialStep, g.phase, g.gap),
      `${number(chase.gap)}米`,
    );
    set("hud-gap", `${number(chase.gap)} 米`);
    set("hud-chase-status", chase.status);
    const danger = document.getElementById("danger")!;
    // 每次更新同时设置两种状态；正式模式明确恢复显示，不继承教学隐藏样式。
    danger.hidden = !chase.enabled;
    danger.style.display = chase.enabled ? "block" : "none";
    danger.classList.toggle("urgent", chase.urgent);
    danger.dataset.chase = chase.enabled ? "active" : "off";
    document.getElementById("danger-fill")!.style.transform =
      `scaleX(${g.avalanche.danger(p.x)})`;
    document.getElementById("route-fill")!.style.width =
      `${g.mode === "tutorial" ? (g.tutorialStep / 6) * 100 : Number.isFinite(g.end) ? clamp((p.x / g.end) * 100, 0, 100) : (p.x % 6000) / 60}%`;
    set(
      "hud-combo",
      s.combo > 1
        ? `${s.combo} 连贯技巧 · ×${Math.min(4, 1 + Math.floor(s.combo / 3))}`
        : "",
    );
    const goal = document.getElementById("hud-goal")!;
    if (g.challenge)
      goal.innerHTML = `<b>${g.challenge.title}</b><span>${g.challenge.subtitle}</span><strong>${number(g.progress)} / ${number(g.target)}${g.challenge.maxCrashes !== undefined ? ` · 碰撞 ${s.crashes}/${g.challenge.maxCrashes}` : ""}</strong>`;
    else if (g.mode === "tutorial") {
      const steps = [
        ["点击或按空格，跃过雪地", "一次按下只起跳一次；不必连续点击"],
        ["空中按住，完成一次后空翻", "接近一圈时松手，成功落地后才会记分"],
        ["再起跳，完成一次精准落地", "这次可不翻转，松手让双板对齐坡面"],
        ["看看左下雪崩距离，保持速度", "继续滑行 140 米；失误会让雪浪逼近"],
        ["云翎陪你练习，试试展翼", "按 E 或右下能力键，实际发动一次能力"],
        ["沿连接坡道，直接滑上高台", "入口无需跳跃；跟着雪晶前进，再自然汇合"],
      ];
      const step = steps[Math.min(5, g.tutorialStep)];
      goal.innerHTML = `<b>${step[0]}</b><span>${step[1]}</span><strong>练习 ${g.tutorialStep + 1} / 6 · 未完成可在本段重练</strong>`;
    } else
      goal.innerHTML = `<b>${g.mode === "adventure" ? "前往山脚避难站" : "顺着风，去更远的地方"}</b><span>${g.mode === "adventure" ? `距终点 ${number(g.end - p.x)} 米` : `本地最远 ${number(g.storage.data.records.endless)} 米`}</span>`;
    const rideHUD = document.getElementById("hud-ride")!,
      ability = document.getElementById("ability") as HTMLButtonElement;
    if (p.ride === "ski") {
      rideHUD.innerHTML = "";
      ability.style.display = "none";
    } else {
      ability.style.display = "";
      ability.disabled = p.cooldown > 0;
      ability.classList.toggle("ready", p.cooldown <= 0);
      ability.classList.toggle("active", p.ability > 0);
      ability.querySelector("small")!.textContent =
        p.cooldown > 0 ? `${Math.ceil(p.cooldown)}秒` : "E";
      rideHUD.innerHTML = `<b>${RIDES[p.ride].name}</b><span>${RIDES[p.ride].ability}</span>${passengerSeats(p)}`;
    }
    document.getElementById("control-hint")!.style.opacity =
      g.elapsed < 12 ? "1" : "0";
    const intro = document.getElementById("intro")!;
    intro.innerHTML =
      g.phase === "intro"
        ? `<h2>${g.mode === "tutorial" ? "第一道雪痕，从这里开始" : (g.challenge?.title ?? (g.storage.data.checkpoint && p.x > 100 ? "从这里，再出发" : "雪浪将至，出发！"))}</h2><p>${g.mode === "tutorial" ? "实际完成六项操作 · 已完成的步骤会保留" : "保持速度 · 我们山脚见"}</p>`
        : "";
  }
}
