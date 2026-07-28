/**
 * 景色（フィールド）の見た目。
 *
 * 旧アプリは Three.js で 3D の世界を組んでいたが、WebGL 必須で低スペック端末に重く、
 * 見た目の検証もできなかった。ここは CSS のグラデーションと遠近法だけで組む
 *（中心体験「用語が奥から迫ってくる」は変えない）。
 *
 * 名前はやさしい日本語にする。ビジュアルテーマ04 §1 の規律により
 * 「冒険・探検・クエスト」系の比喩は使わない。
 */

export interface FieldPreset {
  readonly label: string;
  /** 空のグラデーション [上, 下]。 */
  readonly sky: readonly [string, string];
  /** 地面の色。 */
  readonly ground: string;
  /** 遠近グリッドの線の色。 */
  readonly grid: string;
  /** 用語のまわりの光。 */
  readonly glow: string;
  /** 用語の文字色。 */
  readonly ink: string;
}

export const FIELDS: Record<string, FieldPreset> = {
  forest: {
    label: "もりの みち",
    sky: ["#bfe9ff", "#e9f9df"],
    ground: "#3f9d63",
    grid: "#d6ffb0",
    glow: "#ffffff",
    ink: "#12472c",
  },
  sky: {
    label: "そらの うえ",
    sky: ["#8fd2ff", "#ffe7bd"],
    ground: "#7cb8e6",
    grid: "#ffffff",
    glow: "#fff3c4",
    ink: "#0d3f63",
  },
  sea: {
    label: "うみの なか",
    sky: ["#8ae4ff", "#0a5f96"],
    ground: "#084a75",
    grid: "#9ff2ff",
    glow: "#c8fbff",
    ink: "#032f4c",
  },
  space: {
    label: "うちゅう",
    sky: ["#1b1150", "#5a3fa8"],
    ground: "#160f3a",
    grid: "#b79bff",
    glow: "#e6d8ff",
    ink: "#f4efff",
  },
  future: {
    label: "みらいの まち",
    sky: ["#9fd8ff", "#3d5bb8"],
    ground: "#26356e",
    grid: "#8ffff0",
    glow: "#d9fffa",
    ink: "#0b2350",
  },
  dungeon: {
    label: "ちかの みち",
    sky: ["#f0d5ac", "#8a5a30"],
    ground: "#5d3a1c",
    grid: "#ffd39a",
    glow: "#ffe9c6",
    ink: "#3a2209",
  },
  castle: {
    label: "よるの しろ",
    sky: ["#4a3c86", "#a98ee0"],
    ground: "#3a3160",
    grid: "#e8d7ff",
    glow: "#fff0b8",
    ink: "#f6f1ff",
  },
  cyber: {
    label: "でんのう くうかん",
    sky: ["#0a2a1c", "#0f6b45"],
    ground: "#08241a",
    grid: "#7bffc2",
    glow: "#d0ffe8",
    ink: "#eafff5",
  },
};

export function fieldPreset(id: string): FieldPreset {
  return FIELDS[id] ?? FIELDS.forest!;
}
