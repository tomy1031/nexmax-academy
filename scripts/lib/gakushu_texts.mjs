/**
 * 学習用サイト（public/gakushu/nextmake）の **学習者が読む文** を1か所で集める。
 *
 * 生成（`scripts/gen_gakushu.mjs`）と 検査（`tests/gakushu_site.test.ts`）が
 * **同じ関数**を呼ぶ。ここを2つに割ると「検査は通るのに画面には裸の漢字が出る」
 * というズレが生まれ、こぼれるのは いつも 学習者の側になる。
 *
 * `npm run lint:content` は `content/**` と `src/**` しか見ない。`public/` は
 * 見ないので、この 1枚ものの ページの 見張りは まるごと ここに 載っている。
 */

/** 本文が持つレベル。`en` も検査の対象（空のまま公開しないため）。 */
export const LEVELS = ["n4", "n3", "en"];

/** 日本語として読ませる文だけのレベル（ふりがな検査はこの2つに掛ける）。 */
export const JA_LEVELS = ["n4", "n3"];

/**
 * `{n4, n3, en}` の組か、素の文字列。
 * 素の文字列は **どのレベルでも同じ**（固有名詞・日付・技術の名前）。
 */
function isBundle(value) {
  return value != null && typeof value === "object" && !Array.isArray(value) && "n4" in value;
}

/** 1つの値から、指定したレベルの文を取り出す（素の文字列はそのまま返す）。 */
function pick(value, level) {
  if (typeof value === "string") return value;
  if (isBundle(value)) return typeof value[level] === "string" ? value[level] : "";
  return "";
}

/**
 * ページの中に散らばった「文の入れ物」を、深さに関係なくぜんぶ拾う。
 *
 * ブロックの型ごとに手で並べない——型を1つ足したときに拾い漏らすと、その型の文だけが
 * 検査をすり抜ける。**構造を知らずに歩く**ほうが安全。
 */
function walk(node, visit) {
  if (node == null) return;
  if (typeof node === "string") return;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  if (typeof node !== "object") return;
  if (isBundle(node)) {
    visit(node);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    // 画像の src・ページのid・行き先は文ではない
    if (key === "src" || key === "id" || key === "to" || key === "hero" || key === "kind") continue;
    if (typeof value === "string") {
      visit(value);
      continue;
    }
    walk(value, visit);
  }
}

/**
 * 1つのレベルぶんの文を、ページの並び順で返す。
 *
 * @param pages `PAGES`（data/pages/index.js）
 * @param level "n4" | "n3" | "en"
 */
export function textsOf(pages, level) {
  const out = [];
  const push = (value) => {
    const text = pick(value, level);
    if (text.trim()) out.push(text);
  };
  for (const page of pages) {
    push(page.nav);
    push(page.title);
    walk(page.blocks, push);
  }
  return out;
}

/**
 * **レベルごとに 書き分けた 文だけ**（`{n4, n3, en}` の 組から 取った ぶん）。
 *
 * 素の 文字列は 除く。あれは 会社の 原文（SLOGAN・MISSION）・住所・技術の 名前で、
 * **書きかえては いけない** もの。やさしさの 検査（1文の 長さ・分かち書き）を
 * そこに 掛けると、会社の 言った ことを 直せ、という 検査に なってしまう。
 * ふりがな・禁止語・国名の 検査は 逆に **ぜんぶ**（`textsOf`）に 掛ける——
 * 原文でも 読めない 漢字は 読めないから。
 */
export function bundleTextsOf(pages, level) {
  const out = [];
  const push = (value) => {
    if (!isBundle(value)) return;
    const text = pick(value, level);
    if (text.trim()) out.push(text);
  };
  for (const page of pages) {
    push(page.title);
    walk(page.blocks, push);
  }
  return out;
}

/** 画面が自分で出す文字（`data/ui.js`）。レベルを持たないので1回だけ集める。 */
export function uiTexts(ui) {
  const out = [];
  walk(ui, (value) => {
    const text = pick(value, "n4");
    // URL は文ではない
    if (text.trim() && !text.startsWith("http")) out.push(text);
  });
  return out;
}

/** 日本語の全文（n4 + n3 + UI）。ふりがな・禁止語・国名の検査はこれに掛ける。 */
export function japaneseTexts(pages, ui) {
  return [...JA_LEVELS.flatMap((level) => textsOf(pages, level)), ...uiTexts(ui)];
}

/** ページが指している画像のパス（実在するか検査するため）。 */
export function imagePaths(pages) {
  const out = [];
  for (const page of pages) {
    if (page.hero) out.push(page.hero);
    const collect = (node) => {
      if (node == null || typeof node !== "object") return;
      if (Array.isArray(node)) {
        for (const item of node) collect(item);
        return;
      }
      if (typeof node.src === "string") out.push(node.src);
      if (typeof node.image === "string") out.push(node.image);
      for (const value of Object.values(node)) collect(value);
    };
    collect(page.blocks);
  }
  return out;
}
