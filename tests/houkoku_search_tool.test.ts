import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_LEARNER_WORDS } from "@/content/schema";
import { checkCountryNamesInTexts } from "@/lib/content-checks";
import { KANJI } from "@/lib/text/furigana";
import { LINK_ANSWER_PROMPTS } from "@/content/link-answers";

/**
 * 調査（リサーチ）の ツール（public/tools/hourensou/houkoku_search.*）の 文言を 機械で 見る。
 *
 * この 教材は React では なく **1枚の 静的な ページ**なので、アプリの 検査
 *（`npm run lint:content`）が 中身を 見ない。見ない ぶん、ここで 見る。
 *
 * 見るのは 3つ:
 *  1. **読めない 漢字が 残って いないか**（規律2 と 同じ 検査を、同じ 関数で）
 *  2. **答えを ばらして いないか** — 正しい 並び（社長・部長・課長・社員）を
 *     例や 語群に 混ぜると、調べる 理由が 消える（設計01 P2・P4）。
 *     藤木さんの「取締役」だけは リスニングで もう 出て いる ので 置いてよい。
 *  3. 禁止語・国名（規律1・規律9）
 */

/** window に 代入する 形の データを、テストから 読む。 */
function loadData(): Record<string, unknown> {
  const source = readFileSync(
    join("public", "tools", "hourensou", "houkoku_search.data.js"),
    "utf8",
  );
  const win: Record<string, unknown> = {};
  new Function("window", source)(win);
  return win.SEARCH_DATA as Record<string, unknown>;
}

const DATA = loadData();

/** 学習者が 読む 文を ぜんぶ 集める（ルビ記法の まま）。 */
function learnerTexts(): string[] {
  const texts: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") texts.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(DATA);
  // id（英数字）は 画面に 出ない
  return texts.filter((text) => text !== DATA.id);
}

/**
 * ルビが 付く ところを **取り除いた** 残り（画面の rubyfy と 同じ 見方）。
 *
 * 教材データの 読み辞書とは 当たり方が ちがう。あちらは 辞書を 文ぜんたいに 当てるが、
 * この ページの rubyfy は `{…|…}` と 書いた **その 場所だけ**を ルビに する。
 * だから 同じ 漢字が 1文に 2回 出て 片方に 書き忘れると、辞書の モデルでは
 * 見つからない（「{出|だ}す ボタンを おしたら 出せます」が 通って しまう）。
 */
function outsideRuby(text: string): string {
  return text.replace(/\{[^{}|]+\|[^{}|]+\}/g, "");
}

/** ルビ記法を はずした、画面に 出る ただの 文字。 */
function plain(text: string): string {
  return text.replace(/\{([^{}|]+)\|[^{}|]+\}/g, "$1");
}

describe("調査ツールの 文言", () => {
  it("読めない 漢字が 残って いない（規律2）", () => {
    const bare: string[] = [];
    for (const text of learnerTexts()) {
      const missing = [...outsideRuby(text)].filter((char) => KANJI.test(char));
      if (missing.length > 0) bare.push(`${missing.join("")} ← 「${plain(text)}」`);
    }
    expect(bare).toEqual([]);
  });

  it("答え（正しい 並び）を 先に ばらして いない", () => {
    const all = learnerTexts().map(plain).join("\n");
    for (const rank of ["社長", "部長", "課長", "社員", "係長", "主任"]) {
      expect(all, `${rank} が ツールの 中に 出て いる`).not.toContain(rank);
    }
    // 藤木さんの 役は リスニングで もう 出て いる ので、手がかりとして 置く
    expect(all).toContain("取締役");
  });

  it("学習者に 向けた 禁止語が 無い（規律1）", () => {
    const all = learnerTexts().map(plain).join("\n");
    for (const word of FORBIDDEN_LEARNER_WORDS) {
      expect(all, `禁止語「${word}」が ある`).not.toContain(word);
    }
  });

  it("使わない 国名が 無い（規律9）", () => {
    const findings = checkCountryNamesInTexts(
      "public/tools/hourensou/houkoku_search.data.js",
      learnerTexts().map(plain),
    );
    expect(findings.map((finding) => finding.message)).toEqual([]);
  });

  it("行の 数の 決めごとが そろって いる", () => {
    const rank = DATA.rank as { min: number; max: number; start: number };
    expect(rank.min).toBeGreaterThan(0);
    expect(rank.start).toBeGreaterThanOrEqual(rank.min);
    expect(rank.max).toBeGreaterThanOrEqual(rank.start);
  });

  /*
   * 先生の 画面（`/admin/records`）は、この ツールの こたえの 問いを
   * `src/content/link-answers.ts` の 台帳から 引く。文が 2か所に ある ので、
   * **片方だけ 直すと 先生の 画面だけが 古い 問いを 出す**。ここで 突き合わせる。
   */
  describe("先生の 画面へ 送る こたえ", () => {
    const prompts = LINK_ANSWER_PROMPTS[DATA.id as string] ?? {};
    const fields = (DATA.compare as { fields: { id: string; label: string }[] }).fields;

    it("しつもんの 欄が ぜんぶ 台帳に ある（届いても 問いの 文が 無い 欄を 作らない）", () => {
      for (const field of fields) {
        expect(Object.keys(prompts), `${field.id} が 台帳に 無い`).toContain(field.id);
      }
      // ならべ替えた 階級の ぶんも 1つ 送る
      expect(Object.keys(prompts)).toContain("kaikyuu_order");
    });

    it("台帳の 問いの 文が、ツールの 文と 同じ（ルビを はずして くらべる）", () => {
      for (const field of fields) {
        expect(prompts[field.id]).toBe(plain(field.label));
      }
    });

    it("台帳に 余計な 欄が 無い（ツールが 送らない 問いを 先生に 見せない）", () => {
      const sent = new Set(["kaikyuu_order", ...fields.map((field) => field.id)]);
      expect(Object.keys(prompts).filter((id) => !sent.has(id))).toEqual([]);
    });
  });

  it("画面（HTML）に 日本語を 直接 書いて いない（文言は データ側に 置く）", () => {
    const html = readFileSync(join("public", "tools", "hourensou", "houkoku_search.html"), "utf8");
    // コメント（<!-- --> と /* */ と //）を 落としてから 見る
    const code = html
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    // 字の 範囲は エンジンと そろえる（別の 範囲を 書くと 検査だけ すり抜ける）
    const kana = code.match(/[぀-ヿ]+|[㐀-鿿々]+/g) ?? [];
    // 残ってよいのは 番号の 読み上げ（「ばんめ」）だけ
    expect(kana.filter((word) => word !== "ばんめ")).toEqual([]);
  });
});
