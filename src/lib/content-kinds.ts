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
  /**
   * 学習の**関門**になるか。
   *
   * true の教材は、おわるまで その先へ進めない（飛ばし読みを止めるため）。
   * false の教材は、見ていなくても先へ進めるし、その教材自身も いつでも開ける。
   *
   * 関門にしてよいのは「おわり」が学習者にも分かるものだけである。スライドは
   * 先生の しりょうで、授業中に必要な所だけを開くことも、あとで見直すこともある。
   * 「最後の1枚まで送ったか」を通行の条件にすると、資料1枚のせいで
   * ステージ全体が止まる（2026-08-14 ユーザー指定）。
   */
  readonly gates: boolean;
}

const META: Record<ContentRefType, ContentKindMeta> = {
  manga: { icon: "📖", label: "まんが", href: (id) => `/manga/${id}`, gates: true },
  article: { icon: "📄", label: "よみもの", href: (id) => `/article/${id}`, gates: true },
  // 先生が授業で使う資料（PDF）を そのまま全画面で見せる教材。
  // 「よみもの」と分けるのは、直せる文（article）と 直せない資料（PDF）で
  // 学習者にできることが違うため——スライドは ふりがなを 出せない。
  // 関門にしない（gates: false）。先生の しりょうなので、必要な所だけ 開くことも、
  // あとで 見直すことも ある。ここで 止めると ステージが 進まなくなる。
  slides: { icon: "🖥️", label: "スライド", href: (id) => `/slides/${id}`, gates: false },
  listening: { icon: "🎧", label: "リスニング", href: (id) => `/listening/${id}`, gates: true },
  quizset: { icon: "✏️", label: "もんだい", href: (id) => `/quiz/${id}`, gates: true },
  // たいわ（Gemini Live）はリスニングと同じ Zoom風の枠を使うが別の教材なので、
  // 行き先も /talk に分ける。同じ入口にすると、学習者は「聞くだけ」のつもりで
  // AIと話す画面に入ってしまう。
  scenario: { icon: "🎙️", label: "たいわ", href: (id) => `/talk/${id}`, gates: true },
  // ミーティングは たいわ と同じ Zoom風の枠だが、聞き出すのではなく自分のことを話す。
  // 呼び名も行き先も分ける（学習者が「調べて聞く」つもりで入らないように）。
  meeting: { icon: "💬", label: "ミーティング", href: (id) => `/meeting/${id}`, gates: true },
  wordstage: { icon: "🕹️", label: "ことば", href: (id) => `/arcade/${id}`, gates: true },
};

export function contentKindMeta(type: ContentRefType): ContentKindMeta {
  return META[type];
}

/** 種別 → その教材のページ。 */
export function contentHref(type: ContentRefType, id: string): string {
  return META[type].href(id);
}
