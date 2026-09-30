import { expect, test, type Page } from "@playwright/test";

/**
 * 「最後に 開いた ステージ」の 控え（2026-09-30 の 指定）
 *
 * ユーザーの ことば:「報告の画面を開いてもどったはずなのに、『要件定義』まで進んでいたため、
 * 要件定義のところで止まってしまいました。画面遷移の場合は進行状況で管理せず、
 * 最後に開いたものを開くようにしてください」
 *
 * 地図は ログインの 内側に あって ここからは 見えない（下りる 先の 判断は
 * tests/progress.test.ts の `mapLanding` が 見張る）。ここで 見るのは **控えが 書かれるか**:
 *  - ステージの トップ・中の 教材・単語テストを 開くと、その ステージを 覚える
 *  - 地図に 出ない ステージ（はじめに）では 上書きしない
 */
const KEY = "nexmax.lastOpened.v1";

async function lastOpened(page: Page) {
  // 書くのは 描画の あと（useEffect）なので、待って から 読む
  await page.waitForLoadState("networkidle");
  return page.evaluate((key) => localStorage.getItem(key), KEY);
}

test("開いた ステージを 覚え、地図に 出ない ステージでは 上書きしない", async ({ page }) => {
  await page.goto("/houkoku");
  await expect.poll(() => lastOpened(page)).toBe("houkoku");

  // はじめに（地図に 出ない）は 覚えない——その前に 開いて いた 報告を 忘れない
  await page.goto("/intro");
  await page.waitForTimeout(500);
  expect(await lastOpened(page)).toBe("houkoku");

  // 中の 教材を 開いても 覚える（教材の 枠）
  await page.goto("/renraku/manga");
  await expect.poll(() => lastOpened(page)).toBe("renraku");

  // 単語テストは 持ち主の ステージを 覚える（地図の「単語を 勉強」から 戻る 道）
  await page.goto("/wordtest/kaisha");
  await expect.poll(() => lastOpened(page)).toBe("kaisha");

  // はじめに の 単語テストも 覚えない
  await page.goto("/wordtest/intro");
  await page.waitForTimeout(500);
  expect(await lastOpened(page)).toBe("kaisha");
});
