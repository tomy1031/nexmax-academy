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

/** 短い 文と みなす 字の 数（空白と 記号は 数えない）。「ありがとう ございます。」は 10字。 */
export const SHORT_SENTENCE_CHARS = 10;

/** 短い 文か（「はい。」「分かりました。」「ありがとう ございます。」）。 */
export function isShortSentence(text: string): boolean {
  return (
    text.replace(/[\s\u3000、。，．,.!?！？「」『』（）()・…]/g, "").length <= SHORT_SENTENCE_CHARS
  );
}

/**
 * 1行（同じ 人の ひとつづき）の 文を、**音の ひとまとまり**に まとめる。
 *
 * 2026-09-29 の 指定「わかりました。／ありがとうございます。などの 短い 文で 同じ 人の ものは
 * そのまま 結合」。1文ずつ 1.5秒 あけると「分かりました。…（1.5秒）…ありがとう ございます。」と
 * 不自然に 切れる。**短い 文は 前の 文に つける**（行の 頭の 短い 文は 次の 文に つける）。
 * 行を またいで（話す人が 変わって）まとめる ことは しない。
 */
export function joinShortSentences(sentences: readonly string[]): string[] {
  const groups: string[][] = [];
  let leadingShort = false;
  for (const sentence of sentences) {
    const last = groups[groups.length - 1];
    if (last && (isShortSentence(sentence) || leadingShort)) {
      last.push(sentence);
      leadingShort = leadingShort && isShortSentence(sentence);
      continue;
    }
    groups.push([sentence]);
    leadingShort = groups.length === 1 && isShortSentence(sentence);
  }
  return groups.map((group) => group.join(""));
}

/** 行を 文（または 短い 文を まとめた ひとまとまり）に 割る。 */
function lineUnits(text: string, joinShort: boolean): string[] {
  const sentences = splitSentences(text);
  return joinShort ? joinShortSentences(sentences) : sentences;
}

/**
 * 原稿（行の 並び）を、話す人つきの 文の 並びに する。
 * `joinShort` の 教材（`src/content/listening-audio.ts`）は 短い 文を となりと 1つに する。
 */
export function scriptSentences(
  script: readonly { readonly speaker: string; readonly text: string }[],
  { joinShort = false }: { joinShort?: boolean } = {},
): SpeakerSentence[] {
  return script.flatMap((line) =>
    lineUnits(line.text, joinShort).map((text) => ({ speaker: line.speaker, text })),
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
  { joinShort = false }: { joinShort?: boolean } = {},
): SentenceClip[][] | null {
  let at = 0;
  const lines = script.map((line) =>
    lineUnits(line.text, joinShort).map((text) => ({
      text,
      url: sentenceAudioUrl(listeningId, at++),
    })),
  );
  return lines.every((clips) => clips.every((clip) => has(clip.url))) ? lines : null;
}

/** 空白を 落とす（原稿は 分かち書き・タイピングの お手本は 空白なし）。 */
function squash(text: string): string {
  return text.replace(/[\s\u3000]/g, "");
}

/** ある 文が、音の ひとまとまりの 中で 占める 位置。 */
export interface SentencePart {
  /** 音の ひとまとまりの 番号（0から。`sentenceFileName` に 渡す 番号）。 */
  readonly unit: number;
  /** ひとまとまりの 中の 何文目から 何文目まで（1から 数える）。 */
  readonly from: number;
  readonly to: number;
  /** ひとまとまりの 文の 数（`from` が 1・`to` が これなら まるごと）。 */
  readonly count: number;
}

/**
 * ひとまとまりから **切り出した 音**の ファイル名（`scripts/cut_sentence_parts.ts` が 作る）。
 * `10.wav` の 2文目なら `10_2.wav`、`21.wav` の 1〜2文目なら `21_1-2.wav`。
 * 音づくりが ひとまとまりを 作り直すと フォルダごと 消える ので、古い 音の 切り出しは 残らない。
 */
export function sentencePartFileName(part: SentencePart): string {
  const base = sentenceFileName(part.unit).replace(/\.wav$/, "");
  return `${base}_${part.from === part.to ? part.from : `${part.from}-${part.to}`}.wav`;
}

/** ひとまとまりの 中に `target` が **文として まるごと**（となり合う 文の 並びで）入って いる 位置。 */
function partWithin(
  unit: string,
  target: string,
): { from: number; to: number; count: number } | null {
  const parts = splitSentences(unit).map(squash);
  for (let from = 0; from < parts.length; from += 1) {
    let joined = "";
    for (let to = from; to < parts.length; to += 1) {
      joined += parts[to];
      if (joined === target) return { from: from + 1, to: to + 1, count: parts.length };
      if (joined.length >= target.length) break;
    }
  }
  return null;
}

/**
 * 別の 教材の 文（タイピングの お手本）が、リスニングの 音の どこに あたるか。
 *
 * - まず **音の ひとまとまりと 字が 同じ** もの（空白は 見ない）
 * - 無ければ、ひとまとまりの 中に **文として まるごと 入って いる** もの。短い 文を となりと
 *   1つに した 教材（`joinShort`）では「はい。パソコンと…確認しました。」が 1つの 音なので、
 *   お手本「パソコンと…確認しました。」は その 2文目
 *
 * `units` は ひとまとまりの 字（`scriptSentences` の 順）。`usable` で 音の 無い ものを 外す。
 */
export function locateSentence(
  units: readonly string[],
  text: string,
  usable: (unit: number) => boolean = () => true,
): SentencePart | null {
  const target = squash(text);
  const candidates = units.map((unit, index) => ({ index, text: squash(unit) }));
  const exact = candidates.find((one) => usable(one.index) && one.text === target);
  if (exact) {
    const count = splitSentences(units[exact.index]!).length;
    return { unit: exact.index, from: 1, to: count, count };
  }
  for (const one of candidates) {
    if (!usable(one.index)) continue;
    const part = partWithin(one.text, target);
    if (part) return { unit: one.index, ...part };
  }
  return null;
}

/**
 * 別の 教材の 文（タイピングの お手本）ごとに、リスニングの 文ごとの 音から 当たる 音の URL を 返す。
 *
 * - 当てかたは `locateSentence`
 * - ひとまとまりの 一部に あたる 文は、**切り出した 音**（`sentencePartFileName`）が あれば それ、
 *   無ければ ひとまとまりごと（前後の「はい。」なども 鳴る）
 * - **1文でも 当たらなければ `null`**（`lineSentenceClips` と 同じ 理由——一部の 文にだけ
 *   ボタンが 出ると、聞けない のか 壊れて いるのか 区別が つかない）
 */
export function matchSentenceClips(
  listeningId: string,
  script: readonly { readonly speaker: string; readonly text: string }[],
  texts: readonly string[],
  has: (url: string) => boolean,
  { joinShort = false }: { joinShort?: boolean } = {},
): string[] | null {
  const units = scriptSentences(script, { joinShort }).map((sentence) => sentence.text);
  const usable = (index: number) => has(sentenceAudioUrl(listeningId, index));
  const urls: string[] = [];
  for (const text of texts) {
    const part = locateSentence(units, text, usable);
    if (!part) return null;
    const cut = `/audio/listening/${listeningId}/${sentencePartFileName(part)}`;
    const whole = part.from === 1 && part.to === part.count;
    urls.push(!whole && has(cut) ? cut : sentenceAudioUrl(listeningId, part.unit));
  }
  return urls;
}
