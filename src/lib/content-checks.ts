/**
 * コンテンツ機械検査のロジック（検収パイプライン第1段）
 *
 * scripts/lint_content.ts（CI）と、将来のスタジオ側検査（下書きの保存前検査）が
 * 同じ関数を共用する。「誰が作ったか」でなく「検査を通ったか」で公開可否を決める
 * ため、検査ロジックはここ1か所に閉じる（設計07 §2）。
 *
 * 検査項目:
 *  - 禁止語（学習者向け文言に「不正解」等を使わない — 理解設計ガイド P8）
 *  - 秘匿情報の漏れ（シナリオ: 質問で引き出すべき事実を調査用模擬ページに書かない）
 *  - kind別ID重複（ファイル横断。重複すると進捗保存が壊れる）
 *  - 参照整合（stage.contents / wordStageIds の参照先が存在するか — 設計07 §3）
 */

import { FORBIDDEN_LEARNER_WORDS, type Content, type Scenario } from "../content/schema";

export interface Finding {
  file: string;
  level: "error" | "warn";
  message: string;
}

/** スキーマ検証を通ったコンテンツ1件（横断検査の入力）。 */
export interface ContentEntry {
  file: string;
  content: Content;
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

/** 禁止語検査。データ内の全文字列を走査する。 */
export function checkForbiddenWords(file: string, data: unknown): Finding[] {
  const findings: Finding[] = [];
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
  return findings;
}

/** 秘匿漏れ検査。reqs のキーワードが調査用模擬ページに書かれていたら警告。 */
export function checkSecretLeaks(file: string, scenario: Scenario): Finding[] {
  const findings: Finding[] = [];
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
  return findings;
}

/** kind別のID重複をファイル横断で検出する（同じIDが2ファイルにあると進捗保存が壊れる）。 */
export function checkDuplicateIds(entries: readonly ContentEntry[]): Finding[] {
  const findings: Finding[] = [];
  const seen = new Map<string, string>();
  for (const { file, content } of entries) {
    const key = `${content.kind}:${content.id}`;
    const dup = seen.get(key);
    if (dup) {
      findings.push({
        file,
        level: "error",
        message: `ID「${content.id}」（${content.kind}）が ${dup} と重複している`,
      });
    } else {
      seen.set(key, file);
    }
  }
  return findings;
}

/**
 * 参照整合検査（全ファイル横断）。
 * stage.contents の各 ref が同じ type のコンテンツとして存在するか、
 * wordStageIds の各IDが wordstage として存在するかを調べ、欠けていたら error。
 */
export function checkReferenceIntegrity(entries: readonly ContentEntry[]): Finding[] {
  const findings: Finding[] = [];
  const idsByKind = new Map<string, Set<string>>();
  for (const { content } of entries) {
    const set = idsByKind.get(content.kind) ?? new Set<string>();
    set.add(content.id);
    idsByKind.set(content.kind, set);
  }

  for (const { file, content } of entries) {
    if (content.kind !== "stage") continue;
    content.contents.forEach((item, i) => {
      if (!idsByKind.get(item.type)?.has(item.ref)) {
        findings.push({
          file,
          level: "error",
          message: `contents[${i}] の参照先「${item.ref}」（${item.type}）が存在しない — ステージの参照切れ（設計07 §3）`,
        });
      }
    });
    content.wordStageIds.forEach((id) => {
      if (!idsByKind.get("wordstage")?.has(id)) {
        findings.push({
          file,
          level: "error",
          message: `wordStageIds の「${id}」が wordstage として存在しない — ステージの参照切れ（設計07 §3）`,
        });
      }
    });
  }
  return findings;
}
