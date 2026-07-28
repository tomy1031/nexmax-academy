/**
 * フィードバック辞書 — 自由文字列を書ける場所をなくすための型付きメッセージ
 *（設計03 §1.3-1 / 理解設計ガイド P8）。
 *
 * 表示コンポーネント（FeedbackMessage）は FeedbackKey しか受け取らない。
 * 「不正解」「間違いです」のような文言は、書く場所そのものが存在しない。
 * ここの文言は lint:content ではなく単体テストで禁止語を機械検査する。
 */

/** 見た目（色・アイコン）を決めるトーン。意味は文言側が持つ。 */
export type FeedbackTone = "praise" | "encourage" | "hint" | "info";

export interface Feedback {
  readonly tone: FeedbackTone;
  /** 短い見出し。 */
  readonly title: string;
  /** 次にとる行動。P8「フィードバックは励まし＋次の行動」の後半。 */
  readonly next?: string;
}

/**
 * 使える文言の全集合。増やすときはここに足す（画面側で文字列を書かない）。
 */
export const FEEDBACK = {
  /* --- 読みフェーズ（ことばアーケード） --- */
  "reading.correct": { tone: "praise", title: "よみ、あってる！", next: "つぎは 意味を えらぼう" },
  "reading.retry": {
    tone: "encourage",
    title: "おしい！",
    next: "正しい よみを 見てから、意味を えらぼう",
  },
  "reading.timeup": {
    tone: "encourage",
    title: "つぎに いこう",
    next: "この ことばは「まちがえた ことばだけ」で もう一度 出てくるよ",
  },
  "reading.needHiragana": {
    tone: "hint",
    title: "ひらがなで 入力してね",
    next: "日本語入力に なっているか たしかめよう",
  },
  "reading.hasKanji": {
    tone: "hint",
    title: "ひらがなで 入力してね",
    next: "漢字では なく、よみかたを 書こう",
  },
  "reading.hasLatin": {
    tone: "hint",
    title: "ひらがなで 入力してね",
    next: "キーボードを 日本語入力に かえよう",
  },
  "reading.hasKatakana": {
    tone: "hint",
    title: "カタカナが 入っているよ",
    next: "ひらがなに して 入力してね",
  },

  /* --- 意味フェーズ --- */
  "meaning.correct": { tone: "praise", title: "その とおり！" },
  "meaning.retry": {
    tone: "encourage",
    title: "いっしょに かくにんしよう",
    next: "下の せつめいを 読んで、つぎに いこう",
  },

  /* --- 問題エンジン --- */
  "quiz.correct": { tone: "praise", title: "よく できました！" },
  "quiz.review": {
    tone: "encourage",
    title: "ここが だいじな ところ",
    next: "せつめいを 読んでから、つぎの もんだいへ",
  },
  "quiz.partial": {
    tone: "encourage",
    title: "あと すこし",
    next: "えらべていない ものが あるよ。もう一度 見てみよう",
  },
  "quiz.emotionStep": {
    tone: "info",
    title: "相手の 気もちが わかったね",
    next: "つぎは、その ときの 言い方を えらぼう",
  },

  /* --- ステージ・結果 --- */
  "stage.passed": { tone: "praise", title: "合格！ よく がんばったね", next: "つぎの ステージへ" },
  "stage.keepGoing": {
    tone: "encourage",
    title: "ここまで すすんだね",
    next: "「まちがえた ことばだけ」で もう一度 れんしゅうしよう",
  },
  "stage.locked": {
    tone: "info",
    title: "この ステージは まだ ひらいていません",
    next: "先生から 聞いた パスワードを 入れてね",
  },
  "stage.unlocked": { tone: "praise", title: "ステージが ひらきました" },
  "stage.passwordRetry": {
    tone: "hint",
    title: "パスワードが ちがうみたい",
    next: "もう一度 入れてみよう",
  },

  /* --- リスニング --- */
  "listening.keywordFound": {
    tone: "praise",
    title: "聞きとれたね！",
    next: "つぎの ことばも さがそう",
  },
  "listening.keywordUnknown": {
    tone: "hint",
    title: "その ことばは まだ 出ていないみたい",
    next: "もう一度 聞いて、聞こえた ことばを 入れてみよう",
  },
  "listening.revealProgress": {
    tone: "info",
    title: "原稿が 見えてきたよ",
    next: "聞こえた ことばを 入れると、もっと 出てくるよ",
  },

  /* --- ミーティング（Live対話） --- */
  "meeting.itemFound": { tone: "praise", title: "聞き出せたね！", next: "つぎの ことを 聞こう" },
  "meeting.offTopic": {
    tone: "hint",
    title: "いまは この しつもんの 番では ないかも",
    next: "ボードの のこりを 見て、聞くことを えらぼう",
  },
  "meeting.notReady": {
    tone: "info",
    title: "じゅんびちゅう",
    next: "先生に 「AIの せってい」を たのんでね",
  },
} as const satisfies Record<string, Feedback>;

export type FeedbackKey = keyof typeof FEEDBACK;

export function getFeedback(key: FeedbackKey): Feedback {
  return FEEDBACK[key];
}

/** 入力の問題（normalize.ts の InputIssue）を文言キーに写す。 */
export const INPUT_ISSUE_FEEDBACK = {
  kanji: "reading.hasKanji",
  latin: "reading.hasLatin",
  katakana: "reading.hasKatakana",
  notKana: "reading.needHiragana",
} as const satisfies Record<string, FeedbackKey>;
