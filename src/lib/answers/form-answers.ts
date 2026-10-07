/**
 * 書きこみフォーム（記事の `form` ブロック）の 型と 記録の 形
 *
 * 画面（`src/components/article/form-block.tsx`）と 保存（`./form-answers-db.ts`）の
 * あいだで 使う **決まりごと だけ**を ここに 置く。DB も 画面も 知らない ので、
 * 単体テストで そのまま 確かめられる（`tests/form_answers.test.ts`）。
 *
 * ## 型の 書き方（schema.ts の `form` と 同じ）
 * `＿` が 続く ところが 書きこむ 欄。**すぐ あとが `％` の 欄は 数字だけ**。
 *   「＿＿＿＿機能の 進捗は、＿＿％です。」→ 文字の 欄 ＋ 数字の 欄
 *
 * ## 記録は「組み立てた 文」で 残す
 * 先生が 読むのは 空欄の 中身では なく **学習者が 言う つもりの 1文**
 *（「きのうは、商品名と 値段を 表示しました。」）。欄ごとに 分けて 残すと、
 * 先生は 型を 思い出しながら 頭の 中で つなぐ ことに なる。
 */

import type { ArticleBlock } from "@/content/schema";

export type FormBlock = Extract<ArticleBlock, { kind: "form" }>;
export type FormField = FormBlock["fields"][number];

/** 型を 切った 1つぶん。 */
export type TemplatePart =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "blank"; readonly numeric: boolean };

/** 型を 地の 文と 欄に 切る。 */
export function parseFormTemplate(template: string): TemplatePart[] {
  const parts: TemplatePart[] = [];
  const blank = /＿+/gu;
  let last = 0;
  for (const match of template.matchAll(blank)) {
    const at = match.index ?? 0;
    if (at > last) parts.push({ kind: "text", text: template.slice(last, at) });
    const next = template.charAt(at + match[0].length);
    parts.push({ kind: "blank", numeric: next === "％" || next === "%" });
    last = at + match[0].length;
  }
  if (last < template.length) parts.push({ kind: "text", text: template.slice(last) });
  return parts;
}

/** 欄の 数（入力の 箱の 数）。 */
export function countBlanks(template: string): number {
  return parseFormTemplate(template).filter((part) => part.kind === "blank").length;
}

/**
 * 数字の 欄を 読む。全角（「６０」）でも 受ける。0〜100 の 整数で なければ null。
 *
 * 進捗の ％は「だいたい」で よい（朝礼ページ 3節「1％ずつ こまかく 計算は しません」）
 * が、100を こえる・数字で ない ものは 言い直しが 要る——そのまま 残すと、
 * 先生は「120％」を 書き間違いか 冗談か 区別できない。
 */
export function readPercent(value: string): number | null {
  const text = value.normalize("NFKC").trim();
  if (!/^\d{1,3}$/u.test(text)) return null;
  const n = Number(text);
  return n >= 0 && n <= 100 ? n : null;
}

/** 欄に 書いた ものを 型に 戻して 1文に する（前後の 空白は 落とす）。 */
export function fillFormTemplate(template: string, values: readonly string[]): string {
  let blank = 0;
  return parseFormTemplate(template)
    .map((part) => {
      if (part.kind === "text") return part.text;
      const raw = (values[blank++] ?? "").trim();
      if (!part.numeric) return raw;
      const n = readPercent(raw);
      return n === null ? raw : String(n);
    })
    .join("");
}

/** 1つの 欄の 入力（欄ごとの 文字 ＋「ない」を えらんだか）。 */
export interface FieldInput {
  readonly values: readonly string[];
  readonly none: boolean;
}

/** 書きなおしが 要る ところ。画面は これを そのまま ことばに する。 */
export type FieldProblem = "empty" | "percent";

/**
 * 出す 前の 見なおし。**中身の 良し悪しは 見ない**（正解の 無い 練習。絵の「ポイント」
 *「正しい答えは ありません」）。見るのは 空いて いる 欄と、数字の 欄の 形だけ。
 */
export function checkFormInput(
  fields: readonly FormField[],
  inputs: Readonly<Record<string, FieldInput>>,
): Record<string, FieldProblem> {
  const problems: Record<string, FieldProblem> = {};
  for (const field of fields) {
    const input = inputs[field.id];
    if (field.none && input?.none) continue;
    const blanks = parseFormTemplate(field.template).filter(
      (part): part is Extract<TemplatePart, { kind: "blank" }> => part.kind === "blank",
    );
    const values = input?.values ?? [];
    if (blanks.some((_, i) => (values[i] ?? "").trim() === "")) {
      problems[field.id] = "empty";
      continue;
    }
    if (blanks.some((part, i) => part.numeric && readPercent(values[i] ?? "") === null)) {
      problems[field.id] = "percent";
    }
  }
  return problems;
}

/** 欄ごとの 1文（「ない」を えらんだ 欄は その 言い方）。 */
export function composeFormAnswers(
  fields: readonly FormField[],
  inputs: Readonly<Record<string, FieldInput>>,
): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const field of fields) {
    const input = inputs[field.id];
    answers[field.id] =
      field.none && input?.none
        ? field.none
        : fillFormTemplate(field.template, input?.values ?? []);
  }
  return answers;
}

/** 保存した 1回ぶん。 */
export interface FormEntry {
  /** 1回を まとめる 鍵（`quiz_results.attempt_id`）。 */
  readonly id: string;
  /** 保存した 時こく（ISO）。 */
  readonly at: string;
  /** 欄の id → 1文。 */
  readonly answers: Readonly<Record<string, string>>;
}

/** 記録の 1行ぶん（`quiz_results` から 読んだ 形）。 */
export interface FormAnswerRow {
  readonly question_id: string;
  readonly answer_text: string;
  readonly attempt_id: string;
  readonly created_at: string;
}

/**
 * 行を 1回ずつに まとめ、**新しい 順**に 並べる。
 * そのフォームに 無い 欄の 行は 捨てる（同じ 記事の 別の 記録と まざらない ように）。
 */
export function groupFormEntries(
  rows: readonly FormAnswerRow[],
  fieldIds: readonly string[],
): FormEntry[] {
  const known = new Set(fieldIds);
  const byAttempt = new Map<string, { at: string; answers: Record<string, string> }>();
  for (const row of rows) {
    if (!known.has(row.question_id)) continue;
    const entry = byAttempt.get(row.attempt_id) ?? { at: row.created_at, answers: {} };
    entry.answers[row.question_id] = row.answer_text;
    if (row.created_at < entry.at) entry.at = row.created_at;
    byAttempt.set(row.attempt_id, entry);
  }
  return [...byAttempt.entries()]
    .map(([id, entry]) => ({ id, at: entry.at, answers: entry.answers }))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** 先生の 画面の 問いの 文（「① きのう したこと」）。 */
export function formPrompt(field: FormField): string {
  return field.label ? `${field.label} ${field.title}` : field.title;
}
