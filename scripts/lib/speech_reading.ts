/**
 * 読み上げた 音が **原稿どおりか** を、読み（かな）で 見くらべる。
 *
 * ## `live_tts.ts` の 見くらべとの ちがい
 * あちらは「しつもんに **答えて しまった** 読み上げ」を 落とす ための もので、
 * 一致 55% で 通す（英語の カタカナ読みで 下がる ぶんを 許す）。
 * リスニングは **画面の 原稿と 音が 1字も ずれない** ことが 要る（2026-09-16 の 指定
 *「原稿と 音声が 一致しない 箇所が あったので、完璧に 一致する ように」）。
 * だから ここでは **読み（かな）どうし**を 比べ、ずれを 数で 見る。
 *
 * ## なぜ 字で なく 読みで 比べるか
 * 文字起こしは 表記が ゆれる（「何ですか」⇔「なんですか」、「1日」⇔「一日」）。
 * 字で 比べると 正しく 読んだ 音まで 落ちて、作り直しが 止まらなく なる。
 *
 * - 原稿の 読み … **画面と 同じ 読み辞書**（その 教材の `furigana`）で 付ける
 * - 文字起こしの 読み … 形態素解析（kuromoji。`yomi_check.ts` と 同じ 解析器）
 */

import type { Tokenizer } from "kuromoji";
import { annotateRuby, KANJI, type FuriganaIndex } from "../../src/lib/text/furigana";
import { looseReading } from "../../src/lib/text/normalize";
import {
  NO_SOUNDS,
  spellSounds,
  type SoundsIndex,
} from "../../src/components/listening/listening-checks";

/** 1けたの 数字の 読み（「1日」と「一日」を そろえる ため。原稿に 2けた以上は 無い）。 */
const DIGIT_READING: Readonly<Record<string, string>> = {
  "0": "ぜろ",
  "1": "いち",
  "2": "に",
  "3": "さん",
  "4": "よん",
  "5": "ご",
  "6": "ろく",
  "7": "なな",
  "8": "はち",
  "9": "きゅう",
};

/** 比べる 形に そろえる（かな統一・記号と 空白を 落とす・長音を 母音に・数字を 読みに）。 */
function comparable(reading: string): string {
  return looseReading(
    reading.normalize("NFKC").replace(/[0-9]/g, (digit) => DIGIT_READING[digit] ?? digit),
  );
}

/**
 * 原稿の 読み（画面と 同じ 読み辞書で 付ける。辞書に 無い 字は そのまま）。
 * 数字・英字で 始まる 語は **聞き取り専用の 読み**（`src/content/listening-sounds.ts`）で 先に かなへ。
 */
export function scriptReading(
  text: string,
  index: FuriganaIndex,
  sounds: SoundsIndex = NO_SOUNDS,
): string {
  return comparable(
    annotateRuby(spellSounds(text, sounds), index)
      .map((segment) => segment.reading ?? segment.text)
      .join(""),
  );
}

/**
 * 文字起こしの 読み。
 *
 * **まず 原稿と 同じ 読み辞書で 引き**、辞書に 無い 漢字だけ 解析器の 読みに する。
 * 解析器だけに 任せると「何ですか」を なにですか と 読み、原稿（なんですか）と
 * 1字 ずれる——その 1字を 許す ために「ずれ 1字まで」に して いたら、
 * **「そうですか」を「そうです」と 読んだ 音**まで 通って しまった（2026-09-16）。
 * 同じ 辞書を 通せば、同じ 字は 同じ 読みに なり、ずれ 0字を 求められる。
 */
export function spokenReading(
  transcript: string,
  tokenizer: Tokenizer,
  index: FuriganaIndex,
  sounds: SoundsIndex = NO_SOUNDS,
): string {
  return comparable(
    annotateRuby(spellSounds(tidyTranscript(transcript), sounds), index)
      .map((segment) => {
        if (segment.reading) return segment.reading;
        if (!KANJI.test(segment.text)) return segment.text;
        return tokenizer
          .tokenize(segment.text)
          .map((token) =>
            KANJI.test(token.surface_form)
              ? (token.reading ?? token.surface_form)
              : token.surface_form,
          )
          .join("");
      })
      .join(""),
  );
}

/**
 * 文字起こしの 空白を 詰める。モデルに よっては 語ごとに 空白を 入れて 返す
 *（「公開 日」「Git ハブ」。2026-09-28 の gemini-3.5-flash-lite）。空白で 語が 割れると
 * 読み辞書の 熟語（公開日＝こうかいび）や 台帳の 語（GitHub）に 当たらず、正しく 読んだ 音まで
 * ずれて 見える。英字どうしの あいだの 空白（「Laravel Breeze」）だけは 残す。
 */
export function tidyTranscript(transcript: string): string {
  return transcript
    .normalize("NFKC")
    .replace(/(?<![A-Za-z])\s+|\s+(?![A-Za-z])/g, "")
    .trim();
}

/**
 * 原稿の 文ごとの 読みを、まとめて 聞いた 読みに 当てて、**文ごとの ずれ**を 出す。
 *
 * TTS で 会話を まとめて 読んだ ときに、全体で 1回だけ 文字起こし して、
 * どの 文が 原稿と ちがうかを 見つける（その 文だけ 読み直す）。編集距離の 表を
 * たどって、足す・消す・置きかえる を 原稿の どの 文に 起きたかに 分ける。
 * **文の 切れ目に 足された 音**（同じ 文を 2度 読んだ など）は、どちらの 文の 音に
 * 入ったか 分からないので **両どなりの 文**に 数える。
 */
export function alignSentences(
  expectedParts: readonly string[],
  spoken: string,
): { spoken: string; distance: number }[] {
  const e = [...expectedParts.join("")];
  const s = [...spoken];
  // 文の 始まり位置（e の 添字）
  const starts: number[] = [];
  let at = 0;
  for (const part of expectedParts) {
    starts.push(at);
    at += [...part].length;
  }
  const owner = (i: number): number => {
    let k = 0;
    while (k + 1 < starts.length && starts[k + 1]! <= i) k += 1;
    return k;
  };
  const rows = e.length + 1;
  const cols = s.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      d[i]![j] = Math.min(
        d[i - 1]![j]! + 1,
        d[i]![j - 1]! + 1,
        d[i - 1]![j - 1]! + (e[i - 1] === s[j - 1] ? 0 : 1),
      );
    }
  }
  const out = expectedParts.map(() => ({ spoken: "", distance: 0 }));
  let i = e.length;
  let j = s.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i]![j] === d[i - 1]![j - 1]! + (e[i - 1] === s[j - 1] ? 0 : 1)) {
      const k = owner(i - 1);
      out[k]!.spoken = s[j - 1] + out[k]!.spoken;
      if (e[i - 1] !== s[j - 1]) out[k]!.distance += 1;
      i -= 1;
      j -= 1;
    } else if (i > 0 && d[i]![j] === d[i - 1]![j]! + 1) {
      out[owner(i - 1)]!.distance += 1;
      i -= 1;
    } else {
      // 足された 音。原稿の i 文字目の 前に 入った
      const inside = i > 0 && i < e.length && !starts.includes(i);
      const targets = inside
        ? [owner(i)]
        : i === 0
          ? [0]
          : i >= e.length
            ? [expectedParts.length - 1]
            : [owner(i - 1), owner(i)];
      for (const k of targets) {
        out[k]!.spoken = s[j - 1] + out[k]!.spoken;
        out[k]!.distance += 1;
      }
      j -= 1;
    }
  }
  return out;
}

/** 2つの 文字列の 編集距離（足す・消す・置きかえる の 回数）。 */
export function editDistance(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  let row = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= y.length; j += 1) {
      next[j] = Math.min(
        row[j]! + 1,
        next[j - 1]! + 1,
        row[j - 1]! + (x[i - 1] === y[j - 1] ? 0 : 1),
      );
    }
    row = next;
  }
  return row[y.length]!;
}

/** 見くらべた 結果（台帳 `sentences.json` に そのまま 残す）。 */
export interface ReadingMatch {
  readonly ok: boolean;
  readonly expected: string;
  readonly spoken: string;
  /** 読みの ずれ（かな何字ぶんか）。0 が ぴったり。 */
  readonly distance: number;
  readonly why: string;
}

/**
 * 原稿どおりに 読んだか。
 *
 * ## ずれは 1字も 許さない
 * 文字起こしも 原稿と 同じ 読み辞書で 読む（`spokenReading`）ので、同じ 字なら
 * 読みは そろう。ずれが あれば 読み飛ばし・言いかえ・足した ことばと みなして 作り直す。
 * はじめは 解析器の ゆれの ために 1字 許して いたが、「そうですか」→「そうです」
 *（か の 読み落とし）が 通った（2026-09-16）。長い 文ほど 許す（1割 など）のは もっと 悪い——
 * 「とても」の ような 短い 語の 読み飛ばしが 通る。
 *
 * 文字起こしが 空の ときは 確かめようが ないので **通さない**。
 */
export function matchReading(
  text: string,
  transcript: string,
  index: FuriganaIndex,
  tokenizer: Tokenizer,
  sounds: SoundsIndex = NO_SOUNDS,
): ReadingMatch {
  const expected = scriptReading(text, index, sounds);
  if (transcript.trim() === "") {
    return { ok: false, expected, spoken: "", distance: expected.length, why: "文字起こしが 空" };
  }
  const pair = readingPair(text, transcript, index, tokenizer, sounds);
  if (sounds.entries.length > 0) {
    /*
     * **台帳を 通さない 見くらべも して、ずれの 少ない ほうを 取る**。文字起こしが
     * 英字の 途中に 空白や 点を 入れる（「Git Hub」「A.W.S.」）と 台帳に 当たらず、
     * 台帳を 入れる 前は 通って いた 音まで 落ちる（2026-09-28 の 検収で 実測）。
     */
    const plain = readingPair(text, transcript, index, tokenizer, NO_SOUNDS);
    if (plain.distance < pair.distance) return verdict(plain);
  }
  return verdict(pair);
}

/** 原稿と 文字起こしの 読みを 同じ 台帳で 作って 比べる。 */
function readingPair(
  text: string,
  transcript: string,
  index: FuriganaIndex,
  tokenizer: Tokenizer,
  sounds: SoundsIndex,
): { expected: string; spoken: string; distance: number } {
  // 英字・数字の あいだの 空白と 点は 文字起こしの ゆれ（「Git Hub」「S 3」「A.W.S.」）
  const joined = tidyTranscript(transcript).replace(
    /(?<=[A-Za-z0-9Ａ-Ｚａ-ｚ０-９])[\s.．・]+(?=[A-Za-z0-9Ａ-Ｚａ-ｚ０-９])/g,
    "",
  );
  const expected = scriptReading(text, index, sounds);
  const spoken = spokenReading(joined, tokenizer, index, sounds);
  return { expected, spoken, distance: editDistance(expected, spoken) };
}

function verdict({
  expected,
  spoken,
  distance,
}: {
  expected: string;
  spoken: string;
  distance: number;
}): ReadingMatch {
  const allowed = 0;
  return {
    ok: distance <= allowed,
    expected,
    spoken,
    distance,
    why:
      distance === 0
        ? "読みが ぴったり 一致"
        : `読みの ずれ ${distance}字（許す のは ${allowed}字まで）: 原稿「${expected}」／音「${spoken}」`,
  };
}
