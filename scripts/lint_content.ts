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
 *  7. ふりがなの覆い漏れ（学習者が読む文の漢字が読み辞書で全部覆えているか — 規律2）
 *  7b. 熟語が2語に割れた読み（「報告書」→「報告」＋「書」＝ほうこくか）
 *  7c. 読み辞書エントリの壊れ（死にエントリ・送りがな落ち・同表記異読 —
 *      src/lib/text/furigana-checks.ts）
 *  7d. 読みの正しさの照合（画面と同じルビ合成 × 形態素解析。食い違いはエラー、
 *      確かめ済みは scripts/lib/yomi_allow.ts — 「考え→かんが」が緑のまま
 *      4ファイルで生き残った 2026-08-30 の再発防止）
 *  8. 焼き込みモジュールのずれ（src/content/git-contents.generated.ts）。
 *     アプリはこの生成物だけを読むので、ずれると JSON を直しても画面が変わらない。
 *  9. スライドのファイル面（fileUrl の PDF が public/ に実在するか・pageCount が
 *     実ページ数と合っているか）。学習者が読む字の大半は PDF 側にあるのに、
 *     JSON しか見ないと「画面に何も出ない」「nまい表示が嘘」を素通しする。
 * 10. スライド組版原稿（scripts/slides/<教材ID>/index.html）の禁止語・国名。
 *     PDF は焼き上がりで検査できないので、原稿の側で見る（規律1・9）。
 *
 * 検査ロジックの実体は src/lib/content-checks.ts（スタジオ側と共用）。
 * このスクリプトはファイル走査とレポートだけを受け持つ。
 * 8〜9 は fs に依存するのでこの側に置く。10 のロジックは純関数だが、原稿は
 * このリポジトリにしか無い（スタジオからは見えない）ので、走査ごと
 * scripts/slides/manuscript_checks.ts に置く（語のリストと判定は共用）。
 *
 * 終了コード: エラーあり=1 / 警告のみ・問題なし=0
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { contentSchema, FORBIDDEN_LEARNER_WORDS } from "../src/content/schema";
import {
  checkDuplicateIds,
  checkForbiddenWords,
  checkCountryNames,
  checkFuriganaCoverage,
  checkFuriganaEntrySoundness,
  checkSplitCompoundReadings,
  checkIntroStage,
  checkLinkOrder,
  checkReferenceIntegrity,
  checkStageOrder,
  checkSecretLeaks,
  type ContentEntry,
  type Finding,
} from "../src/lib/content-checks";
// 読みの正しさの照合は kuromoji（devDependency）に依存するので scripts 側に置く。
// スタジオ（ブラウザ・Worker）へは持ち込めない——辞書 約18MB が載らないため。
import { checkYomiCorrectness } from "./lib/yomi_check";
// 焼き込みモジュールの作り手と同じ関数で組み立てて比べる（作り方が2つに割れないように）
import { buildGeneratedSource, GENERATED_PATH } from "./lib/bake_content";
import { buildDictionaryJson, DICTIONARY_GENERATED_PATH } from "./lib/bake_dictionary";
import { buildSceneSource, SCENE_GENERATED_PATH } from "./generate_scene_index.mjs";
import {
  buildGlossarySource,
  collectGlossaryEntries,
  GLOSSARY_GENERATED_PATH,
} from "./generate_glossary.mjs";
import { checkManuscript } from "./slides/manuscript_checks";

const ROOT = join(import.meta.dirname, "..");
const CONTENT_DIR = join(ROOT, "content");
const SRC_DIR = join(ROOT, "src");
const PUBLIC_DIR = join(ROOT, "public");
const SLIDES_MANUSCRIPT_DIR = join(ROOT, "scripts", "slides");

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

/**
 * 焼き込みモジュールが content/ とずれていないかを見る。
 *
 * アプリが実際に読むのは content/*.json ではなく
 * src/content/git-contents.generated.ts のほう（Cloudflare に fs が無いため）。
 * ずれたままだと、先生が JSON を直しても画面が変わらず、原因も見えない。
 */
function checkGenerated(path: string, expected: () => string, source: string): Finding[] {
  const rel = relative(ROOT, path);
  let current: string;
  try {
    current = readFileSync(path, "utf8");
  } catch {
    return [
      {
        file: rel,
        level: "error",
        message: "焼き込みモジュールが無い — `npm run gen:content` で作る",
      },
    ];
  }
  if (current === expected()) return [];
  return [
    {
      file: rel,
      level: "error",
      message: `焼き込みモジュールが ${source} とずれている — \`npm run gen:content\` で作り直す（アプリはこちらを読むので、直さないと画面が変わらない）`,
    },
  ];
}

function checkGeneratedIndex(): Finding[] {
  return [
    ...checkGenerated(GENERATED_PATH, buildGeneratedSource, "content/"),
    ...checkGenerated(SCENE_GENERATED_PATH, buildSceneSource, "public/img/scenes/"),
    /*
     * 語彙メモは 正（content/vocab/）から 焼く。ずれると **診断の 画面だけ 古い 説明**が
     * 出続ける——語を 1か所に した 意味が 無くなるので、機械で 止める。
     */
    ...checkGenerated(
      GLOSSARY_GENERATED_PATH,
      () => buildGlossarySource(collectGlossaryEntries()),
      "content/vocab/",
    ),
    /*
     * ポップアップ辞書は **ブラウザが 取りに来る 1枚**（public/dictionary/learner.json）。
     * ずれると 本文の 下線と ふきだしだけ 古い 説明に なる —— しかも 画面は 動くので
     * 気づけない。ページの 積み荷から 降ろした 代わりに、ここで 見張る
     *（scripts/lib/bake_dictionary.ts に 理由と 実測値）。
     */
    ...checkGenerated(DICTIONARY_GENERATED_PATH, buildDictionaryJson, "content/vocab/"),
  ];
}

/**
 * スライドのファイル面の検査（fs に依存するのでスクリプト側 — 冒頭コメント参照）。
 *
 * - fileUrl の実在: `/` で始まるパスは public/ 配下に実物があるか。無いまま公開すると
 *   学習者の画面にスライドが出ない（`https://` はスタジオで上げた置き場なので、
 *   ここでは確かめようがなく、対象にしない）。
 * - pageCount と実ページ数: ずれると「ぜんぶで nまい」の表示としおりが静かに壊れる。
 *   render_pdf.mjs も印刷時に同じ突き合わせをするが、印刷を通さず JSON だけ
 *   直したとき（枚数の書きまちがい）はここでしか捕まらない。
 */
async function checkSlidesFiles(entries: readonly ContentEntry[]): Promise<Finding[]> {
  const out: Finding[] = [];
  const targets = entries.filter(
    ({ content }) => content.kind === "slides" && content.fileUrl.startsWith("/"),
  );
  if (targets.length === 0) return out;

  // pdfjs は対象があるときだけ・1回だけ読み込む。教材ごとの try の外に置くのは、
  // 依存の壊れ（メジャー更新でのパス移動など）を「この PDF が読めない」と
  // 教材のせいにして誤報しないため（その場合はそのまま落として原因を見せる）。
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

  for (const { file, content } of targets) {
    if (content.kind !== "slides") continue;
    // fileUrl は URL なので、ファイルの場所に直すときは %20 などを戻す
    const urlPath = content.fileUrl.replace(/[?#].*$/, "");
    let decoded = urlPath;
    try {
      decoded = decodeURIComponent(urlPath);
    } catch {
      // 壊れた %xx はそのまま探す（無ければ次の実在検査が知らせる）
    }
    const pdfPath = join(PUBLIC_DIR, decoded);
    if (!existsSync(pdfPath)) {
      out.push({
        file,
        level: "error",
        message: `fileUrl「${content.fileUrl}」の PDF が public/ に無い — 学習者の画面にスライドが出ない。render_pdf.mjs で作るか fileUrl を直す`,
      });
      continue;
    }
    const task = getDocument({ data: new Uint8Array(readFileSync(pdfPath)) });
    try {
      const pages = (await task.promise).numPages;
      if (pages !== content.pageCount) {
        out.push({
          file,
          level: "error",
          message: `pageCount(${content.pageCount}) が PDF の実ページ数(${pages}) とずれている — 「ぜんぶで nまい」の表示としおりが壊れる。JSON か PDF を直す`,
        });
      }
    } catch (e) {
      out.push({
        file,
        level: "error",
        message: `fileUrl「${content.fileUrl}」が PDF として読めない: ${e}`,
      });
    } finally {
      await task.destroy();
    }
  }
  return out;
}

/**
 * スライド組版原稿の一覧（scripts/slides/<教材ID>/index.html）。
 *
 * 教材 JSON と突き合わせない——原稿が先・教材があとの順でも作るので、
 * 対応する教材がまだ無い原稿も、ある限り全部検査する。
 */
function listManuscripts(): string[] {
  // scripts/slides/ はこのスクリプトが import している場所なので、必ず在る
  return readdirSync(SLIDES_MANUSCRIPT_DIR)
    .map((name) => join(SLIDES_MANUSCRIPT_DIR, name, "index.html"))
    .filter((path) => existsSync(path));
}

async function main() {
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
    findings.push(...checkCountryNames(rel, parsed.data));
    if (parsed.data.kind === "scenario") {
      findings.push(...checkSecretLeaks(rel, parsed.data));
    }
  }

  findings.push(...checkDuplicateIds(entries));
  findings.push(...checkReferenceIntegrity(entries));
  findings.push(...checkLinkOrder(entries));
  findings.push(...checkStageOrder(entries));
  findings.push(...checkIntroStage(entries));
  findings.push(...checkFuriganaCoverage(entries));
  findings.push(...checkSplitCompoundReadings(entries));
  findings.push(...checkFuriganaEntrySoundness(entries));
  findings.push(...(await checkYomiCorrectness(entries)));
  findings.push(...checkGeneratedIndex());
  findings.push(...(await checkSlidesFiles(entries)));

  const manuscripts = listManuscripts();
  for (const path of manuscripts) {
    findings.push(...checkManuscript(relative(ROOT, path), readFileSync(path, "utf8")));
  }

  const sourceFiles = walkSource(SRC_DIR);
  for (const file of sourceFiles) checkSourceForbiddenWords(file);

  const errors = findings.filter((f) => f.level === "error");
  const warns = findings.filter((f) => f.level === "warn");
  for (const f of findings) {
    console.log(`${f.level === "error" ? "✖" : "⚠"} [${f.file}] ${f.message}`);
  }
  console.log(
    `\nコンテンツ ${files.length} ファイル / 原稿 ${manuscripts.length} ファイル / ソース ${sourceFiles.length} ファイル検査: エラー ${errors.length} / 警告 ${warns.length}`,
  );
  if (errors.length > 0) process.exit(1);
}

// tsx はこのファイルを CJS として変換するのでトップレベル await は使えない
main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
