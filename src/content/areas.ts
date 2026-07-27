/**
 * まなびマップの「エリア」— カンボジアから日本までの道のりを地域ごとに区切ったもの。
 *
 * 背景画像1枚＝1エリア。エリアは上から順に縦に積まれ、各画像の上下10%は同じ海色
 * （#2E9FD6）なので継ぎ目が見えない（画像生成の契約: docs/skills/codex_image_generation.md）。
 *
 * ステージ（STAGES）はエリアの上に置く。`stageId` を持つエリアにだけステージが立ち、
 * `stageId: null` のエリアは「渡るだけ」の道中（外洋など）になる。
 */
export interface MapArea {
  id: string;
  /** 画面に出す地域名 */
  name: string;
  /** 地域名のよみ（ルビに使う） */
  reading: string;
  /** 背景画像。`public/` からのパス */
  image: string;
  /** このエリアに立つステージ。道中のみのエリアは null */
  stageId: string | null;
  /** 地図の傍らに小さく添える一言。ステージのないエリアの間つなぎにもなる */
  note: string;
}

/** 継ぎ目の海色。背景画像の上下10%と、画像が読めなかったときの下地に使う */
export const SEAM_OCEAN = "#2e9fd6";

export const MAP_AREAS: readonly MapArea[] = [
  {
    id: "cambodia",
    name: "カンボジア",
    reading: "かんぼじあ",
    image: "/img/scenes/area1_cambodia.webp",
    stageId: "it-words",
    note: "ここから はじまります。",
  },
  {
    id: "thailand",
    name: "タイ",
    reading: "たい",
    image: "/img/scenes/area2_thailand.webp",
    stageId: "company-structure",
    note: "きんいろの おてらの くに。",
  },
  {
    id: "vietnam",
    name: "ベトナム",
    reading: "べとなむ",
    image: "/img/scenes/area3_vietnam.webp",
    stageId: "report",
    note: "うみに ならぶ みどりの いわやま。",
  },
  {
    id: "south-china-sea",
    name: "南シナ海",
    reading: "みなみしなかい",
    image: "/img/scenes/area4_sea.webp",
    stageId: null,
    note: "ふねで わたります。",
  },
  {
    id: "taiwan",
    name: "台湾",
    reading: "たいわん",
    image: "/img/scenes/area5_taiwan.webp",
    stageId: "contact",
    note: "やまの うえの かいだんの まち。",
  },
  {
    id: "okinawa",
    name: "沖縄",
    reading: "おきなわ",
    image: "/img/scenes/area6_okinawa.webp",
    stageId: "consult",
    note: "にほんの みなみの しま。",
  },
  {
    id: "japan",
    name: "日本",
    reading: "にほん",
    image: "/img/scenes/japan_goal.webp",
    stageId: null,
    note: "ゴール。ここで はたらきます。",
  },
] as const;

/** 最後のエリア（日本）。ゴール帯として他のエリアと違う描き方をする */
export const GOAL_AREA = MAP_AREAS[MAP_AREAS.length - 1]!;

/** 日本を除いた、道のりのエリア */
export const ROUTE_AREAS = MAP_AREAS.slice(0, -1);
