/**
 * スライドの語彙メモ（ノート欄の【ことば】）を見張る。
 *
 * 使い方:
 *   node scripts/slides/check_glossary.mjs scripts/slides/<教材ID>/index.html content/slides/<教材ID>.json
 *
 * ## なぜ要るか（2026-08-17 に実際にやらかした）
 * 語彙メモを1ページずつ手で書くと、**スライドに出ている語ではなく、自分が書いた
 * ノート文の語**を拾ってしまう。29ページ中11ページでズレていた。人の目では見つからない。
 *
 * ## 何を載せるか（2026-08-18 ユーザー指定）
 * 辞書は「多いほうが安全」ではない。**要らない語が並ぶと、覚えるべき語が埋もれる。**
 * つぎの4つは **載せない**:
 *   1. 絵で想像できるもの（紙・図・ミーティング…）
 *   2. 基礎的な単語（書く・思う・聞く・会社・力…）
 *   3. カタカナ語だけど簡単にフォローできるもの（クイズ・アプリ・コード…）
 *   4. 一度紹介した語（2回目からは載せない）
 * 逆に、いちど どこかで 紹介して あれば、そのページで 出てこなくても よい。
 *
 * ## 見るもの（形態素解析は使わない — 依存を増やさずに 9割を捕まえる）
 *   A. 取りこぼし … スライドに はじめて出た のに どこにも 無い語
 *   B. 重複     … 前のページで もう 紹介した 語（規則4）
 *   C. 幽霊     … ノートには あるのに、そのページの スライドに 無い語（最初の やらかし）
 *
 * 出るのは「候補」なので、0件にすることが目的ではない。**増えていないか**を見る道具。
 */
import fs from "node:fs";

const [htmlPath, jsonPath] = process.argv.slice(2);
if (!htmlPath || !jsonPath) {
  console.error("usage: node scripts/slides/check_glossary.mjs <原稿.html> <教材.json>");
  process.exit(1);
}

/**
 * 辞書に **載せない**語（＝取りこぼしとして数えない語）。漢字の芯で持つ（書いた → 書）。
 * 分類は上の「何を載せるか」の 1〜3 に対応する。
 */
const SKIP = new Set([
  // ── 2. 基礎的な単語（N5〜やさしいN4）
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
  "書",
  "思",
  "聞",
  "見",
  "話",
  "作",
  "読",
  "考",
  "使",
  "決",
  "始",
  "働",
  "言",
  "強",
  "勉強",
  "会社",
  "力",
  "仕事",
  "客",
  "金",
  "時間",
  "週",
  "今年",
  "前",
  "長",
  "小",
  "半分",
  "同",
  "大学",
  "日本語",
  "数",
  "計算",
  // ── 1. 絵で想像できるもの（スライドの絵が そのまま 意味になる）
  "紙",
  // ── it_orientation で 出た ぶん（同じ 4つの 決まり）
  "電車",
  "街",
  "分前",
  "変",
  "新",
  "住",
  "来",
  "持",
  "帰",
  "章扉",
  "場所",
  "メール",
  "学校",
  "言葉",
  "自分",
  "大切",
  "ビジネス",
  "ルール",
  "トップクラス",
  "クラウド",
  "アプリケーション",
  "データベース",
  "ソースコード",
  "エンジニア",
  "大阪",
  "東京",
  "図",
  "道具",
  // ── 3. カタカナ語だけど簡単にフォローできるもの
  "プログラム",
  "クイズ",
  "アプリ",
  "コード",
  "チーム",
  "チャット",
  "アドバイス",
  "アシスタント",
  "テスト",
  "デザイン",
  "サーバー",
  "セキュリティ",
  "メッセージ",
  "ミーティング",
  "チャンス",
  "ビジネスチャンス",
  "マネジメント",
  "コミュニケーション",
  "クライアント",
  // ── 国名（カンボジアは学習者自身の国。アメリカ・中国は N5 の地名）
  "アメリカ",
  "カンボジア",
  "中国",
  // ── 固有名詞
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

/** 空白を すべて 落とす（タグを 剥がした 字と 見出し語を 突き合わせるため）。 */
const flat = (s) => s.replace(/\s+/g, "");

const html = fs.readFileSync(htmlPath, "utf8");
const sections = html.slice(html.indexOf("<body>")).split('<section class="slide').slice(1);
const notes = JSON.parse(fs.readFileSync(jsonPath, "utf8")).notes;

/** すでに紹介した語（芯）。ここに在るものは 取りこぼしに 数えない。 */
const seen = new Set();
/** すでに紹介した見出し語（そのまま）。重複の判定は **芯ではなく そのまま**で見る
 *  ——「見つかる」と「見積もり」は 芯が どちらも「見」に 寄るため。 */
const glossedBefore = new Map();

/**
 * 規則4（一度 紹介した語は 2回目から 載せない）の 例外。
 *
 * **セットで 覚える 語は、欠けると 意味が 変わる。** 「ほうれんそう」は
 * 報告・連絡・相談の 3つで 1つの ことばなので、相談だけ 前のページで 紹介ずみでも
 * その 1枚では 3つ そろえて 出す（2026-08-19 の 指定。2つしか 出ていないのを
 * ユーザーが 見つけた）。ここに 載せた 語は 重複として 数えない。
 */
const DUP_OK = new Set(["相談"]);

let missingTotal = 0;
const dups = [];
const ghosts = [];

sections.forEach((section, i) => {
  const page = i + 1;
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
  const heads = [...(notes.find((n) => n.page === page)?.text ?? "").matchAll(/【(.+?)】/g)]
    .map((m) => m[1].trim())
    .filter(Boolean);

  for (const head of heads) {
    const first = glossedBefore.get(head);
    if (first !== undefined && !DUP_OK.has(head))
      dups.push(`p${page}: 【${head}】 は p${first} で 紹介ずみ`);
    else glossedBefore.set(head, page);
    seen.add(core(head));

    // ひらがなだけの見出し（たつ・やめさせる）は 活用で 形が 変わるので 置き場所を 見ない
    if (/^[ぁ-ん\s]+$/.test(head)) continue;
    // 空白は 落としてから 比べる。タグを 剥がすと 語の 途中に 空白が 入るため
    //（<ruby>身</ruby>に つけます → 「身 に つけます」）。
    if (!flat(text).includes(flat(core(head))))
      ghosts.push(`p${page}: 【${head}】 は この ページの 字に 無い`);
  }

  const missing = candidates.filter((w) => {
    const c = core(w);
    return ![...seen].some((g) => g.includes(c) || c.includes(g));
  });
  if (missing.length > 0) {
    missingTotal += missing.length;
    console.log(`p${String(page).padStart(2)}: ${missing.join(" , ")}`);
  }
});

if (dups.length > 0) console.log(`\n■ 一度 紹介した語（規則4 — 消す）\n${dups.join("\n")}`);
if (ghosts.length > 0)
  console.log(`\n■ そのページに 無い語（自分の 文から 拾って いる）\n${ghosts.join("\n")}`);

console.log(
  missingTotal === 0 && dups.length === 0 && ghosts.length === 0
    ? "\n語彙メモ: 取りこぼし・重複・幽霊 いずれも ありません。"
    : `\nはじめて出るのに 辞書に無い語の候補: ${missingTotal} 件 / 重複 ${dups.length} 件 / 幽霊 ${ghosts.length} 件`,
);
