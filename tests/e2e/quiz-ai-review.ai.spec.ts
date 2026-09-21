import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { fillinSlots, fillinText } from "../../src/lib/quiz/fillin";
import { seedCompleted, seedGeminiKey, shot } from "./helpers";

/**
 * こたえの チェック（もんだいの「こたえの チェック」）— **鍵が あるときの 1往復**
 *
 * `GEMINI_API_KEY` が 渡って いる ときだけ 走る。渡し方は **学習者と同じ道**——
 * 端末（localStorage）に 置き、そこから ブラウザが Google の Live へ 直接 つなぐ。
 *
 * ここで 見るのは 3つ（中身の 良し悪しでは なく、**輪が 閉じる こと**）:
 *  1. 観点ごとに ⭕か ✗が つき、その 下に **ひとこと**が 出る
 *  2. **⭕なら 関門が 開く**（つぎの もんだいが 触れる ように なる）
 *  3. **お手本は まだ 出ない**——答え合わせまで 見せない（2026-09-21 の 指定）
 *
 * 鍵なしの道（毎回 見る ぶん）は `renraku_contact_quiz.spec.ts` に 残して ある。
 * トレースには 鍵を 含む 通信が 残るので、この ファイルは 記録を 切る（judge.ai と 同じ）。
 */
test.use({ trace: "off", video: "off" });

const QUIZ = "renraku_contact_quiz";
const PATH = `/renraku/quiz-${QUIZ}`;

type Question = { id: string; type: string };
const SET = JSON.parse(readFileSync(join("content", "quizsets", `${QUIZ}.json`), "utf8")) as {
  questions: Question[];
};

/**
 * メールの 10問を **ぜんぶ ⭕に した ところ**から 始める。
 *
 * 関門（⭕に なるまで つぎを 開かない）が ある ので、Slackの 問いに たどり着くには
 * メールを 10問 通す 必要が ある。鍵の いる この 検証で 10往復も すると、
 * **枠を 使い切って 肝心の 1往復が 落ちる**。だから 端末の 保存
 *（`src/lib/quiz/resume.ts`）に 正解と ⭕の 印を 先に 置く。
 *
 * 印は **文と セット**なので（`checked[id]` は その ときの 文）、
 * 下書きと 同じ 組み立て（`fillinText`）で 作る——ずれると 画面は ⭕を 捨てる。
 */
function seedMailsDone() {
  const drafts: Record<string, { kind: "fillin"; inputs: string[] }> = {};
  const checked: Record<string, string> = {};
  for (const question of SET.questions) {
    if (question.type !== "fillin") continue;
    // 教材の 型は `fillin`——`fillinSlots` が 欄の 並びを 決める（画面と 同じ 1か所）
    const mail = question as unknown as Parameters<typeof fillinSlots>[0];
    const inputs = fillinSlots(mail).map((slot) => slot.answer);
    drafts[question.id] = { kind: "fillin", inputs };
    checked[question.id] = fillinText(mail, inputs);
  }
  return { quizSetId: QUIZ, results: [], mode: "submit", drafts, index: 0, checked };
}

test.describe("もんだいの こたえの チェック（鍵が あるときだけ）", () => {
  test("Slackの 連絡を 見て もらうと、観点ごとの ⭕✗と ひとことが 出る", async ({
    page,
    context,
  }) => {
    const key = process.env.GEMINI_API_KEY ?? "";
    test.skip(key === "", "GEMINI_API_KEY が 無いので とばしました（鍵なしの道は 別のテスト）");

    await seedGeminiKey(context, key);
    const stage = JSON.parse(readFileSync(join("content", "stages", "renraku.json"), "utf8")) as {
      contents: { ref: string }[];
    };
    const at = stage.contents.findIndex((one) => one.ref === QUIZ);
    await seedCompleted(
      context,
      stage.contents.slice(0, at).map((one) => one.ref),
    );
    await context.addInitScript((saved: unknown) => {
      window.localStorage.setItem(`nexmax:v1:quiz-resume:${QUIZ}`, JSON.stringify(saved));
    }, seedMailsDone());

    await page.goto(PATH);
    // この 教材は 関門では ない ので、開いた ときに ステージ クリアの 板が 出る
    const stay = page.getByRole("button", { name: "ここに のこる" });
    await expect(stay).toBeVisible({ timeout: 15_000 });
    await stay.click();
    // しおりが ある ので「つづきから」
    await page.getByRole("button", { name: /つづきから|はじめる/ }).click();

    /* わざと **足りない** 連絡を 書く（✗が 1つ 出る ことを 期待する）。 */
    const slack = page.locator("#q-slack_1");
    await expect(slack.getByLabel("じゆうに 書く")).toBeEnabled();
    await slack.getByLabel("じゆうに 書く").fill("URLが かわりました。");
    await slack.getByRole("button", { name: /こたえの チェック/ }).click();

    // 判定は はっきり 出る（OKです／なおす ところが N こ）
    await expect(slack.getByText(/OKです|なおす ところが/)).toBeVisible({ timeout: 40_000 });
    // 観点ごとに しるしが つく（「・」の まま 終わらない）
    await expect(slack.getByText(/⭕ OK|✗ なおす/).first()).toBeVisible();
    // **お手本は ここでは 出さない**（答え合わせまで 見せない）
    await expect(page.getByText(/模範解答/)).toHaveCount(0);
    await shot(page, "quiz-ai-review-01-slack");

    /* メールの 側も 同じ 道。欄の ⭕✗は アプリが 決め、AIは ひとことを 足す。 */
    const mail = page.locator("#q-mail_1");
    await mail.getByRole("button", { name: /こたえの チェック/ }).click();
    await expect(mail.getByText(/OKです|なおす ところが/)).toBeVisible({ timeout: 40_000 });
    await shot(page, "quiz-ai-review-02-mail");
  });
});
