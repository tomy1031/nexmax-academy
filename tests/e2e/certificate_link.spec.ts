import { expect, test, type Frame, type Page } from "@playwright/test";
import { bareKanjiTexts, seedCompleted } from "./helpers";

/**
 * ツール教材（link）の 修了証（2026-11-20・相談の 練習問題）
 *
 * tomy さんの 指定「レベル4までで修了証を作成できるようにして、レベル5をもっと特別に」→ 選択
 *「アプリの修了証」「レベル5の特別な修了証」。
 *
 * 見張るのは:
 *  1. 埋め込んだ ページから 修了証の 頼み（`nexmax:link-certificate`）が 来ると、枠の 中に 修了証が 出る
 *     （デモ＝見本・レベルごとの 行・回は 出さない）。とじられる
 *  2. 特別課題（レベル5）の 頼みでは 金の ふちと「特別課題」の 札
 *  3. **埋め込んだ ページ 以外の 窓**から 来た 頼みは 受けない
 *  4. 開き直すと「前に 出した 修了証を ひらく」が 2つ（レベル1〜4・特別課題）
 *  5. 出したら ページに 知らせる（`nexmax:link-certificate-ack`）
 *  6. 裸の 漢字が 無い
 */

const BEFORE = ["soudan_lecture", "soudan_skit", "soudan_listening", "soudan_quiz"];
const TOOL = "/tools/hourensou/soudan_renshu.html";

function toolFrame(page: Page): Frame {
  const frame = page.frames().find((one) => one.url().includes(TOOL));
  if (!frame) throw new Error("ツールの iframe が 無い");
  return frame;
}

async function ask(frame: Frame, tier: "main" | "special", levels: unknown[]): Promise<void> {
  await frame.evaluate(
    ([t, l]) =>
      window.parent.postMessage(
        { type: "nexmax:link-certificate", id: "soudan_renshu", tier: t, levels: l },
        window.location.origin,
      ),
    [tier, levels] as const,
  );
}

test("ツール教材の 修了証: レベル1〜4 と 特別課題が 枠の 中に 出て、開き直すと 前の 修了証を ひらける", async ({
  page,
  context,
}) => {
  test.slow();
  await seedCompleted(context, BEFORE);
  await page.goto("/soudan/link");
  await page
    .getByRole("button", { name: /ひらく/ })
    .first()
    .click();
  await expect(page.frameLocator("iframe").locator(".caption")).toBeVisible();
  const frame = toolFrame(page);
  await frame.evaluate(() => {
    const w = window as unknown as { __acks: string[] };
    w.__acks = [];
    window.addEventListener("message", (event) => {
      const data = event.data as { type?: string; tier?: string } | null;
      if (data?.type === "nexmax:link-certificate-ack" && data.tier) w.__acks.push(data.tier);
    });
  });

  /* 1. レベル1〜4 */
  await ask(frame, "main", [
    { no: 1, stars: 3, fails: 0 },
    { no: 2, stars: 3, fails: 0 },
    { no: 3, stars: 2, fails: 1 },
    { no: 4, stars: 3, fails: 0 },
  ]);
  const panel = page.locator('[data-certificate="ready"]');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-official", "false");
  await expect(panel).toHaveAttribute("data-special", "false");
  await expect(panel).toHaveAttribute("data-perfect", "false");
  await expect(panel).toContainText("レベル4");
  await expect(panel).toContainText("やり直し 1回");
  expect(await bareKanjiTexts(page)).toEqual([]);
  await expect
    .poll(() => frame.evaluate(() => (window as unknown as { __acks: string[] }).__acks))
    .toEqual(["main"]);
  await page.getByRole("button", { name: "✕ とじて つづける" }).click();
  await expect(panel).toHaveCount(0);

  /* 3. 埋め込んだ ページ 以外の 窓から の 頼みは 受けない */
  await page.evaluate(() =>
    window.postMessage(
      {
        type: "nexmax:link-certificate",
        id: "soudan_renshu",
        tier: "special",
        levels: [{ no: 5, stars: 3, fails: 0 }],
      },
      window.location.origin,
    ),
  );
  await page.waitForTimeout(800);
  await expect(page.locator('[data-certificate="ready"]')).toHaveCount(0);

  /* 2. 特別課題 */
  await ask(frame, "special", [{ no: 5, stars: 3, fails: 0 }]);
  const special = page.locator('[data-certificate="ready"]');
  await expect(special).toBeVisible();
  await expect(special).toHaveAttribute("data-special", "true");
  await expect(special).toHaveAttribute("data-perfect", "true");
  await expect(page.locator('[data-certificate="special"]')).toBeVisible();
  expect(await bareKanjiTexts(page)).toEqual([]);
  await page.getByRole("button", { name: "✕ とじて つづける" }).click();

  /* 4. 開き直すと 前の 修了証を ひらける（2つ） */
  await page.reload();
  const again = page.locator("button", { hasText: "（レベル1〜4）" });
  await expect(again).toBeVisible();
  await expect(page.locator("button", { hasText: "特別課題" })).toBeVisible();
  await again.click();
  await expect(page.locator('[data-certificate="ready"]')).toHaveAttribute("data-special", "false");
});
