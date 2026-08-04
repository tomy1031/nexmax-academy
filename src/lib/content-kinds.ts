/**
 * コンテンツ種別の呼び名と行き先 — アプリ内で唯一の対応表
 *
 * 同じ教材が画面ごとに違う名前で呼ばれると（ステージ一覧では「たいわ」、記事の
 * 次の教材カードでは「おきゃくさまと はなす」）、学習者は別のものだと思う。
 * 名前と行き先はここだけに置き、画面はここを読む。
 *
 * 呼び名は学習者向け（N4語彙・分かち書き）。
 */

import type { ContentRefType } from "@/content/schema";

export interface ContentKindMeta {
  /** 一覧やカードの先頭に置く絵文字。 */
  readonly icon: string;
  /** 学習者に見せる呼び名。 */
  readonly label: string;
  /** その種別のページへの行き先を作る。 */
  readonly href: (id: string) => string;
}

const META: Record<ContentRefType, ContentKindMeta> = {
  manga: { icon: "📖", label: "まんが", href: (id) => `/manga/${id}` },
  article: { icon: "📄", label: "よみもの", href: (id) => `/article/${id}` },
  meeting: { icon: "🎧", label: "ミーティング", href: (id) => `/meeting/${id}` },
  quizset: { icon: "✏️", label: "もんだい", href: (id) => `/quiz/${id}` },
  scenario: { icon: "🎙️", label: "たいわ", href: (id) => `/meeting/live/${id}` },
  wordstage: { icon: "🕹️", label: "ことば", href: (id) => `/arcade/${id}` },
};

export function contentKindMeta(type: ContentRefType): ContentKindMeta {
  return META[type];
}

/** 種別 → その教材のページ。 */
export function contentHref(type: ContentRefType, id: string): string {
  return META[type].href(id);
}
