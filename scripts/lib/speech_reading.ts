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

/** 原稿の 読み（画面と 同じ 読み辞書で 付ける。辞書に 無い 字は そのまま）。 */
export function scriptReading(text: string, index: FuriganaIndex): string {
  return comparable(
    annotateRuby(text, index)
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
): string {
  return comparable(
    annotateRuby(transcript.normalize("NFKC"), index)
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
): ReadingMatch {
  const expected = scriptReading(text, index);
  if (transcript.trim() === "") {
    return { ok: false, expected, spoken: "", distance: expected.length, why: "文字起こしが 空" };
  }
  const spoken = spokenReading(transcript, tokenizer, index);
  const distance = editDistance(expected, spoken);
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
