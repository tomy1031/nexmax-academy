import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readingMatches } from "../src/lib/text/normalize";
import {
  canAppendRomaji,
  romajiBackspace,
  romajiCandidates,
  romajiDisplay,
} from "../src/lib/text/romaji";

/**
 * 単語テストの よみは **ローマ字で 打つ**（PC。IME の 予測候補で 答え合わせ させない ため）。
 * だから「教材の よみが ぜんぶ 打てる」ことを、打ち方を 何通りも 作って 確かめる。
 */

type Word = { id: string; reading: string };
const WORDS: Word[] = JSON.parse(
  readFileSync(join(__dirname, "..", "content", "vocab", "vocabulary.json"), "utf8"),
).words;

/** 1文字ずつ 打つ（途中で 弾かれたら そこまで）。弾かれずに 最後まで 打てたか も 返す。 */
function typeAll(romaji: string): { raw: string; ok: boolean } {
  let raw = "";
  for (const key of romaji) {
    if (!canAppendRomaji(raw, key)) return { raw, ok: false };
    raw += key;
  }
  return { raw, ok: true };
}

function accepted(romaji: string, reading: string): boolean {
  const { raw, ok } = typeAll(romaji);
  return ok && romajiCandidates(raw).some((kana) => readingMatches(kana, reading));
}

/* ------------------------------------------------------------------ *
 * かな → ローマ字（テスト用に 打ち方を 作る）
 * ------------------------------------------------------------------ */

type Style = "hepburn" | "kunrei";

const BASE: Record<string, [hepburn: string, kunrei: string]> = {};
const rows: [string, string, string?][] = [
  ["あいうえお", ""],
  ["かきくけこ", "k"],
  ["がぎぐげご", "g"],
  ["さしすせそ", "s"],
  ["ざじずぜぞ", "z"],
  ["たちつてと", "t"],
  ["だぢづでど", "d"],
  ["なにぬねの", "n"],
  ["はひふへほ", "h"],
  ["ばびぶべぼ", "b"],
  ["ぱぴぷぺぽ", "p"],
  ["まみむめも", "m"],
  ["らりるれろ", "r"],
];
for (const [kana, head] of rows) {
  [..."aiueo"].forEach((v, i) => {
    const r = head + v;
    BASE[kana[i]!] = [r, r];
  });
}
Object.assign(BASE, {
  し: ["shi", "si"],
  ち: ["chi", "ti"],
  つ: ["tsu", "tu"],
  ふ: ["fu", "hu"],
  じ: ["ji", "zi"],
  ぢ: ["di", "di"],
  づ: ["du", "du"],
  や: ["ya", "ya"],
  ゆ: ["yu", "yu"],
  よ: ["yo", "yo"],
  わ: ["wa", "wa"],
  を: ["wo", "wo"],
  ー: ["-", "-"],
});

/** 小さい ゃゅょ・ぁぃぅぇぉ が 付く 2文字の 音。 */
const PAIRS: Record<string, [string, string]> = {
  しゃ: ["sha", "sya"],
  しゅ: ["shu", "syu"],
  しょ: ["sho", "syo"],
  しぇ: ["she", "sye"],
  ちゃ: ["cha", "tya"],
  ちゅ: ["chu", "tyu"],
  ちょ: ["cho", "tyo"],
  ちぇ: ["che", "tye"],
  じゃ: ["ja", "zya"],
  じゅ: ["ju", "zyu"],
  じょ: ["jo", "zyo"],
  じぇ: ["je", "zye"],
  てぃ: ["thi", "thi"],
  でぃ: ["dhi", "dhi"],
  ふぁ: ["fa", "fa"],
  ふぃ: ["fi", "fi"],
  ふぇ: ["fe", "fe"],
  ふぉ: ["fo", "fo"],
  うぃ: ["wi", "wi"],
  うぇ: ["we", "we"],
};
const SMALL_Y: Record<string, string> = { ゃ: "a", ゅ: "u", ょ: "o" };
const SMALL_V: Record<string, string> = { ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o" };

/** かなを 音の かたまりに 分けて、それぞれの ローマ字を 返す。 */
function syllables(kana: string, style: Style): string[] {
  const s = style === "hepburn" ? 0 : 1;
  const out: string[] = [];
  const chars = [...kana.replace(/\s/g, "")];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    const pair = c + (chars[i + 1] ?? "");
    if (PAIRS[pair]) {
      out.push(PAIRS[pair][s]);
      i++;
      continue;
    }
    const next = chars[i + 1];
    if (next && SMALL_Y[next] && BASE[c]) {
      // きゃ → kya（i を y に）
      out.push(BASE[c][s].slice(0, -1) + "y" + SMALL_Y[next]);
      i++;
      continue;
    }
    if (SMALL_V[c]) {
      out.push("x" + SMALL_V[c]);
      continue;
    }
    if (c === "ん" || c === "っ") {
      out.push(c);
      continue;
    }
    const base = BASE[c];
    if (!base) throw new Error(`テスト側の 表に ない かな: ${c}（${kana}）`);
    out.push(base[s]);
  }
  return out;
}

/**
 * ん の 打ち方は 3通り:
 *  - "safe"   … いつも nn
 *  - "short"  … 子音の 前は n、母音・y・な行の 前と 語末は nn
 *  - "casual" … な行の 前も n 1つ（konnichiha）。Mac の IME や タイピングゲームの 打ち方
 */
type NStyle = "safe" | "short" | "casual";

function toRomaji(kana: string, style: Style, n: NStyle): string {
  const parts = syllables(kana, style);
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    const next = parts[i + 1] ?? "";
    if (p === "っ") {
      // 次の 子音を 重ねる（ch は tch）
      out += next.startsWith("ch") ? "t" : (next[0] ?? "");
      continue;
    }
    if (p === "ん") {
      const head = next[0] ?? "";
      if (n === "safe" || !head || "aiueoy".includes(head)) out += "nn";
      else if (head === "n") out += n === "casual" ? "n" : "nn";
      else out += "n";
      continue;
    }
    out += p;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 教材の よみが ぜんぶ 打てる
 * ------------------------------------------------------------------ */

describe("ローマ字 → ひらがな（教材の よみ ぜんぶ）", () => {
  it("単語テストの ことばが 読み込めている", () => {
    expect(WORDS.length).toBeGreaterThan(500);
  });

  for (const style of ["hepburn", "kunrei"] as const) {
    for (const n of ["safe", "short", "casual"] as const) {
      it(`${style} ・ ん=${n} で 打っても 当たる`, () => {
        const failed = WORDS.filter((w) => !accepted(toRomaji(w.reading, style, n), w.reading)).map(
          (w) => `${w.reading} ← ${toRomaji(w.reading, style, n)}`,
        );
        expect(failed).toEqual([]);
      });
    }
  }
  /*
   * 教材の `romaji` 欄は 読む ための 表記（genin・VR・offshore）で、IME の 打ち方では ない。
   * IME でも「genin」は げにん に なるので、ここでは 照合しない。
   */
});

/* ------------------------------------------------------------------ *
 * 打ち方の 細かい 決まり
 * ------------------------------------------------------------------ */

describe("ローマ字 → ひらがな（決まり）", () => {
  it("ヘボン式・訓令式・外来語の 音", () => {
    expect(romajiCandidates("shigoto")).toEqual(["しごと"]);
    expect(romajiCandidates("sigoto")).toEqual(["しごと"]);
    expect(romajiCandidates("tsukue")).toEqual(["つくえ"]);
    expect(romajiCandidates("kyaku")).toEqual(["きゃく"]);
    expect(romajiCandidates("mi-thingu")).toEqual(["みーてぃんぐ"]);
    expect(romajiCandidates("purojekuto")).toEqual(["ぷろじぇくと"]);
  });

  it("っ は 子音を 重ねる／xtu でも 打てる", () => {
    expect(romajiCandidates("kitte")).toEqual(["きって"]);
    expect(romajiCandidates("matcha")).toEqual(["まっちゃ"]);
    expect(romajiCandidates("kixtute")).toEqual(["きって"]);
  });

  it("ん: nn・n'・子音の 前の n・語末の n", () => {
    expect(romajiCandidates("kanji")).toEqual(["かんじ"]);
    expect(romajiCandidates("kann")).toEqual(["かん"]);
    expect(romajiCandidates("kan")).toEqual(["かん"]);
    expect(romajiCandidates("kan'i")).toEqual(["かんい"]);
    expect(romajiCandidates("kani")).toEqual(["かに"]);
  });

  it("nn＋母音は 2通りに 読み、どちらでも 判定できる（IME どうしの ちがい）", () => {
    expect(romajiCandidates("konnichiha")).toEqual(["こんいちは", "こんにちは"]);
    expect(romajiCandidates("gennin")).toEqual(["げんいん", "げんにん"]);
    // 画面に 出すのは 先頭（nn → ん）
    expect(romajiDisplay("konni")).toBe("こんい");
  });

  it("打ちかけは 英字の まま 見せ、決定の 候補には しない", () => {
    expect(romajiDisplay("kaisy")).toBe("かいsy");
    expect(romajiCandidates("kaisy")).toEqual([]);
    expect(romajiDisplay("ka")).toBe("か");
    expect(romajiDisplay("kan")).toBe("かn");
  });

  it("読めない 字は 入れない", () => {
    expect(canAppendRomaji("k", "t")).toBe(false);
    expect(canAppendRomaji("", "1")).toBe(false);
    expect(canAppendRomaji("", "'")).toBe(false);
    expect(canAppendRomaji("k", "k")).toBe(true);
    expect(canAppendRomaji("ka", "n")).toBe(true);
  });

  it("Backspace は かな 1つを 消す", () => {
    expect(romajiBackspace("kaishi")).toBe("kai");
    expect(romajiDisplay(romajiBackspace("kaishi"))).toBe("かい");
    expect(romajiBackspace("kais")).toBe("kai");
    expect(romajiBackspace("kyaku")).toBe("kya");
    expect(romajiBackspace("")).toBe("");
    // っ・ん は 英字に 崩さない（IME と 同じく「きっ」「かん」が 残る）
    expect(romajiDisplay(romajiBackspace("kitte"))).toBe("きっ");
    expect(romajiDisplay(romajiBackspace("kka"))).toBe("っ");
    expect(romajiDisplay(romajiBackspace("kanji"))).toBe("かん");
    // 消したあとも 打ち続けられる
    expect(romajiCandidates(romajiBackspace("kitte") + "te")).toEqual(["きって"]);
  });

  it("IME で ふつうに 打てる 綴り", () => {
    for (const [romaji, kana] of [
      ["kwa", "くぁ"],
      ["gwa", "ぐぁ"],
      ["tha", "てゃ"],
      ["dho", "でょ"],
      ["wha", "うぁ"],
      ["whi", "うぃ"],
      ["hwa", "ふぁ"],
      ["yi", "い"],
      ["lye", "ぇ"],
      ["xyi", "ぃ"],
    ] as const) {
      expect(romajiCandidates(romaji)).toEqual([kana]);
    }
  });

  it("nn＋母音が 長く 続いても 固まらない", () => {
    const raw = "nna".repeat(30);
    const start = performance.now();
    canAppendRomaji(raw, "q");
    romajiDisplay(raw);
    expect(performance.now() - start).toBeLessThan(200);
  });
});
