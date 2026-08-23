/**
 * 学習用サイト（public/gakushu/nextmake）の中身を機械で確かめる。
 *
 * この教材は React ではなく **1枚の静的なページ**なので、アプリの検査
 *（`npm run lint:content`）が中身を見ない——あれは `content/**` と `src/**` と
 * スライドの組版原稿しか歩かない。見ないぶん、ここで見る。
 * 型は `tests/romaji_tool.test.ts`（先にできた1枚もの教材）と同じ。
 *
 * 見るのは6つ:
 *  1. **読めない漢字が残っていないか**（規律2）— アプリと同じ `uncoveredKanji` で。
 *  2. **禁止語・国名**（規律1・規律9）— アプリと同じ関数で。
 *  3. **どのレベルも空でないか** — 切りかえた先が白い画面になるのがいちばん困る。
 *  4. **やさしい日本語が やさしいか** — 1文の長さと 分かち書き。
 *  5. **生成物が古くないか** — 読み辞書とことばの辞典は教材データが正で、
 *     `public/` にあるのは写し。正を直して焼き忘れると、画面だけ古くなる。
 *  6. **画像が実在するか** — 参照だけ残って画像が無いと、枠だけの穴になる。
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_LEARNER_WORDS } from "@/content/schema";
import { checkCountryNamesInTexts } from "@/lib/content-checks";
import { buildFuriganaIndex, uncoveredKanji } from "@/lib/text/furigana";
// 静的ページの素の JS モジュール（tsconfig の allowJs で そのまま 読める）
import { PAGES } from "../public/gakushu/nextmake/data/pages/index.js";
import { UI } from "../public/gakushu/nextmake/data/ui.js";
import { FURIGANA } from "../public/gakushu/nextmake/data/furigana.generated.js";
import { GLOSSARY } from "../public/gakushu/nextmake/data/glossary.generated.js";
// 文の集めかたは 生成スクリプトと 同じ関数を 使う（2つに割るとズレる）
import {
  japaneseTexts,
  textsOf,
  bundleTextsOf,
  imagePaths,
  LEVELS,
} from "../scripts/lib/gakushu_texts.mjs";
import {
  buildFurigana,
  buildGlossary,
  furiganaSource,
  glossarySource,
  FURIGANA_PATH,
  GLOSSARY_PATH,
} from "../scripts/gen_gakushu.mjs";

const ROOT = join(import.meta.dirname, "..");
const SITE = join(ROOT, "public", "gakushu", "nextmake");

/** ページの並び。**ナビの並びでもある**ので、変えると学習者の道順が変わる。 */
const EXPECTED_ORDER = [
  "home",
  "about",
  "vietnam",
  "services",
  "making",
  "cambodia",
  "works",
  "dictionary",
];

/** 日本語の全文（やさしい日本語 ＋ 日本語 ＋ 画面の字）。 */
const JA = japaneseTexts(PAGES, UI);

describe("ページの 骨組み", () => {
  it("8ページが この 順で 並ぶ（ナビの 順でもある）", () => {
    expect(PAGES.map((page: { id: string }) => page.id)).toEqual(EXPECTED_ORDER);
  });

  it("お問い合わせの ページは 置かない（送る ものが 無い フォームを 作らない）", () => {
    const navs = PAGES.map((page: { nav: string }) => page.nav).join(" ");
    expect(navs).not.toContain("問い合わせ");
  });

  it("id が 重ならない", () => {
    const ids = PAGES.map((page: { id: string }) => page.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("どの ページにも 見出しと 中身が ある", () => {
    for (const page of PAGES as { id: string; title: unknown; blocks: unknown[] }[]) {
      expect(page.title, page.id).toBeTruthy();
      expect(page.blocks.length, page.id).toBeGreaterThan(0);
    }
  });
});

describe("3つの レベルが そろって いる", () => {
  /*
   * 切りかえた 先が 空だと、学習者には **白い 画面**しか 見えない。
   * 英語は ボタンを 出して いないが、中身は 今から 書いて おく（後で 出す ため）。
   */
  it.each(LEVELS)("%s の 文が 1つも 欠けて いない", (level) => {
    const own = textsOf(PAGES, level);
    const base = textsOf(PAGES, "n4");
    expect(own.length).toBe(base.length);
    expect(own.filter((text: string) => !text.trim())).toEqual([]);
  });

  it("やさしい日本語と 日本語は 別の 文に なって いる（写しでは ない）", () => {
    const n4 = textsOf(PAGES, "n4");
    const n3 = textsOf(PAGES, "n3");
    const same = n4.filter((text: string, at: number) => text === n3[at]);
    // 固有名詞や 短い 見出しは 同じで よい。半分より 多く 同じなら 書き分けて いない
    expect(same.length).toBeLessThan(n4.length / 2);
  });
});

describe("学習者に 出しては いけない ことば", () => {
  it("禁止語（規律1）が 1つも 無い", () => {
    const hits: string[] = [];
    for (const text of JA) {
      for (const word of FORBIDDEN_LEARNER_WORDS) {
        if (text.includes(word)) hits.push(`「${word}」: ${text}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("国名「タイ」を つかって いない（規律9）", () => {
    /*
     * 判定は アプリと **同じ関数**を 呼ぶ。ここで 正規表現を 書き写すと、
     * 規律が 変わった とき 片方だけ 古いまま 残る。
     * ベトナム・カンボジアなど 他の 国名は 出して よい（2026-08-23 の 是正）。
     */
    expect(checkCountryNamesInTexts("public/gakushu/nextmake", JA)).toEqual([]);
    expect(checkCountryNamesInTexts("public/gakushu/nextmake", textsOf(PAGES, "en"))).toEqual([]);
  });

  it("大きな 数は「万」を つかわず 桁区切りで 書く", () => {
    // 「1.5万人」は 量が 伝わらない（制約 2026-08-17）。「15,000人」と 書く
    const hits = JA.filter((text: string) => /[0-9０-９]\s*万/u.test(text));
    expect(hits).toEqual([]);
  });
});

describe("読めない漢字が 残って いない（規律2）", () => {
  it("学習者が 読む 文の 漢字は、ぜんぶ 読み辞書で 覆えて いる", () => {
    const index = buildFuriganaIndex(FURIGANA as [string, string][]);
    const missing = new Map<string, string>();
    for (const text of JA) {
      for (const char of uncoveredKanji(text, index)) {
        if (!missing.has(char)) missing.set(char, text);
      }
    }
    // 足りない字と、どの文に出たかを そのまま 直せる 形で 出す
    expect([...missing.entries()].map(([char, text]) => `${char} … ${text}`)).toEqual([]);
  });

  it("読み辞書の 見出し語は かならず 漢字で 始まる", () => {
    /*
     * `annotateRuby` は **漢字の 位置でしか 辞書を 引かない**ので、
     * 「お願い」のような 見出し語は 永久に 当たらない（辞書だけ 太る）。
     */
    const bad = (FURIGANA as [string, string][]).filter(
      ([surface]) => !/^[㐀-鿿々]/u.test(surface),
    );
    expect(bad).toEqual([]);
  });

  it("読みは ひらがなだけ", () => {
    const bad = (FURIGANA as [string, string][]).filter(
      ([, reading]) => !/^[ぁ-ゖーゔ・\s]+$/u.test(reading),
    );
    expect(bad).toEqual([]);
  });
});

describe("やさしい日本語が やさしい", () => {
  /*
   * 見るのは **書き分けた 文だけ**（`bundleTextsOf`）。会社の 原文（SLOGAN・MISSION）や
   * 住所は どの レベルでも 同じ 素の 文字列で 持って いて、**書きかえない**と 決めた
   *（学習者が サイトで 見つけた 文と、先生が 話す 文が ちがう ものに なるため）。
   */
  /** 「。」で切って、1文ずつにする。 */
  function sentences(text: string): string[] {
    return text
      .split(/(?<=。)/u)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  it("1文が 長すぎない", () => {
    /*
     * 設計書の めやすは 40〜50字。読点で 息を 継げる ぶんを 見て 60字を 上限に する。
     * 長い 1文は、読めない 漢字より 先に 学習者を 止める。
     */
    const long = bundleTextsOf(PAGES, "n4")
      .flatMap(sentences)
      .filter((s: string) => s.length > 60);
    expect(long).toEqual([]);
  });

  it("分かち書きに なって いる（長い文に 空白が ある）", () => {
    const glued = bundleTextsOf(PAGES, "n4")
      .flatMap(sentences)
      .filter((s: string) => s.length >= 24 && !s.includes(" "));
    expect(glued).toEqual([]);
  });
});

describe("ことばの辞典", () => {
  it("語が ある", () => {
    expect(GLOSSARY.length).toBeGreaterThan(20);
  });

  it("どの 語にも 読みと 意味が ある", () => {
    const broken = (GLOSSARY as { term: string; reading: string; meaning: string }[]).filter(
      (item) => !item.term || !item.reading || !item.meaning,
    );
    expect(broken).toEqual([]);
  });

  it("本文に 出て こない 語を 載せない（探して いる 語が 埋もれる）", () => {
    const haystack = [...JA, ...textsOf(PAGES, "en")].join("\n");
    const ghosts = (GLOSSARY as { term: string }[])
      .map((item) => item.term)
      .filter((term) => !haystack.includes(term));
    expect(ghosts).toEqual([]);
  });
});

describe("生成物が 古くない（正は 教材データ）", () => {
  /*
   * 読み辞書と ことばの辞典の 正は `content/links/nextmake_gakushu_site.json` と
   * `content/vocab/vocabulary.json`。`public/` にあるのは **写し**。
   * 正を 直して 焼き忘れると、先生が 直した はずの ふりがなが 画面に 出ない。
   */
  it("読み辞書は `node scripts/gen_gakushu.mjs` の 出力と 同じ", async () => {
    const onDisk = await readFile(FURIGANA_PATH, "utf8");
    expect(onDisk).toBe(furiganaSource(buildFurigana()));
  });

  it("ことばの辞典は `node scripts/gen_gakushu.mjs` の 出力と 同じ", async () => {
    const onDisk = await readFile(GLOSSARY_PATH, "utf8");
    expect(onDisk).toBe(glossarySource(buildGlossary(PAGES, UI)));
  });
});

describe("画像", () => {
  it("ページが 指して いる 画像は ぜんぶ 実在する", () => {
    const missing = imagePaths(PAGES).filter(
      (path: string) => !existsSync(join(ROOT, "public", path.replace(/^\//, ""))),
    );
    expect(missing).toEqual([]);
  });

  it("出どころの 覚書が ある（会社の 素材を 借りて いる ため）", () => {
    expect(existsSync(join(SITE, "img", "SOURCES.md"))).toBe(true);
  });
});
