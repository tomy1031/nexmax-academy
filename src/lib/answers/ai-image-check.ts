/**
 * 画像の AI判定（記事の `aiImageCheck` ブロック）の 記録の 形
 *
 * 保存と 読み返しは **書きこみフォームの しくみを そのまま 使う**（`./form-answers-db.ts`）。
 * 行き先は `quiz_results`（記事の id ＋ 問いの id）。表を 増やさない 理由も フォームと 同じ。
 * 先生は 学習の きろく（`/admin/records`）の「もんだいの こたえ」で 4つの 問いとして 読む
 *（問いの 文は `src/lib/records/units.ts` が ここから 引く）。
 *
 * - `<id>_site`   … えらんだ サイト（名前か URL）
 * - `<id>_riyuu`  … えらんだ 理由
 * - `<id>_hantei` … AIの 判定（「合う／少し ちがう／合わない」）。AIが 使えなかった 回は 無い
 * - `<id>_kotoba` … AIの ことば（合って いる ところ／ちがう ところ／つぎ）。同じく 無い ことが ある
 *
 * **画像は 残さない**（Storage を 増やさない・教室の 共用 PC に 前の 人の 画面を 残さない）。
 * 先生が どの サイトか 分かる ように、サイトの 名前か URL を 書いて もらう。
 */

import type { ArticleBlock } from "@/content/schema";
import {
  DESIGN_VERDICT_LABELS,
  designReviewSummary,
  type DesignReview,
} from "@/lib/ai/design-check";
import type { FormField } from "./form-answers";

export type AiImageCheckBlock = Extract<ArticleBlock, { kind: "aiImageCheck" }>;

/** 記録の 問い（書きこみフォームの 欄の 形に して、保存・読み返しを 使い回す）。 */
export function aiImageCheckFields(block: Pick<AiImageCheckBlock, "id" | "judge">): FormField[] {
  return [
    { id: `${block.id}_site`, label: "①", title: "えらんだ サイト", template: "＿" },
    { id: `${block.id}_riyuu`, label: "②", title: "えらんだ 理由", template: "＿" },
    { id: `${block.id}_hantei`, label: "③", title: `${block.judge}（AI）の 判定`, template: "＿" },
    {
      id: `${block.id}_kotoba`,
      label: "④",
      title: `${block.judge}（AI）の ことば`,
      template: "＿",
    },
  ];
}

/** 1回ぶんの 記録（AIが 見なかった 回は 判定を 入れない）。 */
export function aiImageCheckAnswers(
  block: Pick<AiImageCheckBlock, "id">,
  input: { site: string; reason: string; review: DesignReview | null },
): Record<string, string> {
  const answers: Record<string, string> = {
    [`${block.id}_site`]: input.site.trim(),
    [`${block.id}_riyuu`]: input.reason.trim(),
  };
  if (input.review) {
    answers[`${block.id}_hantei`] = DESIGN_VERDICT_LABELS[input.review.verdict];
    const summary = designReviewSummary(input.review);
    if (summary !== "") answers[`${block.id}_kotoba`] = summary;
  }
  return answers;
}

/** 記録の 判定の ことば → 判定（色を 付ける ため）。読めなければ null。 */
export function verdictOfLabel(label: string | undefined): DesignReview["verdict"] | null {
  for (const [verdict, text] of Object.entries(DESIGN_VERDICT_LABELS)) {
    if (text === label) return verdict as DesignReview["verdict"];
  }
  return null;
}
