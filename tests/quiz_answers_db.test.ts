import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 前に 出した こたえを **ログインした 人ごとに DB から** 読む（2026-09-22 の 指定「Bであるべき」）
 *
 * 端末の 写し（こたえノート）は 同じ ブラウザの 中だけ。教室の 共用 PC でも
 * 別の 端末でも 戻る ように、記録（`quiz_results`）から 読み直す。
 *
 * 見張るのは 4つ。
 *  1. **`profile_id` で 必ず 絞る**——先生は 管理者なので、絞らないと RLS を 通って
 *     教室ぜんいんの 行が 返る（他人の こたえが 自分の 欄に 入る）
 *  2. 丸ごと 通した 回だけ（`full_set`）——絞った やり直しの 回で 戻すと 欄が 虫食いに なる
 *  3. いちばん 新しい **1回ぶん**だけ（同じ `attempt_id` の 行）
 *  4. 鍵の 無い デモモード・表の 無い DB では null（画面は そのまま 開く）
 */

const createClientMock = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ createClient: createClientMock }));

const { fetchLatestQuizAnswers } = await import("@/lib/quiz/results-db");

interface Row {
  profile_id: string;
  quiz_set_id: string;
  question_id: string;
  answer_text: string;
  full_set: boolean;
  attempt_id: string;
  created_at: string;
}

/** `.eq()` で 積まれた 条件を 行に 効かせる 替え玉（呼び出しの 形では なく 結果で 見る）。 */
function fakeClient(rows: Row[], error: { code?: string; message?: string } | null = null) {
  const filters: [string, unknown][] = [];
  let ordered = false;
  const builder = {
    eq(column: string, value: unknown) {
      filters.push([column, value]);
      return builder;
    },
    order() {
      ordered = true;
      return builder;
    },
    limit() {
      return builder;
    },
    then(resolve: (value: { data: Row[] | null; error: unknown }) => unknown) {
      const kept = rows.filter((row) =>
        filters.every(
          ([column, value]) => (row as unknown as Record<string, unknown>)[column] === value,
        ),
      );
      // 新しい 順（`order("created_at", { ascending: false })`）
      const data = error ? null : ordered ? [...kept].reverse() : kept;
      return Promise.resolve(resolve({ data, error }));
    },
  };
  const client = { from: () => ({ select: () => builder }) };
  return { client, filters };
}

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function row(over: Partial<Row> = {}): Row {
  return {
    profile_id: ME,
    quiz_set_id: "houkoku_search_quiz",
    question_id: "kaikyuu",
    answer_text: "わたしの 国では …",
    full_set: true,
    attempt_id: "aaaa",
    created_at: "2026-09-20T18:36:28.000Z",
    ...over,
  };
}

/** 古い → 新しい の 順で 渡す（替え玉が ひっくり返して 返す）。 */
function useRows(rows: Row[], error: { code?: string; message?: string } | null = null) {
  const fake = fakeClient(rows, error);
  createClientMock.mockReturnValue(fake.client);
  return fake;
}

beforeEach(() => {
  createClientMock.mockReset();
});

describe("前に 出した こたえを DB から 読む", () => {
  it("いちばん 新しい 1回ぶんが、問いの id ごとに 返る", async () => {
    useRows([
      row({
        attempt_id: "furui",
        answer_text: "むかしの こたえ",
        created_at: "2026-09-18T11:00:00.000Z",
      }),
      row({
        attempt_id: "atarashii",
        answer_text: "いまの こたえ",
        created_at: "2026-09-20T18:36:28.000Z",
      }),
      row({
        attempt_id: "atarashii",
        question_id: "kaikyuu_order",
        answer_text: "（1）社長　（2）取締役",
        created_at: "2026-09-20T18:36:28.000Z",
      }),
    ]);

    const found = await fetchLatestQuizAnswers(ME, "houkoku_search_quiz");

    expect(found).not.toBeNull();
    expect(found?.answers).toEqual({
      kaikyuu: "いまの こたえ",
      kaikyuu_order: "（1）社長　（2）取締役",
    });
    expect(found?.at).toBe("2026-09-20T18:36:28.000Z");
  });

  it("**自分の 行だけ**を 読む（先生は 管理者なので 絞らないと 全員ぶん 返る）", async () => {
    const fake = useRows([
      row({ profile_id: OTHER, answer_text: "ほかの 人の こたえ" }),
      row({ profile_id: ME, answer_text: "わたしの こたえ" }),
    ]);

    const found = await fetchLatestQuizAnswers(ME, "houkoku_search_quiz");

    expect(fake.filters).toContainEqual(["profile_id", ME]);
    expect(found?.answers["kaikyuu"]).toBe("わたしの こたえ");
  });

  it("丸ごと 通した 回だけ（絞った やり直しの 回は 読まない）", async () => {
    const fake = useRows([row({ full_set: false, answer_text: "やり直しの 1問だけ" })]);

    const found = await fetchLatestQuizAnswers(ME, "houkoku_search_quiz");

    expect(fake.filters).toContainEqual(["full_set", true]);
    expect(found).toBeNull();
  });

  it("その 教材の 行だけを 読む", async () => {
    const fake = useRows([row({ quiz_set_id: "renraku_quiz", answer_text: "べつの 教材" })]);

    const found = await fetchLatestQuizAnswers(ME, "houkoku_search_quiz");

    expect(fake.filters).toContainEqual(["quiz_set_id", "houkoku_search_quiz"]);
    expect(found).toBeNull();
  });

  it("空の こたえは 返さない（書かずに 出した 問い）", async () => {
    useRows([row({ answer_text: "" })]);
    const found = await fetchLatestQuizAnswers(ME, "houkoku_search_quiz");
    expect(found?.answers).toEqual({});
  });

  it("鍵の 無い デモモードでは null（画面は そのまま 開く）", async () => {
    createClientMock.mockReturnValue(null);
    expect(await fetchLatestQuizAnswers(ME, "houkoku_search_quiz")).toBeNull();
  });

  it("表が まだ 無い DB でも 止まらない", async () => {
    useRows([], { code: "42P01", message: "relation does not exist" });
    expect(await fetchLatestQuizAnswers(ME, "houkoku_search_quiz")).toBeNull();
  });
});
