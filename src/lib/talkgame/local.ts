/**
 * 鍵が 無い 教室でも 対話ゲームが 成り立つ ように する — 端末の 中だけの 見かた
 *
 * このアプリは **Supabase も 鍵も 無しで 起動できる**（デモモード）。判定に つなげない
 * 学習者を「好感度が 上がらない 部屋」に 座らせない ため、規則で 判る ぶんだけ 見る。
 *
 * ## 見るのは 形だけ
 * ていねいさ・りゆうの ことば・気もちの ことば・しつもんの 形——**規則で 判る もの だけ**。
 * 会社の 中身が 入って いるか（`concrete`）は 規則では 判らないので **いつも false**に する。
 * ここを 甘く すると、AIが 居る 教室と 居ない 教室で 好感度の 意味が 変わる。
 *
 * ## それでも 満タンには 届く
 * 底（`FLOOR`）と 話しきった ぶんの 底上げ（`applyTurn`）が あるので、
 * 見かたが 無くても **話しきれば 100%** に なる。差は 速さに 出て、届く／届かないには 出ない。
 */

import { NO_OBSERVATIONS, type TalkObservations, type TalkRound } from "@/lib/talkgame/affinity";

/** りゆうの ことば。 */
const REASON = /(から|ので|ため)/;
/** 気もち・考えの ことば。 */
const FEELING =
  /(おもしろ|面白|すご|凄|すき|好き|たのし|楽し|うれし|嬉し|びっくり|かっこ|いいと思|と思います|たいです|みたい)/;
/** ていねいさ。 */
const POLITE = /(です|ます|ました|ません)/;
/** しつもんの 形。 */
const QUESTION = /(ですか|ますか|でしょうか|なぜ|どうして|いつ|どこ|だれ|誰|なに|何|どんな|どう)/;
/** かな・漢字が 1文字でも あれば「日本語で 言えた」と 見る。 */
const JAPANESE = /[ぁ-んァ-ヶ一-鿿]/;

/** 短すぎる 発話（かみ合って いるかを 見るには 足りない）。 */
const MIN_ON_TOPIC = 4;
/** 新しい「おもしろい」と 数える ための 長さ。 */
const MIN_TOPIC = 6;

export function localObservations(round: TalkRound, utterance: string): TalkObservations {
  const text = utterance.trim();
  if (!text) return NO_OBSERVATIONS;
  const japanese = JAPANESE.test(text);
  return {
    japanese,
    onTopic: japanese && text.length >= MIN_ON_TOPIC,
    // 中身が 会社の ことかは 規則では 判らない（AIが 居る ときだけ 見る）
    concrete: false,
    reason: japanese && REASON.test(text),
    feeling: japanese && FEELING.test(text),
    polite: japanese && POLITE.test(text),
    question: japanese && QUESTION.test(text) && round === "listen",
  };
}

/**
 * 見かたが 無い ときの「おもしろい」の 拾い方。
 *
 * ラベルは **学習者の ことば その まま**（先頭 12字）。AIの ような 要約は できないが、
 * 札に 出る のが 自分の ことばなら、何を 見つけたのかは 学習者に 分かる。
 */
export function localTopic(round: TalkRound, utterance: string): string {
  if (round !== "talk") return "";
  const text = utterance.trim();
  if (text.length < MIN_TOPIC) return "";
  return text.length > 12 ? `${text.slice(0, 12)}…` : text;
}
