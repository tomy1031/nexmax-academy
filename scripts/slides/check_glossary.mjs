/**
 * スライドの語彙メモ（ノート欄の【ことば】）に取りこぼしが無いかを見る。
 *
 * 使い方:
 *   node scripts/slides/check_glossary.mjs scripts/slides/<教材ID>/index.html content/slides/<教材ID>.json
 *
 * なぜ要るか（2026-08-17 に実際にやらかした）:
 * 語彙メモを1ページずつ手で書くと、**スライドに出ている語ではなく、自分が書いた
 * ノート文の語**を拾ってしまう。29ページ中11ページでズレていた。人の目では見つからない。
 *
 * 判定のしかた（形態素解析は使わない — 依存を増やさずに 9割を捕まえる）:
 * - スライド本文（ルビの読みは落とす）から「漢字を含む連なり」と「3文字以上のカタカナ語」を候補として拾う
 * - 活用は**漢字の芯**で照合する（書く／書いて／書いた → 書）
 * - 語は**はじめて出るページ**で覆えていればよい（毎ページ載せると新しい語が埋もれる）
 * - N5 の基本語・固有名詞（会社名・国名）は SKIP に入れて黙らせる
 *
 * 出るのは「候補」なので、0件にすることが目的ではない。**増えていないか**を見る道具。
 */
import fs from "node:fs";

const [htmlPath, jsonPath] = process.argv.slice(2);
if (!htmlPath || !jsonPath) {
  console.error("usage: node scripts/slides/check_glossary.mjs <原稿.html> <教材.json>");
  process.exit(1);
}

/** N5 の基本語・数え方・固有名詞。学習者が読めるか以前に、説明しても意味が増えないもの。 */
const SKIP = new Set([
  // N5 の基本語
  "日本",
  "人",
  "年",
  "月",
  "今",
  "先",
  "何",
  "国",
  "日",
  "分",
  "大",
  "多",
  "少",
  "出",
  "上",
  "立",
  // 国名（カンボジアは学習者自身の国、アメリカは N5 の地名）
  "アメリカ",
  "カンボジア",
  // 固有名詞
  "AI",
  "PM",
  "IT",
  "NEXMAX",
  "ACADEMY",
  "Google",
  "Microsoft",
  "Anthropic",
  "Amazon",
  "Meta",
  "Alibaba",
  "Tencent",
  "ByteDance",
  "Harvard",
  "Business",
  "School",
  "MBA",
  "WBS",
]);

/** 送りがなを落として漢字の芯にする（書いて → 書）。 */
const core = (w) => w.replace(/[ぁ-ん]+$/, "") || w;

const html = fs.readFileSync(htmlPath, "utf8");
const sections = html.slice(html.indexOf("<body>")).split('<section class="slide').slice(1);
const notes = JSON.parse(fs.readFileSync(jsonPath, "utf8")).notes;

const seen = new Set();
let missingTotal = 0;

sections.forEach((section, i) => {
  const text = section
    // 出典（脚注）とページ番号は 学習者が覚える言葉ではないので 数えない
    // （「経済産業省」「情報通信白書」まで辞書に載せると、覚える語が 出典に埋もれる）
    .replace(/<div class="footnote">[\s\S]*?<\/div>/g, "")
    .replace(/<div class="pageno">[\s\S]*?<\/div>/g, "")
    .replace(/<rt>.*?<\/rt>/g, "") // ルビの読みは語ではない
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ");

  const candidates = [
    ...new Set([
      ...(text.match(/[一-龯]+[ぁ-ん]{0,3}/g) ?? []),
      ...(text.match(/[ァ-ヶー]{3,}/g) ?? []),
    ]),
  ].filter((w) => !SKIP.has(core(w)) && !SKIP.has(w));

  // ノートは 語彙メモだけを持つ（`【語】English　【語】English …`）。見出し語は 【】 の中。
  const glossed = [...(notes.find((n) => n.page === i + 1)?.text ?? "").matchAll(/【(.+?)】/g)]
    .map((m) => core(m[1].trim()))
    .filter(Boolean);
  glossed.forEach((g) => seen.add(g));

  const missing = candidates.filter((w) => {
    const c = core(w);
    return ![...seen].some((g) => g.includes(c) || c.includes(g));
  });
  if (missing.length > 0) {
    missingTotal += missing.length;
    console.log(`p${String(i + 1).padStart(2)}: ${missing.join(" , ")}`);
  }
});

console.log(
  missingTotal === 0
    ? "語彙メモの 取りこぼし候補は ありません。"
    : `\nはじめて出るのに 辞書に無い語の候補: ${missingTotal} 件（見て、要るものは ノートの【ことば】に足す）`,
);
