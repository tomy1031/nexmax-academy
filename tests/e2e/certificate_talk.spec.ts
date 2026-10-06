import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { answerTalk, joinCall, readOn, seedCompleted, shot, skipAsk } from "./helpers";

/**
 * 会話の 練習の 修了証（2026-10-06 の 回答「取りこぼしなし」・願い #562 の 第2段）
 *
 * - ミーティング: 話しきった 瞬間（しゅうりょうしょうの ポップアップ）に 正式な 修了証が 出る。
 *   答えきれなかった しつもんが あれば パーフェクトで ない（数を 書く）
 * - ヒアリング（事前調査の 無い 教材）: 退室した 瞬間に 出る。聞き出せなかった ことの 数を 書く
 *
 * デモモード（鍵ゼロ）なので **見本**に なる。朝礼は asakai.spec.ts、
 * 規則（パーフェクトの 条件）は tests/certificate_model.test.ts が 見張る。
 */

function refsOf(stage: string): string[] {
  const data: { contents: { ref: string }[] } = JSON.parse(
    readFileSync(join("content", "stages", `${stage}.json`), "utf8"),
  );
  return data.contents.map((item) => item.ref);
}

async function seedBefore(
  context: Parameters<typeof seedCompleted>[0],
  stage: string,
  ref: string,
) {
  const refs = refsOf(stage);
  await seedCompleted(context, refs.slice(0, refs.indexOf(ref)));
}

test("ミーティング: 話しきった 瞬間に 修了証が 出る。飛ばした しつもんが あれば パーフェクトで ない", async ({
  page,
  context,
}) => {
  const meeting: { questions: unknown[] } = JSON.parse(
    readFileSync(join("content", "meetings", "soudan_meeting.json"), "utf8"),
  );
  await seedBefore(context, "soudan", "soudan_meeting");
  await page.goto("/soudan/meeting");
  await joinCall(page);
  for (let i = 0; i < meeting.questions.length; i += 1) {
    await skipAsk(page);
    await page.waitForTimeout(300);
  }

  const popup = page.getByRole("dialog", { name: "しゅうりょうしょうの ポップアップ" });
  await expect(popup).toBeVisible();
  const cert = popup.locator('[data-certificate="ready"]');
  await expect(cert).toBeVisible();
  await expect(cert).toHaveAttribute("data-perfect", "false");
  await expect(popup.locator('[data-certificate="reasons"]')).toContainText(
    `${meeting.questions.length}こ`,
  );
  await cert.scrollIntoViewIfNeeded();
  await shot(page, "certificate-meeting-not-perfect");
});

test("ヒアリング: 退室した 瞬間に 修了証が 出る（聞き出せなかった ことの 数を 書く）", async ({
  page,
  context,
}) => {
  await seedBefore(context, "youken", "youken_aoba");
  await page.goto("/youken/talk");
  await page.getByRole("button", { name: /さんかする/ }).click();
  await page.getByRole("button", { name: /退室|たいしつ/ }).click();
  await page.getByRole("button", { name: "言いました。おわる" }).click();

  const cert = page.locator('[data-certificate="ready"]');
  await expect(cert).toBeVisible();
  await expect(cert).toHaveAttribute("data-perfect", "false");
  // ルビが 語の 中に 入る（「聞きき出せなかった」）ので、数の ところで 見る
  const total = (
    JSON.parse(readFileSync(join("content", "scenarios", "youken_aoba.json"), "utf8")) as {
      interview: { reqs: unknown[] };
    }
  ).interview.reqs.length;
  await expect(page.locator('[data-certificate="reasons"]')).toContainText(`${total}こ`);
  await cert.scrollIntoViewIfNeeded();
  await shot(page, "certificate-scenario-not-perfect");
});

/** たいわの 聞く ばんの 最後の 1つ手前の しおり（最初から 話すと 9回 以上 かかる）。 */
const TALK_NEAR_CLEAR = { round: "listen", percent: 50, turns: 6, asked: 5 };

async function clearTalkGame(page: Page) {
  await page.goto("/kaisha/meeting-kaisha_matsui");
  await page.getByRole("button", { name: "つづきから 話す ▶" }).click();
  await readOn(page);
  // 聞いた 数が 上限に とどくと クリア（`src/lib/talkgame/affinity.ts` の LISTEN_MAX_ASKS）
  await answerTalk(page, "会社で いちばん 大切に して いる ことは 何ですか。");
  await readOn(page, 10);
}

test("たいわ: この 端末で 始めた 回を クリアした 瞬間に パーフェクトの 修了証が 出る", async ({
  page,
  context,
}) => {
  await seedBefore(context, "kaisha", "kaisha_matsui");
  // しおりと 一緒に **この 端末で 始めた 回の 記録**も 置く（自分の 回の つづき）
  await context.addInitScript((talk) => {
    window.localStorage.setItem("nexmax:v1:talkgame-resume:kaisha_matsui", JSON.stringify(talk));
    window.localStorage.setItem(
      "nexmax.cert-run.v1:kaisha_matsui",
      JSON.stringify({ startedAt: new Date().toISOString() }),
    );
  }, TALK_NEAR_CLEAR);
  await clearTalkGame(page);

  const cert = page.locator('[data-certificate="ready"]');
  await expect(cert).toBeVisible({ timeout: 30_000 });
  await expect(cert).toHaveAttribute("data-perfect", "true");
  await cert.scrollIntoViewIfNeeded();
  await shot(page, "certificate-talkgame-perfect");
});

test("たいわ: 回の 記録が 無い しおりの つづき（共有 PC で 前の 人の 続き）は パーフェクトに しない", async ({
  page,
  context,
}) => {
  await seedBefore(context, "kaisha", "kaisha_matsui");
  await context.addInitScript((talk) => {
    window.localStorage.setItem("nexmax:v1:talkgame-resume:kaisha_matsui", JSON.stringify(talk));
  }, TALK_NEAR_CLEAR);
  await clearTalkGame(page);

  const cert = page.locator('[data-certificate="ready"]');
  await expect(cert).toBeVisible({ timeout: 30_000 });
  await expect(cert).toHaveAttribute("data-perfect", "false");
  await expect(page.locator('[data-certificate="reasons"]')).toContainText("続");
});
