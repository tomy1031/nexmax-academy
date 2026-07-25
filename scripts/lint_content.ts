/**
 * コンテンツ検収（検収パイプライン第1段・機械検査）
 *
 * 実行: npm run lint:content
 * 検査対象: content ディレクトリ配下の *.json と src 配下の *.ts / *.tsx
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
import ts from "typescript";
import { contentSchema, FORBIDDEN_LEARNER_WORDS, type Scenario } from "../src/content/schema";

const ROOT = join(import.meta.dirname, "..");
const CONTENT_DIR = join(ROOT, "content");
const SRC_DIR = join(ROOT, "src");

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

function walkSource(dir: string): string[] {
  let files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files = files.concat(walkSource(full));
    else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) files.push(full);
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

function isForbiddenListDefinition(node: ts.Node): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (
      ts.isVariableDeclaration(parent) &&
      ts.isIdentifier(parent.name) &&
      parent.name.text === "FORBIDDEN_LEARNER_WORDS"
    ) {
      return true;
    }
  }
  return false;
}

function sourceLiteralText(node: ts.Node): string | null {
  if (ts.isStringLiteralLike(node) || ts.isJsxText(node)) return node.text;
  if (
    node.kind === ts.SyntaxKind.TemplateHead ||
    node.kind === ts.SyntaxKind.TemplateMiddle ||
    node.kind === ts.SyntaxKind.TemplateTail
  ) {
    return (node as ts.LiteralLikeNode).text;
  }
  return null;
}

function checkSourceForbiddenWords(file: string) {
  const rel = relative(ROOT, file);
  const sourceText = readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  function visit(node: ts.Node) {
    const text = sourceLiteralText(node);
    if (text !== null && !isForbiddenListDefinition(node)) {
      for (const word of FORBIDDEN_LEARNER_WORDS) {
        if (!text.includes(word)) continue;
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        findings.push({
          file: rel,
          level: "error",
          message: `禁止語「${word}」が文字列リテラル ${line + 1}:${character + 1} にある — フィードバックは励まし＋次の行動に（P8）`,
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

function main() {
  let files: string[] = [];
  let contentDirAvailable = true;
  try {
    files = walk(CONTENT_DIR);
  } catch {
    contentDirAvailable = false;
    console.log("content/ ディレクトリがありません。検査対象なし。");
  }
  if (contentDirAvailable && files.length === 0) {
    console.log("コンテンツファイルがありません。検査対象なし。");
  }

  // kind別のID重複をファイル横断で検出する（同じステージ/シナリオIDが2ファイルにあると進捗保存が壊れる）
  const seenIds = new Map<string, string>();

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

    const idKey = `${parsed.data.kind}:${parsed.data.id}`;
    const dup = seenIds.get(idKey);
    if (dup) {
      findings.push({
        file: rel,
        level: "error",
        message: `ID「${parsed.data.id}」（${parsed.data.kind}）が ${dup} と重複している`,
      });
    } else {
      seenIds.set(idKey, rel);
    }

    checkForbiddenWords(rel, data);
    if (parsed.data.kind === "scenario") {
      checkSecretLeaks(rel, parsed.data);
    }
  }

  const sourceFiles = walkSource(SRC_DIR);
  for (const file of sourceFiles) checkSourceForbiddenWords(file);

  const errors = findings.filter((f) => f.level === "error");
  const warns = findings.filter((f) => f.level === "warn");
  for (const f of findings) {
    console.log(`${f.level === "error" ? "✖" : "⚠"} [${f.file}] ${f.message}`);
  }
  console.log(
    `\nコンテンツ ${files.length} ファイル / ソース ${sourceFiles.length} ファイル検査: エラー ${errors.length} / 警告 ${warns.length}`,
  );
  if (errors.length > 0) process.exit(1);
}

main();
