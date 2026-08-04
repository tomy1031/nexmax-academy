/**
 * マップの背景セグメントの走査（サーバ専用）
 *
 * public/img/scenes/ に並んだ背景画像の枚数が、そのままマップの長さになる。
 * 先生がコードを触らずに画像を1枚置くだけでマップが伸び、停留所がふえる
 * ようにするための入口がここである（枚数→停留所の数の換算は map-layout.ts）。
 *
 * node:fs を使うのは listMapSegments だけ。クライアントコンポーネントから
 * import しないこと（ページが読み、props でマップに渡す — 設計07 §11.1）。
 * parseMapSegments は純関数なので、テストからも scripts からも安全に呼べる。
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * 背景に使うファイル名の形。
 * ここをゆるめて map_cambodia.webp や title_keyart.webp まで拾うと、地図でない絵が
 * 途中の段に挟まり、道が海や町を横切って学習者の進む向きが分からなくなる。
 */
const SEGMENT_FILE = /^map_seg(\d+)_([a-z0-9-]+)\.(webp|png|jpg|jpeg|avif)$/i;

/** 画像の置き場所。公開パス（/img/scenes/…）と対になっている。 */
const SCENES_DIR = join(process.cwd(), "public", "img", "scenes");

export interface MapSegment {
  /** ファイル名の連番。map_seg3_coast.webp なら 3。並び順を決める。 */
  readonly order: number;
  /** 連番のあとの名前。coast など。 */
  readonly slug: string;
  /** <img src> にそのまま入れる公開パス。/img/scenes/map_seg3_coast.webp */
  readonly src: string;
}

/**
 * ファイル名の一覧から順番のそろったセグメントを組み立てる。
 *
 * 並びは連番の昇順。文字列順に頼ると seg10 が seg2 より前に来て、10枚を超えた
 * とたんにマップの地形が入れ替わるため、数値として比べる。
 * 同じ連番が2枚あってもファイル名順で決着させ、環境ごとに段の並びが変わらない
 * ようにする（readdir の返す順はOS任せである）。
 */
export function parseMapSegments(fileNames: readonly string[]): MapSegment[] {
  const segments: { readonly name: string; readonly segment: MapSegment }[] = [];
  for (const name of fileNames) {
    const matched = SEGMENT_FILE.exec(name);
    const order = matched?.[1];
    const slug = matched?.[2];
    if (order === undefined || slug === undefined) continue;
    segments.push({
      name,
      segment: { order: Number(order), slug, src: `/img/scenes/${name}` },
    });
  }
  return segments
    .sort((a, b) => a.segment.order - b.segment.order || a.name.localeCompare(b.name))
    .map((item) => item.segment);
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
