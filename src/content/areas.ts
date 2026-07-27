/**
 * まなびマップの「エリア」— 出発地から日本までの空路を、土地ごとに区切ったもの。
 *
 * 背景画像1枚＝1エリア。エリアは上から順に縦に積まれ、あいだは雲海の帯（`CloudBand`）で
 * 仕切る。学習者は空路で雲を越えて次の土地へ進む。
 *
 * ## 表示名に国名を出さない（重要）
 * `name` に**国名を入れない**。国は今後の情勢で柔軟に差し替える前提なので、表示文言が国に
 * 依存していると差し替えのたびに UI を直すことになる。国は画像の主題（`imageSubject`）と
 * `id` にだけ残す。※ ゴールの日本だけは学習の目的地そのものなので例外的に国名を出す。
 *
 * 都市名・遺跡名（アンコールワット、プノンペンなど）は国名ではないので出してよい。
 * 学習者の出発地であるこの2つは、親しみのために実名で呼ぶ。それ以外の土地は景色の名前にする。
 *
 * ## ルート方針
 * 出発地から北上して日本へ向かう「北回り」。南国 → 霧の山 → 温帯の都市 と気候が段階的に
 * 変わるので、絵が単調にならず「日本に近づいている」ことが絵だけで伝わる。
 * エリアを増やすときは、この並びの途中に中継点を挿し込む（末尾に足さない）。
 *
 * ステージ（STAGES）はエリアの上に置く。`stageId` を持つエリアにだけステージが立ち、
 * `stageId: null` のエリアは通過するだけの土地になる（コンテンツが増えるまでの受け皿）。
 */
export interface MapArea {
  id: string;
  /** 画面に出す景色の名前。**国名を入れない** */
  name: string;
  /** 表示名のよみ（ルビに使う） */
  reading: string;
  /** 背景画像。`public/` からのパス */
  image: string;
  /** 画像が何をモチーフにしているか。開発者向けの覚書で、画面には出さない */
  imageSubject: string;
  /** このエリアに立つステージ。通過するだけのエリアは null */
  stageId: string | null;
  /** 地図に小さく添える一言 */
  note: string;
}

/** 雲海の色。エリア画像の端をここへ溶かして継ぎ目を隠す */
export const CLOUD_WHITE = "#f4fbff";

/** 雲のすきまから見える空・海の色。画像が読めなかったときの下地にもなる */
export const SKY_BLUE = "#2e9fd6";

export const MAP_AREAS: readonly MapArea[] = [
  {
    id: "angkor",
    name: "アンコールワット",
    reading: "あんこーるわっと",
    image: "/img/scenes/area1_cambodia.webp",
    imageSubject: "アンコールワット風の石造寺院と熱帯雨林",
    stageId: "it-words",
    note: "ここから はじまります。",
  },
  {
    id: "phnom-penh",
    name: "プノンペン",
    reading: "ぷのんぺん",
    image: "/img/scenes/area_riverside_capital.webp",
    imageSubject: "王宮・高層ビル・リバーサイドの首都",
    stageId: "company-structure",
    note: "かわぞいの おおきな まち。",
  },
  {
    id: "vietnam",
    name: "うみの いわやま",
    reading: "うみの いわやま",
    image: "/img/scenes/area3_vietnam.webp",
    imageSubject: "ハロン湾風の石灰岩の岩山と棚田、提灯の村",
    stageId: "report",
    note: "いわやまの あいだを とびます。",
  },
  {
    id: "taiwan",
    name: "かいだんの まち",
    reading: "かいだんの まち",
    image: "/img/scenes/area5_taiwan.webp",
    imageSubject: "九份風の階段街と赤提灯、茶畑",
    stageId: null,
    note: "やまの しゃめんに ならぶ まち。",
  },
  {
    id: "misty-peaks",
    name: "きりの やまなみ",
    reading: "きりの やまなみ",
    image: "/img/scenes/area_misty_peaks.webp",
    imageSubject: "水墨画風の霧の岩峰と古い城下町、茶畑",
    stageId: "contact",
    note: "きりの なかを ぬけて いきます。",
  },
  {
    id: "palace-town",
    name: "みやこの まち",
    reading: "みやこの まち",
    image: "/img/scenes/area_palace_town.webp",
    imageSubject: "宮殿と瓦屋根の旧市街、奥に現代のビル群",
    stageId: "consult",
    note: "ふるい まちと あたらしい まち。",
  },
  {
    id: "japan",
    // ゴールだけは学習の目的地そのものなので国名を出す
    name: "日本",
    reading: "にほん",
    image: "/img/scenes/japan_goal.webp",
    imageSubject: "富士山・桜・東京のスカイライン・鳥居",
    stageId: null,
    note: "ゴール。ここで はたらきます。",
  },
] as const;

/** 最後のエリア（日本）。ゴール帯として他のエリアと違う描き方をする */
export const GOAL_AREA = MAP_AREAS[MAP_AREAS.length - 1]!;

/** 日本を除いた、道のりのエリア */
export const ROUTE_AREAS = MAP_AREAS.slice(0, -1);
