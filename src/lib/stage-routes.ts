/**
 * ステージの中の教材のURL — `/asakai/listening` の組み立てと読み取り
 *
 * URLは学習者が見る言葉でできているほうがいい。`/stage/m2-asakai` は
 * 「どのステージの何なのか」がどこにも書いていない。`/asakai/listening` なら、
 * URLを見ただけで「朝会のステージのリスニング」と分かる。
 *
 * 規則は2つだけ:
 *  - そのステージに その種別が1つしか無ければ `/<ステージ>/<種別>`
 *  - 2つ以上あるときだけ `-ID` を足す（`/asakai/listening-sample_asakai`）
 *
 * 1つのときに ID を付けないのは、URLを短く読みやすく保つため。2つ目を足した
 * 時点で1つ目のURLも変わるが、リンクはすべてこの関数が組み立てるので画面は追従する。
 *
 * 純関数だけ。node:fs も React も持たない。
 */

import type { ContentRefType, StageContentRef } from "@/content/schema";

/**
 * 種別 → URLの2段目。学習者に見える呼び名に寄せる
 *（`quizset` は「もんだい」なので `quiz`、`scenario` は「たいわ」なので `talk`）。
 *
 * どれも他の接頭辞になっていない。`resolveStageContent` が
 * 「`<種別>-` で始まるか」で切り分けるので、片方が片方の頭になると読み取りが壊れる。
 */
export const CONTENT_SEGMENTS = {
  manga: "manga",
  article: "article",
  slides: "slides",
  listening: "listening",
  quizset: "quiz",
  scenario: "talk",
  meeting: "meeting",
  /** 単語ステージは contents[] ではなく wordStageIds に入る（行き先は /arcade）。 */
  wordstage: "words",
} as const satisfies Record<ContentRefType, string>;

/**
 * 案内ステージ「はじめに」のID。タイトル画面の「はじめに を よむ」の行き先。
 *
 * ここに書いた名前で `/intro` へ行く。**タイトル画面は全員が必ず通る画面**なので、
 * 行き先を出すためにデータを引きに行かない（引くと DB への往復が1つ増える —
 * src/app/page.tsx の方針）。代わりに、この名前のステージが本当にあるかは
 * `lint:content` が検査する（消すと機械が止める）。
 */
export const INTRO_STAGE_ID = "intro";

/** contents[] に入りうる種別だけ（単語ステージは別扱い）。 */
const IN_STAGE_TYPES = (Object.keys(CONTENT_SEGMENTS) as ContentRefType[]).filter(
  (type) => type !== "wordstage",
);

/** ステージの中の index 番目の教材のURL。 */
export function stageContentPath(
  stageId: string,
  contents: readonly StageContentRef[],
  index: number,
): string | null {
  const item = contents[index];
  if (!item) return null;
  const segment = CONTENT_SEGMENTS[item.type];
  const sameType = contents.filter((content) => content.type === item.type);
  return sameType.length === 1 ? `/${stageId}/${segment}` : `/${stageId}/${segment}-${item.ref}`;
}

/**
 * 参照から直接URLを組む（index が手元に無い呼び出し用）。
 * 同じ ref が2回入っている壊れたステージでは最初の1つを指す。
 */
export function stageRefPath(
  stageId: string,
  contents: readonly StageContentRef[],
  ref: string,
): string | null {
  const index = contents.findIndex((content) => content.ref === ref);
  return index < 0 ? null : stageContentPath(stageId, contents, index);
}

/**
 * URLの2段目 → そのステージの中の教材。無ければ null（呼ぶ側が 404 にする）。
 *
 * `/asakai/listening` は「そのステージの最初のリスニング」を指す。
 * 2本目を足した瞬間に この短いURLは1本目を指したままになる——消えるより良い。
 */
export function resolveStageContent(
  contents: readonly StageContentRef[],
  segment: string,
): StageContentRef | null {
  for (const type of IN_STAGE_TYPES) {
    const seg = CONTENT_SEGMENTS[type];
    if (segment === seg) {
      return contents.find((content) => content.type === type) ?? null;
    }
    if (segment.startsWith(`${seg}-`)) {
      const ref = segment.slice(seg.length + 1);
      return contents.find((content) => content.type === type && content.ref === ref) ?? null;
    }
  }
  return null;
}

/** そのステージが持つ 全教材ぶんの2段目（generateStaticParams 用）。 */
export function stageContentSegments(contents: readonly StageContentRef[]): string[] {
  return contents
    .map((_, index) => stageContentPath("x", contents, index))
    .flatMap((path) => (path ? [path.slice("/x/".length)] : []));
}
