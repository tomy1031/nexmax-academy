/**
 * バグ報告（もんだい `bugreport`）— 報告の 型・点・合否・AIへの 頼み
 *
 * 元は 別ページ（`bug_report/`・2026-09-23 の 指定で 移植）。報告の 型は 元の ページの
 * 4つの 欄 ①どの 画面 ②何を したか ③どう なったか ④本当は どう なる はずか で、
 * 「まとめて 報告しましょう」の 1文は 元の `report.js` と 同じ 組み立て
 *（`{画面}で、{したこと}\nすると、{どうなった}\n本当は、{はず}`）。
 *
 * ## 点と 関門
 * 学習者が 🎤 で 話した ことばを AIが ①〜④の 4つで ⭕✗に する。点は ⭕の 数 × 25。
 * **60点 以下は つぎへ 進めない**（2026-09-23 の 指定）。観点は 報告の 型 そのもの——
 * 画面に 出て いる 欄と 同じ 名前で 見る（新しい 枠組みを 足さない・規律10）。
 *
 * ## 鍵（Gemini）が 無い 端末
 * 声を 聞けない ので 点は 出ない。**4つの 欄が うまって いれば 進める**（`skipped`）——
 * 朝礼と 同じ 決め（「キーが 無くても 止めない」2026-09-23）。登録は 画面で うながす。
 *
 * 画面（fetch・マイク）は ここに 置かない。テストから 呼べる 純粋な 関数だけ。
 */

import type { QuizQuestion } from "@/content/schema";
import type { QuizReviewContext, ReviewItem } from "@/lib/quiz/ai-review";

export type BugReportQuestion = Extract<QuizQuestion, { type: "bugreport" }>;

/** 報告の 欄の id（並びも この とおり）。 */
export const BUG_REPORT_FIELD_IDS = ["screen", "action", "result", "expected"] as const;
export type BugReportFieldId = (typeof BUG_REPORT_FIELD_IDS)[number];

/** 欄の 見出しと うすい 字（元の ページの まま）。 */
export const BUG_REPORT_FIELDS: readonly {
  readonly id: BugReportFieldId;
  readonly label: string;
  readonly placeholder: string;
}[] = [
  { id: "screen", label: "① どの 画面ですか？", placeholder: "" },
  { id: "action", label: "② 何を しましたか？", placeholder: "例：○○ボタンを クリックしました。" },
  { id: "result", label: "③ どうなりましたか？", placeholder: "例：○○が 表示されました。" },
  {
    id: "expected",
    label: "④ 本当は どうなる はずですか？",
    placeholder: "例：○○が 表示される はずです。",
  },
];

/** AIが ⭕✗を 返す 単位（欄と 同じ 4つ・同じ 並び）。 */
export const BUG_REPORT_CHECKS: readonly ReviewItem[] = [
  { id: "screen", label: "どの 画面か" },
  { id: "action", label: "何を したか" },
  { id: "result", label: "どう なったか" },
  { id: "expected", label: "本当は どう なる はずか" },
];

/** これより 上なら 合格（60点 以下は つぎへ 進めない）。 */
export const BUG_REPORT_PASS = 60;

/** 1つの バグの 報告（下書き）。 */
export interface BugReportEntry {
  readonly screen: string;
  readonly action: string;
  readonly result: string;
  readonly expected: string;
  /** 🎤 で 話して、聞き取れた ことば（まだなら 空）。 */
  readonly spoken: string;
  /** AIの 点（0〜100）。まだ 見て いない・見られなかった ときは null。 */
  readonly score: number | null;
  /** 観点ごとの ⭕✗と ひとこと（AIが 見た ときだけ）。 */
  readonly items: readonly { readonly id: string; readonly ok: boolean; readonly note: string }[];
  /** ブラッシュアップ（中身が 合って いて 言い方を 直せる ときだけ）。 */
  readonly polished: string;
  /** 鍵が 無くて 声を 聞けなかった（欄が うまって いれば 進める）。 */
  readonly skipped: boolean;
}

export const EMPTY_BUG_REPORT: BugReportEntry = {
  screen: "",
  action: "",
  result: "",
  expected: "",
  spoken: "",
  score: null,
  items: [],
  polished: "",
  skipped: false,
};

/** 欄が 4つとも うまって いるか。 */
export function bugReportFilled(entry: BugReportEntry): boolean {
  return BUG_REPORT_FIELD_IDS.every((id) => entry[id].trim() !== "");
}

/** 1字でも 書いたか。 */
export function bugReportStarted(entry: BugReportEntry): boolean {
  return BUG_REPORT_FIELD_IDS.some((id) => entry[id].trim() !== "") || entry.spoken.trim() !== "";
}

/**
 * 「まとめて 報告しましょう」の 1文（元の `report.js` と 同じ 組み立て）。
 * 空の 欄は 下線で 見せる——どこが まだかが 文の 中で 分かる。
 */
export function composeBugReport(entry: BugReportEntry): string {
  const blank = (value: string, width: number) => value.trim() || "＿".repeat(width);
  return [
    `${blank(entry.screen, 4)}で、${blank(entry.action, 8)}`,
    `すると、${blank(entry.result, 8)}`,
    `本当は、${blank(entry.expected, 8)}`,
  ].join("\n");
}

/** ⭕の 数から 点を 出す（4つ中 3つで 75点）。 */
export function bugReportScore(items: readonly { readonly ok: boolean }[]): number {
  if (items.length === 0) return 0;
  const ok = items.filter((one) => one.ok).length;
  return Math.round((ok / BUG_REPORT_CHECKS.length) * 100);
}

/** 1つの 報告が 合格か（つぎへ 進めるか）。 */
export function bugReportPassed(entry: BugReportEntry): boolean {
  if (entry.score !== null) return entry.score > BUG_REPORT_PASS;
  return entry.skipped && bugReportFilled(entry);
}

/** その 画面の 報告が ぜんぶ 合格か（関門）。 */
export function bugReportsPassed(
  question: BugReportQuestion,
  reports: readonly BugReportEntry[],
): boolean {
  return question.bugs.every((_, i) => {
    const entry = reports[i];
    return entry !== undefined && bugReportPassed(entry);
  });
}

/** お手本（答え合わせの ときだけ 出す）。 */
export function bugReportModelText(question: BugReportQuestion): string {
  return question.bugs
    .map((bug, i) => (question.bugs.length > 1 ? `【バグ ${i + 1}】\n${bug.model}` : bug.model))
    .join("\n\n");
}

/** 先生に 残す 文（`quiz_results.answer_text`）。 */
export function bugReportAnswerText(
  question: BugReportQuestion,
  reports: readonly BugReportEntry[],
): string {
  return question.bugs
    .map((_, i) => {
      const entry = reports[i] ?? EMPTY_BUG_REPORT;
      const lines = [
        question.bugs.length > 1 ? `【バグ ${i + 1}】` : "",
        composeBugReport(entry),
        `🎤 ${entry.spoken.trim() || "（話して いない）"}`,
        `点: ${entry.score === null ? (entry.skipped ? "—（声を 聞けなかった）" : "—") : entry.score}`,
        entry.polished ? `✨ ${entry.polished}` : "",
      ];
      return lines.filter((line) => line !== "").join("\n");
    })
    .join("\n\n");
}

/**
 * AIへの 頼み（`requestQuizReview` に そのまま 渡す）。
 *
 * バグが 2つ ある 画面では **どちらを 報告しても よい**。ただし もう 1つの 欄で
 * すでに 話した バグと 同じなら ✗に する——同じ バグを 2回 言って 2つとも 通るのを 防ぐ。
 */
export function bugReviewContext(
  question: BugReportQuestion,
  index: number,
  reports: readonly BugReportEntry[],
  spoken: string,
): QuizReviewContext {
  const multi = question.bugs.length > 1;
  const scene = [
    `画面の 名前: ${question.screen}`,
    `この 画面で する こと: ${question.about}`,
    `使い方: ${question.usage}`,
  ].join("\n");
  const others = reports
    .map((entry, i) => ({ entry, i }))
    // **合格した 報告だけ**（✗だった 報告と 同じ 話を しても、正しい 報告なら 通す）
    .filter(({ entry, i }) => i !== index && entry.spoken.trim() !== "" && bugReportPassed(entry))
    .map(({ entry }) => entry.spoken.trim());
  const note = [
    "学生は テスターです。上の 画面を 使って 見つけた バグを、声で 報告しました。",
    "「# 学生が 書いた もの」は **声を 文字に した もの**です。同じ 音の 字の ちがい・句読点は 見ません。",
    `- screen: 画面の 名前（${question.screen}）を 言って いれば ⭕。「この画面」だけなら ✗。`,
    "- action: 何を したか（押した・入れた・えらんだ もの）が 言えて いれば ⭕。",
    "- result: その あと 画面が どう なったか（おかしい ところ）が 言えて いれば ⭕。",
    "- expected: 本当は どう なる はずか が 言えて いれば ⭕。",
    "- **バグと 関係の ない 操作や、バグで ない 動き**を 話して いる ときは、action・result・expected を ✗に します。",
    "- 原因や 直し方は 聞いて いません。言って いなくても ✗に しません。",
    "- polished: この もんだいでは、中身が 合って いる ときは **いつも** 書きます。" +
      "学生の ことばを 残して、職場で 先輩に 伝える ていねいな 報告（〜で、〜ました。すると、〜ました。本当は、〜はずです。）に 直します。",
    "",
    multi
      ? `# この 画面の バグ（${question.bugs.length}つ。学生は どれを 報告しても よい）`
      : "# この 画面の バグ",
    ...question.bugs.map((bug, i) => `${i + 1}. ${bug.note}`),
  ];
  if (multi && others.length > 0) {
    note.push(
      "",
      "# もう 1つの 欄で 学生が すでに 報告した こと",
      ...others.map((one) => `- ${one}`),
      "上と **同じ バグ**を もう一度 報告して いる ときは、result・expected を ✗に して、" +
        "ひとことで「べつの バグを さがして ください」と 書きます。",
    );
  }
  return {
    question: question.q,
    scene,
    model: question.bugs.map((bug) => bug.model).join("\n\n"),
    note: note.join("\n"),
    itemKind: "point",
    items: BUG_REPORT_CHECKS,
    written: spoken,
  };
}
