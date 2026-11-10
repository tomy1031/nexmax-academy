/**
 * 画像の AI判定（記事の `aiImageCheck` ブロック）の 記録の 形
 *
 * 保存と 読み返しは **書きこみフォームの しくみを そのまま 使う**（`./form-answers-db.ts`）。
 * 行き先は `quiz_results`（記事の id ＋ 問いの id）。表を 増やさない 理由も フォームと 同じ。
 * 先生は 学習の きろく（`/admin/records`）の「もんだいの こたえ」で 6つの 問いとして 読む
 *（問いの 文は `src/lib/records/units.ts` が ここから 引く）。
 *
 * - `<id>_site`   … えらんだ サイト（名前か URL）
 * - `<id>_riyuu`  … えらんだ 理由
 * - `<id>_hantei` … AIの 判定（「合う／少し ちがう／合わない」）。AIが 見なかった 回は 無い
 * - `<id>_yoi`    … AIが 合って いると 言った ところ（文を「／」で つなぐ）
 * - `<id>_naosu`  … AIが ちがうと 言った ところ
 * - `<id>_tsugi`  … AIが すすめた つぎに する こと
 *
 * AIの ことばを 1つの 問いに まとめないのは、1行が 300字で 切られる ため
 *（`MAX_FORM_TEXT`。3＋4＋1 文を つなぐと 超えて、いちばん 大事な「つぎ」が 切れる）。
 *
 * **画像は 残さない**（Storage を 増やさない・教室の 共用 PC に 前の 人の 画面を 残さない）。
 * 先生が どの サイトか 分かる ように、サイトの 名前か URL を 書いて もらう。
 */

import type { ArticleBlock } from "@/content/schema";
import { DESIGN_VERDICT_LABELS, joinForRecord, type DesignReview } from "@/lib/ai/design-check";
import type { FormField } from "./form-answers";

export type AiImageCheckBlock = Extract<ArticleBlock, { kind: "aiImageCheck" }>;

/** 記録の 問い（書きこみフォームの 欄の 形に して、保存・読み返しを 使い回す）。 */
export function aiImageCheckFields(block: Pick<AiImageCheckBlock, "id" | "judge">): FormField[] {
  return [
    { id: `${block.id}_site`, label: "①", title: "えらんだ サイト", template: "＿" },
    { id: `${block.id}_riyuu`, label: "②", title: "えらんだ 理由", template: "＿" },
    { id: `${block.id}_hantei`, label: "③", title: `${block.judge}（AI）の 判定`, template: "＿" },
    { id: `${block.id}_yoi`, label: "④", title: "合って いる ところ（AI）", template: "＿" },
    { id: `${block.id}_naosu`, label: "⑤", title: "ちがう ところ（AI）", template: "＿" },
    { id: `${block.id}_tsugi`, label: "⑥", title: "つぎに する こと（AI）", template: "＿" },
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
    const { review } = input;
    answers[`${block.id}_hantei`] = DESIGN_VERDICT_LABELS[review.verdict];
    if (review.good.length > 0) answers[`${block.id}_yoi`] = joinForRecord(review.good);
    if (review.fix.length > 0) answers[`${block.id}_naosu`] = joinForRecord(review.fix);
    if (review.next !== "") answers[`${block.id}_tsugi`] = joinForRecord([review.next]);
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
