/**
 * 可読性計測（検収パイプライン第1段・語彙計測の土台）
 *
 * 実行: npm run measure:readability
 * 対象: content 配下の *.json の全文字列フィールド
 *
 * v1 で計測するもの:
 *  - 30字超の文（1文15〜30字の規律 — 理解設計ガイド P10）
 *  - ファイルごとの漢字密度
 *
 * TODO(v2): 形態素解析（kuromoji等）を入れ、JLPT級別語彙リスト
 * （data/jlpt/n5.txt, n4.txt — 1行1語）との突き合わせで
 * 「N4超語彙の出現率」「読み辞書未登録語」を数値化する。
 * 感想ベースの難易度判定はこの数値レポートで置き換える（03 §4 第1段）。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const CONTENT_DIR = join(ROOT, "content");
const MAX_SENTENCE = 30;
/** 文長検査から除外するフィールド（学習者が読む本文ではないもの）。 */
const EXCLUDED_KEYS = new Set(["html", "persona", "url", "voice", "avatar", "color", "icon", "id"]);

function walk(dir: string): string[] {
  let files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files = files.concat(walk(full));
    else if (entry.endsWith(".json")) files.push(full);
  }
  return files;
}

function collectStrings(
  value: unknown,
  path: string,
  key: string,
  out: [string, string][],
) {
  if (typeof value === "string") {
    if (!EXCLUDED_KEYS.has(key)) out.push([path, value]);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => collectStrings(v, `${path}[${i}]`, key, out));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      collectStrings(v, path ? `${path}.${k}` : k, k, out);
    }
  }
}

function main() {
  let files: string[] = [];
  try {
    files = walk(CONTENT_DIR);
  } catch {
    console.log("content/ ディレクトリがありません。");
    return;
  }

  for (const file of files) {
    const rel = relative(ROOT, file);
    const data = JSON.parse(readFileSync(file, "utf8"));
    const strings: [string, string][] = [];
    collectStrings(data, "", "", strings);

    const longSentences: [string, string][] = [];
    let kanji = 0;
    let total = 0;
    for (const [path, text] of strings) {
      total += text.length;
      kanji += (text.match(/[一-龯]/gu) ?? []).length;
      if (!/[ぁ-ゖァ-ヶ一-龯]/u.test(text)) continue; // 日本語を含む文字列のみ文長検査
      for (const sentence of text.split(/[。！？\n]/)) {
        const s = sentence.trim();
        if (s.length > MAX_SENTENCE) longSentences.push([path, s]);
      }
    }

    console.log(`\n■ ${rel}`);
    console.log(
      `  漢字密度: ${total ? ((kanji / total) * 100).toFixed(1) : 0}%（${kanji}/${total}字）`,
    );
    if (longSentences.length === 0) {
      console.log(`  ${MAX_SENTENCE}字超の文: なし`);
    } else {
      console.log(`  ${MAX_SENTENCE}字超の文: ${longSentences.length}件`);
      for (const [path, s] of longSentences.slice(0, 10)) {
        console.log(`    - ${path}: 「${s.slice(0, 40)}…」(${s.length}字)`);
      }
      if (longSentences.length > 10) {
        console.log(`    …ほか ${longSentences.length - 10} 件`);
      }
    }
  }
}

main();
