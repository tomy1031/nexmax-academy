/**
 * タイピングの 判定（純関数）
 *
 * お手本の 文を 見て、同じ 文を 打つ（2026-09-30 の 指定「重要な 文章を タイピングして、
 * 正解した 場合に 英文や 単語の 意味が 出てくる」）。
 *
 * ## かなだけでも、漢字まじりでも 当たる
 * 同じ 日の 前の 指定「ひらがなでも 漢字ありでも どちらも 正しく 機能するように」を
 * タイピングにも 当てる。**お手本も 入力も かなへ 倒してから** 比べる。倒しかたは 聞き取りと 同じ
 *（`readingForms`・`canonicalKana`。数字・英字の 読みは 台帳 `src/content/listening-sounds.ts`）。
 * 「10時」を「じゅうじ」、「GitHub」を「ぎっとはぶ」、「80％」を「はちじっぱーせんと」と 打っても 当たる。
 *
 * ## 空白・句読点は 見ない
 * お手本は 分かち書き（「次は どの タスクを」）だが、打つ ときに 空白は 要らない。
 * 「、」「。」の 打ち忘れも 落とさない（`normalizeReading` が 落とす 記号）。
 * ねらいは 文を 正しく 書けるか で、記号の 位置では ない。
 *
 * ## IME が かなの 語を 漢字に 変えても 落とさない
 * お手本が かなで 書く 語（ごろ・まで・こと・ない・ように・また・ところ）を IME は
 * ふつうに 漢字へ 変える（頃・迄・事・無い・様に・又・所）。読み辞書は お手本の 字しか
 * 持たないので、そのままでは **嘘の 不正解**に なる（code-critic の 実測）。
 * 入力の 側だけ `KANA_IN_KANJI` で かなに 戻す。**お手本に その 漢字が ある 文では 戻さない**
 *——「仕事」の 事を「こと」に すると、正しく 打った 文まで 壊れる。
 *
 * ## 外れたら「どこまで 合って いたか」を 返す
 * 「ちがいます」だけでは 何を 直せば いいのか 分からない（リスニングの `partway` と 同じ 考え）。
 * 入力の 頭から、お手本と 合って いる ところまでを 返す。
 */

import { looseReading, normalizeReading } from "@/lib/text/normalize";
import type { FuriganaIndex } from "@/lib/text/furigana";
import {
  canonicalKana,
  NO_SOUNDS,
  readingForms,
  type SoundsIndex,
} from "@/components/listening/listening-checks";

/**
 * IME が 漢字に 変えがちな かなの 語（入力の 側だけ かなに 戻す）。
 * 1字の もの（事・所・又）は、お手本に その 字が ある 文では 使わない（`createTypingTarget`）。
 * 長い ものから 順に 置く（「無い」を「無」より 先に）。
 */
const KANA_IN_KANJI: readonly (readonly [string, string])[] = [
  ["出来る", "できる"],
  ["下さい", "ください"],
  ["様に", "ように"],
  ["様な", "ような"],
  ["無い", "ない"],
  ["無く", "なく"],
  ["良く", "よく"],
  ["未だ", "まだ"],
  ["全て", "すべて"],
  ["解っ", "わかっ"],
  ["判っ", "わかっ"],
  ["頃", "ごろ"],
  ["迄", "まで"],
  ["事", "こと"],
  ["所", "ところ"],
  ["又", "また"],
  ["為", "ため"],
  ["程", "ほど"],
];

/** 判定に 要る もの（1文ぶん）。 */
export interface TypingTarget {
  /** お手本（表記の まま・かなへ 倒した 形・長音を 開いた 形）と 別解の 形。 */
  readonly forms: readonly string[];
  readonly furigana: FuriganaIndex;
  readonly sounds: SoundsIndex;
  /** 入力の 側で かなに 戻す 漢字（お手本に 無い ものだけ）。 */
  readonly swaps: readonly (readonly [string, string])[];
  /** いちばん 長い 形の 長さ（「どこまで 合って いたか」を 探す はばの 上限に 使う）。 */
  readonly longest: number;
}

export type TypingResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      /** 入力の 頭から、お手本と 合って いた ところ（無ければ 空）。 */
      readonly matched: string;
    };

/** 比べる 形を ぜんぶ 作る（表記の まま・読みの 候補・長音を 開いた 読み）。 */
function formsOf(text: string, furigana: FuriganaIndex, sounds: SoundsIndex): string[] {
  const raw = normalizeReading(text);
  const kana = readingForms(text, furigana, sounds).map((form) =>
    canonicalKana(normalizeReading(form), sounds),
  );
  return [...new Set([raw, ...kana, ...kana.map(looseReading)])].filter(Boolean);
}

export function createTypingTarget(
  text: string,
  options: {
    readonly furigana: FuriganaIndex;
    readonly sounds?: SoundsIndex;
    /** 意味が 同じ 別の 書きかた（表記ゆれは 書かない）。 */
    readonly accept?: readonly string[];
  },
): TypingTarget {
  const sounds = options.sounds ?? NO_SOUNDS;
  const models = [text, ...(options.accept ?? [])];
  const forms = [...new Set(models.flatMap((item) => formsOf(item, options.furigana, sounds)))];
  const swaps = KANA_IN_KANJI.filter(([kanji]) => !models.some((item) => item.includes(kanji)));
  const longest = forms.reduce((max, form) => Math.max(max, form.length), 0);
  return { forms, furigana: options.furigana, sounds, swaps, longest };
}

/** 入力の IME の 漢字を かなに 戻す（お手本に 無い 漢字だけ）。 */
function unswap(target: TypingTarget, input: string): string {
  return target.swaps.reduce((text, [kanji, kana]) => text.split(kanji).join(kana), input);
}

/** 入力の 形の どれかが、お手本の 形の どれかと 同じ（`prefix` なら 頭が 同じ）か。 */
function meets(target: TypingTarget, input: string, prefix: boolean): boolean {
  const inputs = formsOf(unswap(target, input), target.furigana, target.sounds);
  return inputs.some((form) =>
    target.forms.some((model) => (prefix ? model.startsWith(form) : model === form)),
  );
}

export function judgeTyping(target: TypingTarget, raw: string): TypingResult {
  const input = raw.trim();
  if (normalizeReading(input) && meets(target, input, false)) return { ok: true };
  /*
   * 頭から 1字ずつ 縮めて、お手本の 頭と 合う いちばん 長い ところを 探す。
   * お手本より ずっと 長い 頭は 合いようが ないので、**お手本の 2倍から** 始める——
   * 長い 文を 貼り付けられても 1字ずつ 全部を 試さない（3000字で 13秒 固まった。code-critic の 実測）。
   */
  for (let end = Math.min(input.length, target.longest * 2); end > 0; end -= 1) {
    const head = input.slice(0, end);
    if (normalizeReading(head) && meets(target, head, true)) {
      // 見ない 記号（空白・句読点）で 終わって いたら 落とす——「でた 」までは、では 読みにくい
      return { ok: false, matched: head.replace(/[\s　、。，．,.]+$/, "") };
    }
  }
  return { ok: false, matched: "" };
}
