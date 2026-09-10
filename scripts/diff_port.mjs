#!/usr/bin/env node
/**
 * 移植の 差分を 文単位で 見せる — 「勝手に 足された 一言」を 機械で 拾う
 *
 * ## なぜ 要るのか
 *
 * 2026-09-10、報連相「報告」の 移植で こういう ことが 起きた。
 *
 * - 旧アプリの 問い「日本の会社で一番大切なことは何ですか？」が 消え、
 *   **答え**「一番 大切なのは チームワークです」が ページの 1行目に 移って いた
 * - 旧アプリの 因果「**ですから**、藤木さんが お客様に すぐ 確認して くれます」が 消え、
 *   代わりに「とても 上の ポジションで」という **評価の 一言**が 足されて いた
 * - 旧アプリの 英語の 添え（Fact / Boss / Error / Bug / Teamwork）が ぜんぶ 落ちて いた
 *
 * どれも「読みやすく した つもり」の 手つきで、**指示は「移植して」だけ**だった。
 * ユーザーの ことば:「いつも私が意図を持ってやっていることを勝手に破壊されたり、
 * 余計な一言を加えられます」。
 *
 * 文章の ルールを 足しても、この 型の 事故は 止まらない——**その 場では
 * 「良く して いる」ように 見える**からである。止められるのは
 * **「足した 文・削った 文を 並べて 見せる」**という 手つきだけ。
 *
 * ## 使いかた
 *
 * ```
 * node scripts/diff_port.mjs <旧アプリのURL or ファイル> ... -- <新しい 教材の JSON> ...
 * ```
 *
 * 例（報連相：報告）:
 * ```
 * node scripts/diff_port.mjs \
 *   https://nextmake-onboarding.netlify.app/lecture/houkoku/index.html \
 *   https://nextmake-onboarding.netlify.app/listening/houkoku/index.html \
 *   -- content/articles/houkoku_lecture.json content/articles/houkoku_kotsu.json
 * ```
 *
 * 出す もの:
 * - **★新規** … 旧に 近い 文が 無い（＝AIが 足した 文。1行ずつ 理由を 言えること）
 * - **書き換え** … 似た 文が あるが 変わって いる（似ている 度合いを 添える）
 * - **落ちた** … 旧に あって 新に 見あたらない 文（**因果の 接続詞が ここに 出やすい**）
 *
 * 判定は しない。**PR に 貼って、1行ずつ 説明できるかを 人が 見る**ための 道具である。
 */

import { readFileSync } from "node:fs";

/** タグと ルビを 落として、文の 列に する。 */
function sentencesFromHtml(html) {
  let s = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, "")
    .replace(/<rt>[\s\S]*?<\/rt>/g, "") // ルビの 読みは 本文では ない
    .replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return splitSentences(s);
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** 教材 JSON から、学習者が 読む 字だけを 集める。 */
function sentencesFromJson(json) {
  const SKIP = new Set([
    "src",
    "refs",
    "status",
    "id",
    "url",
    "audioUrl",
    "kind",
    "type",
    "ref",
    "prompt", // 画像生成の 英語は 画面に 出ない
    "furigana",
    "romaji",
    "keywords",
    "wrongMeanings",
  ]);
  const out = [];
  const walk = (node) => {
    if (typeof node === "string") out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object")
      for (const [k, v] of Object.entries(node)) if (!SKIP.has(k)) walk(v);
  };
  walk(json);
  return splitSentences(out.join("\n"));
}

function splitSentences(text) {
  return text
    .split(/[。？！\n]/)
    .map((t) => t.replace(/[\s　]+/g, ""))
    .filter((t) => t.length >= 6);
}

/** 0〜1。だいたいの 似ぐあい（2文字の 並びが どれだけ 重なるか）。 */
function similarity(a, b) {
  if (a === b) return 1;
  const grams = (s) => {
    const g = new Set();
    for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2));
    return g;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (ga.size === 0 || gb.size === 0) return 0;
  let hit = 0;
  for (const g of ga) if (gb.has(g)) hit++;
  return (2 * hit) / (ga.size + gb.size);
}

function closest(sentence, pool) {
  let best = null;
  let score = 0;
  for (const p of pool) {
    const r = similarity(sentence, p);
    if (r > score) {
      score = r;
      best = p;
    }
  }
  return { best, score };
}

async function load(ref) {
  if (/^https?:\/\//.test(ref)) {
    const res = await fetch(ref);
    if (!res.ok) throw new Error(`${ref} が 取れない（${res.status}）`);
    return sentencesFromHtml(await res.text());
  }
  const raw = readFileSync(ref, "utf8");
  if (ref.endsWith(".json")) return sentencesFromJson(JSON.parse(raw));
  return sentencesFromHtml(raw);
}

/** 「そのまま 写した」と 見なす 線。これ以上 似て いれば 差分に 出さない。 */
const SAME = 0.9;
/** これ未満なら「旧に 近い 文が 無い」＝ 新しく 書かれた 文。 */
const NEW = 0.45;

async function main() {
  const argv = process.argv.slice(2);
  const cut = argv.indexOf("--");
  if (cut < 1 || cut === argv.length - 1) {
    console.error(
      "使いかた: node scripts/diff_port.mjs <旧の URL/ファイル>... -- <新の JSON/ファイル>...",
    );
    process.exit(2);
  }
  const oldRefs = argv.slice(0, cut);
  const newRefs = argv.slice(cut + 1);

  const oldSents = (await Promise.all(oldRefs.map(load))).flat();
  const newSents = (await Promise.all(newRefs.map(load))).flat();

  const added = [];
  const changed = [];
  const matchedOld = new Set();

  for (const s of newSents) {
    const { best, score } = closest(s, oldSents);
    if (score >= SAME) {
      matchedOld.add(best);
      continue;
    }
    if (score < NEW) added.push(s);
    else {
      changed.push({ now: s, was: best, score });
      matchedOld.add(best);
    }
  }
  const dropped = oldSents.filter((s) => !matchedOld.has(s) && closest(s, newSents).score < NEW);

  const line = (n) => "─".repeat(n);
  console.log(`\n旧: ${oldSents.length}文 / 新: ${newSents.length}文`);

  console.log(`\n${line(64)}\n★ 新しく 書かれた 文（${added.length}）`);
  console.log("  旧に 近い 文が ない。**1行ずつ「なぜ 足したか」を 言えること。**");
  for (const s of added) console.log(`  ＋ ${s}`);

  console.log(`\n${line(64)}\n△ 書き換えた 文（${changed.length}）`);
  console.log("  意味が 変わって いないか、**添えものを 削って いないか**を 見る。");
  for (const c of changed) {
    console.log(`  新 ${c.now}`);
    console.log(`  旧 ${c.was}   （似ぐあい ${c.score.toFixed(2)}）`);
  }

  console.log(`\n${line(64)}\n▽ 落ちた 文（${dropped.length}）`);
  console.log("  **因果の 接続詞（ですから・だから）と 英語の 添えが ここに 出やすい。**");
  for (const s of dropped) console.log(`  − ${s}`);

  console.log(
    `\n${line(64)}\nまとめ: 足した ${added.length} / 書き換えた ${changed.length} / 落とした ${dropped.length}`,
  );
  console.log("この 3つを PR の「順路」欄に 貼り、1行ずつ 理由を 書く。\n");
}

main().catch((e) => {
  console.error("止まりました:", e.message);
  process.exit(1);
});
