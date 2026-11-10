/**
 * 深く 聞く たいわ（ウェブサイトの 要件定義・2026-11-04 の 指定）— 純粋な 判断だけ
 *
 * 指定:「最低限 聞かなければ ならない ことで 要件が カードとして 出る ことに 異論は
 * ありませんが、質問は もっと オープンで あるべきなので、決められた 答えを 見つけるだけでは
 * ない 仕組みが 望ましいです」。
 *
 * カード（最低限の 要件）は これまでどおり ことばの 照合で 開く。その 外側に 2つを 足す:
 *
 * 1. **深く 聞いた しつもん**（なぜ・どんな・たとえば…）は、カードに 当たらなくても
 *    「番では ないかも」と 言わない。相手役は カードに 無い **くわしい 話**を 持って いて、
 *    深く 聞かれた ときに 話す（persona）。だから 画面は ほめて 数える。
 *    以前は 同じ しつもんに「ボードの のこりを 見て、聞くことを えらぼう」と 出て いた——
 *    ミッションが 求める ことと **逆の 指導**だった（2026-11-04 の R7 検収）。
 * 2. **相手が 学習者に 意見を 聞いた あとの 返事**は、しつもんでは なく 意見・提案として 数え、
 *    カードの 照合に かけない。答えの ことば（「若い 人は いくらか 知りたいです」）で
 *    カードが 開くと、だれも 言って いない「800,000円」が ボードに 出る（同じ 検収で 実測）。
 *
 * どの 教材で 使うかは `OPEN_TALK_STYLE`（教材の id）。ほかの たいわの 動きは 変えない——
 * 1人の お客さまの 教材は、相手が くわしい 話を 持って いないので、深く 聞いても
 * 「まだ 決めて いません」しか 返らない。そこで ほめると 学習者を 迷わせる。
 *
 * ## 2026-11-10: 要件定義（STEP11）も オープンに する
 * 指定「オープンにしたいミーティングの質問画面がかなりクローズになっているので、もっと自由に
 * いろんな質問ができるようにしたい」「当時はチャットでやっていたやり取りを、実際に音声で
 * できるようにしたい」「聞いたことは各自メモをして欲しい」。旧アプリの 6.質問は
 * **何でも 聞ける チャット**だった。相手（山本社長）に 旧アプリの 知識を 戻した うえで ここに 足す。
 * - カードに 当たらない しつもんも「番では ないかも」と 言わない（深く なくても）。
 *   しつもんの 形なら「しつもん できたね／答えを メモしよう」（`talk.freeAsk`）
 * - `selfMemo` の 教材は、開いた 札に 答え（secret）を 出さない。札は「聞けた」しるしだけ。
 *   **答えを 書きとるのは 学習者**（画面が 代わりに メモしない）
 */

import { normalizeReading } from "@/lib/text/normalize";

/** 深く 聞く たいわの 教材ごとの 見せ方。 */
export interface OpenTalkStyle {
  /** ボードの 見出しの 下に 出す ひとこと（画面の 読み辞書 `PEOPLE_FURIGANA` で ルビを 付ける）。 */
  readonly boardNote: string;
  /** 相手が 学習者に 意見を 聞く 教材か（「伝えた 意見」の 数を 出す）。 */
  readonly opinions: boolean;
  /** 開いた 札に 答えを 出さず、学習者に メモさせるか。 */
  readonly selfMemo: boolean;
}

/** 深く 聞く たいわに する 教材（scenario の id → 見せ方）。 */
export const OPEN_TALK_STYLE: ReadonlyMap<string, OpenTalkStyle> = new Map([
  [
    "youkenweb_zoom",
    {
      boardNote: "カードは 最低限 聞く ことです。カードに 無い ことは、メモして 議事録に 書こう。",
      opinions: true,
      selfMemo: false,
    },
  ],
  [
    "youken_aoba",
    {
      boardNote:
        "カードは かならず 聞く ことです。ほかの ことも 自由に 聞こう。答えは カードに 出ません。聞いた ことは 自分で メモしよう。",
      opinions: false,
      selfMemo: true,
    },
  ],
]);

/** 深く 聞く たいわに する 教材（scenario の id）。 */
export const OPEN_TALK: ReadonlySet<string> = new Set(OPEN_TALK_STYLE.keys());

/**
 * 深く 聞いた しるしの ことば。**答えが「はい・いいえ」や 数で 終わらない 聞き方**だけ。
 * 「どのくらい」「いくら」「何回」は 数を 聞く ので 入れない（カードの しつもんに なる）。
 */
const DEEP_MARKERS = [
  "なぜ",
  "何故",
  "どうして",
  "どんな",
  "どういう",
  "どのように",
  "どのような",
  "たとえば",
  "例えば",
  "ほかに",
  "他に",
  "もう少し",
  "もうすこし",
  "くわしく",
  "詳しく",
  "具体的",
  "理由",
].map(normalizeReading);

/**
 * 相手が 学習者に 意見を 聞いた しるし（persona の 逆質問の 言い方）。
 * 「意見」の 1語では 見ない——「いい 意見ですね」と ほめた あとの しつもんまで 意見に なる
 *（2026-11-04 のコード検収で 実測）。
 */
const OPINION_ASK_MARKERS = ["思いますか", "おもいますか", "どうですか", "どう思"].map(
  normalizeReading,
);

/** お願いの 形の しつもん（「予算を 教えて ください」）。か で 終わらなくても しつもん。 */
const REQUEST_MARKERS = [
  "教えて",
  "おしえて",
  "お聞き",
  "おきき",
  "聞かせて",
  "きかせて",
  "聞いても",
].map(normalizeReading);

/**
 * 提案の 形（このステージで 教える 型の 終わり「〜のは どうでしょうか」）。
 * 「か」で 終わるが、意見を 聞かれた あとなら **しつもんでは なく 提案**として 数える。
 */
const PROPOSAL_ENDINGS = ["どうでしょうか", "のはどうですか", "のはどう", "はいかがでしょうか"].map(
  normalizeReading,
);

/** 中身の 無い 返事（「わかりません」）。意見と して ほめない（規律1）。 */
const EMPTY_REPLIES = ["わかりません", "分かりません", "すみません", "ありがとう"].map(
  normalizeReading,
);

/** 文の 終わりの 記号を 落とした 形。 */
function trimEnd(utterance: string): string {
  return utterance
    .normalize("NFKC")
    .replace(/[\s。．.！!、,…]+$/u, "")
    .trim();
}

/** 深く 聞いた しつもんか（ことばが あり、しつもんか お願いの 形）。 */
export function isDeepQuestion(utterance: string): boolean {
  const text = normalizeReading(utterance);
  if (!text) return false;
  if (!DEEP_MARKERS.some((marker) => marker.length > 0 && text.includes(marker))) return false;
  /*
   * しつもんの 形で なければ 数えない——「もう少し ゆっくり お願いします」
   *「ほかに ありません。ありがとうございました」は 深い しつもんでは ない（同じ 検収で 実測）。
   */
  return looksLikeQuestion(utterance) || isRequest(utterance);
}

/**
 * しつもんの 形か（「か」「？」で 終わる・お願いの 形）。深く なくても よい。
 * オープンな たいわでは、カードに 当たらなくても この 形なら 受けとめる（`talk.freeAsk`）。
 */
export function isQuestionLike(utterance: string): boolean {
  if (!normalizeReading(utterance)) return false;
  if (looksLikeQuestion(utterance) || isRequest(utterance)) return true;
  /*
   * 「か」で 終わらない 聞き方も しつもん（「コンセプトは 何」「働く 時間を 知りたいです」）。
   * `isRequest` には 入れない——「知りたい」は 意見の 答え（「若い 人は いくらか 知りたいです」）にも
   * 出るので、意見の 答えを しつもんと 取りちがえる（isOpinionAnswer）。
   */
  const text = normalizeReading(trimEnd(utterance));
  return (
    WANT_TO_KNOW.some((marker) => marker.length > 0 && text.includes(marker)) ||
    QUESTION_END_WORDS.some((word) => word.length > 0 && text.endsWith(word))
  );
}

/** 「知りたい」の 形（isQuestionLike だけで 使う）。 */
const WANT_TO_KNOW = ["知りたい", "しりたい"].map(normalizeReading);

/** 文の 終わりに 来ると しつもんに なる 語（「コンセプトは 何」）。 */
const QUESTION_END_WORDS = [
  "何",
  "なに",
  "いつ",
  "どこ",
  "だれ",
  "誰",
  "いくら",
  "どのくらい",
  "どう",
].map(normalizeReading);

/** お願いの 形の しつもんか。 */
export function isRequest(utterance: string): boolean {
  const text = normalizeReading(utterance);
  return REQUEST_MARKERS.some((marker) => marker.length > 0 && text.includes(marker));
}

/** 相手の 1行が、学習者に 意見を 聞いて いるか。 */
export function isOpinionAsk(partnerLine: string | undefined): boolean {
  if (!partnerLine) return false;
  const text = normalizeReading(partnerLine);
  return OPINION_ASK_MARKERS.some((marker) => marker.length > 0 && text.includes(marker));
}

/**
 * 学習者の 発話が しつもんの 形か（文の 終わりが「か」「？」）。
 *
 * 意見を 聞かれた あとでも、学習者が しつもんで 返した ときは カードの 照合に かける
 *（「予算は いくらですか」）。答え（「…と 思います」「…です」）だけを 外す。
 */
export function looksLikeQuestion(utterance: string): boolean {
  return /[か？?]$/u.test(trimEnd(utterance));
}

/** 提案の 形で 終わって いるか（「…のは どうでしょうか」）。 */
export function endsWithProposal(utterance: string): boolean {
  const text = normalizeReading(trimEnd(utterance));
  return PROPOSAL_ENDINGS.some((ending) => ending.length > 0 && text.endsWith(ending));
}

/** 会話の 1行（`TalkLine` の 一部）。 */
interface LineLike {
  readonly from: string;
  readonly text: string;
}

/**
 * 学習者の この 発話の **直前の 相手の 行**。
 *
 * - 声（`said: true`）… 発話は もう 記録の 中に ある。相手が 話しはじめた 合図で 束ねて
 *   届くので、記録の 末尾には 相手の 返事の 書きはじめが 付いて いる ことが ある。だから
 *   **最後の 自分の 行より 前**を 見る。
 * - 文字（`said: false`）… 送った 行は まだ 記録に 無い。**最後の 相手の 行**を 見る
 *  （文の 一致で 自分の 行を さがすと、前に 同じ 文を 送って いた とき 取りちがえる）。
 */
export function partnerLineBefore(
  history: readonly LineLike[],
  said: boolean,
): LineLike | undefined {
  let until = history.length;
  if (said) {
    for (let at = history.length - 1; at >= 0; at -= 1) {
      if (history[at]!.from === "me") {
        until = at;
        break;
      }
    }
  }
  for (let at = until - 1; at >= 0; at -= 1) {
    const line = history[at]!;
    if (line.from !== "me") return line;
  }
  return undefined;
}

/**
 * この 発話は「意見を 聞かれた ことへの 答え」か（カードの 照合に かけない）。
 *
 * - 直前の 相手の 行が 意見を 聞いて いて、**その 人に 話しかけて いる**とき だけ
 *  （🎤 を 別の 人へ 切りかえた あとの しつもんは 答えでは ない）
 * - しつもん（か・？）と お願い（教えて ください）は 答えに しない。ただし 提案の 形
 *  （…のは どうでしょうか）は 答え
 * - 中身の 無い 返事（わかりません）は 答えに しない
 */
export function isOpinionAnswer({
  history,
  utterance,
  said,
  targetId,
}: {
  history: readonly LineLike[];
  utterance: string;
  said: boolean;
  targetId: string;
}): boolean {
  const partner = partnerLineBefore(history, said);
  if (!partner || partner.from !== targetId || !isOpinionAsk(partner.text)) return false;
  const text = normalizeReading(utterance);
  if (!text || EMPTY_REPLIES.some((reply) => text.startsWith(reply))) return false;
  if (endsWithProposal(utterance)) return true;
  if (looksLikeQuestion(utterance) || isRequest(utterance)) return false;
  return true;
}
