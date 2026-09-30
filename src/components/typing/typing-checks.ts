/**
 * タイピングの 判定（純関数）
 *
 * お手本の 文を 見て、同じ 文を 打つ（2026-09-30 の 指定「重要な 文章を タイピングして、
 * 正解した 場合に 英文や 単語の 意味が 出てくる」）。
 *
 * ## かなだけでも、漢字まじりでも 当たる
 * 同じ 日の 前の 指定「ひらがなでも 漢字ありでも どちらも 正しく 機能するように」を
 * タイピングにも 当てる。学習者は IME で 変換しても しなくても よい——
 * **お手本も 入力も かなへ 倒してから** 比べる。倒しかたは 聞き取りと 同じ
 *（`readingForms`・`canonicalKana`。数字・英字の 読みは 台帳 `src/content/listening-sounds.ts`）。
 * 「10時」を「じゅうじ」、「GitHub」を「ぎっとはぶ」、「80％」を「はちじっぱーせんと」と 打っても 当たる。
 *
 * ## 空白・句読点は 見ない
 * お手本は 分かち書き（「次は どの タスクを」）だが、打つ ときに 空白は 要らない。
 * 「、」「。」の 打ち忘れも 落とさない（`normalizeReading` が 落とす 記号）。
 * ねらいは 文を 正しく 書けるか で、記号の 位置では ない。
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

/** 判定に 要る もの（1文ぶん）。 */
export interface TypingTarget {
  /** お手本（表記の まま・かなへ 倒した 形・長音を 開いた 形）と 別解の 形。 */
  readonly forms: readonly string[];
  readonly furigana: FuriganaIndex;
  readonly sounds: SoundsIndex;
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
  const forms = [text, ...(options.accept ?? [])].flatMap((item) =>
    formsOf(item, options.furigana, sounds),
  );
  return { forms: [...new Set(forms)], furigana: options.furigana, sounds };
}

/** 入力の 形の どれかが、お手本の 形の どれかと 同じ（`prefix` なら 頭が 同じ）か。 */
function meets(target: TypingTarget, input: string, prefix: boolean): boolean {
  const inputs = formsOf(input, target.furigana, target.sounds);
  return inputs.some((form) =>
    target.forms.some((model) => (prefix ? model.startsWith(form) : model === form)),
  );
}

export function judgeTyping(target: TypingTarget, raw: string): TypingResult {
  const input = raw.trim();
  if (normalizeReading(input) && meets(target, input, false)) return { ok: true };
  // 頭から 1字ずつ 縮めて、お手本の 頭と 合う いちばん 長い ところを 探す
  for (let end = input.length; end > 0; end -= 1) {
    const head = input.slice(0, end);
    if (normalizeReading(head) && meets(target, head, true)) {
      // 見ない 記号（空白・句読点）で 終わって いたら 落とす——「でた 」までは、では 読みにくい
      return { ok: false, matched: head.replace(/[\s　、。，．,.]+$/, "") };
    }
  }
  return { ok: false, matched: "" };
}
