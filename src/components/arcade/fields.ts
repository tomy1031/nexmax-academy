/**
 * 景色（フィールド）の設定。
 *
 * 旧 wordtest（nextmake_onboarding_training/wordtest/src/main.js）の `FIELD_CONFIG` を
 * そのまま移した。色・霧の距離・世界の種類は原典の数値のまま変えていない。
 * 世界の見た目は three.js が組む（arcade-three.ts）。
 *
 * 足したのは `label` だけ。旧アプリは世界の名前を画面に出さなかったが、
 * 現行はステージ上部に景色の名前を出しているので、その表示用にやさしい日本語で持つ。
 *
 * ビジュアルテーマ04 §1 の規律により「冒険・探検・クエスト」系の比喩は使わない。
 */

/** 旧 FIELD_CONFIG の `kind`。どの物を並べるかを決める。 */
export type FieldKind =
  "forest" | "sky" | "sea" | "space" | "future" | "dungeon" | "castle" | "cyber";

export interface FieldPreset {
  /** 画面に出す景色の名前。旧 `jp` をやさしい日本語にしたもの。 */
  readonly label: string;
  /** スカイドームのグラデーション [上, 下]。 */
  readonly sky: readonly [number, number];
  readonly fog: number;
  readonly fogFar: number;
  /** 地面がある世界だけ持つ。空・宇宙には地面がない。 */
  readonly ground?: number;
  readonly grid?: number;
  /** その世界の発光色。迫る用語のネオン縁と出現の輪に使う。 */
  readonly aura: string;
  /** データハイウェイ（全世界に通る一本道）の色。 */
  readonly hw: number;
  readonly kind: FieldKind;
}

export const FIELDS: Record<string, FieldPreset> = {
  forest: {
    label: "データの もり",
    sky: [0x53b7f0, 0xd8f7e2],
    fog: 0xbfe4d4,
    fogFar: 1500,
    ground: 0x2e7d4f,
    grid: 0x7dffb0,
    aura: "#c8ff5e",
    hw: 0x7dffb0,
    kind: "forest",
  },
  sky: {
    label: "ゆうやけの そら",
    sky: [0x5b3fa0, 0xff9a5c],
    fog: 0xd88a70,
    fogFar: 1600,
    aura: "#ffd27d",
    hw: 0xffb37e,
    kind: "sky",
  },
  sea: {
    label: "ふかい うみ",
    sky: [0x021c38, 0x0a7fae],
    fog: 0x06507a,
    fogFar: 1300,
    ground: 0x032c4a,
    grid: 0x2fd6ff,
    aura: "#7df9ff",
    hw: 0x2fd6ff,
    kind: "sea",
  },
  space: {
    label: "うちゅう",
    sky: [0x000005, 0x241454],
    fog: 0x0a0618,
    fogFar: 2600,
    aura: "#c58cff",
    hw: 0x8c5cff,
    kind: "space",
  },
  future: {
    label: "みらいの まち",
    sky: [0x040b2a, 0x2a3f8f],
    fog: 0x101d4a,
    fogFar: 1500,
    ground: 0x0a1030,
    grid: 0x00ffe0,
    aura: "#00ffe0",
    hw: 0x00ffe0,
    kind: "future",
  },
  dungeon: {
    label: "いしの みち",
    sky: [0x0a0604, 0x2e1a0c],
    fog: 0x1c110a,
    fogFar: 1100,
    ground: 0x241407,
    grid: 0xff9d4d,
    aura: "#ffb057",
    hw: 0xff9d4d,
    kind: "dungeon",
  },
  castle: {
    label: "よるの しろ",
    sky: [0x150d33, 0x5b3f8f],
    fog: 0x2c2050,
    fogFar: 1400,
    ground: 0x3a3352,
    grid: 0xd9b8ff,
    aura: "#ffd700",
    hw: 0xc9a5ff,
    kind: "castle",
  },
  cyber: {
    label: "でんのう くうかん",
    sky: [0x000803, 0x03301a],
    fog: 0x021409,
    fogFar: 1500,
    ground: 0x01140a,
    grid: 0x00ff88,
    aura: "#00ff88",
    hw: 0xff2fd6,
    kind: "cyber",
  },
};

/** 旧 fieldConf()。知らない名前が来たら森にする。 */
export function fieldPreset(id: string): FieldPreset {
  return FIELDS[id] ?? FIELDS.forest!;
}

/** 舞台の下地。3Dが出るまでの一瞬と、WebGLが使えない端末で見える色（旧 --ink）。 */
export const ARCADE_INK = "#070b18";
