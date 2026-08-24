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

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_LEARNER_WORDS } from "@/content/schema";
import { checkCountryNamesInTexts } from "@/lib/content-checks";
import { annotateRuby, buildFuriganaIndex, uncoveredKanji } from "@/lib/text/furigana";
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
import { buildFurigana, buildGlossary } from "../scripts/gen_gakushu.mjs";

const ROOT = join(import.meta.dirname, "..");
const SITE = join(ROOT, "public", "gakushu", "nextmake");

/** ページの並び。**ナビの並びでもある**ので、変えると学習者の道順が変わる。 */
const EXPECTED_ORDER = [
  "home",
  "about",
  "cambodia",
  "group",
  "services",
  "making",
  "works",
  "dictionary",
];

/** 日本語の全文（やさしい日本語 ＋ 日本語 ＋ 画面の字）。 */
const JA = japaneseTexts(PAGES, UI);

/** サイト専用の 読み辞書の **正**（生成物では なく 教材データの ほう）。 */
const LINK_FURIGANA: [string, string][] = JSON.parse(
  readFileSync(join(ROOT, "content", "links", "nextmake_gakushu_site.json"), "utf8"),
).furigana;

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
    /*
     * **ことばの辞典の 語釈も 数える。**
     *
     * ここを ページの 本文だけに して いた ため、辞典の ページに 裸の 漢字が
     * 10字 出て いるのに 検査は 通って いた（2026-08-24 実発生）。
     * 語釈は ことばの正から 来るので、サイトの 読み辞書が 覆って いるとは
     * 限らない——1字の 見出し語は ことばの正から 借りない 決まりに した ぶん、
     * なおさら ここで 見る 必要が ある。
     */
    const shown = [...JA, ...GLOSSARY.flatMap((word) => [word.term, word.meaning])];
    for (const text of shown) {
      for (const char of uncoveredKanji(text, index)) {
        if (!missing.has(char)) missing.set(char, text);
      }
    }
    // 足りない字と、どの文に出たかを そのまま 直せる 形で 出す
    expect([...missing.entries()].map(([char, text]) => `${char} … ${text}`)).toEqual([]);
  });

  /*
   * **辞典の 印は、ルビの 切れ目に そろって いなければ ならない。**
   *
   * `glossRuby`（app.js）は 印を 付ける ために 本文を 切る。切った ところが
   * ルビの 切れ目と ずれると、長い 読みが 割れて 残りが 裸の 漢字に なる:
   *
   *   代表取締役社長 に 「代表」の 印 → 取締役 が 裸（2026-08-24 実発生）
   *   三井住友銀行   に 「銀行」の 印 → 三井住友 が 裸
   *
   * app.js は かたまり単位で しか 印を 付けない ように 直した ので、画面が
   * こわれる ことは もう 無い。かわりに その 語には **印が 付かない**——
   * 本文からは 引けず、辞典の ページでしか 出あえない。
   *
   * 下の 一覧は「長い 語の 中に 埋もれて いて、印が 付かない と 分かって いる」もの。
   * 新しく 増えたら、その 語は 本文から 引けない ままに なる。ここに 足す 前に、
   * **その 語を 単独で 出す 言い回しに 直せないか**を 先に 考える こと。
   */
  const BURIED_IN_COMPOUNDS = new Set([
    /*
     * 下は「読み辞書が かたまりとして 持って いる ので 辞典には 載るが、
     * 本文では もっと 長い 語の 中に しか 出ない」もの。
     * 辞典の ページでは 引けるが、本文からは 引けない。
     */
    "画像", // 画像解析
    "経営", // 経営理念
    "公共", // 公共交通
    "試験", // 日本語能力試験
    "支部", // 協会南大阪支部
    "障害", // 障害対応
    "成果", // 成果物
    "世代", // 新世代
    "能力", // 日本語能力試験
    "発注", // 受発注
    "理念", // 経営理念
    "履歴", // 飛行履歴
    "解析", // 画像解析
    "業務", // 業務代行
    "修了", // 修了式
    "世界", // 世界中
    "設計", // 設計書
    "説明", // 説明書
    "対応", // 対応漏れ
    "代表", // 代表取締役社長
    "不足", // 人手不足
    "有効", // 有効性
    "要件", // 要件定義
  ]);

  it("辞典の 語は、本文の ルビの 切れ目に そろう", () => {
    const index = buildFuriganaIndex(FURIGANA as [string, string][]);
    /** 分かち書きの 空白を 落とした 形（app.js の `bare` と そろえる）。 */
    const bare = (text: string) => text.replace(/\s+/gu, "");

    /** app.js の `segmentsOf` と 同じ 切りかた。 */
    const cutsOf = (text: string) => {
      const out: string[] = [];
      for (const segment of annotateRuby(text, index)) {
        if (segment.reading) out.push(segment.text);
        else out.push(...segment.text);
      }
      return out;
    };

    /** その 語が、かたまりを つないだ 形で 出る 場所が **どこかに** あるか。 */
    const reachable = (term: string) => {
      const want = bare(term);
      for (const text of JA) {
        if (!bare(text).includes(want)) continue;
        const cuts = cutsOf(text);
        for (let i = 0; i < cuts.length; i += 1) {
          if (!bare(cuts[i] ?? "")) continue; // 空白から 始まる 印は 作らない
          let joined = "";
          for (let n = 0; n < 12 && i + n < cuts.length; n += 1) {
            const cut = cuts[i + n] ?? "";
            joined += cut;
            if (bare(joined).length > want.length) break;
            if (!bare(cut)) continue;
            if (bare(joined) === want) return true;
          }
        }
      }
      return false;
    };

    const unreachable = (GLOSSARY as { term: string }[])
      .filter((word) => !BURIED_IN_COMPOUNDS.has(word.term))
      .filter((word) => JA.some((text) => bare(text).includes(bare(word.term))))
      .filter((word) => !reachable(word.term))
      .map((word) => word.term);
    expect(unreachable).toEqual([]);
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

  /*
   * **覆えて いる ことと、読みが 合って いる ことは 別**（2026-08-23 にユーザーが発見）。
   * 1字ずつの 読みで 全部 覆えて いても、つないだ 読みは たいてい まちがう:
   *   教育 → 教（おし）＋育（そだ）＝「おしそだ」
   *   社会 → 社（しゃ）＋会（あ）　＝「しゃあ」
   * 学習者は その まちがった 読みを おぼえて しまう ので、覆いの 検査より 重い。
   *
   * `content/` 側には 同じ 検査が すでに あった（`checkSplitCompoundReadings`）が、
   * あれは `public/` を 見ない。ここで 同じ 考えかたを 掛ける。
   *
   * 下の 一覧は「割れる が、つないだ 読みは 合って いる」もの。**目で 1つずつ 確かめた**。
   * 新しく 増えたら ここに 足す 前に、声に 出して 読んで みる こと。
   * ここに 入れて よいのは **読みが 合って いる** ものだけ。「たぶん 大丈夫」で 足すと
   * 検査は 黙り、まちがった 読みが そのまま 学習者に 届く（2026-08-23 に
   * 「強化 → つよか」が この 一覧に 紛れこんで いた）。
   */
  const VERIFIED_SPLITS = new Set([
    // 「育成」「連合会」を 引けるように、わざと 割った（読みは 同じ）
    "育成連合会",
    "株式会社業務代行",
    "日本語授業修了式",
    "自動車株式会社様",
    "協会南大阪支部様",
    "日本語能力試験",
    "会育成連合会様",
    "受託開発事業",
    "海外人材育成",
    "海外有力大学",
    "日本企業文化",
    "徳島県三好市",
    "一部上場企業",
    "日本語教育",
    "日本語授業",
    "社内設置型",
    "多言語翻訳",
    "補助金支援",
    "導入補助金",
    "自動車整備",
    "会社紹介",
    "大阪本社",
    "制作事業",
    "開発事業",
    "海外事業",
    "日本国内",
    "国家発展",
    "日本文化",
    "学生代表",
    "現地来訪",
    "進行管理",
    "毎日連絡",
    "人材育成",
    "先進事業",
    "口頭報告",
    "業務項目",
    "地域資料",
    "地域還元",
    "証明情報",
    "承認手順",
    "限定情報",
    "自律運用",
    "設備異常",
    "温度変化",
    "災害対応",
    "救助活動",
    "要件整理",
    "品質管理",
    "日本企業",
    "海外展開",
    "英語対応",
    "事業課題",
    "動画制作",
    "社内業務",
    "鈑金塗装",
    "整備業向",
    "社以上",
    "礼儀正",
    "見積",
  ]);

  /**
   * ルビの 検査に かける ひとかたまり＝**漢字が つづく ところ**。
   *
   * 送りがなを はさむ 語（取り組み）まで 広げる のは 試して 見送った:
   * 分かち書きの 無い 日本語の 文では 助詞ごと つながって しまい
   *（「人と 文化」「少し 便利」…）、本当に あぶない ものが 85件の
   * まぎれものに 埋もれた。**まぎれものだらけの 検査は 誰も 読まない。**
   * かなを はさむ 語は「1字の 見出し語は 名指しで 決める」（下の 検査）で 防ぐ。
   */
  const RUNS = /[々一-鿿]{2,}/gu;

  it("熟語が 1字ずつに 割れて いない（割れるなら 読みを 目で 確かめた ものだけ）", () => {
    const index = buildFuriganaIndex(FURIGANA as [string, string][]);
    const known = new Set((FURIGANA as [string, string][]).map(([surface]) => surface));
    const broken = new Map<string, string>();

    for (const text of [...JA, ...textsOf(PAGES, "en")]) {
      for (const run of text.match(RUNS) ?? []) {
        if (run.length < 2) continue;
        if (known.has(run) || VERIFIED_SPLITS.has(run) || broken.has(run)) continue;
        const segments = annotateRuby(run, index);
        // 覆えて いない ものは 上の 検査の 担当。ここは **全部に ルビが 付いた うえで
        // 2つ以上に 割れた** ものだけ 見る
        if (segments.length < 2 || segments.some((s) => !s.reading)) continue;
        broken.set(
          run,
          `${segments.map((s) => s.text).join("＋")} →「${segments.map((s) => s.reading).join("")}」`,
        );
      }
    }
    expect([...broken.entries()].map(([run, how]) => `${run}: ${how}`)).toEqual([]);
  });

  /*
   * **漢字1字の 読みは、この サイトの 辞書で 名指しで 決める。**
   *
   * 1字の 漢字は 読みが 1つに 決まらない。ことばの正（`content/vocab`）に ある
   * 1字の 見出し語は ほとんどが 送りがなの つく 動詞の ためで（`会 → あ`＝会う）、
   * それを 黙って 借りると 名詞の 中で 火を 噴く:
   *
   *   大阪府 こども会 育成連合会  →  こども会（あ）   ← 2026-08-23 に 実際に 出た
   *
   * どちらが 正しいかは **この サイトの 文を 見ないと 決められない**。だから
   * `scripts/gen_gakushu.mjs` は 1字の 見出し語を ことばの正から 取らず、
   * リンク教材の `furigana`（人が 目で 決めた 表）だけを 使う。
   * この 検査は その 約束が 守られて いるかを 見る——ゆるめると、ことばの正に
   * 1字の 語が 増えた 日に、誰も 知らない うちに サイトの 読みが 変わる。
   */
  it("漢字1字の 読みは 教材リンクの 辞書が 名指しで 決めて いる", () => {
    const declared = new Set(LINK_FURIGANA.map(([surface]) => surface));
    const borrowed = (FURIGANA as [string, string][])
      .filter(([surface]) => surface.length === 1 && /^[㐀-鿿々]$/u.test(surface))
      .filter(([surface]) => !declared.has(surface))
      .map(([surface, reading]) => `${surface}→${reading}`);
    expect(borrowed).toEqual([]);
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
    /*
     * くらべる ときは **分かち書きの 空白を 落とす**。やさしい日本語は 語の 間を
     * あける ので、「今のまま」は 本文では「今の まま」と 書かれて いる。
     * 空白ごと くらべると、画面には 印が 出て いる 語を「本文に 無い」と
     * 言って しまう（生成側 `appearsAsWord` と 画面側 `glossRuby` は
     * どちらも 空白を 飛ばして 見る）。
     */
    const bare = (text: string) => text.replace(/\s+/gu, "");
    const haystack = bare([...JA, ...textsOf(PAGES, "en")].join("\n"));
    const ghosts = (GLOSSARY as { term: string }[])
      .map((item) => item.term)
      .filter((term) => !haystack.includes(bare(term)));
    expect(ghosts).toEqual([]);
  });
});

describe("生成物が 古くない（正は 教材データ）", () => {
  /*
   * 読み辞書と ことばの辞典の 正は `content/links/nextmake_gakushu_site.json` と
   * `content/vocab/vocabulary.json`。`public/` にあるのは **写し**。
   * 正を 直して 焼き忘れると、先生が 直した はずの ふりがなが 画面に 出ない。
   *
   * 見るのは **中身**で、ファイルの 字面では ない。字面で 比べると prettier が
   * 整形した 瞬間に 落ちて、直しかたが「もう一度 焼く」なのか「整形を 戻す」なのか
   * 分からない 失敗に なる（実際 そうなった）。
   */
  it("読み辞書は `node scripts/gen_gakushu.mjs` の 出力と 同じ", () => {
    expect(FURIGANA).toEqual(buildFurigana());
  });

  it("ことばの辞典は `node scripts/gen_gakushu.mjs` の 出力と 同じ", () => {
    expect(GLOSSARY).toEqual(buildGlossary(PAGES, UI));
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
