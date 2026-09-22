import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { seedCompleted, seedGeminiKey, shot, writeFillinIn } from "./helpers";

/**
 * こたえの チェック（もんだいの「こたえの チェック」）— **鍵が あるときの 1往復**
 *
 * `GEMINI_API_KEY` が 渡って いる ときだけ 走る。渡し方は **学習者と同じ道**——
 * 端末（localStorage）に 置き、そこから ブラウザが Google の Live へ 直接 つなぐ。
 *
 * ここで 見るのは 3つ（中身の 良し悪しでは なく、**輪が 閉じる こと**）:
 *  1. 上級（Slack）… **観点ごとに** ⭕✗と ひとことが 出る（⭕✗は AIが 決める）
 *  2. 初級（メール）… **欄ごとに** ⭕✗が 出る（⭕✗は アプリが 決め、AIは ひとことだけ）
 *  3. どちらも **お手本は まだ 出ない**——答え合わせまで 見せない（2026-09-21 の 指定）
 *
 * 2026-09-21 に 初級と 上級を 別の 教材に 分けたので、**どちらも 1問目が すぐ 触れる**
 *（前は Slackに たどり着くのに メール10問ぶんの ⭕が 要り、端末の 保存を 仕込んで いた）。
 *
 * 鍵なしの道（毎回 見る ぶん）は `renraku_contact_quiz.spec.ts` に 残して ある。
 * トレースには 鍵を 含む 通信が 残るので、この ファイルは 記録を 切る（judge.ai と 同じ）。
 */
test.use({ trace: "off", video: "off" });

const MAIL_QUIZ = "renraku_contact_quiz";
const SLACK_QUIZ = "renraku_contact_slack_quiz";

async function seedUpTo(context: BrowserContext, ref: string) {
  const stage = JSON.parse(readFileSync(join("content", "stages", "renraku.json"), "utf8")) as {
    contents: { ref: string }[];
  };
  const at = stage.contents.findIndex((one) => one.ref === ref);
  await seedCompleted(
    context,
    stage.contents.slice(0, at).map((one) => one.ref),
  );
}

async function open(page: Page, ref: string) {
  await page.goto(`/renraku/quiz-${ref}`);
  // この 教材は 関門では ない ので、開いた ときに ステージ クリアの 板が 出る
  const stay = page.getByRole("button", { name: "ここに のこる" });
  await expect(stay).toBeVisible({ timeout: 15_000 });
  await stay.click();
  await page.getByRole("button", { name: /つづきから|はじめる/ }).click();
}

test.describe("もんだいの こたえの チェック（鍵が あるときだけ）", () => {
  test("上級（Slack）: 観点ごとの ⭕✗と ひとことが 出る", async ({ page, context }) => {
    const key = process.env.GEMINI_API_KEY ?? "";
    test.skip(key === "", "GEMINI_API_KEY が 無いので とばしました（鍵なしの道は 別のテスト）");

    await seedGeminiKey(context, key);
    await seedUpTo(context, SLACK_QUIZ);
    await open(page, SLACK_QUIZ);

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
  });

  test("初級（メール）: 欄ごとの ⭕✗に AIの ひとことが つく", async ({ page, context }) => {
    const key = process.env.GEMINI_API_KEY ?? "";
    test.skip(key === "", "GEMINI_API_KEY が 無いので とばしました（鍵なしの道は 別のテスト）");

    await seedGeminiKey(context, key);
    await seedUpTo(context, MAIL_QUIZ);
    await open(page, MAIL_QUIZ);

    await writeFillinIn(page, "mail_1", {
      宛先: "システム管理部の 佐藤さん",
      問題: "ログインできない",
      原因: "サーバーの エラー",
      直る予定: "今日の 15:00",
    });
    const mail = page.locator("#q-mail_1");
    await mail.getByRole("button", { name: /こたえの チェック/ }).click();
    await expect(mail.getByText(/OKです|なおす ところが/)).toBeVisible({ timeout: 40_000 });
    // 欄の ⭕✗は アプリが 決める（ぜんぶ 正解なので ⭕）
    await expect(mail.getByText("⭕ OK").first()).toBeVisible();
    await expect(page.getByText(/模範解答/)).toHaveCount(0);
    await shot(page, "quiz-ai-review-02-mail");
  });
});
