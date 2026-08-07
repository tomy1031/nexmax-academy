/**
 * 景色（フィールド）の見た目。
 *
 * 旧アプリは Three.js で世界を組んでいたが、WebGL 必須で低スペック端末に重い。
 * ここは CSS のグラデーションと遠近法だけで組む。
 * 中心体験「用語が奥から迫ってくる」と、数問ごとに景色が変わる進み具合の実感は変えない。
 *
 * 配色は島マップ（/map）と地続きの明るいトロピカルに寄せる。
 * 旧アプリの暗いサイバー調には戻さない。緊張感は暗さではなく距離と速度で出す。
 *
 * 名前はやさしい日本語。ビジュアルテーマ04 §1 の規律により
 * 「冒険・探検・クエスト」系の比喩は使わない。
 */

export interface FieldPreset {
  readonly label: string;
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
}

export const FIELDS: Record<string, FieldPreset> = {
  forest: {
    label: "もりの みち",
    sky: ["#a8e4ff", "#eaffd6"],
    ground: ["#2f8b52", "#7fc98d"],
    grid: "#d9ffc2",
    glow: "#ffffff",
    ink: "#0f3f27",
    inkEdge: "#ffffff",
  },
  sky: {
    label: "そらの うえ",
    sky: ["#7ec9ff", "#ffe9bd"],
    ground: ["#6fb4e6", "#bfe4ff"],
    grid: "#ffffff",
    glow: "#fff6d5",
    ink: "#0b3a5c",
    inkEdge: "#ffffff",
  },
  sea: {
    label: "うみの うえ",
    sky: ["#8fe0ff", "#d9f7ff"],
    ground: ["#1f86c4", "#79d4f2"],
    grid: "#ccf6ff",
    glow: "#ffffff",
    ink: "#04395c",
    inkEdge: "#ffffff",
  },
  space: {
    label: "ゆうやけの そら",
    sky: ["#8f7fe0", "#ffc3a0"],
    ground: ["#6b5bb5", "#c9a3e8"],
    grid: "#ffe2c9",
    glow: "#fff0d8",
    ink: "#2b1a52",
    inkEdge: "#ffffff",
  },
  future: {
    label: "みらいの まち",
    sky: ["#9fd8ff", "#e6f6ff"],
    ground: ["#4f7bd6", "#a9c9f5"],
    grid: "#e8fbff",
    glow: "#ffffff",
    ink: "#102f66",
    inkEdge: "#ffffff",
  },
  dungeon: {
    label: "いしの みち",
    sky: ["#ffd9a3", "#fff0d0"],
    ground: ["#a9713f", "#d9a76d"],
    grid: "#ffe9c6",
    glow: "#fff6e2",
    ink: "#4a2a0d",
    inkEdge: "#ffffff",
  },
  castle: {
    label: "しろの にわ",
    sky: ["#b9a6f0", "#ffe0ef"],
    ground: ["#7a68c4", "#c3b2f0"],
    grid: "#ffeaf5",
    glow: "#fff2c9",
    ink: "#2e1f63",
    inkEdge: "#ffffff",
  },
  cyber: {
    label: "でんのう くうかん",
    sky: ["#8ef0d0", "#e8fffa"],
    ground: ["#1f9c78", "#84e3c6"],
    grid: "#d8fff2",
    glow: "#ffffff",
    ink: "#06412f",
    inkEdge: "#ffffff",
  },
};

export function fieldPreset(id: string): FieldPreset {
  return FIELDS[id] ?? FIELDS.forest!;
}
