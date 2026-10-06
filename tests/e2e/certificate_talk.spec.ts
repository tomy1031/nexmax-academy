import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { joinCall, seedCompleted, shot, skipAsk } from "./helpers";

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
