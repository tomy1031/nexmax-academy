"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { fieldPreset, type FieldPreset } from "./fields";

/**
 * ことばアーケードの3D世界。
 *
 * 旧アプリ（DATA DIVE）は three.js で木・ビル・柱・星を奥に並べ、それを手前へ
 * 流し続けることで「自分が前へ進んでいる」を作っていた。移植のときにこの層が
 * まるごと落ちて、動かない床の絵だけが残っていた。用語が拡大するだけでは
 * 迫ってくる感じは出ない。奥の物が自分を追い越していくから速さが分かる。
 *
 * three.js は足せない（package.json は共有ファイル）ので、CSS の遠近法
 * （perspective + translateZ）で同じ層を組み直す。奥行きは本物なので、
 * 近づくほど加速する見え方も旧アプリのカメラと同じになる。
 * 形は板（ビルボード）で作る。旧アプリの木・雲・星もカメラを向いた板だったので、
 * 見え方は変わらない。
 */

/** 舞台の遠近の強さ。旧アプリのカメラ（fov 70）に相当する。 */
export const PERSPECTIVE_PX = 900;

/** 景色が湧く奥と、視点を追い越していく手前（旧 moveScenery の -1600 → +140）。 */
const SCENERY_FAR = -2600;
const SCENERY_NEAR = 560;

/** 用語が旅する奥行き（旧 spawnEnemy の z=-800 から衝突の z=+30 まで）。 */
export const TERM_FAR = -2400;
export const TERM_NEAR = 520;

/** 目の高さから地面までの距離。地面より下に物を置かないための基準。 */
const EYE_TO_GROUND = 260;

/** 床の目地の1マス。この幅ぶん流れて折り返す。 */
const GRID_TILE = 140;

/** 道に並ぶ矢印の間隔。 */
const CHEVRON_TILE = 280;

/**
 * 奥行き z にある物が何倍に見えるか。
 * 旧アプリのカメラと同じ双曲線で、目の前に来る直前に一気に大きくなる。
 */
export function projectedScale(z: number): number {
  return PERSPECTIVE_PX / (PERSPECTIVE_PX - z);
}

/** 進み具合（0=水平線 / 1=目の前）から用語の奥行きを出す。 */
export function termDepth(progress: number): number {
  return TERM_FAR + (TERM_NEAR - TERM_FAR) * progress;
}

/**
 * 舞台がぶつかる直前かどうか（旧 gameLoop の `enemyZ > -250` と同じ位置）。
 * ここから画面が揺れ始める。
 */
export const IMMINENT_PROGRESS = (-250 - TERM_FAR) / (TERM_NEAR - TERM_FAR);

/* ------------------------------------------------------------------ *
 * 景色の配置
 * ------------------------------------------------------------------ */

/**
 * 景色の並びは毎回同じにする。
 * Math.random だとサーバとクライアントで絵が変わり、hydration が壊れる。
 */
function seededRandom(seed: string): () => number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return () => {
    hash += 0x6d2b79f5;
    let t = hash;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Placement {
  /** 視点から見た左右（px）。用語を隠さないよう中央は空ける。 */
  readonly x: number;
  /** 上下（px。+が下）。立っている物は地面（EYE_TO_GROUND）に置く。 */
  readonly y: number;
  /** 0〜1。流れの中のどこから始めるか。ばらけさせて途切れなくする。 */
  readonly phase: number;
  /** 小さい画面では出さない（描く数を半分に減らす）。 */
  readonly thin: boolean;
  /** 流れずに遠くへ留まる（旧 staticBg）。夕陽や水中の光の筋はこれ。 */
  readonly still?: boolean;
  readonly node: ReactNode;
}

/** 留まる物を置く奥行き。旧アプリの staticBg と同じで、近づいてこない。 */
const STILL_Z = -1900;

/* ------------------------------------------------------------------ *
 * 板の部品
 * ------------------------------------------------------------------ */

/** 地面に立つ板。置いた点が足元になる。 */
function standing(width: number, height: number, style: CSSProperties): CSSProperties {
  return { position: "absolute", left: -width / 2, bottom: 0, width, height, ...style };
}

/** 空にうかぶ板。置いた点が真ん中になる。 */
function floating(width: number, height: number, style: CSSProperties): CSSProperties {
  return {
    position: "absolute",
    left: -width / 2,
    bottom: -height / 2,
    width,
    height,
    ...style,
  };
}

/** 木（旧: 幹のシリンダー＋2段のコーン）。 */
function Tree({ scale, dark }: { scale: number; dark: boolean }) {
  const h = 210 * scale;
  const w = 120 * scale;
  return (
    <div style={standing(w, h, {})}>
      <div
        style={{
          position: "absolute",
          left: "44%",
          bottom: 0,
          width: w * 0.12,
          height: h * 0.34,
          background: "linear-gradient(90deg, #8a5a34, #5f3c20)",
          borderRadius: 2,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: h * 0.26,
          width: w,
          height: h * 0.44,
          background: `linear-gradient(100deg, ${dark ? "#2f9e5c" : "#48c47a"}, ${dark ? "#1c6c3d" : "#2c8f55"})`,
          clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: w * 0.16,
          bottom: h * 0.54,
          width: w * 0.68,
          height: h * 0.42,
          background: `linear-gradient(100deg, ${dark ? "#3fbb72" : "#63dd94"}, ${dark ? "#26824c" : "#39a866"})`,
          clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)",
        }}
      />
    </div>
  );
}

/** ふわふわ雲（旧: つぶしたスフィアの集まり）。 */
function Cloud({ width, tint }: { width: number; tint: string }) {
  return (
    <div
      className="arc-float"
      style={floating(width, width * 0.42, {
        background: tint,
        borderRadius: "999px",
        boxShadow: `${width * 0.22}px ${-width * 0.1}px 0 ${-width * 0.06}px ${tint},
                    ${-width * 0.24}px ${-width * 0.04}px 0 ${-width * 0.09}px ${tint}`,
        opacity: 0.85,
      })}
    />
  );
}

/** 窓が光るビル（旧: 窓テクスチャを貼ったボックス）。 */
function Tower({ width, height, lit }: { width: number; height: number; lit: string }) {
  return (
    <div
      style={standing(width, height, {
        background: `
          repeating-linear-gradient(to bottom, ${lit} 0 7px, transparent 7px 20px),
          repeating-linear-gradient(to right, ${lit} 0 8px, transparent 8px 22px),
          linear-gradient(100deg, #3d5f9e, #21386b)`,
        backgroundBlendMode: "overlay, overlay, normal",
        borderRadius: "3px 3px 0 0",
        boxShadow: "inset -8px 0 0 rgba(0,0,0,.18)",
      })}
    />
  );
}

/** ワイヤーフレームの塔（旧: EdgesGeometry の線だけの箱）。 */
function WireTower({ width, height, line }: { width: number; height: number; line: string }) {
  return (
    <div
      style={standing(width, height, {
        border: `2px solid ${line}`,
        background: `
          repeating-linear-gradient(to bottom, ${line} 0 2px, transparent 2px 34px),
          linear-gradient(180deg, rgba(255,255,255,.14), transparent)`,
        boxShadow: `0 0 18px ${line}66`,
      })}
    />
  );
}

/** 石柱とたいまつ（旧: シリンダー＋グロースプライト）。 */
function Pillar({ height, glow }: { height: number; glow: string }) {
  const w = 74;
  return (
    <div style={standing(w, height, {})}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(100deg, #9a7248, #5f4327)",
          clipPath: "polygon(18% 0%, 82% 0%, 100% 100%, 0% 100%)",
        }}
      />
      <div
        className="arc-float"
        style={{
          position: "absolute",
          left: "50%",
          top: -22,
          width: 44,
          height: 44,
          marginLeft: -22,
          borderRadius: "999px",
          background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`,
        }}
      />
    </div>
  );
}

/** 城壁と旗（旧: 胸壁つきのボックス＋ポールと旗）。 */
function CastleWall({ stone, flag }: { stone: string; flag: string }) {
  return (
    <div style={standing(200, 150, {})}>
      <div
        style={{
          position: "absolute",
          inset: "26px 0 0 0",
          background: `linear-gradient(100deg, ${stone}, rgba(0,0,0,.28))`,
          backgroundBlendMode: "overlay",
          backgroundColor: stone,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 28,
          background: `repeating-linear-gradient(to right, ${stone} 0 34px, transparent 34px 60px)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 24,
          top: -70,
          width: 5,
          height: 78,
          background: "#4a4560",
        }}
      />
      <div
        className="arc-float"
        style={{
          position: "absolute",
          left: 29,
          top: -64,
          width: 46,
          height: 30,
          background: flag,
          clipPath: "polygon(0 0, 100% 0, 78% 50%, 100% 100%, 0 100%)",
        }}
      />
    </div>
  );
}

/** 海底の岩とあわ。 */
function Rock({ size, tint }: { size: number; tint: string }) {
  return (
    <div
      style={standing(size, size * 0.72, {
        background: `linear-gradient(100deg, ${tint}, rgba(0,0,0,.35))`,
        backgroundColor: tint,
        clipPath: "polygon(12% 100%, 0% 46%, 30% 6%, 72% 0%, 100% 40%, 92% 100%)",
      })}
    />
  );
}

function Bubble({ size, tint }: { size: number; tint: string }) {
  return (
    <div
      className="arc-float"
      style={floating(size, size, {
        borderRadius: "999px",
        border: `2px solid ${tint}`,
        background: `radial-gradient(circle at 32% 30%, #ffffffcc, transparent 58%)`,
      })}
    />
  );
}

/** 水中にさす光の筋（旧: ゴッドレイのプレーン）。 */
function GodRay({ width, tint }: { width: number; tint: string }) {
  return (
    <div
      style={floating(width, 760, {
        background: `linear-gradient(180deg, ${tint}, transparent)`,
        opacity: 0.35,
        transform: "skewX(-6deg)",
      })}
    />
  );
}

/** 夕陽・星雲の光（旧 makeGlowSprite）。 */
function Glow({ size, tint, strength }: { size: number; tint: string; strength: number }) {
  return (
    <div
      style={floating(size, size, {
        borderRadius: "999px",
        background: `radial-gradient(circle, ${tint} 0%, transparent 70%)`,
        opacity: strength,
      })}
    />
  );
}

/** ただよう光の粒（旧 makeMotes）。 */
function Mote({ size, tint, rain }: { size: number; tint: string; rain: boolean }) {
  return (
    <div
      className={rain ? "arc-rain" : "arc-float"}
      style={floating(size, rain ? size * 5 : size, {
        borderRadius: rain ? "2px" : "999px",
        background: tint,
        boxShadow: `0 0 ${size * 2}px ${tint}`,
      })}
    />
  );
}

/* ------------------------------------------------------------------ *
 * 世界ごとの並べ方（旧 FIELD_BUILDERS と1対1）
 * ------------------------------------------------------------------ */

/** 中央（用語の通り道）を空けて、左右に振り分ける。 */
function sideX(random: () => number, near: number, far: number): number {
  return (random() < 0.5 ? -1 : 1) * (near + random() * (far - near));
}

function buildPlacements(preset: FieldPreset, seed: string): Placement[] {
  const random = seededRandom(seed);
  const out: Placement[] = [];
  const ground = EYE_TO_GROUND;

  /** 立ち並ぶ物は16個。うち後半8個は小さい画面では出さない。 */
  const bulk = 16;

  for (let i = 0; i < bulk; i += 1) {
    const thin = i >= bulk / 2;
    const phase = i / bulk + random() * 0.03;
    const x = sideX(random, 240, 620);

    switch (preset.kind) {
      case "forest":
        out.push({
          x,
          y: ground,
          phase,
          thin,
          node: <Tree scale={0.75 + random() * 0.7} dark={random() < 0.5} />,
        });
        break;
      case "sky":
        out.push({
          x: sideX(random, 260, 700),
          y: -180 + random() * 380,
          phase,
          thin,
          node: <Cloud width={140 + random() * 170} tint="#ffffff" />,
        });
        break;
      case "sunset":
        out.push({
          x: sideX(random, 260, 700),
          y: -200 + random() * 400,
          phase,
          thin,
          node: (
            <Cloud width={160 + random() * 200} tint={random() < 0.5 ? "#ffd9c2" : "#ffbfa6"} />
          ),
        });
        break;
      case "sea":
        out.push(
          i % 3 === 0
            ? {
                x,
                y: ground,
                phase,
                thin,
                node: <Rock size={90 + random() * 90} tint="#0f5b86" />,
              }
            : i % 3 === 1
              ? {
                  x: sideX(random, 250, 660),
                  y: -220 + random() * 420,
                  phase,
                  thin,
                  node: <Bubble size={40 + random() * 70} tint="#bff0ff" />,
                }
              : {
                  x: sideX(random, 300, 720),
                  y: -140,
                  phase,
                  thin,
                  still: true,
                  node: <GodRay width={70 + random() * 70} tint="#eafcff" />,
                },
        );
        break;
      case "future":
        out.push({
          x,
          y: ground,
          phase,
          thin,
          node: (
            <Tower width={70 + random() * 60} height={220 + random() * 400} lit={preset.mote} />
          ),
        });
        break;
      case "dungeon":
        out.push({
          x,
          y: ground,
          phase,
          thin,
          node: <Pillar height={190 + random() * 150} glow={preset.aura} />,
        });
        break;
      case "castle":
        out.push({
          x,
          y: ground,
          phase,
          thin,
          node: <CastleWall stone="#8d84ab" flag="#e0559a" />,
        });
        break;
      case "cyber":
        out.push({
          x,
          y: ground,
          phase,
          thin,
          node: (
            <WireTower
              width={70 + random() * 60}
              height={210 + random() * 330}
              line={preset.aura}
            />
          ),
        });
        break;
    }
  }

  // 遠くに置きっぱなしの大きな光（夕陽・空の光）。旧アプリと同じく流れない。
  if (preset.kind === "sunset") {
    out.push({
      x: 0,
      y: -60,
      phase: 0,
      thin: false,
      still: true,
      node: <Glow size={1100} tint="#ffb56b" strength={0.75} />,
    });
    out.push({
      x: -320,
      y: 120,
      phase: 0,
      thin: true,
      still: true,
      node: <Glow size={760} tint="#ff9ec2" strength={0.4} />,
    });
  }
  if (preset.kind === "sky") {
    out.push({
      x: 380,
      y: -220,
      phase: 0,
      thin: false,
      still: true,
      node: <Glow size={620} tint="#fff3c9" strength={0.7} />,
    });
  }

  // ただよう光の粒。旧アプリの makeMotes。電脳空間だけは縦に降らせる。
  const rain = preset.kind === "cyber";
  const motes = 16;
  for (let i = 0; i < motes; i += 1) {
    out.push({
      x: sideX(random, 90, 760),
      y: -320 + random() * 640,
      phase: i / motes + random() * 0.05,
      thin: i % 2 === 1,
      node: <Mote size={4 + random() * 5} tint={preset.mote} rain={rain} />,
    });
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * 世界を描く
 * ------------------------------------------------------------------ */

/**
 * 奥から手前へ流れる景色。
 *
 * `speed` は難しさの速度倍率（0.5〜1）。旧アプリと同じく、難しくすると
 * 景色も速く流れる（速さが上がったことが景色で分かる）。
 */
export function FieldWorld({ field, speed }: { field: string; speed: number }) {
  const preset = fieldPreset(field);
  const pace = Math.max(0.25, speed);
  // 1周にかかる秒数。速度倍率で割る（速いほど短い）。
  const travel = 13 / pace;
  const placements = useMemo(() => buildPlacements(preset, field), [preset, field]);
  // 床の目地と道の矢印は、1マス分ずつ手前へずらして折り返す。
  const gridFlow = `${(GRID_TILE / 26 / pace).toFixed(2)}s`;
  const roadFlow = `${(CHEVRON_TILE / 26 / pace).toFixed(2)}s`;

  return (
    <>
      {/*
       * 床と立ち並ぶ物は別の3D空間に分ける。
       * 同じ空間に入れると、寝かせた大きな床とビルボードの前後関係が
       * ブラウザの並べ替え次第になり、木がときどき床に沈む。
       */}
      <div className="arc-world" aria-hidden>
        {/* 床（旧: GroundPlane ＋ GridHelper）。目地が手前へ流れて速さを見せる。 */}
        <div
          className="arc-plane"
          style={{
            width: 5200,
            height: 4000,
            marginLeft: -2600,
            marginTop: -4000,
            transform: `translateY(${EYE_TO_GROUND}px) translateZ(520px) rotateX(90deg)`,
            background: `linear-gradient(to top, ${preset.ground[0]}, ${preset.ground[1]})`,
          }}
        >
          <div
            className="arc-scroll"
            style={
              {
                top: -GRID_TILE,
                background: `
                  repeating-linear-gradient(to right, ${preset.grid} 0 3px, transparent 3px ${GRID_TILE}px),
                  repeating-linear-gradient(to bottom, ${preset.grid} 0 3px, transparent 3px ${GRID_TILE}px)`,
                opacity: 0.55,
                "--arc-step": `${GRID_TILE}px`,
                animationDuration: gridFlow,
              } as CSSProperties
            }
          />
        </div>

        {/* データハイウェイ（旧 makeHighway）。全部の世界に通っている一本道。 */}
        <div
          className="arc-plane"
          style={{
            width: 460,
            height: 4000,
            marginLeft: -230,
            marginTop: -4000,
            // 床とぴったり同じ高さだと重なって描画が乱れるので、少しだけ浮かせる。
            transform: `translateY(${EYE_TO_GROUND - 8}px) translateZ(520px) rotateX(90deg)`,
            background: `linear-gradient(90deg,
              ${preset.highway} 0 3%, transparent 3% 8%,
              transparent 92% 97%, ${preset.highway} 97% 100%)`,
            boxShadow: `0 0 40px ${preset.highway}`,
            opacity: 0.85,
          }}
        >
          <div
            className="arc-scroll"
            style={
              {
                top: -CHEVRON_TILE,
                backgroundImage: chevron(preset.highway),
                backgroundSize: `100% ${CHEVRON_TILE}px`,
                backgroundRepeat: "repeat-y",
                "--arc-step": `${CHEVRON_TILE}px`,
                animationDuration: roadFlow,
              } as CSSProperties
            }
          />
        </div>
      </div>

      {/* 立ち並ぶ物。奥のものが手前のものに隠れるよう、ここだけで前後を決める。 */}
      <div className="arc-world" aria-hidden>
        {placements.map((p, i) => (
          <div
            key={`${field}-${i}`}
            className={`arc-prop${p.thin ? "arc-thin" : ""}`}
            style={{ transform: `translate3d(${p.x}px, ${p.y}px, 0)` }}
          >
            <div
              className={p.still ? undefined : "arc-travel"}
              style={
                p.still
                  ? { position: "absolute", transform: `translateZ(${STILL_Z}px)` }
                  : {
                      animationDuration: `${travel}s`,
                      animationDelay: `-${(p.phase * travel).toFixed(2)}s`,
                    }
              }
            >
              {p.node}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/** 道に流れる矢印。旧アプリがキャンバスに描いていた三角形と同じ形。 */
function chevron(color: string): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'>` +
    `<path d='M128 34 L166 96 L128 78 L90 96 Z' fill='${color}' opacity='0.55'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/* ------------------------------------------------------------------ *
 * 舞台のCSS
 * ------------------------------------------------------------------ */

/**
 * 舞台だけで使うキーフレーム。
 * globals.css は共有ファイルなので、ここに閉じ込めて持ち歩く。
 */
export const WORLD_CSS = `
.arc-world{position:absolute;inset:0;transform-style:preserve-3d;pointer-events:none}
.arc-prop{position:absolute;left:50%;top:50%;transform-style:preserve-3d}
.arc-travel{position:absolute;transform-style:preserve-3d;
  animation-name:arc-travel;animation-timing-function:linear;animation-iteration-count:infinite}
@keyframes arc-travel{
  0%{transform:translateZ(${SCENERY_FAR}px);opacity:0}
  12%{opacity:1}
  100%{transform:translateZ(${SCENERY_NEAR}px);opacity:1}}
.arc-plane{position:absolute;left:50%;top:50%;transform-origin:50% 100%;
  overflow:hidden;backface-visibility:hidden}
/* 目地・矢印は1マスぶん手前へずらして折り返す。transform なので塗り直しが起きない。 */
@keyframes arc-scroll{from{transform:translateY(0)}to{transform:translateY(var(--arc-step))}}
.arc-scroll{position:absolute;left:0;right:0;bottom:0;
  animation-name:arc-scroll;animation-timing-function:linear;animation-iteration-count:infinite}
@keyframes arc-float{0%,100%{translate:0 0}50%{translate:0 -16px}}
.arc-float{animation:arc-float 3.4s ease-in-out infinite}
@keyframes arc-rain{from{translate:0 -320px}to{translate:0 320px}}
.arc-rain{animation:arc-rain 2.6s linear infinite}
@keyframes arc-shake{
  0%{translate:1px 1px}25%{translate:-3px 0}50%{translate:-1px 2px}
  75%{translate:3px 1px}100%{translate:1px -2px}}
.arc-quake{animation:arc-shake .5s infinite}
@keyframes arc-damage{
  0%{translate:0 0}15%{translate:-14px 6px}30%{translate:13px -7px}
  45%{translate:-11px 5px}60%{translate:9px -5px}75%{translate:-6px 3px}100%{translate:0 0}}
.arc-damage{animation:arc-damage .48s ease-out}
@keyframes arc-kick{0%{scale:1}35%{scale:1.06}100%{scale:1}}
.arc-kick{animation:arc-kick .45s ease-out}
@media (max-width:640px){.arc-thin{display:none}}
@media (prefers-reduced-motion:reduce){
  .arc-travel,.arc-scroll,.arc-float,.arc-rain,.arc-quake,.arc-damage,.arc-kick{animation:none}
  .arc-travel{transform:translateZ(-900px)}}
`;
