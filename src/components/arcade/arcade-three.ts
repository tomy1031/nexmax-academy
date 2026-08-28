/**
 * ことばアーケードの3D世界 — 旧 wordtest の three.js シーンの移植。
 *
 * 原典: nextmake_onboarding_training/wordtest/src/main.js の
 *   initThree / buildField / FIELD_BUILDERS / moveScenery /
 *   makeEnemyTexture / spawnEnemy / spawnFxRing / spawnFxFlash /
 *   explode / updateFx / updateParticles / kickFov / gameLoop
 * を、構造・数値・順序をそのままに持ってきたもの。
 *
 * 旧アプリはグローバル変数と DOM を直接触っていたので、React から使えるように
 * 「一つの世界＝一つのハンドル」に閉じただけで、絵に関わる計算は変えていない。
 *
 * 旧版は CDN の three r128。npm の r185 で名前が変わった所だけ読み替えている
 * （読み替えた理由はその場にコメントで残す）。
 */

import type * as ThreeModule from "three";
import { fieldPreset, type FieldPreset } from "./fields";

type Three = typeof ThreeModule;
type TObject3D = ThreeModule.Object3D;
type TVector3 = ThreeModule.Vector3;

/** 地面の高さ。用語スプライト（目線 y=0 中心）と重ならないよう十分下げる（旧 GROUND_Y）。 */
const GROUND_Y = -90;

/** 旧 moveScenery の折り返し幅。GridHelper のマス目1つぶん。 */
const GRID_STEP = 4000 / 130;

/** 景色や用語を出し入れする窓口。React 側はここだけを触る。 */
export interface ArcadeWorldHandle {
  /** 旧 buildField。景色をまるごと組み直す。 */
  setField(id: string): void;
  /** 旧 currentSpeed の戻り値。景色の流れと用語の近づく速さ。 */
  setSpeed(speed: number): void;
  /** 遊んでいる間だけ景色を流す（旧 gameLoop の STATE 判定）。 */
  setMoving(moving: boolean): void;
  /** 旧 spawnEnemy。 */
  spawnTerm(term: string, reading: string, showReading: boolean): void;
  /** 旧 redrawEnemy。ふりがなの ON/OFF を描き直す。 */
  redrawTerm(term: string, reading: string, showReading: boolean): void;
  /**
   * 読みのフェーズを終える（旧 resolveReading → startMcqPhase）。
   * 旧アプリと同じ間（正解350ms・取りそこね200ms・問題だけモード300ms）を置いてから
   * explode する。待ち時間を世界側に持たせるのは、原典がそうだったから。
   */
  resolveTerm(kind: TermOutcome): void;
  /** 用語を演出なしで片づける。 */
  clearTerm(): void;
  dispose(): void;
}

/** 読みフェーズの終わり方。旧アプリの分岐に対応する。 */
export type TermOutcome = "hit" | "missed" | "skipped";

export interface ArcadeWorldOptions {
  /** 用語がカメラに届いた（旧 `enemyZ > 30`）。 */
  onCollide: () => void;
  /** 用語が目の前に来たかどうか（旧 `enemyZ > -250` の .shake-screen）。 */
  onNear: (near: boolean) => void;
}

/**
 * 世界を作ってコンテナに差し込む。WebGL が使えない端末では null を返す。
 * 旧アプリに退避路は無かったが、ここでは3Dが出せなくても学習は続けられるようにする。
 */
export async function createArcadeWorld(
  container: HTMLElement,
  options: ArcadeWorldOptions,
): Promise<ArcadeWorldHandle | null> {
  // three は 600KB 超。SSR では触らず、遊ぶときだけ読み込む
  // （静的 import にすると入口ページの初期バンドルに乗る）。
  const THREE: Three = await import("three");

  // r152 以降は色管理が既定で入り、同じ16進でも r128 と違う明るさになる。
  // 旧アプリの見た目をそのまま出すため、旧来の扱い（変換なし）に戻す。
  THREE.ColorManagement.enabled = false;

  // 差し込まれた直後で高さが 0 のことがある。0除算で NaN を作らない。
  const viewWidth = () => container.clientWidth || window.innerWidth || 1;
  const viewHeight = () => container.clientHeight || window.innerHeight || 1;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, viewWidth() / viewHeight(), 0.1, 3000);
  camera.position.set(0, 0, 0);

  let renderer: ThreeModule.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch {
    return null;
  }
  // 旧版の outputEncoding 既定（sRGB変換なし）に合わせる。上の ColorManagement と対。
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setSize(viewWidth(), viewHeight());
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
  const dir = new THREE.DirectionalLight(0xffffff, 0.55);
  dir.position.set(100, 200, 50);
  scene.add(dir);

  // 旧版は window の resize を見ていた。ここは全画面の舞台なので大きさは同じだが、
  // コンテナを測るほうが確実（サイドバー付きの画面でもずれない）。
  const resize = () => {
    const w = viewWidth();
    const h = viewHeight();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  /* ---------------------------------------------------------------- *
   * 状態（旧アプリのグローバル変数に対応）
   * ---------------------------------------------------------------- */
  let bgObjects: TObject3D[] = [];
  let enemySprite: ThreeModule.Sprite | null = null;
  let enemyZ = -800;
  let fieldTime = 0;
  let lastTime = 0;
  let fovKick = 0;
  let speed = 0.7;
  let moving = false;
  let resolved = false;
  let near = false;
  let field = "forest";
  let frame = 0;
  let burstTimer: ReturnType<typeof setTimeout> | null = null;

  const particles: { mesh: ThreeModule.Mesh; vel: TVector3; life: number }[] = [];
  const fxList: { mesh: TObject3D; t: number; kind: string }[] = [];

  /* ---------------------------------------------------------------- *
   * 後片づけ（旧 disposeOne / disposeObj）
   * ---------------------------------------------------------------- */
  type MaybeResource = TObject3D & {
    geometry?: { dispose(): void };
    material?: DisposableMaterial | DisposableMaterial[];
  };
  interface DisposableMaterial {
    dispose(): void;
    map?: { dispose(): void } | null;
  }

  function disposeOne(o: TObject3D) {
    const res = o as MaybeResource;
    if (res.geometry) res.geometry.dispose();
    if (res.material) {
      const mats = Array.isArray(res.material) ? res.material : [res.material];
      mats.forEach((m) => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    }
  }
  function disposeObj(obj: TObject3D) {
    scene.remove(obj);
    if (obj.traverse) obj.traverse(disposeOne);
    else disposeOne(obj);
  }

  /* ---------------------------------------------------------------- *
   * フィールド構築（旧: 実体ローポリ × 発光データの二層世界）
   * userData フラグ:
   *   staticBg  … スクロールしない（空・太陽・道路など）
   *   texScroll … テクスチャUVを流す（データハイウェイ）
   *   float     … {amp, sp, ph, base} 上下にゆらぐ
   *   spin      … Y回転（惑星など）
   *   rain      … 縦に降る粒子（電脳空間）
   * ---------------------------------------------------------------- */
  interface SceneryData {
    staticBg?: boolean;
    texScroll?: number;
    float?: { amp: number; sp: number; ph: number; base: number };
    spin?: number;
    rain?: number;
  }

  function bgAdd<T extends TObject3D>(obj: T, ud?: SceneryData): T {
    if (ud) obj.userData = Object.assign(obj.userData || {}, ud);
    scene.add(obj);
    bgObjects.push(obj);
    return obj;
  }
  function hexCss(hex: number) {
    return "#" + hex.toString(16).padStart(6, "0");
  }

  function makeSkydome(topHex: number, bottomHex: number) {
    const cv = document.createElement("canvas");
    cv.width = 2;
    cv.height = 512;
    const ctx = cv.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, hexCss(topHex));
    g.addColorStop(1, hexCss(bottomHex));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 512);
    const mat = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(cv),
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2400, 24, 18), mat);
    dome.renderOrder = -10;
    return bgAdd(dome, { staticBg: true });
  }

  /** 全ワールド共通の「データハイウェイ」＝旅の一貫性の象徴。 */
  function makeHighway(colorHex: number) {
    const css = hexCss(colorHex);
    const cv = document.createElement("canvas");
    cv.width = 256;
    cv.height = 256;
    const ctx = cv.getContext("2d")!;
    ctx.shadowColor = css;
    ctx.shadowBlur = 16;
    ctx.fillStyle = css;
    ctx.fillRect(12, 0, 7, 256);
    ctx.fillRect(237, 0, 7, 256);
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(128, 34);
    ctx.lineTo(166, 96);
    ctx.lineTo(128, 78);
    ctx.lineTo(90, 96);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 12);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(150, 3200), mat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, GROUND_Y + 1.4, -1400);
    return bgAdd(road, { staticBg: true, texScroll: 0.6 });
  }

  /** 環境パーティクル（加算合成の光の粒）。 */
  function makeMotes(
    colorHex: number,
    count: number,
    opts: {
      spreadX?: number;
      spreadY?: number;
      yBase?: number;
      size?: number;
      opacity?: number;
      rain?: number;
    } = {},
  ) {
    const geo = new THREE.BufferGeometry();
    const verts: number[] = [];
    const spreadX = opts.spreadX || 760;
    const spreadY = opts.spreadY || 420;
    const yBase = opts.yBase || 0;
    for (let i = 0; i < count; i++) {
      verts.push(
        (Math.random() - 0.5) * spreadX,
        yBase + (Math.random() - 0.5) * spreadY,
        -Math.random() * 1800,
      );
    }
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    const mat = new THREE.PointsMaterial({
      color: colorHex,
      size: opts.size || 3.5,
      transparent: true,
      opacity: opts.opacity == null ? 0.8 : opts.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    return bgAdd(new THREE.Points(geo, mat), opts.rain ? { rain: opts.rain } : {});
  }

  /** 放射グラデーションの光（太陽・星雲・トーチの灯りなど）。 */
  function makeGlowSprite(
    cssColor: string,
    size: number,
    x: number,
    y: number,
    z: number,
    opacity?: number,
    ud?: SceneryData,
  ) {
    const cv = document.createElement("canvas");
    cv.width = 128;
    cv.height = 128;
    const ctx = cv.getContext("2d")!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, cssColor);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const mat = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(cv),
      transparent: true,
      opacity: opacity == null ? 1 : opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const sp = new THREE.Sprite(mat);
    sp.position.set(x, y, z);
    sp.scale.set(size, size, 1);
    return bgAdd(sp, ud || { staticBg: true });
  }

  function makeGroundPlane(c: FieldPreset) {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 4000),
      new THREE.MeshLambertMaterial({ color: c.ground }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = GROUND_Y;
    bgAdd(ground, { staticBg: true });
    const grid = new THREE.GridHelper(4000, 130, c.grid, c.grid);
    // r128 の material は単体だったが、型の上では配列もありうる。単体として扱う。
    const gridMat = grid.material as ThreeModule.LineBasicMaterial;
    gridMat.transparent = true;
    gridMat.opacity = 0.3;
    grid.position.y = GROUND_Y + 0.6;
    bgAdd(grid, {});
  }

  const FIELD_BUILDERS: Record<string, (c: FieldPreset) => void> = {
    // データの森：絵本ローポリの樹木＋金のホタル
    forest(c) {
      makeGroundPlane(c);
      for (let i = 0; i < 46; i++) {
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(2.4, 3.4, 24, 6),
          new THREE.MeshLambertMaterial({ color: 0x6b4a2e }),
        );
        trunk.position.y = 12;
        tree.add(trunk);
        const l1 = new THREE.Mesh(
          new THREE.ConeGeometry(16, 30, 6),
          new THREE.MeshLambertMaterial({ color: Math.random() > 0.5 ? 0x2fae62 : 0x1f8f52 }),
        );
        l1.position.y = 32;
        tree.add(l1);
        const l2 = new THREE.Mesh(
          new THREE.ConeGeometry(11, 22, 6),
          new THREE.MeshLambertMaterial({ color: 0x3fd07a }),
        );
        l2.position.y = 48;
        tree.add(l2);
        const s = 0.7 + Math.random() * 0.9;
        tree.scale.set(s, s, s);
        tree.position.set(
          (Math.random() > 0.5 ? 1 : -1) * (95 + Math.random() * 140),
          GROUND_Y,
          -Math.random() * 1600,
        );
        bgAdd(tree, {});
      }
      makeMotes(0xfff2a0, 120, { size: 4, spreadY: 220, yBase: GROUND_Y + 120, opacity: 0.9 });
    },

    // 夕焼けの空：大きな夕陽＋ふわふわ雲（中央回避）
    sky() {
      makeGlowSprite("rgba(255,186,110,1)", 1000, 0, -80, -1900, 0.95);
      makeGlowSprite("rgba(255,120,160,0.7)", 1500, 0, 40, -2000, 0.4);
      for (let i = 0; i < 46; i++) {
        const puff = new THREE.Mesh(
          new THREE.SphereGeometry(16 + Math.random() * 26, 8, 8),
          new THREE.MeshLambertMaterial({ color: 0xffe9dc, transparent: true, opacity: 0.5 }),
        );
        puff.scale.y = 0.55;
        let sx = (Math.random() - 0.5) * 660;
        const sy = (Math.random() - 0.5) * 360;
        if (Math.abs(sx) < 170 && Math.abs(sy) < 130) sx += (sx >= 0 ? 1 : -1) * 190;
        puff.position.set(sx, sy, -Math.random() * 1700);
        bgAdd(puff, {
          float: {
            amp: 4 + Math.random() * 6,
            sp: 0.4 + Math.random() * 0.5,
            ph: Math.random() * 6.28,
            base: sy,
          },
        });
      }
      makeMotes(0xffd9a0, 70, { size: 3 });
    },

    // 深海：ゴッドレイ＋泡＋シアンの海底
    sea(c) {
      makeGroundPlane(c);
      const rayCv = document.createElement("canvas");
      rayCv.width = 64;
      rayCv.height = 256;
      const rctx = rayCv.getContext("2d")!;
      const rg = rctx.createLinearGradient(0, 0, 0, 256);
      rg.addColorStop(0, "rgba(190,240,255,0.6)");
      rg.addColorStop(1, "rgba(190,240,255,0)");
      rctx.fillStyle = rg;
      rctx.fillRect(0, 0, 64, 256);
      const rayTex = new THREE.CanvasTexture(rayCv);
      for (let i = 0; i < 6; i++) {
        const ray = new THREE.Mesh(
          new THREE.PlaneGeometry(60 + Math.random() * 60, 760),
          new THREE.MeshBasicMaterial({
            map: rayTex,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
            fog: false,
          }),
        );
        ray.position.set((Math.random() - 0.5) * 860, 240, -300 - Math.random() * 1000);
        ray.rotation.z = (Math.random() - 0.5) * 0.35;
        bgAdd(ray, { staticBg: true });
      }
      for (let j = 0; j < 34; j++) {
        const bub = new THREE.Mesh(
          new THREE.SphereGeometry(4 + Math.random() * 8, 8, 8),
          new THREE.MeshBasicMaterial({
            color: 0x9fe8ff,
            transparent: true,
            opacity: 0.28,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        let bx = (Math.random() - 0.5) * 640;
        const by = (Math.random() - 0.5) * 360;
        if (Math.abs(bx) < 160 && Math.abs(by) < 120) bx += (bx >= 0 ? 1 : -1) * 180;
        bub.position.set(bx, by, -Math.random() * 1500);
        bgAdd(bub, {
          float: {
            amp: 8 + Math.random() * 8,
            sp: 0.6 + Math.random() * 0.6,
            ph: Math.random() * 6.28,
            base: by,
          },
        });
      }
      for (let k = 0; k < 14; k++) {
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(14 + Math.random() * 20, 0),
          new THREE.MeshLambertMaterial({ color: 0x0a3a5c }),
        );
        rock.position.set(
          (Math.random() > 0.5 ? 1 : -1) * (120 + Math.random() * 200),
          GROUND_Y + 8,
          -Math.random() * 1500,
        );
        rock.rotation.set(Math.random(), Math.random(), Math.random());
        bgAdd(rock, {});
      }
      makeMotes(0x9fe8ff, 110, { size: 3 });
    },

    // 宇宙：二層の星＋星雲＋環つき惑星
    space() {
      makeMotes(0xffffff, 320, { size: 2.2, spreadX: 1200, spreadY: 850, opacity: 0.95 });
      makeMotes(0xaad4ff, 120, { size: 4, spreadX: 1000, spreadY: 750, opacity: 0.8 });
      makeGlowSprite("rgba(150,110,255,0.9)", 1300, -430, 210, -2100, 0.5);
      makeGlowSprite("rgba(80,200,255,0.8)", 800, 500, -160, -2000, 0.4);
      const planet = new THREE.Group();
      planet.add(
        new THREE.Mesh(
          new THREE.SphereGeometry(85, 24, 18),
          new THREE.MeshLambertMaterial({ color: 0xffa46b }),
        ),
      );
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(112, 155, 42),
        new THREE.MeshBasicMaterial({
          color: 0xffe0b0,
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide,
          fog: false,
        }),
      );
      ring.rotation.x = Math.PI / 2.4;
      planet.add(ring);
      planet.position.set(-340, 170, -1500);
      bgAdd(planet, { staticBg: true, spin: 0.03 });
      const moon = new THREE.Mesh(
        new THREE.SphereGeometry(34, 16, 12),
        new THREE.MeshLambertMaterial({ color: 0x9fb8d8 }),
      );
      moon.position.set(380, -70, -1250);
      bgAdd(moon, { staticBg: true });
    },

    // 未来都市：窓が光る摩天楼
    future(c) {
      makeGroundPlane(c);
      const winCv = document.createElement("canvas");
      winCv.width = 64;
      winCv.height = 128;
      const wctx = winCv.getContext("2d")!;
      wctx.fillStyle = "#0a1030";
      wctx.fillRect(0, 0, 64, 128);
      for (let y = 6; y < 122; y += 10) {
        for (let x = 6; x < 58; x += 12) {
          if (Math.random() < 0.55) {
            wctx.fillStyle = Math.random() < 0.8 ? "#ffd977" : "#7de9ff";
            wctx.fillRect(x, y, 6, 5);
          }
        }
      }
      const winTex = new THREE.CanvasTexture(winCv);
      winTex.magFilter = THREE.NearestFilter;
      const winMat = new THREE.MeshBasicMaterial({ map: winTex });
      for (let i = 0; i < 40; i++) {
        const h = 90 + Math.random() * 260;
        const w = 26 + Math.random() * 26;
        const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), winMat);
        box.position.set(
          (Math.random() > 0.5 ? 1 : -1) * (150 + Math.random() * 210),
          GROUND_Y + h / 2,
          -Math.random() * 1700,
        );
        bgAdd(box, {});
      }
      makeMotes(0x7de9ff, 70, { size: 3 });
    },

    // ダンジョン：石柱＋トーチの灯り＋舞う火の粉
    dungeon(c) {
      makeGroundPlane(c);
      for (let i = 0; i < 26; i++) {
        const ph = 70 + Math.random() * 70;
        const pillar = new THREE.Mesh(
          new THREE.CylinderGeometry(9, 12, ph, 7),
          new THREE.MeshLambertMaterial({ color: 0x4a3620 }),
        );
        const px = (Math.random() > 0.5 ? 1 : -1) * (115 + Math.random() * 130);
        const pz = -Math.random() * 1500;
        pillar.position.set(px, GROUND_Y + ph / 2, pz);
        bgAdd(pillar, {});
        if (i % 2 === 0) {
          makeGlowSprite("rgba(255,150,50,0.95)", 52, px, GROUND_Y + ph + 14, pz, 0.9, {
            float: { amp: 3, sp: 2.2, ph: Math.random() * 6.28, base: GROUND_Y + ph + 14 },
          });
        }
      }
      makeMotes(0xffa050, 90, { size: 3.5, yBase: GROUND_Y + 90, spreadY: 180 });
    },

    // 夜の城：胸壁つきの城壁＋旗＋金の粒子
    castle(c) {
      makeGroundPlane(c);
      const stone = new THREE.MeshLambertMaterial({ color: 0x6b6484 });
      for (let i = 0; i < 16; i++) {
        const wall = new THREE.Group();
        wall.add(new THREE.Mesh(new THREE.BoxGeometry(30, 90, 92), stone));
        for (let b = -1; b <= 1; b++) {
          const merlon = new THREE.Mesh(new THREE.BoxGeometry(30, 14, 18), stone);
          merlon.position.set(0, 52, b * 32);
          wall.add(merlon);
        }
        wall.position.set(
          (i % 2 === 0 ? 1 : -1) * (155 + Math.random() * 70),
          GROUND_Y + 45,
          -i * 115 - Math.random() * 50,
        );
        bgAdd(wall, {});
      }
      for (let f = 0; f < 10; f++) {
        const g = new THREE.Group();
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(1.2, 1.2, 64, 5),
          new THREE.MeshLambertMaterial({ color: 0x333344 }),
        );
        pole.position.y = 32;
        g.add(pole);
        const flag = new THREE.Mesh(
          new THREE.PlaneGeometry(26, 16),
          new THREE.MeshLambertMaterial({ color: 0xd6336c, side: THREE.DoubleSide }),
        );
        flag.position.set(14, 52, 0);
        g.add(flag);
        g.position.set((f % 2 === 0 ? 1 : -1) * 155, GROUND_Y + 90, -f * 175);
        bgAdd(g, {});
      }
      makeMotes(0xffe08c, 90, { size: 3 });
    },

    // 電脳空間：ワイヤーフレーム塔＋緑のデジタルレイン
    cyber(c) {
      makeGroundPlane(c);
      for (let i = 0; i < 32; i++) {
        const h = 80 + Math.random() * 230;
        const w = 24 + Math.random() * 22;
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, w)),
          new THREE.LineBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.7 }),
        );
        edges.position.set(
          (Math.random() > 0.5 ? 1 : -1) * (145 + Math.random() * 180),
          GROUND_Y + h / 2,
          -Math.random() * 1600,
        );
        bgAdd(edges, {});
      }
      makeMotes(0x37ff9c, 240, { size: 3.4, spreadX: 950, spreadY: 720, rain: 130, opacity: 0.85 });
      makeMotes(0xff2fd6, 40, { size: 4, opacity: 0.5 });
    },
  };

  function buildField(id: string) {
    field = id;
    const c = fieldPreset(id);
    bgObjects.forEach(disposeObj);
    bgObjects = [];
    fieldTime = 0;
    scene.background = new THREE.Color(c.sky[0]);
    scene.fog = new THREE.Fog(c.fog, 100, c.fogFar || 1400);
    makeSkydome(c.sky[0], c.sky[1]);
    const hemi = new THREE.HemisphereLight(c.sky[1], c.ground || 0x0c1224, 0.95);
    bgAdd(hemi, { staticBg: true });
    makeHighway(c.hw || c.grid || 0x4ee1ff);
    FIELD_BUILDERS[c.kind]?.(c);
  }

  /* ---------------------------------------------------------------- *
   * 景色を流す（旧 moveScenery）
   * ---------------------------------------------------------------- */
  function moveScenery(delta: number) {
    const sp = speed * 0.8;
    const dz = sp * delta * 60;
    fieldTime += delta;
    for (let k = 0; k < bgObjects.length; k++) {
      const obj = bgObjects[k]!;
      const ud = (obj.userData || {}) as SceneryData;
      const mat = (obj as MaybeResource).material;
      if (ud.texScroll && mat && !Array.isArray(mat)) {
        const map = (mat as { map?: { offset: { y: number } } | null }).map;
        if (map) map.offset.y += ud.texScroll * sp * delta;
      }
      if (ud.spin) obj.rotation.y += ud.spin * delta;
      if (ud.float)
        obj.position.y =
          ud.float.base + Math.sin(fieldTime * ud.float.sp + ud.float.ph) * ud.float.amp;
      if (ud.staticBg) continue;
      if (obj.type === "Points") {
        const attr = (obj as ThreeModule.Points).geometry.attributes.position!;
        const pos = attr.array as Float32Array;
        if (ud.rain) {
          for (let i = 1; i < pos.length; i += 3) {
            pos[i]! -= ud.rain * delta;
            if (pos[i]! < -420) pos[i] = 420;
          }
        } else {
          for (let i = 2; i < pos.length; i += 3) {
            pos[i]! += dz;
            if (pos[i]! > 100) pos[i] = -1800;
          }
        }
        attr.needsUpdate = true;
      } else if (obj.type === "GridHelper") {
        obj.position.z += dz;
        if (obj.position.z > GRID_STEP) obj.position.z -= GRID_STEP;
      } else if (obj.position) {
        obj.position.z += dz;
        if (obj.position.z > 140) obj.position.z = -1600;
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * 迫る用語（旧 makeEnemyTexture / spawnEnemy / redrawEnemy）
   * ---------------------------------------------------------------- */
  // 旧版は Google Fonts の Noto Sans JP を読んでいた。ここは next/font が配る
  // 名前をキャンバスから参照できないので、端末にある丸ゴシック→ゴシックの順に頼る。
  const TERM_FONT = '"Hiragino Maru Gothic ProN", "Hiragino Sans", "Noto Sans JP", sans-serif';

  /**
   * 長い ひとことは **2行に 折る**（2026-08-25・願い #203 で センテンスが 入った）。
   *
   * 字の 大きさは 長さで 決まる（`820 / 長さ`）ので、1行の ままだと
   * 「お時間を いただき、ありがとうございます」は 米粒に なる。
   * やさしい日本語は 語の 間を あけて 書く ので、**まん中に いちばん 近い 空白**で
   * 切れば 語の 途中で 割れない。
   */
  function wrapTerm(label: string): string[] {
    if (label.length <= 12) return [label];
    const spaces = [...label.matchAll(/\s/gu)].map((m) => m.index);
    if (spaces.length === 0) return [label];
    const mid = label.length / 2;
    const at = spaces.reduce((best, i) => (Math.abs(i - mid) < Math.abs(best - mid) ? i : best));
    return [label.slice(0, at), label.slice(at + 1)];
  }

  function makeEnemyTexture(label: string, reading: string, showReading: boolean) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;
    const aura = fieldPreset(field).aura;
    const lines = wrapTerm(label);
    const longest = Math.max(...lines.map((line) => line.length));
    const fs = Math.min(200, Math.floor(820 / longest));
    const cy = showReading && reading ? 300 : 256; // 読みを上に出すときは漢字を少し下げる
    /*
     * **下地は 敷かない**（2026-08-27 の 指定「四角い膜が カッコ悪い」）。
     *
     * 前は 明るい 景色でも 読める ように、円い グラデーションを 敷いて いた。
     * ところが 塗る 先は 1024×512 の **四角い** キャンバスで、円の 半径(430)が
     * 縦の 半分(256)より 大きい。つまり 上下の 端では まだ 濃い ところで
     * 切られる ので、**字の まわりに 四角い 膜**が 見えて いた。
     *
     * 読みやすさは 下地の 代わりに **字そのもの**で 作る——黒い ふちを 厚くして
     * 影を 足す。膜は 消えて、字は かえって くっきり する。
     */
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 " + fs + "px " + TERM_FONT;
    // 2行の ときは 上下に 振り分ける（1行なら これまでどおり まん中）
    const step = fs * 1.15;
    const ys = lines.map((_, i) => cy + (i - (lines.length - 1) / 2) * step);
    // ワールド色のネオングロー
    ctx.save();
    ctx.shadowColor = aura;
    ctx.shadowBlur = 46;
    ctx.lineWidth = fs * 0.1;
    ctx.strokeStyle = aura;
    lines.forEach((line, i) => ctx.strokeText(line, 512, ys[i]!));
    ctx.restore();
    // 黒縁 → グラデーションの本体。下地を やめた ぶん、ふちを 厚く して 影を 足す
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 26;
    ctx.lineWidth = fs * 0.2;
    ctx.strokeStyle = "rgba(0,0,0,0.95)";
    lines.forEach((line, i) => ctx.strokeText(line, 512, ys[i]!));
    lines.forEach((line, i) => ctx.strokeText(line, 512, ys[i]!)); // 2度がけ で 濃くする
    ctx.restore();
    const top = ys[0]! - fs / 2;
    const tg = ctx.createLinearGradient(0, top, 0, ys[lines.length - 1]! + fs / 2);
    tg.addColorStop(0, "#ffffff");
    tg.addColorStop(0.55, "#eef6ff");
    tg.addColorStop(1, "#b8d8ff");
    ctx.fillStyle = tg;
    lines.forEach((line, i) => ctx.fillText(line, 512, ys[i]!));
    if (showReading && reading) {
      const rfs = Math.min(92, Math.floor(740 / reading.length));
      const ry = top - fs * 0.1 - rfs * 0.5;
      ctx.font = "800 " + rfs + "px " + TERM_FONT;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.85)";
      ctx.shadowBlur = 16;
      ctx.lineWidth = rfs * 0.3;
      ctx.strokeStyle = "rgba(0,0,0,0.95)";
      ctx.strokeText(reading, 512, ry);
      ctx.strokeText(reading, 512, ry);
      ctx.restore();
      ctx.fillStyle = "#ffd54a";
      ctx.fillText(reading, 512, ry);
    }
    return new THREE.CanvasTexture(canvas);
  }

  function spawnEnemy(term: string, reading: string, showReading: boolean) {
    cancelBurst();
    if (enemySprite) {
      disposeObj(enemySprite);
      enemySprite = null;
    }
    const mat = new THREE.SpriteMaterial({
      map: makeEnemyTexture(term, reading, showReading),
      transparent: true,
    });
    mat.depthTest = false; // 背景オブジェクトに隠れず常に手前に出す
    mat.depthWrite = false;
    enemySprite = new THREE.Sprite(mat);
    enemySprite.renderOrder = 999;
    enemyZ = -800;
    resolved = false;
    setNear(false);
    enemySprite.position.set(0, 0, enemyZ);
    enemySprite.scale.set(300, 150, 1);
    scene.add(enemySprite);
    spawnFxRing(new THREE.Vector3(0, 0, enemyZ), "portal");
  }

  /* ---------------------------------------------------------------- *
   * ワンショット演出（旧 spawnFxRing / spawnFxFlash / updateFx / explode）
   * ---------------------------------------------------------------- */
  function spawnFxRing(pos: TVector3, kind: string) {
    const color =
      kind === "portal" ? new THREE.Color(fieldPreset(field).aura) : new THREE.Color(0xffffff);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(kind === "portal" ? 26 : 8, kind === "portal" ? 32 : 13, 48),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        fog: false,
      }),
    );
    ring.renderOrder = 998;
    ring.position.copy(pos);
    scene.add(ring);
    fxList.push({ mesh: ring, t: 0, kind });
  }

  function spawnFxFlash(pos: TVector3) {
    const cv = document.createElement("canvas");
    cv.width = 128;
    cv.height = 128;
    const ctx = cv.getContext("2d")!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,220,130,0.9)");
    g.addColorStop(1, "rgba(255,160,40,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(cv),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        fog: false,
      }),
    );
    sp.renderOrder = 998;
    sp.position.copy(pos);
    sp.scale.set(200, 200, 1);
    scene.add(sp);
    fxList.push({ mesh: sp, t: 0, kind: "flash" });
  }

  function updateFx(delta: number) {
    for (let i = fxList.length - 1; i >= 0; i--) {
      const f = fxList[i]!;
      f.t += delta;
      const dur = f.kind === "flash" ? 0.22 : f.kind === "portal" ? 0.55 : 0.6;
      const k = f.t / dur;
      const mat = (f.mesh as MaybeResource).material as { opacity: number } | undefined;
      if (k >= 1) {
        disposeObj(f.mesh);
        fxList.splice(i, 1);
        continue;
      }
      if (f.kind === "flash") {
        const s2 = 200 * (1 + k * 1.6);
        f.mesh.scale.set(s2, s2, 1);
      } else {
        const s = 1 + k * (f.kind === "portal" ? 5 : 15);
        f.mesh.scale.set(s, s, 1);
      }
      if (mat) mat.opacity = 0.95 * (1 - k);
    }
  }

  function explode(pos: TVector3) {
    const auraHex = new THREE.Color(fieldPreset(field).aura).getHex();
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(5, 5, 5),
        new THREE.MeshBasicMaterial({ color: Math.random() < 0.5 ? 0xffc24a : auraHex }),
      );
      m.position.copy(pos);
      particles.push({
        mesh: m,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 24,
          (Math.random() - 0.5) * 24,
          (Math.random() - 0.5) * 24,
        ),
        life: 1,
      });
      scene.add(m);
    }
    spawnFxRing(pos, "shock");
    spawnFxFlash(pos);
  }

  function updateParticles(delta: number) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]!;
      p.mesh.position.add(p.vel.clone().multiplyScalar(delta * 60));
      p.mesh.rotation.x += 0.1;
      p.mesh.rotation.y += 0.1;
      p.life -= delta * 1.5;
      const mat = p.mesh.material as ThreeModule.MeshBasicMaterial;
      mat.transparent = true;
      mat.opacity = Math.max(0, p.life);
      if (p.life <= 0) {
        disposeObj(p.mesh);
        particles.splice(i, 1);
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * ループ（旧 gameLoop）
   * ---------------------------------------------------------------- */
  function setNear(value: boolean) {
    if (near === value) return;
    near = value;
    options.onNear(value);
  }

  function gameLoop(time: number) {
    frame = requestAnimationFrame(gameLoop);
    let delta = (time - lastTime) / 1000;
    lastTime = time;
    if (delta > 0.1) delta = 0.1;

    // 解説の間も背景は流し続ける（止めず次のシーンへ徐々に切り替わる感じ）
    if (moving) moveScenery(delta);

    if (moving && enemySprite && !resolved) {
      enemyZ += speed * delta * 150;
      // FPS視点：中心に向かって迫り、自分にぶつかる（遠くではふわっと漂う）
      const bobAmp = 8 * Math.min(1, Math.max(0, -enemyZ / 800));
      enemySprite.position.set(0, Math.sin(fieldTime * 2.2) * bobAmp, enemyZ);
      const sc = 300 + Math.max(0, enemyZ + 800) * 0.25;
      enemySprite.scale.set(sc, sc * 0.5, 1);
      if (enemyZ > -250) setNear(true);
      if (enemyZ > 30) {
        // カメラに到達＝ぶつかった
        setNear(false);
        resolved = true;
        options.onCollide();
      }
    } else {
      setNear(false);
    }

    // 正解時のFOVキック（ぐっと加速する感じ）
    if (fovKick > 0) {
      fovKick = Math.max(0, fovKick - delta * 3.2);
      camera.fov = 70 + 7 * Math.sin(fovKick * Math.PI);
      camera.updateProjectionMatrix();
    }

    updateParticles(delta);
    updateFx(delta);
    renderer.render(scene, camera);
  }

  function cancelBurst() {
    if (burstTimer !== null) {
      clearTimeout(burstTimer);
      burstTimer = null;
    }
  }

  buildField("forest");
  frame = requestAnimationFrame(gameLoop);

  return {
    setField(id) {
      if (id !== field) buildField(id);
    },
    setSpeed(value) {
      speed = value;
    },
    setMoving(value) {
      moving = value;
    },
    spawnTerm(term, reading, showReading) {
      spawnEnemy(term, reading, showReading);
    },
    redrawTerm(term, reading, showReading) {
      // ふりがなON/OFF切替時、現在の漢字を描き直す（位置はそのまま）
      if (!enemySprite) return;
      const old = enemySprite.material.map;
      enemySprite.material.map = makeEnemyTexture(term, reading, showReading);
      enemySprite.material.needsUpdate = true;
      if (old) old.dispose();
    },
    resolveTerm(kind) {
      cancelBurst();
      resolved = true;
      setNear(false);
      if (kind === "hit" && enemySprite) {
        // 旧 resolveReading(true)：金色に染めて FOV をひと蹴りする
        enemySprite.material.color.setHex(0xffe9a0);
        fovKick = 1;
      }
      const wait = kind === "hit" ? 350 : kind === "missed" ? 200 : 300;
      burstTimer = setTimeout(() => {
        burstTimer = null;
        if (!enemySprite) return;
        explode(enemySprite.position.clone());
        disposeObj(enemySprite);
        enemySprite = null;
      }, wait);
    },
    clearTerm() {
      cancelBurst();
      resolved = true;
      setNear(false);
      if (enemySprite) {
        disposeObj(enemySprite);
        enemySprite = null;
      }
    },
    dispose() {
      cancelBurst();
      cancelAnimationFrame(frame);
      observer.disconnect();
      bgObjects.forEach(disposeObj);
      bgObjects = [];
      fxList.forEach((f) => disposeObj(f.mesh));
      fxList.length = 0;
      particles.forEach((p) => disposeObj(p.mesh));
      particles.length = 0;
      if (enemySprite) disposeObj(enemySprite);
      enemySprite = null;
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
