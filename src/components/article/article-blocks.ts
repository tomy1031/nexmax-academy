/**
 * 説明ページ（article）の描画に使う純粋ヘルパ（設計07 §5）
 *
 * JSX を持たないのは、目次の組み立て・次の教材へのリンク先といった
 * 「まちがえると読者が迷子になる」判断をテストできる形に切り出すため。
 */

import type { ArticleBlock, ContentRefType } from "@/content/schema";

/** コンテンツ種別 → ルート。ステージ内のどの教材にも同じ規則でつなぐ。 */
const HREF_BY_TYPE: Record<ContentRefType, (ref: string) => string> = {
  manga: (ref) => `/manga/${ref}`,
  article: (ref) => `/article/${ref}`,
  meeting: (ref) => `/meeting/${ref}`,
  quizset: (ref) => `/quiz/${ref}`,
  scenario: (ref) => `/meeting/live/${ref}`,
  wordstage: (ref) => `/arcade/${ref}`,
};

/** link ブロックの飛び先を作る。 */
export function contentHref(type: ContentRefType, ref: string): string {
  return HREF_BY_TYPE[type](ref);
}

/** カードに出す種別の見た目（学習者向けの呼び名は分かち書き・N4語彙）。 */
export interface ContentKindLabel {
  readonly emoji: string;
  readonly name: string;
}

const LABEL_BY_TYPE: Record<ContentRefType, ContentKindLabel> = {
  manga: { emoji: "📖", name: "まんが" },
  article: { emoji: "📄", name: "よみもの" },
  meeting: { emoji: "🎧", name: "ミーティング" },
  quizset: { emoji: "✏️", name: "もんだい" },
  scenario: { emoji: "🎤", name: "おきゃくさまと はなす" },
  wordstage: { emoji: "🎮", name: "ことばの ゲーム" },
};

export function contentKindLabel(type: ContentRefType): ContentKindLabel {
  return LABEL_BY_TYPE[type];
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
