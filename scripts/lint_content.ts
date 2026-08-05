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
 *  4. kind別ID重複＋参照整合（stage.contents / wordStageIds の参照切れ — 設計07 §3）
 *  5. 導線の一致（article の link ブロックがステージの学習順の直後を指しているか）
 *  6. マップの停留所とステージの結びつき（step重複・既定エリアより先の area 未設定）。
 *     マップは「1ステージ＝1エリア＝背景画像1枚」（src/content/areas.ts）。
 *
 * 検査ロジックの実体は src/lib/content-checks.ts（スタジオ側と共用）。
 * このスクリプトはファイル走査とレポートだけを受け持つ。
 *
 * 終了コード: エラーあり=1 / 警告のみ・問題なし=0
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { contentSchema, FORBIDDEN_LEARNER_WORDS } from "../src/content/schema";
import {
  checkDuplicateIds,
  checkForbiddenWords,
  checkLinkOrder,
  checkReferenceIntegrity,
  checkStageSteps,
  checkSecretLeaks,
  type ContentEntry,
  type Finding,
} from "../src/lib/content-checks";

const ROOT = join(import.meta.dirname, "..");
const CONTENT_DIR = join(ROOT, "content");
const SRC_DIR = join(ROOT, "src");

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

  // スキーマ検証を通ったコンテンツ（横断検査＝ID重複・参照整合の入力）
  const entries: ContentEntry[] = [];

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

    entries.push({ file: rel, content: parsed.data });
    findings.push(...checkForbiddenWords(rel, data));
    if (parsed.data.kind === "scenario") {
      findings.push(...checkSecretLeaks(rel, parsed.data));
    }
  }

  findings.push(...checkDuplicateIds(entries));
  findings.push(...checkReferenceIntegrity(entries));
  findings.push(...checkLinkOrder(entries));
  findings.push(...checkStageSteps(entries));

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
