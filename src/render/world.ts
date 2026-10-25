import * as THREE from "three";
import type { Game } from "../core/game";
import type { Entity, GameEvent, Ride, Settings } from "../core/types";
import { AbilityVisual } from "./ability-visual";
import { ADVENTURE_LENGTH, REGIONS, REGION_LENGTH } from "../data/config";
import { clamp, lerp, random } from "../core/math";
import { RenderQuality } from "./quality";
import type { RenderPose } from "./sampling";
import { makeObstacle, updateObstacleAppearance } from "./obstacle-models";
import { AvalancheVisual } from "./avalanche-visual";
import { makeTerrainGeometry } from "./terrain-geometry";
import { avalancheFeedback } from "../systems/avalanche-feedback";
import {
  placeScenery,
  sceneryMaterial,
  sceneryGroundHeight,
  SCENERY_DEPTH,
} from "./scenery";
import {
  material,
  part,
  makeCabin,
  makePine,
  makeRide,
  Skier,
  animateRide,
  texture,
} from "./models";

const crystalGeometry = new THREE.OctahedronGeometry(0.28, 0);
const markerGeometry = new THREE.TorusGeometry(0.65, 0.045, 6, 24);

/** GPU 侧也每 240m 重置局部原点。全局路线仍用 double，长时间无尽不会产生浮点抖动。 */
export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera();
  skier: Skier;
  preview = new THREE.Group();
  sun = new THREE.DirectionalLight("#fff0cd", 3);
  private chunks = new Map<number, THREE.Group>();
  private objects = new Map<string, THREE.Group>();
  private backdrop = new THREE.Group();
  private avalancheVisual = new AvalancheVisual();
  private abilityVisual = new AbilityVisual();
  private avalanche = this.avalancheVisual.front;
  private snowParticles: THREE.Points;
  private trail: THREE.Points;
  private origin = 0;
  private originY = 0;
  private viewX = 0;
  private viewY = 0;
  private lastSeed = -1;
  private tree = makePine();
  private previewKey = "";
  private width = 1;
  private height = 1;
  private cameraSize = 14;
  private shake = 0;
  private quality = new RenderQuality();
  private qualityMode: Settings["quality"] = "auto";
  private perfTime = 0;
  private perfFrames = 0;
  private highlightTime = 0;
  private landingRing = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.72, 32),
    new THREE.MeshBasicMaterial({
      color: "#d88c4c",
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  previewOutfit: string | null = null;
  previewSki: string | null = null;
  private avatarKey = "";
  fps = 60;
  draws = 0;
  triangles = 0;
  previewRide: Ride | null = null;
  constructor(
    private canvas: HTMLCanvasElement,
    outfit: string,
    ski: string,
    quality: Settings["quality"] = "auto",
  ) {
    this.qualityMode = quality;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color(REGIONS[0].sky);
    this.scene.fog = new THREE.Fog(REGIONS[0].fog, 45, 170);
    this.scene.add(new THREE.HemisphereLight("#e1f5ff", "#819b88", 2.8));
    this.sun.position.set(-15, 30, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, {
      left: -30,
      right: 30,
      top: 25,
      bottom: -20,
      near: 1,
      far: 100,
    });
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.06;
    this.scene.add(this.sun, this.sun.target);
    this.skier = new Skier(outfit, ski);
    this.avatarKey = `${outfit}:${ski}`;
    this.landingRing.rotation.x = -Math.PI / 2;
    this.scene.add(this.landingRing);
    this.scene.add(
      this.skier.root,
      this.backdrop,
      this.avalanche,
      this.preview,
      this.abilityVisual.root,
      this.abilityVisual.burstsRoot,
    );
    this.makeBackdrop();
    this.camera.add(this.avalancheVisual.mist);
    this.scene.add(this.camera);
    const particleGeometry = new THREE.BufferGeometry(),
      positions = new Float32Array(180 * 3);
    for (let i = 0; i < positions.length; i++)
      positions[i] = (random(123, i) - 0.5) * 80;
    particleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );
    this.snowParticles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({
        color: "#ffffff",
        size: 0.08,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      }),
    );
    this.scene.add(this.snowParticles);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(60 * 3), 3),
    );
    this.trail = new THREE.Points(
      trailGeo,
      new THREE.PointsMaterial({
        color: "#ffffff",
        size: 0.16,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      }),
    );
    this.scene.add(this.trail);
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }
  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.renderer.setSize(this.width, this.height, false);
    this.quality.configure(this.qualityMode, this.width, this.height);
    this.applyQuality();
  }
  /** 仅在倍率实际变化时重建绘图缓冲，不能每帧 setPixelRatio。 */
  private applyQuality() {
    if (
      Math.abs(this.renderer.getPixelRatio() - this.quality.pixelRatio) > 0.001
    )
      this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.snowParticles.geometry.setDrawRange(0, this.quality.particleCount);
  }
  /** 实际绘图缓冲可核验，避免把 CSS 尺寸误当作渲染分辨率。 */
  get renderQuality() {
    return {
      pixelRatio: this.renderer.getPixelRatio(),
      drawingBuffer: [this.canvas.width, this.canvas.height],
      viewport: [this.width, this.height],
      shadows: this.quality.shadows,
      particleCount: this.quality.particleCount,
      poseInterpolation: true,
    };
  }
  impact() {
    this.shake = 0.16;
  }
  abilityEvent(event: GameEvent, time: number) {
    this.abilityVisual.event(event, time);
    if (event.type === "break") this.shake = event.powered ? 0.12 : 0.07;
  }
  get abilityFeedback() {
    return this.abilityVisual.diagnostics;
  }
  highlight() {
    this.highlightTime = 0.6;
  }
  /** 只读验收信息，供诊断贴坡反馈是否在真实事件后可见。 */
  get landingFeedback() {
    return {
      visible: this.landingRing.visible,
      remaining: this.highlightTime,
      opacity: this.landingRing.material.opacity,
    };
  }
  private mountain(
    radius: number,
    height: number,
    color: string,
    seed: number,
  ) {
    const geometry = new THREE.BufferGeometry();
    const pos: number[] = [],
      indices: number[] = [];
    const sides = 48,
      rings = 18;
    for (let j = 0; j <= rings; j++)
      for (let i = 0; i <= sides; i++) {
        const angle = (i / sides) * Math.PI * 2,
          t = j / rings;
        const r =
          radius *
          (1 - t) ** 0.7 *
          (1 + Math.sin(angle * 3 + seed) * 0.12 + Math.cos(angle * 7) * 0.06);
        pos.push(
          Math.cos(angle) * r,
          height * t +
            Math.sin(angle * 5 + t * 10 + seed) *
              radius *
              0.04 *
              Math.sin(t * Math.PI),
          Math.sin(angle) * r * 0.48,
        );
        if (j < rings && i < sides) {
          const a = j * (sides + 1) + i,
            b = a + sides + 1;
          indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, material(color));
  }
  private makeBackdrop() {
    for (let i = 0; i < 11; i++) {
      const mountain = this.mountain(
        22 + random(8, i) * 12,
        22 + random(13, i) * 32,
        i % 2 ? "#a0c2c4" : "#b9d5d2",
        i,
      );
      mountain.position.set((i - 5) * 27, -9, -75 - (i % 3) * 12);
      this.backdrop.add(mountain);
      mountain.scale.y = 0.5;
      const peak = this.mountain(
        13 + random(8, i) * 7,
        17 + random(13, i) * 18,
        "#e4eeeb",
        i,
      );
      peak.position.copy(mountain.position);
      peak.position.y += 12;
      this.backdrop.add(peak);
      peak.scale.y = 0.5;
    }
    for (let i = 0; i < 16; i++) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 4; j++)
        part(cloud, "#e2eeeb", j * 3, Math.sin(j) * 0.6, 0, 4, 1.15, 1.5);
      cloud.position.set(i * 24 - 190, 24 + random(3, i) * 12, -60);
      this.backdrop.add(cloud);
    }
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(3.4, 24, 16),
      new THREE.MeshBasicMaterial({ color: "#fff0c6", fog: false }),
    );
    sun.position.set(-34, 15, -110);
    this.backdrop.add(sun);
  }
  private terrainMesh(
    game: Game,
    start: number,
    length: number,
    branch = false,
  ) {
    const g = makeTerrainGeometry(
      game.terrain,
      start,
      length,
      this.origin,
      this.originY,
      branch,
    );
    const mesh = new THREE.Mesh(
      g,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.94,
        side: THREE.DoubleSide,
        map: texture("snow"),
        bumpMap: texture("snow"),
        bumpScale: 0.035,
      }),
    );
    mesh.receiveShadow = true;
    mesh.userData.ownedGeometry = true;
    mesh.userData.ownedMaterial = true;
    return mesh;
  }
  private chunk(game: Game, n: number) {
    const start = n * 120,
      group = new THREE.Group();
    group.add(this.terrainMesh(game, start, 120));
    const region = Math.floor(Math.max(0, start) / REGION_LENGTH) % 3;
    const trees: THREE.Matrix4[] = [],
      helper = new THREE.Object3D();
    for (let i = 0; i < 16; i++) {
      const x = start + random(game.seed + n, i) * 120,
        z = SCENERY_DEPTH.tree - random(51 + n, i) * 15;
      // 营地保留开阔雪坪，避免高树在窄桌面视口投影到标题和操作文案上。
      // 清理的是装饰物分布，进入游戏后仍沿用同一片真实地形。
      if (x > -80 && x < 12) continue;
      const y = sceneryGroundHeight(x, game.terrain.height(x), z);
      if (region === 0 || (region === 2 && i % 4 === 0)) {
        helper.position.set(x - this.origin, y - this.originY, z);
        const scale = 0.75 + random(42, i) * 0.85;
        helper.scale.setScalar(scale);
        helper.rotation.y = random(n, i);
        helper.updateMatrix();
        trees.push(helper.matrix.clone());
      } else if (region === 1) {
        const rock = this.mountain(
          2.5 + random(n, i) * 2,
          6 + random(1 + n, i) * 9,
          i % 2 ? "#a4cbd5" : "#bfdce0",
          i,
        );
        placeScenery(
          rock,
          x - this.origin,
          sceneryGroundHeight(
            x,
            game.terrain.height(x),
            SCENERY_DEPTH.ice - (i % 3) * 4,
          ) -
            this.originY -
            1,
          SCENERY_DEPTH.ice - (i % 3) * 4,
          region,
        );
        group.add(rock);
        rock.userData.ownedGeometry = true;
      }
    }
    if (trees.length)
      this.tree.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const instanced = new THREE.InstancedMesh(
            o.geometry,
            sceneryMaterial(o.material as THREE.Material, region),
            trees.length,
          );
          o.updateMatrix();
          for (let i = 0; i < trees.length; i++)
            instanced.setMatrixAt(i, trees[i].clone().multiply(o.matrix));
          instanced.castShadow = false;
          instanced.receiveShadow = false;
          instanced.userData.scenery = true;
          group.add(instanced);
        }
      });
    // 删除贴着玩家雪道摆放的装饰石；远处只留低矮、宽缓的雪覆岩台。
    for (let i = 0; i < 3; i++) {
      const x = start + i * 36 + 12;
      const shelf = new THREE.Group();
      part(shelf, "#a4bcc1", 0, 0, 0, 3.2, 0.42, 1.5);
      part(shelf, REGIONS[region].snow, -0.15, 0.25, 0, 3.0, 0.22, 1.4);
      placeScenery(
        shelf,
        x - this.origin,
        sceneryGroundHeight(
          x,
          game.terrain.height(x),
          SCENERY_DEPTH.rock - i * 3,
        ) -
          this.originY +
          0.12,
        SCENERY_DEPTH.rock - i * 3,
        region,
      );
      group.add(shelf);
    }
    if (n % 7 === 0 && region !== 1) {
      const cabin = makeCabin();
      const x = start + 35;
      placeScenery(
        cabin,
        x - this.origin,
        sceneryGroundHeight(x, game.terrain.height(x), SCENERY_DEPTH.cabin) -
          this.originY -
          0.05,
        SCENERY_DEPTH.cabin,
        region,
      );
      cabin.rotation.y = -0.18;
      group.add(cabin);
    }
    if (n === 0) {
      const camp = makeCabin();
      camp.scale.setScalar(0.85);
      placeScenery(
        camp,
        16 - this.origin,
        sceneryGroundHeight(16, game.terrain.height(16), SCENERY_DEPTH.cabin) -
          this.originY -
          0.05,
        SCENERY_DEPTH.cabin,
        region,
      );
      camp.rotation.y = -0.12;
      group.add(camp);
    }
    if (region === 1 && n % 2 === 0) {
      // 装饰不再使用暗色洞口：它与真正可穿越的低矮洞口语义冲突。
      const x = start + 90;
      const ridge = this.mountain(9, 4, "#bfdce0", n);
      placeScenery(
        ridge,
        x - this.origin,
        sceneryGroundHeight(x, game.terrain.height(x), SCENERY_DEPTH.ice) -
          this.originY -
          1,
        SCENERY_DEPTH.ice,
        region,
      );
      ridge.userData.ownedGeometry = true;
      group.add(ridge);
    }
    if (region === 2 && n % 3 === 0) {
      const x = start + 65;
      const lift = new THREE.Group();
      for (const z of [0, -4]) {
        part(lift, "#a2b9c1", 0, 4, z, 0.2, 8, 0.2, "box");
        part(lift, "#bccdd1", 0, 7.7, z, 7, 0.18, 0.22, "box");
      }
      placeScenery(
        lift,
        x - this.origin,
        sceneryGroundHeight(x, game.terrain.height(x), SCENERY_DEPTH.lift) -
          this.originY,
        SCENERY_DEPTH.lift,
        region,
      );
      group.add(lift);
    }
    // 上层平台实体有木质承重与雪面，桥段留出可辨认的缺口，主路始终可通过。
    const module = Math.floor(start / 240);
    if (n % 2 === 0 && game.terrain.hasBranch(module)) {
      group.add(this.terrainMesh(game, module * 240 + 84, 106, true));
      for (let x = module * 240 + 90; x < module * 240 + 180; x += 12) {
        const h = game.terrain.branchDeckHeight(x)!;
        if (game.terrain.branchGap(x)) continue;
        part(
          group,
          "#92775a",
          x - this.origin,
          h - this.originY - 2,
          -1.3,
          0.22,
          4,
          0.22,
          "box",
        );
        part(
          group,
          "#b19371",
          x - this.origin,
          h - this.originY - 0.2,
          0.8,
          5,
          0.22,
          1.9,
          "box",
        );
      }
    }
    if (ADVENTURE_LENGTH >= start && ADVENTURE_LENGTH < start + 120) {
      const refuge = makeCabin(true);
      refuge.position.set(
        ADVENTURE_LENGTH + 5 - this.origin,
        game.terrain.height(ADVENTURE_LENGTH + 5) - this.originY,
        -3,
      );
      group.add(refuge);
      for (const at of [ADVENTURE_LENGTH - 4, ADVENTURE_LENGTH + 3])
        part(
          group,
          "#e7aa67",
          at - this.origin,
          game.terrain.height(at) - this.originY + 1.5,
          2,
          0.12,
          3,
          0.12,
          "box",
        );
    }
    return group;
  }
  private removeChunk(group: THREE.Group) {
    this.scene.remove(group);
    group.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
      if (o instanceof THREE.Mesh && o.userData.ownedGeometry)
        o.geometry.dispose();
      if (
        o instanceof THREE.Mesh &&
        o.userData.ownedMaterial &&
        o.material instanceof THREE.Material
      )
        o.material.dispose();
    });
  }
  private entityModel(e: Entity): THREE.Group {
    const g = new THREE.Group();
    if (e.kind === "coin") {
      const mesh = new THREE.Mesh(
        crystalGeometry,
        material(e.route === "upper" ? "#efb45e" : "#e7b968", 0.32, 0.25),
      );
      g.add(mesh);
      part(g, "#ffedb4", 0, 0, 0.1, 0.07, 0.3, 0.035, "box");
    } else if (e.kind === "ride") {
      const ride = makeRide(e.ride!);
      g.add(ride);
      const marker = new THREE.Mesh(markerGeometry, material("#f2cb7d"));
      marker.position.y = 3.6;
      g.add(marker);
      part(g, "#f3d599", 0, 3.6, 0, 0.4, 0.07, 0.07, "box");
      part(g, "#f3d599", 0, 3.6, 0, 0.07, 0.4, 0.07, "box");
    } else if (e.kind === "sign") {
      part(g, "#82654b", 0, 1.4, -1.4, 0.12, 2.8, 0.12, "box");
      part(g, "#debb7e", 0, 2.4, -1.35, 2.2, 0.65, 0.12, "box");
      const arrow = part(
        g,
        "#355b58",
        0.35,
        2.45,
        -1.25,
        0.6,
        0.12,
        0.04,
        "box",
      );
      arrow.rotation.z = 0.5;
    } else {
      return makeObstacle(e, material);
    }
    return g;
  }
  render(
    game: Game,
    time: number,
    dt: number,
    settings: Settings,
    pose: RenderPose = game.player,
    alpha = 1,
  ) {
    if (this.qualityMode !== settings.quality) {
      this.qualityMode = settings.quality;
      this.quality.configure(settings.quality, this.width, this.height);
      this.applyQuality();
    }
    const menu = game.phase === "menu",
      p = game.player,
      terrain = game.terrain;
    const victorious = game.phase === "won";
    const px = menu ? 8 : pose.x,
      py = menu ? terrain.height(8) : victorious ? terrain.height(p.x) : pose.y;
    const nextOrigin = Math.floor(px / 240) * 240;
    if (this.origin !== nextOrigin || this.lastSeed !== terrain.seed) {
      const oldOrigin = this.origin,
        oldOriginY = this.originY,
        changedSeed = this.lastSeed !== terrain.seed;
      for (const group of this.chunks.values()) this.removeChunk(group);
      this.chunks.clear();
      for (const group of this.objects.values()) this.scene.remove(group);
      this.objects.clear();
      this.origin = nextOrigin;
      this.originY = terrain.height(this.origin);
      this.lastSeed = terrain.seed;
      if (changedSeed) {
        this.viewX = px - this.origin;
        this.viewY = py - this.originY;
      } else {
        this.viewX -= this.origin - oldOrigin;
        this.viewY -= this.originY - oldOriginY;
      }
    }
    for (let n = Math.floor(px / 120) - 1; n <= Math.floor(px / 120) + 2; n++)
      if (!this.chunks.has(n)) {
        const group = this.chunk(game, n);
        this.chunks.set(n, group);
        this.scene.add(group);
      }
    for (const [n, group] of this.chunks)
      if (Math.abs(n * 120 - px) > 300) {
        this.removeChunk(group);
        this.chunks.delete(n);
      }
    const cx = px - this.origin,
      cy = py - this.originY;
    // 教学短段重练、检查点恢复或返回营地是离散迁移。
    // 普通滑行保留阻尼跟随；迁移时立即校准，避免镜头追着旧位置导致雪道离屏。
    if (Math.abs(cx - this.viewX) > 110) {
      this.viewX = cx + (menu ? -5.5 : 10);
      this.viewY = cy + (menu ? 3 : 4);
    }
    const outfit =
      menu && this.previewOutfit
        ? this.previewOutfit
        : game.storage.data.outfit;
    const ski =
      menu && this.previewSki ? this.previewSki : game.storage.data.ski;
    if (this.avatarKey !== `${outfit}:${ski}`) {
      // 换装只替换衣物节点，保留骑乘与乘客模型；共享衣物模板有界缓存。
      this.skier.setStyle(outfit, ski);
      this.avatarKey = `${outfit}:${ski}`;
    }
    const animationTime = menu ? time : game.elapsed;
    for (const e of game.entities) {
      if (e.x < px - 45 || e.x > px + 100 || e.used) continue;
      let model = this.objects.get(e.id);
      if (!model) {
        model = this.entityModel(e);
        this.objects.set(e.id, model);
        this.scene.add(model);
      }
      model.visible = !menu;
      // 动物与玩家使用相同固定步插值，只平滑显示，不改写交互位置。
      const ex = e.escape
        ? THREE.MathUtils.lerp(e.escape.previousX, e.x, alpha)
        : e.x;
      const ey = e.escape
        ? THREE.MathUtils.lerp(e.escape.previousY, e.y, alpha)
        : e.y;
      model.position.set(ex - this.origin, ey - this.originY, 0);
      if (e.kind === "coin") {
        model.rotation.y = animationTime * 1.8;
        model.position.y += Math.sin(animationTime * 3 + e.x) * 0.08;
      }
      if (e.kind === "ride") {
        model.rotation.z =
          e.escape && e.ride !== "owl"
            ? Math.atan(terrain.surface(ex, e.route).slope)
            : 0;
        animateRide(
          model.children[0] as THREE.Group,
          e.ride!,
          e.escape ? e.escape.age + Number(e.id.length % 7) : animationTime,
          false,
          !!e.escape,
        );
      }
      if (e.kind === "obstacle")
        updateObstacleAppearance(model, e, p.ride, animationTime);
    }
    const valid = new Set(
      game.entities
        .filter((e) => !e.used && Math.abs(e.x - px) < 110)
        .map((e) => e.id),
    );
    for (const [id, model] of this.objects)
      if (!valid.has(id)) {
        this.scene.remove(model);
        this.objects.delete(id);
      }
    this.skier.root.position.set(cx, cy + 0.02, 0.35);
    this.skier.root.rotation.z = menu
      ? Math.atan(terrain.slope(8))
      : victorious
        ? Math.atan(terrain.slope(p.x))
        : pose.angle;
    this.skier.root.scale.setScalar(menu || victorious ? 1.65 : 1);
    this.skier.setStyle(outfit, ski);
    this.skier.animate(
      menu
        ? { ...p, grounded: true, ride: "ski", vx: 8, fall: 0 }
        : victorious
          ? { ...p, grounded: true, ride: "ski", fall: 0 }
          : p,
      victorious ? time : animationTime,
      victorious,
    );
    const previewKey = this.previewRide ?? "";
    if (previewKey !== this.previewKey) {
      this.preview.clear();
      if (this.previewRide && this.previewRide !== "ski")
        this.preview.add(makeRide(this.previewRide));
      this.previewKey = previewKey;
    }
    this.preview.visible = menu && !!this.previewRide;
    this.skier.root.visible = !this.preview.visible;
    this.preview.position.set(cx, cy + 0.1, 0);
    this.preview.scale.setScalar(1.5);
    if (this.previewRide)
      animateRide(this.preview, this.previewRide, animationTime, true);
    this.viewX = lerp(
      this.viewX,
      // 补偿速度滞后，高速时也真正保留约 10m 的前瞻量。
      cx +
        (menu && (this.previewOutfit || this.previewSki || this.previewRide)
          ? -9
          : menu || victorious
            ? -5.5
            : 10 + p.vx / 3),
      Math.min(1, dt * 3),
    );
    this.viewY = lerp(this.viewY, cy + (menu ? 3 : 4), Math.min(1, dt * 3.5));
    const desiredSize =
      menu || victorious
        ? 18
        : 23 + clamp((p.vx - 24) / 3, 0, 3) + (!p.grounded ? 1.5 : 0);
    this.cameraSize = lerp(this.cameraSize, desiredSize, Math.min(1, dt * 2));
    // 横屏窄视口也至少显示 48m 世界宽度，保留障碍预警时间。
    const aspect = this.width / this.height,
      size = Math.max(this.cameraSize, menu || victorious ? 0 : 48 / aspect);
    Object.assign(this.camera, {
      left: (-size * aspect) / 2,
      right: (size * aspect) / 2,
      top: size / 2,
      bottom: -size / 2,
      near: 0.1,
      far: 300,
    });
    this.camera.updateProjectionMatrix();
    if (game.phase === "playing") this.shake = Math.max(0, this.shake - dt);
    const shake =
      settings.shake && this.shake > 0
        ? Math.sin(animationTime * 81) * this.shake * 0.4
        : 0;
    this.camera.position.set(this.viewX, this.viewY + 6 + shake, 38);
    this.camera.lookAt(this.viewX + 1, this.viewY, 0);
    this.backdrop.position.set(this.viewX * 0.85, this.viewY - 25, 0);
    const region = menu ? 0 : game.region,
      sky = new THREE.Color(REGIONS[region].sky);
    (this.scene.background as THREE.Color).lerp(sky, 0.02);
    (this.scene.fog as THREE.Fog).color.lerp(
      new THREE.Color(REGIONS[region].fog),
      0.02,
    );
    this.sun.color.lerp(new THREE.Color(REGIONS[region].light), 0.01);
    this.sun.position.set(cx - 15, cy + 27, 20);
    this.sun.target.position.set(cx + 6, cy, 0);
    const chase = avalancheFeedback(
      game.mode,
      game.tutorialStep,
      game.phase,
      game.gap,
    );
    this.avalancheVisual.update(chase, game.elapsed, size * aspect, size);
    // 本体只使用真实路线坐标；左缘雪雾是独立环境反馈，不参与前沿或碰撞定位。
    this.avalanche.position.set(
      game.avalanche.x - this.origin,
      terrain.height(game.avalanche.x) - this.originY,
      0,
    );
    this.sun.intensity = 3 * chase.light;
    this.snowParticles.visible = settings.particles && !menu;
    this.snowParticles.position.set(cx, cy, -3);
    this.snowParticles.rotation.z = -animationTime * 0.006;
    const trail = this.trail.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    for (let i = 0; i < trail.count; i++) {
      const t = i / trail.count,
        x = cx - t * (p.vx / 4 + 1);
      trail.setXYZ(
        i,
        x,
        terrain.height(x + this.origin) -
          this.originY +
          0.08 +
          random(53, i) * t * 0.5,
        0.25 + (random(13, i) - 0.5) * t * 1.4,
      );
    }
    trail.needsUpdate = true;
    this.trail.visible = settings.particles && p.grounded && !menu;
    if (game.phase === "playing")
      this.highlightTime = Math.max(0, this.highlightTime - dt);
    this.landingRing.visible =
      settings.flash && this.highlightTime > 0 && !menu;
    const ringSurface = terrain.surface(p.x, p.route);
    // 扩散环贴合局部坡面，避免水平放置时被上坡积雪遮住一半。
    this.landingRing.rotation.set(
      -Math.PI / 2,
      -Math.atan(ringSurface.slope),
      0,
    );
    this.landingRing.position.set(cx, ringSurface.y - this.originY + 0.08, 0.3);
    const spread = 1 + (1 - this.highlightTime / 0.6) * 3;
    // 侧视镜头会压扁地面的圆；沿纵深适度展开，保留一条可辨认的柔和椭圆。
    this.landingRing.scale.set(spread, spread * 2, spread);
    this.landingRing.material.opacity = (this.highlightTime / 0.6) * 0.7;
    this.abilityVisual.update(
      p,
      game.elapsed,
      pose,
      this.origin,
      this.originY,
      settings,
      game.phase,
      game.runId,
      this.quality.particleCount,
    );
    this.perfTime += dt;
    this.perfFrames++;
    if (this.perfTime > 2) {
      this.fps = Math.round(this.perfFrames / this.perfTime);
      this.perfFrames = 0;
      this.perfTime = 0;
      // 菜单/暂停的空闲帧不能证明实际滑行有余量，避免休息后把画质误升满。
      if (game.phase === "playing") this.quality.observe(this.fps);
      this.applyQuality();
    }
    this.renderer.render(this.scene, this.camera);
    this.draws = this.renderer.info.render.calls;
    this.triangles = this.renderer.info.render.triangles;
  }
}
