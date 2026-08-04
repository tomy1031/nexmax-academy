/**
 * マップの座標計算 — 停留所・点線の道・ネクマックスの立ち位置
 *
 * マップは「背景画像を1枚たすと縦に1画面ぶん伸び、停留所が2個ふえる」ように作る。
 * 座標を画面側に書き並べると、画像を足すたびに人の手で打ち直すことになり、必ず
 * どこかがずれる。ずれた結果を見るのは学習者で、「点線が停留所を通っていない地図」
 * や「ステージを作ったのにピンが出ない地図」になる。だから停留所も道もキャラも、
 * すべてこのファイルの1つの式から作る。
 *
 * このモジュールはクライアントコンポーネント（マップ画面）と scripts/ の検収
 * スクリプトの両方から読まれる。どちらでも動くよう、node:fs も React も入れない
 * 純関数だけに保つ。
 */

/** 背景画像1枚が受け持つ停留所の数。画像を1枚足すとこの数だけ増える。 */
export const STOPS_PER_SEGMENT = 2;

/** 背景画像1枚ぶんの縦の高さ（vh）。3枚で従来の 260vh になる値。 */
export const SEGMENT_HEIGHT_VH = 87;

/**
 * 停留所を置く帯の上端（％）。ここより上は背景の空にあてて、
 * 1つめのピンがヘッダーに隠れないようにしている。
 */
const TOP = 12;

/** 停留所を置く帯の高さ（％）。TOP + SPAN = 88 で、下端はゴールへの余白に残す。 */
const SPAN = 76;

/** 中央からの左右のふれ幅（％）。道をつづら折りに見せて「進んでいる感」を出す。 */
const SWING = 10;

/** 道の出入り口。マップの上端・下端の中央から出入りする。 */
const ROUTE_START: MapStop = { x: 50, y: 0 };
const ROUTE_END: MapStop = { x: 50, y: 100 };

/**
 * 道のふくらみ。停留所と停留所のあいだで、行き先の外がわへどれだけ張り出すか。
 * 1区間の縦の長さに対する倍率で持つ（停留所がふえて間隔がつまっても形が崩れない）。
 *
 * 元の手描きの道から割り出した値。たとえば (58,15)→(41,31) の区間は制御点が
 * x=22〜23 まで振れていて、行き先より 18 ほど外に出ている。ここを内がわに寄せると
 * 道は直線に近づき、島から島へ渡っていく道のりの長さが伝わらなくなる。
 */
const ROUTE_OVERSHOOT_RATIO = 1.1;
const ROUTE_OVERSHOOT_MIN = 6;
const ROUTE_OVERSHOOT_MAX = 22;

/** ふくらみを効かせる縦の位置（区間の何割の地点か）。手描きの道の実測値。 */
const ROUTE_CURVE_IN = 0.33;
const ROUTE_CURVE_OUT = 0.68;

/** 制御点が画面の外へ出ると、道が端で切れて見える。 */
const ROUTE_MARGIN = 4;

/** キャラを停留所の外がわへどれだけずらすか（％）。右と左で見えかたが違うので値も違う。 */
const CHARACTER_OFFSET_RIGHT = 17;
const CHARACTER_OFFSET_LEFT = -22;

/** キャラは停留所より少し下に立たせる。真横だとピンの吹き出しと重なる。 */
const CHARACTER_OFFSET_Y = 8.5;

export interface MapStop {
  readonly x: number;
  readonly y: number;
}

/**
 * 背景画像の枚数から、置ける停留所の上限を出す。
 *
 * 画像が1枚も無くてもマップはグラデーションで表示されるので、0枚でも1枚ぶんは
 * 確保する。ここが0になると、どのステージも「マップからたどり着けない」と
 * 判定されてしまう。
 */
export function mapStopCapacity(segmentCount: number): number {
  return Math.max(segmentCount, 1) * STOPS_PER_SEGMENT;
}

/**
 * 停留所を上から下へ、左右にふりながら等間隔に置く（％座標）。
 *
 * 帯の中を count 等分し、その真ん中に置く（+0.5）。両端に寄せないことで、
 * 停留所が2個でも10個でも上下の余白が同じに見える。
 */
export function stopPositions(count: number): MapStop[] {
  if (count <= 0) return [];

  return Array.from({ length: count }, (_, index) => ({
    x: 50 + (index % 2 === 0 ? SWING : -SWING),
    y: TOP + ((index + 0.5) * SPAN) / count,
  }));
}

/**
 * 停留所をつなぐ点線の道。SVG の d 属性（0..100 の座標系）。
 *
 * 停留所と同じ座標系で描くので、停留所が何個になっても道は必ずピンの上を通る。
 *
 * 各区間は、行き先の外がわへ大きく張り出す3次ベジェにする。点をなめらかに結ぶだけ
 * （Catmull-Rom など）だと道は内がわを通ってほぼ直線になり、手描きだったころの
 * つづら折りが消える。マップは「まだこんなに道のりがある」と見せるためのものなので、
 * ふくらみは飾りではなく役目を持っている。
 *
 * 停留所が0個でも (50,0) → (50,100) の縦線になり、道が消えることはない。
 */
export function routePath(stops: readonly MapStop[]): string {
  const points: MapStop[] = [ROUTE_START, ...stops, ROUTE_END];
  const first = points[0]!;
  const parts = [`M ${fixed2(first.x)} ${fixed2(first.y)}`];

  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i]!;
    const to = points[i + 1]!;
    const dy = to.y - from.y;
    const dx = to.x - from.x;

    // 張り出す向きは「これから進む横向き」。真下へ行く区間はふくらませない。
    const direction = dx === 0 ? 0 : Math.sign(dx);
    const overshoot = clamp(
      Math.abs(dy) * ROUTE_OVERSHOOT_RATIO,
      ROUTE_OVERSHOOT_MIN,
      ROUTE_OVERSHOOT_MAX,
    );
    const controlX = clamp(to.x + direction * overshoot, ROUTE_MARGIN, 100 - ROUTE_MARGIN);

    parts.push(
      `C ${fixed2(controlX)} ${fixed2(from.y + dy * ROUTE_CURVE_IN)}` +
        ` ${fixed2(controlX)} ${fixed2(from.y + dy * ROUTE_CURVE_OUT)}` +
        ` ${fixed2(to.x)} ${fixed2(to.y)}`,
    );
  }

  return parts.join(" ");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * ネクマックスを置く場所。停留所の外がわ・すこし下。
 *
 * 最後の停留所のぶんは作らない。ゴール手前は画面の下端に近く、キャラを置くと
 * はみ出して見きれるため。
 */
export function characterSlots(stops: readonly MapStop[]): MapStop[] {
  return stops.slice(0, -1).map((stop) => ({
    x: stop.x + (stop.x > 50 ? CHARACTER_OFFSET_RIGHT : CHARACTER_OFFSET_LEFT),
    y: stop.y + CHARACTER_OFFSET_Y,
  }));
}

/** d 属性は差分でも読むので桁を2に固定する。Number を通して余分な 0 と -0 を落とす。 */
function fixed2(value: number): string {
  return String(Number(value.toFixed(2)));
}
