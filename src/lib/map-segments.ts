/**
 * マップの背景の走査と帯の合成（走査だけサーバ専用）
 *
 * 背景は2種類ある:
 *  - 元の絵 map_seg1〜3: 1つづきの道として描かれた3枚組。STEP 1〜5 を受け持つ。
 *  - ステップの絵 map_step6_*.webp など: STEP 6 以降の「1ステージ = 1枚」。
 *    この絵を置くだけで、そのステップの帯がマップに足され、ピンが絵の上に立つ。
 *
 * node:fs を使うのは listMapSegments だけ。クライアントコンポーネントから
 * import しないこと（ページが読み、props でマップに渡す — 設計07 §11.1）。
 * parseMapSegments / composeMapBands は純関数なので、テストからも scripts からも
 * 安全に呼べる。
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { BASE_STOP_COUNT } from "./map-layout";

/**
 * 背景に使うファイル名の形。
 * ここをゆるめて map_cambodia.webp や title_keyart.webp まで拾うと、地図でない絵が
 * 途中の段に挟まり、道が海や町を横切って学習者の進む向きが分からなくなる。
 */
const BASE_FILE = /^map_seg(\d+)_([a-z0-9-]+)\.(webp|png|jpg|jpeg|avif)$/i;
const STEP_FILE = /^map_step(\d+)_([a-z0-9-]+)\.(webp|png|jpg|jpeg|avif)$/i;

/** 画像の置き場所。公開パス（/img/scenes/…）と対になっている。 */
const SCENES_DIR = join(process.cwd(), "public", "img", "scenes");

export interface MapSegment {
  /** base = 元の3枚組（STEP 1〜5）。step = 1ステージ1枚の絵（STEP 6〜）。 */
  readonly kind: "base" | "step";
  /** base はファイル名の連番、step は受け持つ STEP の番号。並び順を決める。 */
  readonly order: number;
  /** 連番のあとの名前。coast など。 */
  readonly slug: string;
  /** <img src> にそのまま入れる公開パス。/img/scenes/map_seg3_coast.webp */
  readonly src: string;
}

/** マップの縦の帯1つ。src が null の帯は絵がまだ無く、グラデーションで表示される。 */
export interface MapBand {
  /** React の key に使う。絵が無い帯でも安定した値を持つ。 */
  readonly id: string;
  readonly src: string | null;
}

/** 帯の並びと、そのうち元の絵が何枚か（停留所の割り付けに使う）。 */
export interface MapBands {
  readonly bands: readonly MapBand[];
  readonly baseBandCount: number;
}

/**
 * ファイル名の一覧から順番のそろったセグメントを組み立てる。
 *
 * 並びは 元の絵 → ステップの絵、それぞれ番号の昇順。文字列順に頼ると seg10 が
 * seg2 より前に来て、10枚を超えたとたんにマップの地形が入れ替わるため、数値として
 * 比べる。同じ番号が2枚あってもファイル名順で決着させ、環境ごとに段の並びが
 * 変わらないようにする（readdir の返す順はOS任せである）。
 */
export function parseMapSegments(fileNames: readonly string[]): MapSegment[] {
  const segments: { readonly name: string; readonly segment: MapSegment }[] = [];
  for (const name of fileNames) {
    for (const [kind, pattern] of [
      ["base", BASE_FILE],
      ["step", STEP_FILE],
    ] as const) {
      const matched = pattern.exec(name);
      const order = matched?.[1];
      const slug = matched?.[2];
      if (order === undefined || slug === undefined) continue;
      segments.push({
        name,
        segment: { kind, order: Number(order), slug, src: `/img/scenes/${name}` },
      });
      break;
    }
  }
  const rank = (segment: MapSegment) => (segment.kind === "base" ? 0 : 1);
  return segments
    .sort(
      (a, b) =>
        rank(a.segment) - rank(b.segment) ||
        a.segment.order - b.segment.order ||
        a.name.localeCompare(b.name),
    )
    .map((item) => item.segment);
}

/**
 * 背景の帯の並びを組む。「元の絵ぜんぶ」のあとに「STEP 6 以降のステップ1つに
 * つき帯1つ」。ステップの絵がまだ無くても帯は作る（src: null）——絵の遅れで
 * ステージが消えると、学習者は昨日あった教材を探しまわることになる。
 *
 * steps は公開ステージの step の一覧（昇順）。STEP 5 までは元の絵の上に立つので
 * 帯を増やさない。map_step5 以下の絵が置かれても使わない（元の絵が優先）。
 */
export function composeMapBands(
  segments: readonly MapSegment[],
  steps: readonly number[],
): MapBands {
  const baseSegments = segments.filter((segment) => segment.kind === "base");
  const stepSrcByOrder = new Map(
    segments.filter((segment) => segment.kind === "step").map((s) => [s.order, s.src]),
  );

  // 元の絵が1枚も無い環境でもグラデーションの帯を1つ置く（map-layout と同じ規則）。
  const baseBands: MapBand[] =
    baseSegments.length > 0
      ? baseSegments.map((segment) => ({ id: segment.src, src: segment.src }))
      : [{ id: "base-fallback", src: null }];

  const stepBands: MapBand[] = steps
    .filter((step) => step > BASE_STOP_COUNT)
    .map((step) => ({ id: `step-${step}`, src: stepSrcByOrder.get(step) ?? null }));

  return { bands: [...baseBands, ...stepBands], baseBandCount: baseBands.length };
}

/**
 * public/img/scenes を読む。
 * 読めなければ空配列を返し、マップは背景なしのグラデーションに落ちる。
 * 画像が無いことでページ全体が落ちると、学習者は教材そのものに入れなくなる。
 */
export function listMapSegments(): MapSegment[] {
  try {
    return parseMapSegments(readdirSync(SCENES_DIR));
  } catch {
    return [];
  }
}
