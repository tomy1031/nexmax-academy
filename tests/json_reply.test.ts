import { describe, expect, it } from "vitest";
import { buildRetryNote, extractJsonText, parseJsonReply } from "@/lib/ai/json-reply";

/**
 * AI の返事から JSON を取り出す
 *
 * Codex には Gemini の responseSchema のような「形を機械で縛る」仕組みが無い。
 * 受け取る側が頑丈でないと、教材づくりが返事のご機嫌で止まる。
 */

describe("素直な返事", () => {
  it("JSON だけの返事をそのまま読む", () => {
    expect(parseJsonReply('{"title":"あさかい"}')).toEqual({ title: "あさかい" });
  });

  it("配列でも読む", () => {
    expect(parseJsonReply("[1, 2, 3]")).toEqual([1, 2, 3]);
  });

  it("前後の空白と改行は気にしない", () => {
    expect(parseJsonReply('\n\n  {"a":1}  \n')).toEqual({ a: 1 });
  });
});

describe("よくある崩れ方を吸収する", () => {
  it("```json の囲みを外す", () => {
    expect(parseJsonReply('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("言語名なしのコードフェンスも外す", () => {
    expect(parseJsonReply('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("前置きが付いても読む", () => {
    expect(parseJsonReply('はい、作りました:\n{"a":1}')).toEqual({ a: 1 });
  });

  it("後書きが付いても読む", () => {
    expect(parseJsonReply('{"a":1}\n\n必要なら直します。')).toEqual({ a: 1 });
  });

  it("前置きと後書きの両方でも読む", () => {
    expect(parseJsonReply('できました。\n\n{"a":1}\n\nいかがでしょうか。')).toEqual({ a: 1 });
  });
});

describe("文字列の中の括弧に釣られない", () => {
  it("値に } が入っていても、正しい位置で閉じる", () => {
    const raw = '{"text":"ここで } を使います","next":2}';
    expect(parseJsonReply(raw)).toEqual({ text: "ここで } を使います", next: 2 });
  });

  it("値に { が入っていても、深さを数え間違えない", () => {
    const raw = '{"text":"{ を使います","next":2}';
    expect(parseJsonReply(raw)).toEqual({ text: "{ を使います", next: 2 });
  });

  it("エスケープされた引用符をまたいで数えられる", () => {
    const raw = '{"text":"かれは \\"はい\\" と言った","next":2}';
    expect(parseJsonReply(raw)).toEqual({ text: 'かれは "はい" と言った', next: 2 });
  });

  it("入れ子のオブジェクトを最後まで取る", () => {
    const raw = '{"a":{"b":{"c":1}},"d":2}';
    expect(parseJsonReply(raw)).toEqual({ a: { b: { c: 1 } }, d: 2 });
  });
});

describe("直せない崩れは null にする（半端な結果を通さない）", () => {
  it("途中で切れている返事", () => {
    expect(parseJsonReply('{"a":1,"b":')).toBeNull();
    expect(extractJsonText('{"beats":[{"panel":1,')).toBeNull();
  });

  it("閉じ括弧が足りない", () => {
    expect(parseJsonReply('{"a":{"b":1}')).toBeNull();
  });

  it("JSON がひとつも無い返事", () => {
    expect(parseJsonReply("すみません、作れませんでした。")).toBeNull();
  });

  it("空の返事", () => {
    expect(parseJsonReply("")).toBeNull();
    expect(parseJsonReply("   \n  ")).toBeNull();
  });

  it("括弧はあるが JSON として壊れている", () => {
    expect(parseJsonReply("{これは JSON ではありません}")).toBeNull();
  });
});

describe("実物の返事で読める（2026-08-07 実測）", () => {
  it("Codex が返した4コマの骨組みを読む", () => {
    const raw = `{
  "title": "先輩、教えてください",
  "logline": "ニャムが質問のしかたを学ぶ。",
  "teachingPoint": "試したことと疑問点を短く伝える。",
  "beats": [
    { "panel": 1, "what": "ニャムの作業が止まる。", "why": "質問が必要な場面を示す。" },
    { "panel": 2, "what": "ニャムは長く説明する。", "why": "きんちょうする様子を見せる。" },
    { "panel": 3, "what": "ヘンディが努力をほめる。", "why": "安心して聞ける空気を作る。" },
    { "panel": 4, "what": "ニャムが疑問点を短く聞く。", "why": "よい質問の形を覚える。" }
  ],
  "newVocab": [
    { "term": "疑問点", "reading": "ぎもんてん", "meaning": "よくわからないところ" }
  ]
}`;
    const parsed = parseJsonReply(raw) as { beats: unknown[]; title: string };
    expect(parsed.title).toBe("先輩、教えてください");
    expect(parsed.beats).toHaveLength(4);
  });
});

describe("直してほしいの文面", () => {
  it("問題と期待する形の両方を含める", () => {
    const note = buildRetryNote("beats が 3つでした（4つ必要）", '{"beats": [...]}');
    expect(note).toContain("beats が 3つでした");
    expect(note).toContain('{"beats": [...]}');
    // 形をもう一度見せるのが要点。zod のパス表記だけだとモデルが直しどころを誤る
    expect(note).toContain("下の形だけ");
  });
});
