/**
 * ツール教材（link）に 書いた こたえを、先生の 画面へ 届ける
 *
 * ## なぜ ここに 置くか
 * 調査（リサーチ）の ツールは `public/tools/**` の **静的な 1枚**で、DBの 鍵も
 * ログインの 情報も 持たない（規律4）。だから ツールは 中身を `postMessage` で
 * 親へ 渡すだけに して、**保存は アプリ側**で 行う
 *（受け口は `src/components/link/link-view.tsx`）。
 *
 * ## 新しい 表を 作らない
 * 行き先は もんだいと 同じ `quiz_results`。先生の 画面（`/admin/records`）は
 * すでに この 表を 所属・期生・ステージで 絞って 読めるので、**表を 増やすと
 * 同じ 絞り込みが 2つに 育つ**（片方だけ 直る）。読み手を 増やさないのが いちばん 安い。
 *
 * 問いの 文は `src/content/link-answers.ts` の 台帳から 引く（記録には 入れない
 * ——答えの 文だけを 残し、問いは 教材の 正から 引く のが この アプリの 流儀）。
 *
 * ## 正解は 無い
 * 調べて 書く ものなので 採点しない。`correct: true` / `earned = max_points` で
 * 残す——自由記述だけの もんだい（`content/quizsets/houkoku_answer.json`）と 同じ
 * 扱いに して、先生の 画面で ○×の 意味を そろえる。
 */
"use client";

import { linkAnswerOrder } from "@/content/link-answers";
import { fetchOwnProfile } from "@/lib/profile-db";
import { insertQuizResultRows, newAttemptId, type QuizResultRow } from "@/lib/quiz/results-db";

/** ツールから 届く 1つぶん。 */
export interface LinkAnswer {
  readonly id: string;
  readonly text: string;
}

/**
 * 届いた ものが この 形か（外から 来る ものは 信じない）。
 * 中身が 1つも 無い・文字で ない ものは 捨てる。
 */
export function parseLinkAnswers(value: unknown): LinkAnswer[] {
  if (!Array.isArray(value)) return [];
  const out: LinkAnswer[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const { id, text } = item as { id?: unknown; text?: unknown };
    if (typeof id !== "string" || id === "" || typeof text !== "string") continue;
    out.push({ id, text });
  }
  return out;
}

/**
 * 記録の 行に する。**台帳に ある 問いだけ**を、台帳の 順で 残す。
 *
 * 台帳に 無い id を 落とすのは、ツール側に 欄が 増えた ときに **問いの 文が 無い 行**が
 * 先生の 画面へ 出ない ように する ため（`kaikyuu` のような id が 列に 並ぶ）。
 * 台帳を 足せば その日から 出る。
 */
export function linkAnswerRows({
  profileId,
  linkId,
  answers,
  attemptId,
}: {
  profileId: string;
  linkId: string;
  answers: readonly LinkAnswer[];
  attemptId: string;
}): QuizResultRow[] {
  const order = linkAnswerOrder(linkId);
  const byId = new Map(answers.map((answer) => [answer.id, answer.text]));
  return order.flatMap((id, index) => {
    const text = byId.get(id);
    if (text === undefined) return [];
    return [
      {
        profile_id: profileId,
        quiz_set_id: linkId,
        question_id: id,
        question_index: index,
        // 正解の 無い 自由記述。先生の 画面の「かたち」は「じゆうに 書く」に なる
        question_type: "free",
        answer_text: text,
        correct: true,
        earned: 1,
        max_points: 1,
        full_set: true,
        attempt_id: attemptId,
      },
    ];
  });
}

/**
 * 出した こたえを 残す。**待たない・投げない**（記録の ために 学習を 止めない）。
 *
 * ログインして いない（デモモード・先生の 下見）ときは 何も しない。
 */
export async function saveLinkAnswers({
  linkId,
  answers,
}: {
  linkId: string;
  answers: readonly LinkAnswer[];
}): Promise<void> {
  if (answers.length === 0) return;
  const profile = await fetchOwnProfile();
  if (!profile?.id) return;
  await insertQuizResultRows(
    linkAnswerRows({ profileId: profile.id, linkId, answers, attemptId: newAttemptId() }),
  );
}
