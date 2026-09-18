import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { joinCall, seedCompleted, shot } from "./helpers";

/**
 * 🎤 が つながらない ときの 手がかり（2026-09-18「マイクが うまく 動かない・
 * エラーの デバッグも 動いて いない」）
 *
 * ミーティング・朝礼の 🎤 は つながらないと「いまは したの らんに かいて こたえて
 * ください」しか 出さず、鍵・トークン・マイクの 許可・モデルの どこで 止まったか
 * 分からなかった。ここでは 鍵の 無い 端末（デモモード）で 押して、
 *   1. 理由の 名前が 小さく 出る（ふだんの 画面でも）
 *   2. `?debug=1` を 付けた ときだけ、つなぎの 記録が 出る
 * を 見る。どちらも 部品は 1つ（`SpeakButton`）なので、ミーティングと 朝礼で 同じに 出る。
 */

/** 朝礼の 前に ある 教材（関門を 開けて おく）。 */
function asakaiBefore(): string[] {
  const stage = JSON.parse(
    readFileSync(join(__dirname, "..", "..", "content", "stages", "asakai.json"), "utf8"),
  ) as { contents: { ref: string }[] };
  const refs = stage.contents.map((item) => item.ref);
  return refs.slice(0, refs.indexOf("asakai_kantan"));
}

async function pressStart(page: Page) {
  await page.getByRole("button", { name: /スタート（マイクを つなぐ）/ }).click();
  await expect(page.getByText("いまは したの らんに かいて こたえて ください")).toBeVisible();
}

test("ミーティング: つながらない ときは 理由の 名前が 出る。記録は ?debug=1 の ときだけ", async ({
  page,
  context,
}) => {
  await seedCompleted(context, ["hajimari_manga"]);
  await page.goto("/hajimari/meeting");
  await joinCall(page);
  await pressStart(page);

  const reason = page.getByTestId("live-reason");
  await expect(reason).toContainText("reason: noKey");
  await expect(reason).toContainText("voice.key none on this origin");
  await expect(page.getByTestId("live-debug")).toHaveCount(0);

  await page.goto("/hajimari/meeting?debug=1");
  await joinCall(page);
  await pressStart(page);
  const panel = page.getByTestId("live-debug");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("!! voice.key none on this origin");
  await shot(page, "live-debug-01-meeting");
});

test("朝礼: 同じ 🎤 なので 同じ 理由と 記録が 出る", async ({ page, context }) => {
  await seedCompleted(context, asakaiBefore());
  await page.goto("/asakai/meeting-asakai_kantan?debug=1");
  await joinCall(page);
  const memo = page.getByRole("dialog", { name: "報告メモ" });
  if (await memo.isVisible().catch(() => false)) {
    await memo.getByRole("button", { name: "とじる" }).click();
  }
  await pressStart(page);

  await expect(page.getByTestId("live-reason")).toContainText("reason: noKey");
  await expect(page.getByTestId("live-debug")).toContainText("voice.key none on this origin");
  await shot(page, "live-debug-02-asakai");
});
