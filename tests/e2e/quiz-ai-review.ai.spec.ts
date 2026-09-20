import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { seedCompleted, seedGeminiKey, shot, writeFillinIn } from "./helpers";

/**
 * 書いた ものの 見かた（もんだいの「🤖 AIに 見て もらう」）— **鍵が あるときの 1往復**
 *
 * `GEMINI_API_KEY` が 渡って いる ときだけ 走る。渡し方は **学習者と同じ道**——
 * 端末（localStorage）に 置き、そこから ブラウザが Google の Live へ 直接 つなぐ。
 *
 * ここで 見るのは 3つ（中身の 良し悪しでは なく、**輪が 閉じる こと**）:
 *  1. 観点に ○ か △ が つく（「・」の まま 終わらない）
 *  2. **✨ブラッシュアップ回答**が 出る（学習者の 文を もとに した 書き直し）
 *  3. **📘お手本（模範解答）**が いっしょに 出る
 *
 * 鍵なしの道（毎回 見る ぶん）は `renraku_contact_quiz.spec.ts` に 残して ある。
 * トレースには 鍵を 含む 通信が 残るので、この ファイルは 記録を 切る（judge.ai と 同じ）。
 */
test.use({ trace: "off", video: "off" });

const PATH = "/renraku/quiz-renraku_contact_quiz";

test.describe("もんだいの AIの 見かた（鍵が あるときだけ）", () => {
  test("Slackの 連絡を 見て もらうと、観点・ブラッシュアップ・お手本が 出る", async ({
    page,
    context,
  }) => {
    const key = process.env.GEMINI_API_KEY ?? "";
    test.skip(key === "", "GEMINI_API_KEY が 無いので とばしました（鍵なしの道は 別のテスト）");

    await seedGeminiKey(context, key);
    const stage = JSON.parse(readFileSync(join("content", "stages", "renraku.json"), "utf8")) as {
      contents: { ref: string }[];
    };
    const at = stage.contents.findIndex((one) => one.ref === "renraku_contact_quiz");
    await seedCompleted(
      context,
      stage.contents.slice(0, at).map((one) => one.ref),
    );

    await page.goto(PATH);
    await page.getByRole("button", { name: "はじめる" }).click();

    /* わざと **足りない** 連絡を 書く（△が 1つ 出る ことを 期待する）。 */
    const slack = page.locator("#q-slack_1");
    await slack.getByLabel("じゆうに 書く").fill("URLが かわりました。");
    await slack.getByRole("button", { name: /AIに 見/ }).click();

    // 判定は はっきり 出る（つたわります／もう すこし です）
    await expect(slack.getByText(/つたわります|もう すこし/)).toBeVisible({ timeout: 40_000 });
    // 観点に しるしが つく（「・」の まま 終わらない）
    await expect(slack.getByText(/⭕|△/).first()).toBeVisible();
    // 学習者の 文を もとに した 書き直しと、教材の お手本が 並ぶ
    await expect(slack.getByText(/ブラッシュアップ回答/)).toBeVisible();
    await expect(slack.getByText(/模範解答/)).toBeVisible();
    await shot(page, "quiz-ai-review-01-slack");

    /* メールの 側も 同じ 道（組み立てた メール全文を 見て もらう）。 */
    await writeFillinIn(page, "mail_1", {
      宛先: "システム管理部の 佐藤さん",
      問題: "ログインできない",
      原因: "サーバーの エラー",
      直る予定: "今日の 15:00",
    });
    const mail = page.locator("#q-mail_1");
    await mail.getByRole("button", { name: /AIに 見/ }).click();
    await expect(mail.getByText(/つたわります|もう すこし/)).toBeVisible({ timeout: 40_000 });
    await shot(page, "quiz-ai-review-02-mail");
  });
});
