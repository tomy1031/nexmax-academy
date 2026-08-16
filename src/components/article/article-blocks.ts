/**
 * 説明ページ（article）の描画に使う純粋ヘルパ（設計07 §5）
 *
 * JSX を持たないのは、目次の組み立て・次の教材へのリンク先といった
 * 「まちがえると読者が迷子になる」判断をテストできる形に切り出すため。
 */

import type { ArticleBlock, ContentRefType } from "@/content/schema";
import { contentKindMeta } from "@/lib/content-kinds";

/**
 * 種別 → 行き先・呼び名は src/lib/content-kinds.ts が唯一の出どころ。
 * ここに別表を持つと「たいわ」と「おきゃくさまと はなす」のように呼び名がずれる。
 */
export { contentHref } from "@/lib/content-kinds";

export interface ContentKindLabel {
  readonly emoji: string;
  readonly name: string;
}

export function contentKindLabel(type: ContentRefType): ContentKindLabel {
  const meta = contentKindMeta(type);
  return { emoji: meta.icon, name: meta.label };
}

/** 見出しの id。記事IDを前に付けて、1画面に2記事（スタジオのプレビュー）でも衝突させない。 */
export function headingId(articleId: string, blockIndex: number): string {
  return `${articleId}-h${blockIndex}`;
}

/** 目次の1項目。 */
export interface HeadingEntry {
  /** blocks 内の位置（id の生成に使う）。 */
  readonly index: number;
  readonly level: 2 | 3;
  readonly text: string;
}

/** 目次のもと。heading ブロックだけを順番どおりに拾う。 */
export function collectHeadings(blocks: readonly ArticleBlock[]): HeadingEntry[] {
  return blocks.flatMap((block, index) =>
    block.kind === "heading" ? [{ index, level: block.level, text: block.text }] : [],
  );
}

/**
 * 目次を出すか。見出しが3つ以上あるときだけ（1〜2個なら目次の方が読むのを邪魔する）。
 */
export function shouldShowToc(headings: readonly HeadingEntry[]): boolean {
  return headings.length >= 3;
}

/**
 * かじょうがき・てじゅんを **1回で読み上げる**ための1本の文にする。
 *
 * 項目ごとにボタンを置かないのは、5項目なら 🔊 が5個並び、どれを押すのか
 * 選ぶ手間が「音に逃げる」という助けを打ち消すため。まとまりで読ませる。
 *
 * 句点は足しなおす。項目は「〜します。」で終わるものと終わらないものが混ざるので、
 * そのまま つなぐと 文の切れ目が音にならず、5つの項目が一息で流れてしまう。
 */
/**
 * しょうかいカードに出す 登場人物1人ぶん。
 *
 * `content/characters/*.json` から **絵と名前だけ**を持ってくる。立場と ひとことは
 * 記事側（`characters` ブロック）にある——人物カードの `role` / `personality` は
 * 先生向けの覚書で、学習者に読ませる言葉ではない（schema.ts のコメント）。
 */
export interface ArticleCharacter {
  readonly id: string;
  readonly name: string;
  readonly reading: string;
  /** 顔の絵。無ければ カードは 名前だけになる。 */
  readonly portrait?: string;
}

export function joinItemsForSpeech(items: readonly string[]): string {
  return items
    .map((item) => item.trim().replace(/[。．]+$/u, ""))
    .filter((item) => item.length > 0)
    .map((item) => `${item}。`)
    .join("");
}
