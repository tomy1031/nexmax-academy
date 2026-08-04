"use client";

/**
 * 授業サポートカード（08 §7.1）。決定的レンダリング——AIを呼ばず、
 * スコアとクラス集計から `buildStudentHints` が組み立てたものを表示するだけ。
 *
 * - **先頭に要約を置かない。** カードは行動から始まる（08 §3.2。要約はラベルになる）
 * - 回答言語の注記は**全員に出す**（08 §5.2-2。easy は既定値で、除外すると
 *   一番届けたい相手にだけ注記が出なくなる）
 * - hints が 0 件なのは正規の状態（08 §3.4）。無理に埋めない
 */
import {
  PERSONALITY_AXIS_META,
  PERSONALITY_QUESTIONS,
  type PersonalityAxis,
} from "@/content/personality";
import type { TeachingHint } from "@/content/teaching-hints";
import { buildStudentHints } from "@/lib/teaching-hints";
import type { StatsProfile } from "@/lib/personality-stats";

function axisCheckLine(axis: PersonalityAxis): string {
  const meta = PERSONALITY_AXIS_META[axis];
  return `「${meta.poleLabels[0]}」と「${meta.poleLabels[1]}」は 3対2 の僅差です。どちらの場面が合うかは、教室での様子で判断してください。`;
}

/** 根拠として画面に出す設問番号（同じ軸の設問）。 */
function axisQuestionIds(axis: PersonalityAxis): string {
  return PERSONALITY_QUESTIONS.filter((question) => question.axis === axis)
    .map((question) => `Q${question.id}`)
    .join("・");
}

function HintRow({ hint }: { hint: TeachingHint }) {
  return (
    <li className="border-hairline rounded-2xl border bg-white px-4 py-3">
      <p className="text-ink font-bold">{hint.action}</p>
      <p className="text-ink-soft mt-1 text-xs font-bold">
        根拠: {axisQuestionIds(hint.axis)} の回答 ／ 合っていないサイン: {hint.counterSign}
      </p>
    </li>
  );
}

export function TeachingHintsCard({
  student,
  cohort,
  examDate,
}: {
  student: StatsProfile;
  cohort: readonly StatsProfile[];
  examDate: string;
}) {
  const { hints, closeAxes, droppedBySkew } = buildStudentHints(student, cohort);

  return (
    <section className="card-pop mt-6 p-5 sm:p-6">
      <h2 className="text-navy text-lg font-black">授業サポート（参考）</h2>

      {/* 回答言語の注記。条件を付けない（08 §5.2-2） */}
      <p className="bg-sun/20 text-ink mt-3 rounded-xl px-3 py-2 text-xs font-bold">
        この回答は、やさしい日本語・日本語・英語のいずれか（本人にとって第2・第3の言語）で行われています。発言が少ないことは、日本語への不安によることがあります。
      </p>

      {hints.length > 0 ? (
        <>
          <h3 className="text-ink mt-4 text-sm font-black">明日の授業でできること</h3>
          <ul className="mt-2 space-y-2">
            {hints.map((hint) => (
              <HintRow key={`${hint.axis}-${hint.pole}-${hint.direction}`} hint={hint} />
            ))}
          </ul>
        </>
      ) : (
        <p className="text-ink mt-4 text-sm font-bold">
          この20問からは、明日の授業を変える根拠は出せませんでした。目の前の様子で判断してください。
        </p>
      )}

      {closeAxes.length > 0 && (
        <>
          <h3 className="text-ink mt-4 text-sm font-black">教室で確かめること</h3>
          <ul className="text-ink-soft mt-2 space-y-1 text-xs font-bold">
            {closeAxes.map((axis) => (
              <li key={axis}>{axisCheckLine(axis)}</li>
            ))}
          </ul>
        </>
      )}

      {droppedBySkew.length > 0 && (
        <p className="text-ink-soft mt-3 text-xs font-bold">
          {droppedBySkew.map((axis) => `「${PERSONALITY_AXIS_META[axis].question}」`).join("と")}
          の軸は、クラスのほぼ全員が同じ選択をした設問に支えられています。個人の差としては読まないでください。
        </p>
      )}

      <p className="text-ink-soft mt-4 text-[11px] font-bold">
        {new Date(examDate).toLocaleDateString("ja-JP")}
        の回答20問から組み立てた参考情報です。目の前の生徒と合わないときは、生徒のほうを優先してください。
      </p>
    </section>
  );
}
