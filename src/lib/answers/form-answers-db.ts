/**
 * 書きこみフォーム（記事の `form` ブロック）を 保存して、本人が 読み返す
 *
 * ## 行き先は `quiz_results`（表を 増やさない）
 * `quiz_set_id` ＝ 記事の id、`question_id` ＝ 欄の id、`answer_text` ＝ 組み立てた 1文。
 * 先生の 画面（`/admin/records`）は この 表を 所属・期生・ステージで 絞って 読めるので、
 * 何も 足さずに「もんだいの こたえ」に 出る。問いの 文は 記事から 引く
 *（`src/lib/records/units.ts`）。ツール教材の こたえ（`./link-answers-db.ts`）と 同じ 形。
 *
 * ## 読み返すのは 本人の 行だけ
 * RLS は「自分の 行 **または 管理者**」を 通す。先生が 開くと 教室ぜんいんの 行が
 * 返るので、**かならず `profile_id` で 絞る**（`fetchLatestQuizAnswers` と 同じ 注意）。
 *
 * ## デモモード（鍵ゼロ）は 端末に 置く
 * CI の 通し検証は 鍵の 無い アプリを 通る。そこで「保存したら 下に 出る」が
 * 見えないと、この 機能は 一度も 機械に 確かめられない。だから **DB が 無い ときだけ**
 * 端末（localStorage）に 置く。ログインして いる ときに 端末へ 置かないのは、
 * 教室の 共用 PC で **前の 人の 朝礼が 次の 人の 画面に 出る**から。
 *
 * ## 「保存しました」は 入った ときだけ
 * ほかの 書き手（もんだい・ツール教材）は 送りっぱなしで よいが、ここは 学習者が
 * 下の 一覧で 自分の 書いた ものを 探す。入って いないのに「保存しました」と 出すと、
 * 次に 開いた とき 消えて いる（結果を ぼかさない — 規律1）。
 */
"use client";

import { z } from "zod";
import { defaultBackend, type ProgressBackend } from "@/lib/progress/store";
import { createClient } from "@/lib/supabase/client";
import { readOwnId } from "@/lib/supabase/claims";
import { insertQuizResultRows, newAttemptId, type QuizResultRow } from "@/lib/quiz/results-db";
import {
  groupFormEntries,
  type FormAnswerRow,
  type FormEntry,
  type FormField,
} from "./form-answers";

/** 1つの 文の 長さの 上限（先生の 表は 1行に 描く ので、際限なく 太らせない）。 */
export const MAX_FORM_TEXT = 300;

/** 端末に 置く 回数の 上限（デモモードだけ。古い ほうから 落とす）。 */
const MAX_LOCAL_ENTRIES = 50;

/** 進捗ストアと 同じ 名前空間（`@/lib/answers/notebook.ts` と 同じ 作法）。 */
function localKey(articleId: string): string {
  return `nexmax:v1:form:${articleId}`;
}

const localEntriesSchema = z.array(
  z.object({
    id: z.string(),
    at: z.string(),
    answers: z.record(z.string(), z.string()),
  }),
);

function readLocal(articleId: string, backend: ProgressBackend): FormEntry[] {
  const raw = backend.get(localKey(articleId)) ?? "";
  if (raw === "") return [];
  try {
    const parsed = localEntriesSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** 記録の 行に する（欄の 並びが 先生の 画面の Q1・Q2… の 順に なる）。 */
export function formAnswerRows({
  profileId,
  articleId,
  fields,
  answers,
  attemptId,
}: {
  profileId: string;
  articleId: string;
  fields: readonly FormField[];
  answers: Readonly<Record<string, string>>;
  attemptId: string;
}): QuizResultRow[] {
  return fields.flatMap((field, index) => {
    const text = answers[field.id];
    if (text === undefined) return [];
    return [
      {
        profile_id: profileId,
        quiz_set_id: articleId,
        question_id: field.id,
        question_index: index,
        // 正解の 無い 自由記述。先生の 画面の「かたち」は「じゆうに 書く」に なる
        question_type: "free",
        answer_text: text.slice(0, MAX_FORM_TEXT),
        correct: true,
        earned: 1,
        max_points: 1,
        full_set: true,
        attempt_id: attemptId,
      },
    ];
  });
}

/** 保存の けっか。`failed` の ときは 画面が 書いた ものを 消さずに 残す。 */
export type SaveFormResult = { ok: true; entry: FormEntry } | { ok: false };

export async function saveFormAnswers(
  {
    articleId,
    fields,
    answers,
  }: {
    articleId: string;
    fields: readonly FormField[];
    answers: Readonly<Record<string, string>>;
  },
  backend: ProgressBackend = defaultBackend(),
): Promise<SaveFormResult> {
  const entry: FormEntry = { id: newAttemptId(), at: new Date().toISOString(), answers };
  try {
    const supabase = createClient();
    if (!supabase) {
      // デモモード。端末に 置く（上の 註）
      const kept = [entry, ...readLocal(articleId, backend)].slice(0, MAX_LOCAL_ENTRIES);
      backend.set(localKey(articleId), JSON.stringify(kept));
      return { ok: true, entry };
    }
    const profileId = await readOwnId(supabase);
    if (!profileId) return { ok: false };
    const saved = await insertQuizResultRows(
      formAnswerRows({ profileId, articleId, fields, answers, attemptId: entry.id }),
    );
    return saved ? { ok: true, entry } : { ok: false };
  } catch (error) {
    console.warn("[form-answers] 保存できませんでした:", error);
    return { ok: false };
  }
}

/**
 * 本人が これまでに 保存した ものを 新しい 順に 読む。
 *
 * 読めなかった ときは **空では なく null**。空を 返すと 画面が「まだ ありません」と
 * 言い、書いた はずの 学習者は 消えたと 思う（読めなかったと 言う ほうが 正しい）。
 */
export async function loadFormEntries(
  articleId: string,
  fields: readonly FormField[],
  backend: ProgressBackend = defaultBackend(),
): Promise<FormEntry[] | null> {
  try {
    const supabase = createClient();
    if (!supabase) return readLocal(articleId, backend);
    const profileId = await readOwnId(supabase);
    if (!profileId) return null;
    const { data, error } = await supabase
      .from("quiz_results")
      .select("question_id, answer_text, attempt_id, created_at")
      .eq("profile_id", profileId)
      .eq("quiz_set_id", articleId)
      .order("created_at", { ascending: false })
      .limit(400);
    if (error) {
      console.warn("[form-answers] 前に 書いた ものを 読めませんでした:", error.message);
      return null;
    }
    return groupFormEntries(
      (data ?? []) as FormAnswerRow[],
      fields.map((field) => field.id),
    );
  } catch (error) {
    console.warn("[form-answers] 前に 書いた ものを 読めませんでした:", error);
    return null;
  }
}
