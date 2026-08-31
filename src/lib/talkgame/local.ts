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

/** 札に 入る 長さ（これを 越えたら ことばの 切れめで 切る）。 */
const MAX_TOPIC = 12;

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
 * 見かたが 無い ときの **相手の 返事**（2026-08-31 の 指定）。
 *
 * ## なぜ 要るか
 * 見かたに つなげない ときは `reply` が 空に なる。すると 画面は 板を 閉じた 瞬間に
 * **つぎの しつもんを 出して いた**——学習者から 見ると、答えた ことに 相手が
 * 何も 言わないまま 次の しつもんが 来る
 *（2026-08-31「質問に回答すると、判定画面ですぐに次の質問に行ってしまう」）。
 *
 * 会話の 練習で いちばん 大事なのは「言った ことが 相手に 届いた」感じなので、
 * ここは **鍵の あるなしで 消して よい ところでは ない**。中身までは 作れないが、
 * 受け取った ことは 必ず 返す。
 *
 * かなだけで 書く（その場の 文には ふりがなを 合成できない・規律2）。
 */
const ACKS: readonly string[] = [
  "なるほど。よく はなして くれましたね。",
  "そうですか。おしえて くれて ありがとう ございます。",
  "はい。よく わかりました。",
  "いいですね。きかせて くれて ありがとう ございます。",
];

/** 聞く ばんは、答えを 作れない ことを 正直に 言う（作り話を しない・persona と 同じ 決まり）。 */
const LISTEN_ACK = "いい しつもんですね。ありがとう ございます。";

export function localReply(round: TalkRound, turns: number): string {
  if (round === "listen") return LISTEN_ACK;
  const at = Math.abs(Math.trunc(turns)) % ACKS.length;
  return ACKS[at] ?? LISTEN_ACK;
}

/**
 * 見かたが 無い ときの「おもしろい」の 拾い方。
 *
 * ラベルは **学習者の ことば その まま**（長ければ ことばの 切れめで 切る）。
 * AIの ような 要約は できないが、札に 出る のが 自分の ことばなら、
 * 何を 見つけたのかは 学習者に 分かる。
 *
 * ## 日本語で 言えて いない ものは 開かない（2026-08-24 の 検収指摘）
 * 長さだけで 見て いた ころは、英語でも でたらめな ローマ字でも 札が 開いた——
 * 5回 でたらめを 打てば 聞く ばんへ 行けて しまい、「おもしろい ところを
 * 5つ 見つける」という ねらいが 空に なる。できて いない ことを
 * 「みつけました！」と 返すのは、ほめる ことばの 値打ちも 下げる（設計01 P8）。
 */
export function localTopic(
  round: TalkRound,
  utterance: string,
  observations: TalkObservations,
): string {
  if (round !== "talk") return "";
  if (!observations.japanese || !observations.onTopic) return "";
  const text = utterance.trim();
  if (text.length < MIN_TOPIC) return "";
  return clip(text);
}

/**
 * 長い ことばを 札に 入る 形へ 切る。**ことばの 切れめで 切る**。
 *
 * 前は 12字めで そのまま 切って いた ので、実機の 札に
 *「Japanese IT …」「私は チームで 話す こ…」が 出た（2026-08-27 の 通し検証）。
 * この 札は 好感度の 記録に 残り、あとから 一覧にも 出る——**語の 途中で 切れた
 * ものは、あとで 見ても 何を 見つけたのか 分からない**。
 *
 * 教材の 文は 分かち書き（設計01）なので、空白まで 戻せば 語の 切れめに なる。
 * 戻り先が 無い ほど 長い 1語（URL など）の ときだけ、これまでどおり その まま 切る。
 */
function clip(text: string): string {
  if (text.length <= MAX_TOPIC) return text;
  const head = text.slice(0, MAX_TOPIC);
  const at = head.lastIndexOf(" ");
  const cut = at >= MIN_TOPIC ? head.slice(0, at) : head;
  return `${cut.trimEnd()}…`;
}
