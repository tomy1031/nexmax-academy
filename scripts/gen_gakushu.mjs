#!/usr/bin/env node
/**
 * 学習用サイトの 読み辞書と ことばの辞典を、**教材データから 焼き込む**
 *（実行: `npm run gen:content`）。
 *
 * ## なぜ 生成に するのか
 * サイトの 本文は 静的な JS に 置くが、**漢字の 読みと ことばの 意味は 教材の 正**
 *（`content/`）で 持つ、と 決めた（2026-08-23）。理由は2つ:
 *
 *  1. 先生が `/admin` の 読み辞書を 直せば、サイトの ふりがなも 直る。
 *  2. 同じ 語を **単語テスト**（ことばアーケード）でも 出せる。サイトに 書き写すと、
 *     辞典と テストで 意味が ちがう ものに 育つ。
 *
 * ## 正 と 写し
 * ```
 * content/links/nextmake_gakushu_site.json  furigana[]  … サイト専用の 読み
 * content/vocab/vocabulary.json             words[]     … ことばの 意味（＋読み）
 *        ↓ この スクリプト
 * public/gakushu/nextmake/data/furigana.generated.js
 * public/gakushu/nextmake/data/glossary.generated.js
 * ```
 * 生成物は **コミットする**（実行環境に fs が無くても 動く ように）。
 * ずれていないかは `tests/gakushu_site.test.ts` が 見る。
 *
 * ## 辞典に 載る 語
 * **サイトの 本文に 出て きた 語だけ**。ことばの 正に ある 語を 全部 並べると、
 * この サイトと 関係の 無い 語が 混ざって、探して いる 語が 埋もれる
 *（制約 2026-08-18「辞書は 多いほど 良いのでは ない」）。
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { japaneseTexts, textsOf } from "./lib/gakushu_texts.mjs";

const ROOT = join(import.meta.dirname, "..");
const SITE = join(ROOT, "public", "gakushu", "nextmake");
const LINK_JSON = join(ROOT, "content", "links", "nextmake_gakushu_site.json");
const VOCAB_JSON = join(ROOT, "content", "vocab", "vocabulary.json");

export const FURIGANA_PATH = join(SITE, "data", "furigana.generated.js");
export const GLOSSARY_PATH = join(SITE, "data", "glossary.generated.js");
/** スタジオの ことばの 候補（アプリ側から import する ので src の 下）。 */
export const LINK_TERMS_PATH = join(ROOT, "src", "content", "gakushu-terms.generated.ts");

/**
 * 見出し語は **漢字で 始まる** ものだけ 焼く。
 *
 * `annotateRuby`（src/lib/text/furigana.ts）は **漢字の 位置でしか 辞書を 引かない**
 * ので、「お客さま」のように かなで 始まる 見出し語は 何度 走査しても 当たらない。
 * 焼いても 効かない ものを 載せると、辞書だけ 太って 引くのが 遅く なる
 *（この1枚は 学習者の 端末で 全語を 線形に 探すので、長さが そのまま 効く）。
 */
const STARTS_WITH_KANJI = /^[㐀-鿿々]/u;

/**
 * **漢字1字の 見出し語は ことばの正から 借りない**（このサイト専用の 辞書で 名指しする）。
 *
 * 1字の 漢字は 読みが 1つに 決まらない。ことばの正（`content/vocab`）に ある
 * 1字の 見出し語は、ほとんどが **送りがなの つく 動詞**の ための もの
 *（`会 → あ`＝会う、`教 → おし`＝教える）。それを この サイトの 文に そのまま
 * かけると、名詞の 中で 火を 噴く:
 *
 * ```
 * 大阪府 こども会 育成連合会   →   こども会(あ)     ← 2026-08-23 に 実際に 出た
 * ```
 *
 * どちらの 読みが 正しいかは **この サイトの 文を 見ないと 決められない**ので、
 * 判断を リンク教材の `furigana`（人が 目で 決めた 表）に 寄せる。ここで 落とすと
 * 覆えて いない 漢字が 出るので、`tests/gakushu_site.test.ts` の 覆いの 検査が
 * 「どれを 決め忘れたか」を そのまま 一覧に して くれる。
 */
function isSingleKanji(surface) {
  return surface.length === 1 && STARTS_WITH_KANJI.test(surface);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** サイトのページ定義（ESM）を読む。`data/pages/index.js` が並び順の正。 */
export async function loadSite() {
  const pages = await import(pathToFileURL(join(SITE, "data", "pages", "index.js")).href);
  const ui = await import(pathToFileURL(join(SITE, "data", "ui.js")).href);
  return { PAGES: pages.PAGES, UI: ui.UI };
}

/**
 * 読み辞書を作る。
 *
 * リンク教材の `furigana` が **サイト専用の 正**で、ことばの 正の `[term, reading]` を
 * 下に 敷く（同じ 表記が あれば リンク側が 勝つ — `mergeFuriganaEntries` と同じ 後勝ち）。
 */
export function buildFurigana() {
  const link = readJson(LINK_JSON);
  const vocab = readJson(VOCAB_JSON);

  const map = new Map();
  for (const word of vocab.words ?? []) {
    if (word.term && word.reading && !isSingleKanji(word.term)) map.set(word.term, word.reading);
  }
  for (const [surface, reading] of vocab.furigana ?? []) {
    if (!isSingleKanji(surface)) map.set(surface, reading);
  }
  for (const [surface, reading] of link.furigana ?? []) map.set(surface, reading);

  return [...map.entries()]
    .filter(([surface, reading]) => surface && reading && STARTS_WITH_KANJI.test(surface))
    .sort((a, b) => b[0].length - a[0].length);
}

const KANJI_CHAR = /[㐀-鿿々]/u;

/**
 * その語が **語として** 本文に出ているか。
 *
 * ただの `includes` だと、複合語の 一部を 拾って しまう——「外国」から「国」、
 * 「前例」から「例」、「教育」から「教」。そういう 語が 辞典に 並ぶと、
 * ほんとうに 引きたい 語が 埋もれる（制約 2026-08-18「辞書は 多いほど 良いのでは ない」）。
 *
 * そこで **前後が 漢字の ときは 語と みなさない**。国名の 検査（content-checks.ts の
 * `indexOfPlace`）が カタカナで やって いるのと 同じ 考えかた。
 */
function appearsAsWord(haystack, term, readingUnits = new Set()) {
  /*
   * **読み辞書が 1つの かたまりとして 持って いる 語は、前後が 漢字でも 語**。
   *
   * 下の 境目の 判定は「外国」から「国」を 拾わない ための もの。ところが
   * 「育成連合会」の 中の 「連合会」の ように、**読みの かたまりとして
   * ちゃんと 切れて いる** 語まで はじいて しまう。画面では 印が 付けられるのに
   * 辞典に 載らない、と いう ちぐはぐが 起きる（2026-08-24 実発生）。
   *
   * 読み辞書に その 表記が あると いう ことは、人が「ここで 切れる」と
   * 決めた と いう こと。それを 語と みなす。
   */
  if (readingUnits.has(term)) return haystack.includes(term);
  /*
   * 語の 中に **分かち書きの 空白が 入り込む** ことが ある。
   * やさしい日本語は 読みやすさの ために 語の 間を あける ので、
   * 「今のまま」は 本文では「今の まま」と 書かれて いる。
   * 空白を 飛ばして さがす（画面側の `glossRuby` も 同じ 見かたを する）。
   *
   * **本文の ほうから 空白を 落としては いけない。** 落とすと、もともと
   * 空白で 分かれて いた 漢字どうしが くっついて、下の「前後が 漢字なら
   * 語と みなさない」判定に 引っかかり、ふつうの 語まで 辞典から 消える
   *（2026-08-24 に 8語 消えた）。
   */
  const pattern = [...term]
    .map((char) => char.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
    .join("\\s*");
  const finder = new RegExp(pattern, "gu");
  for (const found of haystack.matchAll(finder)) {
    if (!KANJI_CHAR.test(term)) return true;
    const before = haystack[found.index - 1] ?? "";
    const after = haystack[found.index + found[0].length] ?? "";
    if (!KANJI_CHAR.test(before) && !KANJI_CHAR.test(after)) return true;
  }
  return false;
}

/**
 * 本文に 出て きた ことばを、ことばの 正から 拾う（正の かたちの まま）。
 *
 * 辞典（学習者が サイトで 引く もの）と、**先生が 単語テストに 出す 語を えらぶ
 * ときの 候補**（`src/content/gakushu-terms.generated.ts`）の 両方の もとに なる。
 * 2つの 場所で 別々に 拾うと、サイトに 出て いる のに 候補に 出ない 語が できる。
 */
export function siteVocabWords(pages, ui) {
  const vocab = readJson(VOCAB_JSON);
  const haystack = [...japaneseTexts(pages, ui), ...textsOf(pages, "en")].join("\n");
  /** 読み辞書が「ここで 切れる」と 決めて いる 表記。 */
  const readingUnits = new Set(buildFurigana().map(([surface]) => surface));

  return (
    (vocab.words ?? [])
      /*
       * 1文字の 見出し語は 載せない。この 正に ある 1文字の 語は「紙・国・聞・教」の
       * ような **N5の 基礎語と 動詞の 語幹**で、この サイトの 辞典が 引かせたい
       * ITと しごとの ことばでは ない（制約 2026-08-18: 基礎的な 単語は 載せない）。
       * ふりがなは 読み辞書が 別に 覆うので、載せなくても 読めなく ならない。
       */
      .filter((word) => word.term.length >= 2)
      .filter((word) => appearsAsWord(haystack, word.term, readingUnits))
  );
}

/** 本文に 出て きた ことばだけを、ことばの 正から 拾う。 */
export function buildGlossary(pages, ui) {
  return siteVocabWords(pages, ui)
    .map((word) => ({
      term: word.term,
      reading: word.reading,
      meaning: word.meaningJa,
      en: word.englishTerm ?? "",
    }))
    .sort((a, b) => a.reading.localeCompare(b.reading, "ja"));
}

function header(what, from) {
  return `/**
 * 自動生成。手で編集しない（\`npm run gen:content\` で作り直す）。
 *
 * ${what}
 * 正は ${from}。直したい ときは **正を 直す**。ここを 直しても 次の 生成で 消える。
 */
`;
}

export function furiganaSource(entries) {
  const body = entries.map(([surface, reading]) => `  ["${surface}", "${reading}"],`).join("\n");
  return `${header(
    "学習用サイトの 読み辞書（表記・よみ）。",
    "content/links/nextmake_gakushu_site.json の furigana と content/vocab/vocabulary.json",
  )}
export const FURIGANA = [
${body}
];
`;
}

/**
 * リンク教材（学習用サイト）に 出て くる 語の id。
 *
 * スタジオの「📚 辞書から えらぶ」が、**その ステージの 本文に 出て くる 語だけ**を
 * 出す ために 使う（願い #203）。サイトの 本文は 静的な JS に あり、
 * アプリからは 読めない（Workers に fs が 無い）ので、ここで 焼く。
 * ほかの 教材（記事・まんが・スライド…）は DB で 変わるので、
 * 画面の 側で 本文と 突き合わせる（`src/lib/vocab/stage-pool.ts`）。
 */
export function linkTermsSource(linkId, words) {
  const ids = words.map((word) => `    ${JSON.stringify(word.id)},`).join("\n");
  return `${header(
    "リンク教材（学習用サイト）の 本文に 出て くる ことばの id。",
    "content/vocab/vocabulary.json と public/gakushu/nextmake/",
  )}
export const GAKUSHU_TERMS: Readonly<Record<string, readonly string[]>> = {
  ${JSON.stringify(linkId)}: [
${ids}
  ],
};
`;
}

export function glossarySource(entries) {
  const body = entries.map((e) => `  ${JSON.stringify(e)},`).join("\n");
  return `${header(
    "学習用サイトの ことばの辞典（本文に 出た 語だけ）。",
    "content/vocab/vocabulary.json",
  )}
export const GLOSSARY = [
${body}
];
`;
}

/*
 * 書き出した あと **Prettier に かける**。
 *
 * `.js` は lint-staged の 対象に 入って いない（`*.{ts,tsx,mjs,css,md,json}`）ので、
 * コミット時の 自動整形が 届かない。素の まま 出すと `npm run format:check` が
 * CI で 落ち、**直しかたが 分からない 落ち方**に なる（2026-08-25 に 2回 出した）。
 * ここで 整えて おけば、生成した ものは いつでも 整形ずみに なる。
 */
function writeFormatted(path, source) {
  writeFileSync(path, source);
  try {
    execFileSync("npx", ["prettier", "--write", "--log-level", "silent", path], {
      cwd: join(import.meta.dirname, ".."),
    });
  } catch {
    // Prettier が 無い 環境（本番のビルドなど）では 素の ままで よい
  }
}

async function main() {
  const { PAGES, UI } = await loadSite();
  const furigana = buildFurigana();
  const words = siteVocabWords(PAGES, UI);
  const glossary = buildGlossary(PAGES, UI);
  writeFormatted(FURIGANA_PATH, furiganaSource(furigana));
  writeFormatted(GLOSSARY_PATH, glossarySource(glossary));
  writeFormatted(LINK_TERMS_PATH, linkTermsSource(readJson(LINK_JSON).id, words));
  console.log(
    `学習用サイト: 読み辞書 ${furigana.length}語 / ことばの辞典 ${glossary.length}語 / ` +
      `単語の候補 ${words.length}語 を書き出しました`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
