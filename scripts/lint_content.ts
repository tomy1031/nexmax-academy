/**
 * コンテンツ検収（検収パイプライン第1段・機械検査）
 *
 * 実行: npm run lint:content
 * 検査対象: content ディレクトリ配下の *.json
 *
 * 検査項目:
 *  1. zodスキーマ検証（src/content/schema.ts が唯一の契約）
 *  2. 禁止語（学習者向け文言に「不正解」等を使わない — 理解設計ガイド P8）
 *  3. 秘匿情報の漏れ（シナリオ: reqs のキーワードが調査用模擬ページに
 *     書かれていたら警告 — 質問で引き出すべき情報は調査素材に書かない）
 *
 * 終了コード: エラーあり=1 / 警告のみ・問題なし=0
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { contentSchema, FORBIDDEN_LEARNER_WORDS, type Scenario } from "../src/content/schema";

const ROOT = join(import.meta.dirname, "..");
const CONTENT_DIR = join(ROOT, "content");

interface Finding {
  file: string;
  level: "error" | "warn";
  message: string;
}

const findings: Finding[] = [];

function walk(dir: string): string[] {
  let files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files = files.concat(walk(full));
    else if (entry.endsWith(".json")) files.push(full);
  }
  return files;
}

function collectStrings(value: unknown, path: string, out: [string, string][]) {
  if (typeof value === "string") {
    out.push([path, value]);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => collectStrings(v, `${path}[${i}]`, out));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      collectStrings(v, path ? `${path}.${k}` : k, out);
    }
  }
}

function checkForbiddenWords(file: string, data: unknown) {
  const strings: [string, string][] = [];
  collectStrings(data, "", strings);
  for (const [path, text] of strings) {
    for (const word of FORBIDDEN_LEARNER_WORDS) {
      if (text.includes(word)) {
        findings.push({
          file,
          level: "error",
          message: `禁止語「${word}」が ${path} にある — フィードバックは励まし＋次の行動に（P8）`,
        });
      }
    }
  }
}

function checkSecretLeaks(file: string, scenario: Scenario) {
  const pagesHtml = scenario.research.pages.map((p) => p.html).join("\n");
  for (const req of scenario.interview.reqs) {
    const leaked = req.keywords.filter((kw) => kw.length >= 2 && pagesHtml.includes(kw));
    if (leaked.length > 0) {
      findings.push({
        file,
        level: "warn",
        message: `${req.id}（${req.label}）のキーワード [${leaked.join(", ")}] が調査ページ内にある — 質問で引き出す情報なら模擬ページから削除する（P4）`,
      });
    }
  }
}

function main() {
  let files: string[] = [];
  try {
    files = walk(CONTENT_DIR);
  } catch {
    console.log("content/ ディレクトリがありません。検査対象なし。");
    return;
  }
  if (files.length === 0) {
    console.log("コンテンツファイルがありません。検査対象なし。");
    return;
  }

  for (const file of files) {
    const rel = relative(ROOT, file);
    let data: unknown;
    try {
      data = JSON.parse(readFileSync(file, "utf8"));
    } catch (e) {
      findings.push({ file: rel, level: "error", message: `JSONとして読めない: ${e}` });
      continue;
    }

    const parsed = contentSchema.safeParse(data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        findings.push({
          file: rel,
          level: "error",
          message: `スキーマ違反 ${issue.path.join(".") || "(root)"}: ${issue.message}`,
        });
      }
      continue;
    }

    checkForbiddenWords(rel, data);
    if (parsed.data.kind === "scenario") {
      checkSecretLeaks(rel, parsed.data);
    }
  }

  const errors = findings.filter((f) => f.level === "error");
  const warns = findings.filter((f) => f.level === "warn");
  for (const f of findings) {
    console.log(`${f.level === "error" ? "✖" : "⚠"} [${f.file}] ${f.message}`);
  }
  console.log(`\n${files.length} ファイル検査: エラー ${errors.length} / 警告 ${warns.length}`);
  if (errors.length > 0) process.exit(1);
}

main();
