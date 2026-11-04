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
 * どの 教材で 使うかは `OPEN_TALK`（教材の id）。ほかの たいわの 動きは 変えない——
 * 1人の お客さまの 教材は、相手が くわしい 話を 持って いないので、深く 聞いても
 * 「まだ 決めて いません」しか 返らない。そこで ほめると 学習者を 迷わせる。
 */

import { normalizeReading } from "@/lib/text/normalize";

/** 深く 聞く たいわに する 教材（scenario の id）。 */
export const OPEN_TALK: ReadonlySet<string> = new Set(["youkenweb_zoom"]);

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

/** 相手が 学習者に 意見を 聞いた しるし（persona の 逆質問の 言い方）。 */
const OPINION_ASK_MARKERS = ["思いますか", "おもいますか", "どうですか", "どう思", "意見"].map(
  normalizeReading,
);

/** 深く 聞いた しつもんか。 */
export function isDeepQuestion(utterance: string): boolean {
  const text = normalizeReading(utterance);
  if (!text) return false;
  return DEEP_MARKERS.some((marker) => marker.length > 0 && text.includes(marker));
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
 *（「クメール語の ページは どうですか」）。答え（「…と 思います」「…です」）だけを 外す。
 */
export function looksLikeQuestion(utterance: string): boolean {
  const trimmed = utterance
    .normalize("NFKC")
    .replace(/[\s。．.！!、,…]+$/u, "")
    .trim();
  return /[か？?]$/u.test(trimmed);
}

/** 会話の 1行（`TalkLine` の 一部）。 */
interface LineLike {
  readonly from: string;
  readonly text: string;
}

/**
 * 学習者の この 発話の **直前の 相手の 行**。
 *
 * 声は 相手が 話しはじめた 合図で 束ねて 届くので、記録には もう 相手の 返事の 書きはじめが
 * 入って いる ことが ある。だから 最後の 相手の 行では なく、**最後の 自分の 行より 前**を 見る。
 * 文字で 送った ときは 自分の 行が まだ 記録に 無いので、最後の 相手の 行に なる。
 */
export function partnerLineBefore(
  history: readonly LineLike[],
  utterance: string,
): string | undefined {
  const said = utterance.trim();
  let mine = -1;
  for (let at = history.length - 1; at >= 0; at -= 1) {
    const line = history[at]!;
    if (line.from === "me" && line.text.trim() === said) {
      mine = at;
      break;
    }
  }
  const until = mine >= 0 ? mine : history.length;
  for (let at = until - 1; at >= 0; at -= 1) {
    const line = history[at]!;
    if (line.from !== "me") return line.text;
  }
  return undefined;
}

/** この 発話は「意見を 聞かれた ことへの 答え」か（カードの 照合に かけない）。 */
export function isOpinionAnswer(history: readonly LineLike[], utterance: string): boolean {
  if (looksLikeQuestion(utterance)) return false;
  return isOpinionAsk(partnerLineBefore(history, utterance));
}
