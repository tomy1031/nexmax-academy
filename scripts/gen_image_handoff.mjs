#!/usr/bin/env node
/**
 * 「絵の 作り直し台帳」を 台帳（scripts/images/*.json）から 組み立てる
 *
 * 出すのは 2つ。**報連相**（45枚）と **開発の 工程**（9枚）。
 *
 * ## なぜ 生成するのか
 * 前の 引き継ぎ書は **表4列の 手書き**で、英語の プロンプトは 教材データの 中に しか
 * 無かった。作る 人は md を 読んでから **JSON を 探しに 行く**ことに なり、
 * しかも 台帳を 直しても md は 古いまま 残る——2つの 場所に 同じ 事実が あると、
 * 必ず 片方が 古くなる。
 *
 * だから **台帳を 正**に して、md は そこから 出す。1枚に つき
 *「何の 絵か／絵の 中の 文字／出力する 先／書き込む 先／参照画像／台帳／大きさ／
 * プロンプト全文」を 書き出す ので、この md だけ 見れば 手が 動く。
 *
 *     node scripts/gen_image_handoff.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildPrompt } from "./lib/image_ledger.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER_DIR = join(ROOT, "scripts", "images");
const outPath = (name) => join(ROOT, "docs", "teaching", `${name}.md`);

/** 出す 順。**作る 順**でも ある（上から 流せば よい）。 */
const ORDER = [
  [
    "hourensou_tomita",
    "富田さん（報告の 相手・PM）",
    "まず 0番の 設定画を 作る。それが 以後 ぜんぶの 参照に なる",
  ],
  ["hourensou_tomita_zukai", "富田さんの 図（文字あり）", "文字を 焼く ので 台帳が 別"],
  ["hourensou_okuda", "奥田さん（相談の 相手・先輩）", "もとの「鈴木先輩」から 置きかえた 人"],
  ["hourensou_okuda_zukai", "奥田さんの 図（文字あり）", "文字を 焼く ので 台帳が 別"],
  ["hourensou_hendy", "ヘンディ先輩（連絡・チーム）", "設定画が いちばん しっかり ある 人"],
  ["hourensou_fujiki", "藤木取締役（会社の 階級）", "文字あり。ほうれい線を 描かない"],
  [
    "hourensou_zukai",
    "人物を 特定しない 図（文字あり）",
    "参照画像なし。1枚目が 絵柄の アンカーに なる",
  ],
  [
    "hourensou_scenes",
    "人物を 特定しない 場面（文字なし）",
    "本文が ことばを 持って いるので 絵は 場面だけ",
  ],
  ["soudan_kehai", "場面クイズ「いま 話しかけて いい？」", "**いま 絵が 無い**（点線わく）。急ぐ"],
  ["renraku_manga", "まんが「連絡が なかった 日」", "**いま 絵が 無い**（点線わく）。急ぐ"],
];

/** 開発の 工程。**文字入りの 図を 先に**（1枚目が 絵柄の アンカーに なる）。 */
const KAIHATSU_ORDER = [
  [
    "kaihatsu_zukai",
    "文字入りの 図（6枚）",
    "参照画像なし。1枚目（7つの 工程）が 以後の 絵柄の アンカーに なる",
  ],
  [
    "kaihatsu_scenes",
    "場面の 絵（3枚・文字なし）",
    "本文と カードが ことばを 持つので 絵は 場面だけ",
  ],
];

const load = (name) => JSON.parse(readFileSync(join(LEDGER_DIR, `${name}.json`), "utf8"));

/**
 * 台帳 1つぶんを 書き出す。**報連相と 開発の 工程で 同じ 形**に する
 * （作る 人が 2つの md を 行き来しても 読み方を 覚え直さなくて よい）。
 */
function renderLedgers(out, order, stripPrefix) {
  let n = 0;
  const counts = [];
  for (const [name, label, note] of order) {
    const ledger = load(name);
    counts.push([label, ledger.scenes.length]);
    out("---");
    out();
    out(`## ${label}`);
    out();
    out(`- 台帳: \`scripts/images/${name}.json\`（${ledger.scenes.length}枚）`);
    out(
      `- 参照画像: ${ledger.refs?.length ? ledger.refs.map((r) => `\`${r}\``).join(" ／ ") : "なし（1枚目が 絵柄の アンカーに なる）"}`,
    );
    out(
      `- 絵の 中の 文字: ${ledger.noText?.startsWith("Japanese lettering") ? "**焼く**（ふりがな付き）" : "焼かない"}`,
    );
    out(`- ${note}`);
    out();
    out(`\`\`\`bash`);
    out(
      `node scripts/slides/gen_images.mjs scripts/images/${name}.json .tmp-img/${name.replace(stripPrefix, "")}`,
    );
    out(`\`\`\``);
    out();
    for (const scene of ledger.scenes) {
      n += 1;
      out(`### ${n}. ${scene.title}`);
      out();
      out(`- **出力する 先** … \`${scene.dest}\``);
      out(`- **書き込む 先** … ${scene.where ?? "（台帳に 未記入）"}`);
      if (scene.text?.length) {
        out(`- **絵の 中の 文字** … ${scene.text.map((t) => `「${t}」`).join("・")}`);
      }
      out(
        `- **大きさ** … ${scene.output ?? `Output: one landscape illustration, ${ledger.output ?? "1536x1024"}.`}`,
      );
      out(`- **優先度** … ${scene.priority ?? "B"}`);
      out();
      out("<details><summary>プロンプト全文（そのまま 貼る）</summary>");
      out();
      out("```text");
      out(buildPrompt(ledger, scene));
      out("```");
      out();
      out("</details>");
      out();
    }
  }
  return { n, counts };
}

/** md を 1つ 組み立てて 書き出す。 */
function writeDoc(name, build) {
  const lines = [];
  const out = (s = "") => lines.push(s);
  const n = build(out);
  writeFileSync(outPath(name), `${lines.join("\n")}`);
  console.log(`docs/teaching/${name}.md（${n}枚）`);
}

writeDoc("hourensou_絵の作り直し台帳", (out) => {
  out("# 報連相 — 絵の 作り直し台帳");
  out();
  out("> **この ファイルは `node scripts/gen_image_handoff.mjs` が 作る。手で 直さない。**");
  out("> 直すのは `scripts/images/hourensou_*.json`（台帳）の ほう。");
  out();
  out("報連相3ステージの 絵を、**アプリの テイストに そろえて ぜんぶ 作り直す**ための 指示書。");
  out("2026-08-30 の 指定「漫画だけじゃなくて、全コンテンツの絵を新たにテイストに合わせて");
  out("作成し直す必要があります。報連相の画像は主に藤木取締役とヘンディさんです」に よる。");
  out();
  out("いま 画面に 出て いる 絵は、2026-08-29 の 移植で **旧アプリの スライドを そのまま 写した");
  out("当て画像**である。絵柄が 別系統（鉛筆テクスチャ・くすんだ グレー）で、実在の ロゴが");
  out("写り込んで いる ものも あり、**11枚は 720×405 しか なく 拡大しても 読めない**。");
  out();
  out("## 作業する 場所");
  out();
  out("**ローカル**。Codex の image-gen-2 が 要る ので、クラウドの セッションでは 作れない。");
  out("`cwebp` も クラウドには 無い。");
  out();
  out("```bash");
  out("# 別の ターミナルで 先に 立てる");
  out("npm run codex:bridge");
  out();
  out("# 台帳を 1つずつ 流す（出力は PNG。出力先に もう ある ファイルは 飛ばす）");
  out("node scripts/slides/gen_images.mjs scripts/images/hourensou_tomita.json .tmp-img/tomita");
  out("```");
  out();
  out("## 置き場所の 決まり");
  out();
  out("| 何の 絵                  | 置き場                                              |");
  out("| ------------------------ | --------------------------------------------------- |");
  out("| 講義・スキットの 絵      | `public/img/hourensou/<ステージ>/<名前>.webp`        |");
  out("| まんがの コマ            | `public/img/manga/renraku_manga/panel<n>.webp`       |");
  out("| 場面クイズ               | `public/img/quiz/soudan_kehai/<設問ID>.webp`         |");
  out("| 人物の 設定画            | `public/img/characters/<id>/sheet.webp`              |");
  out();
  out("PNG で 出る ので **WebP に 変換してから 置く**: `cwebp -q 84 in.png -o out.webp`");
  out();
  out(
    "**`content/*.json` を 手で 直さない。** `scripts/gen_hourensou_content.mjs` が 作り直すので",
  );
  out("消える。絵を **同じ パスに 上書き**すれば、データを 触らずに 画面が 変わる。");
  out();
  out("## いちばん 先に やる こと — ふりがなの 試作");
  out();
  out("2026-08-30 の 指定:「**ふりがなを 丁寧に 振るという 指示を 出せば ふりがなつきの 画像に");
  out("なります。規律2は 一旦 流して 見て。ダメそうなら 考えて**」。");
  out();
  out("これまでの 決めごとは 逆で、`src/content/schema.ts` には「ふりがなは 実例が ゼロで、");
  out("原理的にも 最も 壊れる」と 書いて ある。**今回は それを 横に 置いて 試す。**");
  out();
  out("> **関門: `hourensou_zukai` の 1枚目（報連相の 3つ）だけを 先に 作る。**");
  out("> できた 絵を **幅 390px に 縮めて** 見て、漢字の 上の ふりがなが 読めるか 確かめる。");
  out(">");
  out("> - 読めた → そのまま 残りを 流す");
  out("> - 潰れた → **文字を 焼くのを やめる**。台帳の `noText` を 文字なしの ものに 差しかえ、");
  out(">   `text` に 書いて ある ことばを 教材データ側（`cards` / `steps` ブロック）へ 移す");
  out();
  out("## 作る 順");
  out();
  out("1. **富田さんの 設定画**（0番）— これが 無いと 報告ステージの 絵が 始まらない");
  out("2. **場面クイズ6枚・まんが9コマ** — いま 絵が 無く、画面に 点線わくが 出て いる");
  out("3. **文字入りの 図**（`*_zukai`）— 720×405 で 読めない ものを 含む");
  out("4. **残りの 場面**");
  out();

  const { n, counts } = renderLedgers(out, ORDER, "hourensou_");

  out("---");
  out();
  out("## 動画の ポスター 3枚（生成しない）");
  out();
  out("`poster_30min_a/b/c.webp` は `soudan/slide6.webp` を たてに 3つへ 切った もの。");
  out("slide6 を 作り直したら、同じように 切り出して 置きかえる（生成は 要らない）。");
  out();
  out("## 差しかえた あとの 確かめ");
  out();
  out("```bash");
  out("npm run gen:content      # 焼き込みモジュールを 作り直す（忘れると 画面が 変わらない）");
  out("npm run lint:content     # スキーマ・ふりがな・焼き込みずれ");
  out("npm run e2e              # 通しの 自動検証");
  out("```");
  out();
  out(`絵の 数: **${n}枚**（内訳 — ${counts.map(([l, c]) => `${l} ${c}`).join(" ／ ")}）`);
  out();
  return n;
});

writeDoc("kaihatsu_絵の作り直し台帳", (out) => {
  out("# 開発の 工程 — 絵の 作り直し台帳");
  out();
  out("> **この ファイルは `node scripts/gen_image_handoff.mjs` が 作る。手で 直さない。**");
  out("> 直すのは `scripts/images/kaihatsu_*.json`（台帳）の ほう。");
  out();
  out(
    "「開発の 工程」の レクチャーの 絵 9枚を、**アプリの テイストに そろえて 作り直す**ための 指示書。",
  );
  out("報連相の 台帳（`hourensou_絵の作り直し台帳.md`）と 同じ 読み方で 使える。");
  out();
  out("## なぜ 作り直すのか");
  out();
  out("いま 出て いるのは 2026-08-31 の 移植で **旧アプリの スライドを 縮めて 写した 当て画像**。");
  out("絵柄が 別系統（鉛筆テクスチャ・くすんだ グレー）な うえに、**英語の 副題と 説明文が");
  out("びっしり 入って いる**。元が 1800px でも 本文の 幅 1048px に 縮めると どれも 読めない——");
  out("`dev_process.webp` は 7つの 工程に 日本語・英語・説明文が 全部 入って いて、");
  out("**テスト／デプロイ／保守運用の 名前が 上下 2回 くり返されて いる**。");
  out("同じ 絵の 開発の コマには **Git の ロゴ**（実在の ブランドマーク）も 写り込んで いる。");
  out();
  out("作り直しの 方針は 1つ: **名前だけ 大きく、中身は 絵で 見せる。** 説明文は 教材の");
  out("カードが すでに 持って いるので、絵に 二重に 書かない。");
  out();
  out("## 作業する 場所");
  out();
  out("**ローカル**。Codex の image-gen-2 が 要る ので、クラウドの セッションでは 作れない。");
  out("`cwebp` も クラウドには 無い。");
  out();
  out("```bash");
  out("# 別の ターミナルで 先に 立てる");
  out("npm run codex:bridge");
  out();
  out("# 文字入りの 図 → 場面 の 順に 流す");
  out(
    "node scripts/slides/gen_images.mjs scripts/images/kaihatsu_zukai.json .tmp-img/kaihatsu_zukai",
  );
  out("```");
  out();
  out("## 置き場所の 決まり");
  out();
  out("9枚 ぜんぶ `public/img/kaihatsu/<名前>.webp` に **同じ 名前で 上書き**する。");
  out("PNG で 出る ので 変換してから 置く: `cwebp -q 84 in.png -o out.webp`");
  out();
  out("**`content/articles/kaihatsu_lecture.json` を 手で 直さない。**");
  out("`scripts/gen_kaihatsu_content.mjs` が 作り直すので 消える。絵を 同じ パスに 上書きすれば、");
  out("データを 触らずに 画面が 変わる。");
  out();
  out("## いちばん 先に やる こと — ふりがなの 試作");
  out();
  out("報連相と **同じ 関門**を 通す（2026-08-30 の 指定「ふりがなを 丁寧に 振るという 指示を");
  out("出せば ふりがなつきの 画像に なります。規律2は 一旦 流して 見て」）。");
  out();
  out("> **`kaihatsu_zukai` の 1枚目（7つの 工程）だけを 先に 作る。**");
  out("> できた 絵を **幅 390px に 縮めて** 見て、漢字の 上の ふりがなが 読めるか 確かめる。");
  out(">");
  out("> - 読めた → そのまま 残りを 流す");
  out("> - 潰れた → **文字を 焼くのを やめる**。台帳の `noText` を 文字なしの ものに 差しかえ、");
  out(
    ">   `text` の ことばは 教材データ側（`cards` ブロック）が すでに 持って いるので 移さなくて よい",
  );
  out(">");
  out("> 報連相の 関門を 先に 通して あれば、その 結果を そのまま 使って よい（同じ 指示文）。");
  out();

  const { n, counts } = renderLedgers(out, KAIHATSU_ORDER, "kaihatsu_");

  out("---");
  out();
  out("## 絵と 本文が 食い違って いた ところ（直しずみ）");
  out();
  out("当て画像の `deploy.webp` は **4つ**の 場面（デプロイ準備・デプロイ実行・稼働確認・");
  out("デプロイ完了）を 描いて いるのに、下の カードは **3つ**しか 無かった。");
  out("作り直しでは **3つに そろえる**（キャプションも「デプロイの 3つの 場面」に 直した）。");
  out();
  out("## 差しかえた あとの 確かめ");
  out();
  out("```bash");
  out("node scripts/gen_kaihatsu_content.mjs   # 教材データを 作り直す");
  out("npm run gen:content                     # 焼き込みモジュール（忘れると 画面が 変わらない）");
  out("npm run lint:content                    # スキーマ・ふりがな・焼き込みずれ");
  out("npm run e2e                             # 通しの 自動検証");
  out("```");
  out();
  out(`絵の 数: **${n}枚**（内訳 — ${counts.map(([l, c]) => `${l} ${c}`).join(" ／ ")}）`);
  out();
  return n;
});
