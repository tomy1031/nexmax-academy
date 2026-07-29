/**
 * ルビ合成エンジン（絶対規律2の実装）
 *
 * コンテンツはプレーンテキスト＋読み辞書（furigana）で持ち、ルビHTMLは手書きしない。
 * 表示時にこのエンジンがテキストと辞書を突き合わせてルビ区間を切り出す。
 *
 * 返すのは HTML 文字列ではなくセグメント配列。描画は
 * `src/components/ruby-text.tsx` が担当する（dangerouslySetInnerHTML を使わないため）。
 */

import type { furiganaEntrySchema } from "@/content/schema";
import type { z } from "zod";

export type FuriganaEntry = z.infer<typeof furiganaEntrySchema>;

/** ルビなしの素通し区間。 */
export interface PlainSegment {
  kind: "plain";
  text: string;
}

/** ルビを振る区間。base に reading をかぶせる。 */
export interface RubySegment {
  kind: "ruby";
  base: string;
  reading: string;
}

export type Segment = PlainSegment | RubySegment;

/**
 * 辞書を最長一致用に整列する。
 *
 * スキーマは「複合語を先に置く」運用だが、著者の並び順に依存すると
 * 「挨拶」が「挨拶回り」より先にある辞書で短い方に食われる。
 * ここで表記の長い順に並べ替えて、並び順に関係なく最長一致を保証する
 * （同じ長さなら著者の順序を保つ安定ソート）。
 */
function sortByLongest(dict: readonly FuriganaEntry[]): FuriganaEntry[] {
  return dict
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => b.entry[0].length - a.entry[0].length || a.index - b.index)
    .map(({ entry }) => entry);
}

/**
 * プレーンテキストと読み辞書からルビ区間を切り出す。
 *
 * - 左から走査し、各位置で最長一致するエントリを1つ採用する
 * - 一致した語は出現するたびに毎回ルビを振る（N5〜N3学習者向けの既定）
 * - 辞書が空、または一致なしなら plain 1本を返す
 */
export function synthesizeRuby(text: string, dict?: readonly FuriganaEntry[]): Segment[] {
  if (!text) return [];
  const entries = dict && dict.length > 0 ? sortByLongest(dict) : [];
  if (entries.length === 0) return [{ kind: "plain", text }];

  const segments: Segment[] = [];
  let buffer = "";
  let i = 0;

  const flush = () => {
    if (buffer) {
      segments.push({ kind: "plain", text: buffer });
      buffer = "";
    }
  };

  while (i < text.length) {
    const hit = entries.find(([base]) => base.length > 0 && text.startsWith(base, i));
    if (hit) {
      flush();
      segments.push({ kind: "ruby", base: hit[0], reading: hit[1] });
      i += hit[0].length;
    } else {
      buffer += text[i];
      i += 1;
    }
  }
  flush();

  return segments;
}

/** ルビを取り除いた素のテキスト（読み上げ・検索・比較用）。 */
export function stripRuby(segments: readonly Segment[]): string {
  return segments.map((s) => (s.kind === "ruby" ? s.base : s.text)).join("");
}
