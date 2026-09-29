/**
 * リスニングの 音の 切りかたの 台帳（画面と 音づくりで 共用する）
 *
 * ## 短い 文を となりの 文と 1つの 音に する 教材（2026-09-29 の 指定）
 * 「わかりました。／ありがとうございます。などの 短い 文で 同じ 人の ものは そのまま 結合」。
 * ここに 載せた 教材は、文ごとの 音（`public/audio/listening/<教材ID>/01.wav …`）の 1つが
 *「短い 文を まとめた ひとまとまり」に なる（`joinShortSentences`・`src/lib/audio/sentences.ts`）。
 * こたえあわせの ▶ も 同じ まとまりで 出る——**画面と 音づくりが 同じ 台帳を 見ないと
 * ボタンの 音と 原稿が ずれる**ので、ここ 1か所に 置く。
 *
 * 報告の リスニング（`houkoku_listening`）は 1文ずつの 音が すでに あるので 載せない。
 */
export const JOIN_SHORT_SENTENCES: ReadonlySet<string> = new Set([
  "houkoku_kanryou_listening",
  "houkoku_okure_listening",
  "houkoku_shougai_listening",
  "houkoku_chousa_listening",
  "houkoku_chourei_listening",
]);

/** その 教材の 音の 切りかた（`scriptSentences`・`lineSentenceClips` に 渡す）。 */
export function audioUnitsOf(listeningId: string): { joinShort: boolean } {
  return { joinShort: JOIN_SHORT_SENTENCES.has(listeningId) };
}
