/**
 * 読み辞書エントリの構造検査（furigana-checks.ts）の回帰テスト。
 *
 * 事例はぜんぶ実際に学習者へ届いたまちがい（2026-08-25 #197 / 08-28 #233 /
 * 08-30 監査 / 09-01 全量照合）。ここが緑のまま同じ型が再発したら、
 * 検査のほうが壊れている。
 */
import { describe, expect, it } from "vitest";
import {
  checkFuriganaEntries,
  checkFuriganaEntry,
  foldKana,
} from "../src/lib/text/furigana-checks";
import { AI_KANJI_FURIGANA } from "../src/lib/ai-kanji";
import { FEEDBACK_FURIGANA } from "../src/lib/feedback";
import { JUDGE_FURIGANA } from "../src/components/meeting/ui-furigana";
import { PERSONALITY_RESULT_READINGS } from "../src/content/personality";

describe("checkFuriganaEntry", () => {
  it("先頭がかな・数字の見出しは死にエントリ（絶対に当たらない）", () => {
    // 2026-09-01 の監査で 4件が実在した型
    expect(checkFuriganaEntry("お願い", "おねがい")?.kind).toBe("dead");
    expect(checkFuriganaEntry("お時間", "おじかん")?.kind).toBe("dead");
    expect(checkFuriganaEntry("1年間", "いちねんかん")?.kind).toBe("dead");
  });

  it("見出しのかな部分が読みに無いと送りがな落ち", () => {
    // 「考え→かんが」は画面で「かんがます」と読めた（2026-08-30）
    expect(checkFuriganaEntry("考え", "かんが")?.kind).toBe("misaligned");
    // 「出し→で」の型（かなの「し」が読みに無い）
    expect(checkFuriganaEntry("出し", "で")?.kind).toBe("misaligned");
    expect(checkFuriganaEntry("急がないで", "いそがない")?.kind).toBe("misaligned");
  });

  it("正しいエントリは通る（送りがな込み・数字はさみ・カタカナ倒し）", () => {
    expect(checkFuriganaEntry("考え", "かんがえ")).toBeNull();
    expect(checkFuriganaEntry("出し", "だし")).toBeNull();
    expect(checkFuriganaEntry("急がないで", "いそがないで")).toBeNull();
    expect(checkFuriganaEntry("報連相", "ほうれんそう")).toBeNull();
    // 数字・記号は読みに現れても現れなくてもよい（「第1回→だいいっかい」）
    expect(checkFuriganaEntry("第1回", "だいいっかい")).toBeNull();
    // 見出しのカタカナは、ひらがなの読みと同一視する
    expect(checkFuriganaEntry("消しゴム", "けしごむ")).toBeNull();
  });

  it("読みに空白があってもかな部分の照合は崩れない", () => {
    // ステージ名の読みは空白を含められる（schema の hiragana が許す）
    expect(checkFuriganaEntry("報連相：報告", "ほうれんそう ほうこく")).toBeNull();
  });
});

describe("checkFuriganaEntries", () => {
  it("同じ表記に別の読みがあると衝突（並び順で勝ち負けが変わるため）", () => {
    const problems = checkFuriganaEntries([
      ["出", "で"],
      ["出", "だ"],
    ]);
    expect(problems.map((p) => p.kind)).toContain("conflict");
  });

  it("同じ表記・同じ読みの重複は衝突にしない", () => {
    expect(
      checkFuriganaEntries([
        ["会社", "かいしゃ"],
        ["会社", "かいしゃ"],
      ]),
    ).toEqual([]);
  });
});

describe("コード側の読み台帳（触ったら この検査を通ること）", () => {
  it("AI_KANJI_FURIGANA は壊れたエントリを持たない", () => {
    expect(checkFuriganaEntries(AI_KANJI_FURIGANA)).toEqual([]);
  });

  it("FEEDBACK_FURIGANA は壊れたエントリを持たない", () => {
    expect(checkFuriganaEntries(FEEDBACK_FURIGANA)).toEqual([]);
  });

  it("JUDGE_FURIGANA（ミーティング画面の読み）は壊れたエントリを持たない", () => {
    expect(checkFuriganaEntries(JUDGE_FURIGANA.entries)).toEqual([]);
  });

  it("PERSONALITY_RESULT_READINGS は送りがな落ちを持たない", () => {
    // 診断の ReadingsRuby は位置任意（かな頭でも当たる）ので、死にエントリ検査は当てない。
    // 送りがな整合だけは同じ理屈で効く——読みが欠ければ画面でも欠ける。
    const misaligned = PERSONALITY_RESULT_READINGS.flatMap((reading) => {
      const problem = checkFuriganaEntry(reading.text, reading.reading);
      return problem && problem.kind === "misaligned" ? [problem] : [];
    });
    expect(misaligned).toEqual([]);
  });
});

describe("foldKana", () => {
  it("カタカナをひらがなへ倒し、長音・記号は残す", () => {
    expect(foldKana("サーバ")).toBe("さーば");
    expect(foldKana("ほうれんそう ほうこく")).toBe("ほうれんそう ほうこく");
  });
});
