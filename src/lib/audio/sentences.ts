/**
 * リスニングの 原稿を 1文ずつに 割る（画面と 音づくりで 共用する 唯一の 割りかた）。
 *
 * 音づくり（`scripts/make_listening_audio.ts`）は この 割りかたで 文ごとの 音
 * `public/audio/listening/<教材ID>/01.wav …` を 作る。こたえあわせの 画面は **同じ 割りかたで**
 * 行を 文に 分け、文ごとの 音を 鳴らす。割りかたを 2か所に 書くと、1か所 直した 日から
 * **ボタンの 音と 原稿の 文が ずれる**——だから ここ 1つに 置く。
 */

/** 文の おわりの 記号。 */
const SENTENCE_END = /[。？！?!]/;
/** かっこの 開き と 閉じ。かっこの 中の「。」では 割らない。 */
const OPEN = /[「『（(]/;
const CLOSE = /[」』）)]/;

/**
 * 1行を 文に 割る。
 *
 * - 「。」「？」「！」の あとで 割る。
 * - **かっこの 中では 割らない**（「きょうは 休みです。」と 言った——を 2つに しない）。
 * - 前後の 空白は 落とす（分かち書きの 空白が 頭に 残らない ように）。
 */
export function splitSentences(text: string): string[] {
  const chars = [...text];
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i]!;
    if (OPEN.test(ch)) depth += 1;
    else if (CLOSE.test(ch)) depth = Math.max(0, depth - 1);
    if (depth > 0 || !SENTENCE_END.test(ch)) continue;
    let end = i + 1;
    while (end < chars.length && SENTENCE_END.test(chars[end]!)) end += 1;
    out.push(chars.slice(start, end).join("").trim());
    start = end;
    i = end - 1;
  }
  out.push(chars.slice(start).join("").trim());
  return out.filter((sentence) => sentence.length > 0);
}

/** 話す人つきの 1文。 */
export interface SpeakerSentence {
  readonly speaker: string;
  readonly text: string;
}

/** 原稿（行の 並び）を、話す人つきの 文の 並びに する。 */
export function scriptSentences(
  script: readonly { readonly speaker: string; readonly text: string }[],
): SpeakerSentence[] {
  return script.flatMap((line) =>
    splitSentences(line.text).map((text) => ({ speaker: line.speaker, text })),
  );
}

/** 文ごとの wav の ファイル名（`01.wav` から）。並び順が そのまま つなぐ 順。 */
export function sentenceFileName(index: number): string {
  return `${String(index + 1).padStart(2, "0")}.wav`;
}

/** 文ごとの 音の URL（`public/` から 見た 場所）。 */
export function sentenceAudioUrl(listeningId: string, index: number): string {
  return `/audio/listening/${listeningId}/${sentenceFileName(index)}`;
}

/** 行の 中の 1文と、その 音の URL。 */
export interface SentenceClip {
  readonly text: string;
  readonly url: string;
}

/**
 * 行ごとに「文と 音」を 並べる。**全部の 文の 音が そろって いる ときだけ** 返す
 *（1つでも 欠けて いたら `null`——一部の 文にだけ ボタンが 出ると、無い 文は
 * 聞けない のか 壊れて いるのか 学習者に 区別が つかない）。
 *
 * `has` には「その URL の 音が 置いて あるか」を 渡す（画面では 資産の 版番号の 一覧）。
 */
export function lineSentenceClips(
  listeningId: string,
  script: readonly { readonly speaker: string; readonly text: string }[],
  has: (url: string) => boolean,
): SentenceClip[][] | null {
  let at = 0;
  const lines = script.map((line) =>
    splitSentences(line.text).map((text) => ({ text, url: sentenceAudioUrl(listeningId, at++) })),
  );
  return lines.every((clips) => clips.every((clip) => has(clip.url))) ? lines : null;
}
