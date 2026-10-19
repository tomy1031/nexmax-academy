import { expect, test } from "@playwright/test";
import { seedCompleted } from "./helpers";

/**
 * 記事の「つぎは これ」カードで ミーティングへ 行ける（2026-10-16 の 指摘）
 *
 * 朝礼の「KhmerSabaiの 朝礼」と 夕礼の「Next Talent の 夕礼」の さいごに ある
 * カードは `/meeting/<ID>` を 指して いたが、その URL を 受ける ページが 無く、
 * 押すと「この ページは ありません」に なって いた。いまは `[stage]` の ページが
 * 受けて、その ミーティングが 入って いる ステージの URL へ 送る
 *（`standaloneContent` — src/lib/stage-routes.ts）。
 *
 * 単体テスト（tests/internal_links.test.ts）は 「送り先が 引ける」ことまでを 見る。
 * ここでは **作りおきの ページが ほんとうに 転送する**ことを 見る。
 */

const CASES = [
  {
    name: "朝礼",
    article: "/asakai/article-asakai_team",
    label: "9/21 月曜日の 朝礼に 出る",
    meeting: "/asakai/meeting-asakai_kantan",
    // 関門を あける（content/stages/asakai.json の 並び）
    before: ["asakai_lecture", "asakai_team"],
  },
  {
    name: "夕礼",
    article: "/asakai/article-yuurei_nexttalent",
    label: "9/28 月曜日の 夕礼に 出る",
    meeting: "/asakai/meeting-asakai_muzukashii",
    before: ["asakai_lecture", "asakai_team", "asakai_kantan", "yuurei_nexttalent"],
  },
] as const;

for (const item of CASES) {
  test(`${item.name}の 前ばなしの「つぎは これ」から ミーティングが 開く`, async ({
    page,
    context,
  }) => {
    await seedCompleted(context, item.before);
    await page.goto(item.article);

    const card = page.locator("a.card-island").filter({ hasText: "つぎは これ" });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(item.label.slice(0, 4));

    await card.click();
    await expect(page).toHaveURL(new RegExp(`${item.meeting}$`));
    await expect(page.getByRole("heading", { name: /この\s*ページは\s*ありません/ })).toHaveCount(
      0,
    );
  });
}

test("ステージに 入って いない ミーティングの URL は、これまでどおり「ありません」", async ({
  page,
}) => {
  const response = await page.goto("/meeting/no_such_meeting");
  expect(response?.status()).toBe(404);
});
