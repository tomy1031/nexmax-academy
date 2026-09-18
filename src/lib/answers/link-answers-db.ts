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
 * 調べて 書く ものなので 採点しない。`correct: true` / `earned = max_points` で 残す。
 *
 * **自由記述の もんだい（`free`）とは 同じでは ない**——あちらは「`minLength` より
 * 長く 書けたか」を 見て いる（`src/lib/quiz/draft.ts`）ので ×に なる ことが ある。
 * ここは 中身を いっさい 見ない。先生の 画面の ○は「出した」という 意味に なる。
 * 正答率の まとまりは 教材と 問いの 組で 分かれる（`src/lib/records/table.ts` の
 * `stat.group`）ので、もんだいの 正答率に この 行が 混ざる ことは ない。
 */
"use client";

import { linkAnswerOrder } from "@/content/link-answers";
import { createClient } from "@/lib/supabase/client";
import { readOwnId } from "@/lib/supabase/claims";
import {
  insertQuizResultRows,
  newAttemptId,
  readOwnQuizResultRows,
  type OwnQuizResultRow,
  type QuizResultRow,
} from "@/lib/quiz/results-db";

/** ツールから 届く 1つぶん。 */
export interface LinkAnswer {
  readonly id: string;
  readonly text: string;
}

/**
 * 1つの こたえの 長さの 上限。
 *
 * 先生の 表は こたえを そのまま 1行に 描く（`src/lib/records/table.ts`）ので、
 * 際限なく 太ると 表が 読めなく なる。ツール側でも `maxlength` で 止めて いるが、
 * **合図は 外から 来る もの**なので ここでも 切る。
 */
const MAX_TEXT = 1000;

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
    out.push({ id, text: text.slice(0, MAX_TEXT) });
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
 * 出した こたえを 残す。**投げない**（記録の ために 学習を 止めない）。
 *
 * ログインして いない（デモモード）ときは 何も しない。**投げないのが 大事**で、
 * 呼び出し側は 結果だけを 見る ので、ここから 例外が 出ると 誰も 受け取らない
 *（画面には 何も 出ず、記録も 残らず、警告すら 出ない）。だから 自分で 握って 書く。
 *
 * id は `readOwnId`（トークンの 中みを その場で 確かめる）で 取る——**外へ 出ない**し、
 * 学習者の 行 まるごと（answers/scores の JSON 込み）を 取りに 行かずに 済む。
 *
 * @param owner     ページの 控えの 持ち主。**ログイン中の 人と ちがえば 残さない**
 *   ——控えは ログアウトでは 消えないので、教室の PC では 前の 人の こたえが 来る ことが ある
 * @param attemptId ページが 付けた 1回の id（uuid）。送り直しでも 同じ id が 来るので、
 *   DB の 一意索引（attempt_id, question_id）が 2回目を 捨てる。無ければ ここで 作る
 * @returns DB に 入ったか（すでに 入って いた 送り直しも true）。**true の ときだけ**
 *   ページへ「とどいた」を 返す（ページは それまで 開くたびに 送り直す）。
 */
export async function saveLinkAnswers({
  linkId,
  answers,
  owner,
  attemptId,
}: {
  linkId: string;
  answers: readonly LinkAnswer[];
  owner?: string;
  attemptId?: string;
}): Promise<boolean> {
  if (answers.length === 0) return false;
  try {
    const supabase = createClient();
    if (!supabase) return false; // デモモード（鍵ゼロ）。学習は そのまま 進む
    const profileId = await readOwnId(supabase);
    if (!profileId) return false; // ログインして いない
    if (owner !== profileId) {
      console.warn("[link-answers] ほかの 学習者の 控えなので 残しません");
      return false;
    }
    return await insertQuizResultRows(
      linkAnswerRows({ profileId, linkId, answers, attemptId: attemptId ?? newAttemptId() }),
    );
  } catch (error) {
    // 先生の 画面に 出ない ことに 気づける ように、**黙らせない**
    console.warn("[link-answers] 記録できませんでした:", error);
    return false;
  }
}

/** DB に 残って いる 最後の 1回ぶん。 */
export interface LatestLinkAnswers {
  readonly answers: LinkAnswer[];
  /** その 1回の id（ページは これを 覚え、直さずに 出し直しても 行を 増やさない）。 */
  readonly attemptId: string | null;
}

/**
 * DB の 行から、**いちばん 新しい 1回ぶん**の こたえを 取り出す（台帳の 順）。
 *
 * 「直す → 出す」は 1回ごとに 別の 記録（attempt）に なる。戻すのは 最後に 出した
 * ものだけ——古い 回の 欄が 混ざると、学習者が 消した はずの 文が 生き返る。
 *
 * @param rows 新しい 順（`readOwnQuizResultRows` の 並び）
 */
export function latestLinkAnswers(
  linkId: string,
  rows: readonly OwnQuizResultRow[],
): LatestLinkAnswers {
  const latest = rows[0]?.attempt_id;
  if (!latest) return { answers: [], attemptId: null };
  const byId = new Map(
    rows
      .filter((row) => row.attempt_id === latest)
      .map((row) => [row.question_id, row.answer_text]),
  );
  const answers = linkAnswerOrder(linkId).flatMap((id) => {
    const text = byId.get(id);
    return text === undefined ? [] : [{ id, text }];
  });
  return { answers, attemptId: answers.length > 0 ? latest : null };
}

/** ページへ 返す いまの ようす（`STATE_MESSAGE` の 中身）。 */
export interface LinkState extends LatestLinkAnswers {
  /** ログイン中の 人。デモモード・未ログイン・読めない ときは null。 */
  readonly owner: string | null;
  /**
   * デモモード（鍵ゼロ）か。ページは これが true の ときだけ、持ち主の 無い 控えで 動く。
   * owner が null で これが false（ログインの 情報が 読めない）なら、ページは 何も 見せない
   *——だれの 控えか 決められず、出しても DB に 届かないのに 関門だけ 開いて しまう。
   */
  readonly demo: boolean;
}

/**
 * **いま だれが 開いて いるか**と、その 人が DB に 残した 最後の こたえを 読む。**投げない**。
 *
 * ページは これを 見て、端末の 控えが この 人の ものか 確かめ（ちがえば 捨てる）、
 * 控えが 空なら DB の こたえを 戻す——別の 端末・別の URL で 開くと
 * 控え（localStorage）は 空で、出した はずの こたえが 消えた ように 見えるため。
 */
export async function loadLinkState(linkId: string): Promise<LinkState> {
  const none: LinkState = { owner: null, answers: [], attemptId: null, demo: false };
  try {
    const supabase = createClient();
    if (!supabase) return { ...none, demo: true };
    const profileId = await readOwnId(supabase);
    if (!profileId) return none;
    const rows = await readOwnQuizResultRows(profileId, linkId);
    return { owner: profileId, demo: false, ...latestLinkAnswers(linkId, rows ?? []) };
  } catch (error) {
    console.warn("[link-answers] 読めませんでした:", error);
    return none;
  }
}
