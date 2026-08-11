/**
 * 景色（フィールド）の見た目。
 *
 * 旧アプリは Three.js で世界を組んでいた。WebGL と 500KB のライブラリを足さずに
 * 同じ世界を出したいので、ここは CSS の遠近法（perspective + translateZ）で組む。
 * 奥行きは本物なので、旧アプリと同じく近づくほど加速して見える。
 * 立てる物（木・ビル・柱…）の作り方は arcade-world.tsx にある。
 *
 * 配色は島マップ（/map）と地続きの明るいトロピカルに寄せる。
 * 旧アプリの暗いサイバー調には戻さない。緊張感は暗さではなく距離と速度で出す。
 *
 * 名前はやさしい日本語。ビジュアルテーマ04 §1 の規律により
 * 「冒険・探検・クエスト」系の比喩は使わない。
 */

/** 立てる物の作り分け。旧アプリの FIELD_BUILDERS と1対1で対応する。 */
export type FieldKind =
  "forest" | "sky" | "sea" | "sunset" | "future" | "dungeon" | "castle" | "cyber";

export interface FieldPreset {
  readonly label: string;
  /** どの物を立てるか。 */
  readonly kind: FieldKind;
  /** 空のグラデーション [天頂, 水平線ぎわ]。 */
  readonly sky: readonly [string, string];
  /** 地面（床）の色 [手前, 奥]。 */
  readonly ground: readonly [string, string];
  /** 床の目地の色。奥行きを作る線。 */
  readonly grid: string;
  /** 水平線のかすみ・用語のうしろの光。 */
  readonly glow: string;
  /** 用語の文字色。背景の上でいちばん強いコントラストにする。 */
  readonly ink: string;
  /** 用語の縁取り（明るい背景で文字を浮かせる）。 */
  readonly inkEdge: string;
  /** その世界の発光色。用語のうしろの光・出現の輪・撃破の粒に使う（旧 aura）。 */
  readonly aura: string;
  /** 遠くをかすませる色（旧 THREE.Fog の色）。 */
  readonly fog: string;
  /** 全世界に通る「データハイウェイ」の色（旧 hw）。旅がつながっている印。 */
  readonly highway: string;
  /** ただよう光の粒の色（旧 makeMotes）。 */
  readonly mote: string;
}

export const FIELDS: Record<string, FieldPreset> = {
  forest: {
    label: "もりの みち",
    kind: "forest",
    sky: ["#a8e4ff", "#eaffd6"],
    ground: ["#2f8b52", "#7fc98d"],
    grid: "#d9ffc2",
    glow: "#ffffff",
    ink: "#0f3f27",
    inkEdge: "#ffffff",
    aura: "#8de84f",
    fog: "#e9ffe4",
    highway: "#2f9e63",
    mote: "#fff2a0",
  },
  sky: {
    label: "そらの うえ",
    kind: "sky",
    sky: ["#7ec9ff", "#ffe9bd"],
    ground: ["#6fb4e6", "#bfe4ff"],
    grid: "#ffffff",
    glow: "#fff6d5",
    ink: "#0b3a5c",
    inkEdge: "#ffffff",
    aura: "#ffd166",
    fog: "#eaf6ff",
    highway: "#2f86c4",
    mote: "#ffffff",
  },
  sea: {
    label: "うみの うえ",
    kind: "sea",
    sky: ["#8fe0ff", "#d9f7ff"],
    ground: ["#1f86c4", "#79d4f2"],
    grid: "#ccf6ff",
    glow: "#ffffff",
    ink: "#04395c",
    inkEdge: "#ffffff",
    aura: "#35d6ff",
    fog: "#daf6ff",
    highway: "#0f6fa8",
    mote: "#d6f8ff",
  },
  // ラベルは「ゆうやけの そら」なので、立てる物は旧アプリの sky（夕焼け）を使う。
  space: {
    label: "ゆうやけの そら",
    kind: "sunset",
    sky: ["#8f7fe0", "#ffc3a0"],
    ground: ["#6b5bb5", "#c9a3e8"],
    grid: "#ffe2c9",
    glow: "#fff0d8",
    ink: "#2b1a52",
    inkEdge: "#ffffff",
    aura: "#ffa25c",
    fog: "#ffe0cc",
    highway: "#c96f9e",
    mote: "#ffe9c9",
  },
  future: {
    label: "みらいの まち",
    kind: "future",
    sky: ["#9fd8ff", "#e6f6ff"],
    ground: ["#4f7bd6", "#a9c9f5"],
    grid: "#e8fbff",
    glow: "#ffffff",
    ink: "#102f66",
    inkEdge: "#ffffff",
    aura: "#37c8ff",
    fog: "#e9f6ff",
    highway: "#2f6fd0",
    mote: "#cfefff",
  },
  dungeon: {
    label: "いしの みち",
    kind: "dungeon",
    sky: ["#ffd9a3", "#fff0d0"],
    ground: ["#a9713f", "#d9a76d"],
    grid: "#ffe9c6",
    glow: "#fff6e2",
    ink: "#4a2a0d",
    inkEdge: "#ffffff",
    aura: "#ff9d4d",
    fog: "#ffeccf",
    highway: "#8a5427",
    mote: "#ffd08a",
  },
  castle: {
    label: "しろの にわ",
    kind: "castle",
    sky: ["#b9a6f0", "#ffe0ef"],
    ground: ["#7a68c4", "#c3b2f0"],
    grid: "#ffeaf5",
    glow: "#fff2c9",
    ink: "#2e1f63",
    inkEdge: "#ffffff",
    aura: "#ffcf3d",
    fog: "#f3e6ff",
    highway: "#6a54ad",
    mote: "#ffe9a8",
  },
  cyber: {
    label: "でんのう くうかん",
    kind: "cyber",
    sky: ["#8ef0d0", "#e8fffa"],
    ground: ["#1f9c78", "#84e3c6"],
    grid: "#d8fff2",
    glow: "#ffffff",
    ink: "#06412f",
    inkEdge: "#ffffff",
    aura: "#10d894",
    fog: "#e2fff5",
    highway: "#0f8f6e",
    mote: "#b6ffe4",
  },
};

export function fieldPreset(id: string): FieldPreset {
  return FIELDS[id] ?? FIELDS.forest!;
}
