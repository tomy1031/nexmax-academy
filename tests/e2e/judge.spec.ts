import { expect, test } from "@playwright/test";
import {
  itemsBefore,
  KAISHA,
  joinCall,
  seedCompleted,
  seedGeminiKey,
  shot,
  speakByText,
} from "./helpers";

/**
 * 返事の 見かた（judge）— 鍵が 無くても 進める／鍵が あれば AIが 見る
 *
 * ## 鍵が 無いのが 教室の 既定
 * Gemini の 鍵は **学習者の 端末ごと**（BYOK）。入っていない教室のほうが多いので、
 * 「鍵が 無くても 会話が 止まらない」ほうが 大事な 検証になる。
 *
 * ## 鍵が あるときは 1往復だけ 見る
 * `GEMINI_API_KEY` が CI に 渡っているときだけ、本物の 1往復を 確かめる。
 * 渡し方は **学習者と同じ道**——端末（localStorage）に置く。そこから
 * **ブラウザが Google を 直接 呼ぶ**（2026-08-17 から サーバは 通さない）。
 * サーバの環境変数にも ビルドにも 渡さない（OpenNext が バンドルへ 焼き込むため
 * — docs/deploy.md §0.2）。
 *
 * ## このファイルだけ トレースを 取らない
 * トレースには Google へ 送った 通信（**鍵を含む**）が そのまま 残る。
 * 成果物に 鍵を 出さないため、鍵を さわる このファイルは 丸ごと 記録を 切る
 *（Playwright は describe の 中で use を 使えないので、ファイルの あたまに 置く）。
 * 画面の 写真は 撮ってよい——鍵は どの 画面にも 出ない。
 */
test.use({ trace: "off", video: "off" });

test("鍵が 無くても、規則ベースの 受け止めで 会話が 止まらない", async ({ page, context }) => {
  await seedCompleted(context, itemsBefore(4));
  await page.goto(KAISHA.meetingHendy.path);
  await joinCall(page);

  await speakByText(page, "はい。ほうこくします。");

  // ほめる ひとことは 出る（責める ことばは 出さない）
  await expect(page.getByText("🌸").first()).toBeVisible();
  // なぜ AIの みかたが 出ないのかを、責めずに 1行 伝える
  await expect(page.getByText("AIの せっていが まだです")).toBeVisible();
  // そして つぎへ 進める（＝止まらない）
  await expect(page.getByRole("button", { name: "つぎへ →" })).toBeEnabled();
  await shot(page, "22-judge-fallback");
});

/** 鍵ありの 1往復（鍵が 無い CI・フォークからの PR では とばす）。 */
test.describe("AIの みかた（鍵が あるときだけ）", () => {
  test("文字で 答えると、3段の どれかと ほめ言葉が かえる", async ({ page, context }) => {
    const key = process.env.GEMINI_API_KEY ?? "";
    test.skip(
      key === "",
      "GEMINI_API_KEY が 無いので とばしました（鍵なしの道は 別のテストで 見ています）",
    );

    await seedGeminiKey(context, key);
    await seedCompleted(context, itemsBefore(4));
    await page.goto(KAISHA.meetingHendy.path);
    await joinCall(page);

    await speakByText(page, "はい。ほうこくします。");

    // 3段（すばらしい／つたわりました／もう いちど）の どれかが 出る
    const card = page.getByLabel("にほんごの みかた");
    await expect(card).toBeVisible({ timeout: 45_000 });
    await expect(
      card.getByText(/すばらしい！|つたわりました！|もう いちど いってみよう/),
    ).toBeVisible();
    // ほめる ひとことと、言いかえの 見本が そろっている
    await expect(card.getByText("🌸")).toBeVisible();
    await expect(card.getByText("こう いうと もっと いいです")).toBeVisible();
    await shot(page, "23-judge-live");
  });
});
