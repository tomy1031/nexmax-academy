/**
 * フィードバック辞書 — 自由文字列を書ける場所をなくすための型付きメッセージ
 *（設計03 §1.3-1 / 理解設計ガイド P8）。
 *
 * 表示コンポーネント（FeedbackMessage）は FeedbackKey しか受け取らない。
 * 「不正解」「間違いです」のような文言は、書く場所そのものが存在しない。
 * ここの文言は lint:content ではなく単体テストで禁止語を機械検査する。
 */

import type { FuriganaEntry } from "@/lib/text/furigana";

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
  /**
   * 読みの 時間切れ。**画面には 出さない**（2026-08-27）——出すのは 大きな ⏰ と
   * 「❌ ただしい よみ: …」の ほうで、この 文言は 使って いない。
   * 辞書に 残して あるのは、フェーズの 見分け（`hint` の 値）に 使う ためだけ。
   */
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
  /**
   * 4択の 時間切れ。**外したのと 同じ 文言に しない**——
   * 「えらべなかった」と「えらんだ ものが ちがった」は 学習者に とって 別の 出来事で、
   * 同じ ことばを 出されると 何が 起きたのか 分からない（2026-08-26 の 指摘）。
   */
  "meaning.timeup": {
    tone: "encourage",
    title: "時間切れ！",
    next: "つぎは はやく えらべるよ。下の せつめいを 読もう",
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
  /**
   * 気持ちを外したときの2段階目。「外した」ことには触れず、同じ次の行動へ送る
   *（P8: 失敗を指さない。2段階目に進めた事実だけを前向きに置く）。
   */
  "quiz.emotionStepMiss": {
    tone: "info",
    title: "気もちを たしかめて いこう",
    next: "つぎは、その ときの 言い方を えらぼう",
  },
  /**
   * **正解の 無い もんだい**（自由記述だけの セット）を 出し終えたとき。
   *
   * 「合格」「せいかい」と 言わない——書いた ことに 正解は 無い。ここで 言えるのは
   * 「ぜんぶ 書けた＝つぎの 会話の じゅんびが できた」ことだけである
   *（2026-08-27 の 指定「松井社長に 何を 話す？は 答えが ないので 答え合わせと
   * いう 形では ない」）。次の 一手は **書いた ものの 行き先**を 教える。
   */
  "quiz.prepared": {
    tone: "praise",
    title: "じゅんび できました！",
    next: "書いた ことばは、つぎの 会話の「📋 自分の こたえ」で 見られます",
  },
  /** 問題セットを終えたが合格に届かなかったとき（もんだい単位の言い方）。 */
  "quiz.keepGoing": {
    tone: "encourage",
    title: "ここまで すすんだね",
    next: "「もう一度 やる」で 直したい ところだけ 直せます",
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

  /* --- たいわ（Live対話） --- */
  "talk.itemFound": { tone: "praise", title: "聞き出せたね！", next: "つぎの ことを 聞こう" },
  "talk.offTopic": {
    tone: "hint",
    title: "いまは この しつもんの 番では ないかも",
    next: "ボードの のこりを 見て、聞くことを えらぼう",
  },
  /** 言えていることに近いが、もう一言たりないとき（Live対話の判定が使う）。 */
  "talk.close": {
    tone: "hint",
    title: "おしい！ちかい ことばだよ",
    next: "もう ひとこと たして、聞いてみよう",
  },
  "talk.notReady": {
    tone: "info",
    title: "じゅんびちゅう",
    next: "先生に 「AIの せってい」を たのんでね",
  },
} as const satisfies Record<string, Feedback>;

export type FeedbackKey = keyof typeof FEEDBACK;

export function getFeedback(key: FeedbackKey): Feedback {
  return FEEDBACK[key];
}

/**
 * FEEDBACK の文言に出てくる漢字の読み辞書（規律2）。
 *
 * フィードバックは**いちばん読まれる文**なのに、教材データの読み辞書が届かない
 * 場所に置かれている（画面ではなく辞書型で持つため）。ここに辞書を同梱して
 * FeedbackMessage が必ずルビを合成する。覆い漏れは tests/feedback.test.ts が機械検査する。
 *
 * 同じ漢字でも読みが変わるところだけ、送りがなまで表記に含める
 *（「出てくる」＝で ／「聞き出せた」＝だせ）。最長一致なので長い表記が先に当たる。
 */
export const FEEDBACK_FURIGANA: FuriganaEntry[] = [
  ["時間切れ", "じかんぎれ"],
  ["日本語", "にほんご"],
  // こたえノート（📋 自分の こたえ）への 案内で 使う
  ["自分", "じぶん"],
  ["会話", "かいわ"],
  ["直", "なお"],
  ["入力", "にゅうりょく"],
  ["一度", "いちど"],
  ["意味", "いみ"],
  ["漢字", "かんじ"],
  ["相手", "あいて"],
  ["合格", "ごうかく"],
  ["先生", "せんせい"],
  ["原稿", "げんこう"],
  ["入っ", "はいっ"],
  ["出せ", "だせ"],
  ["入", "い"],
  ["出", "で"],
  ["正", "ただ"],
  ["見", "み"],
  ["読", "よ"],
  ["書", "か"],
  ["聞", "き"],
  ["言", "い"],
  ["方", "かた"],
  ["気", "き"],
  ["下", "した"],
  ["番", "ばん"],
];

/** 入力の問題（normalize.ts の InputIssue）を文言キーに写す。 */
export const INPUT_ISSUE_FEEDBACK = {
  kanji: "reading.hasKanji",
  latin: "reading.hasLatin",
  katakana: "reading.hasKatakana",
  notKana: "reading.needHiragana",
} as const satisfies Record<string, FeedbackKey>;
