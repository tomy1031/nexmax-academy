import { expect, test } from "@playwright/test";
import {
  itemsBefore,
  KAISHA,
  joinCall,
  seedCompleted,
  seedGeminiKey,
  shot,
  speakByText,
  waitForAsk,
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
  /*
   * そして **ポップアップを 1回 押すだけで** つぎの しつもんが 出る（＝止まらない）。
   * 鍵が あっても 無くても 出る ものは 同じ 形——「言った のに 何も 出ない ときが
   * ある」を 無くす ため（2026-08-20 の 指定）。`speakByText` が その 1押しを 含む。
   */
  await waitForAsk(page, 2);
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

    /*
     * AIの みかたは **best-effort**（src/components/meeting/judge-api.ts）。
     * 動的に 作った 文には ふりがなを 合成できないので、漢字が 混ざった 返事は
     * 1回 言い直させ、それでも 混ざれば **捨てて** 規則ベースへ 落とす。
     * つまり 鍵が あっても みかたが 出ない ことは 仕様の うち。
     *
     * ここで 出ないだけで CI を 赤に すると、みんなの PR が 止まる（実際に
     * 2026-08-18 に 何度も 止まった）。**出なかったのは 出なかったと 分かる
     * ように skip で 残す**——緑で 通して 黙って 消すのは しない。
     */
    /*
     * みかたの カードは **落ちた ときも 出る**（規則ベースで 同じ 形に 組む）。
     * だから「出たか」では なく、**落ちた 印（理由の ひとこと）が 無いか**で 見る。
     */
    const card = page.getByLabel("にほんごの みかた");
    const fellBack = page.getByText(
      /AIの みかたは いま つかえません|きょうは AIを つかいすぎました|AIが いま こんで います|つうしんが うまく いきませんでした|AIの へんじが おそいので/,
    );
    await expect(card.first()).toBeVisible({ timeout: 45_000 });

    if ((await fellBack.count()) > 0) {
      // 会話が 止まらない ことだけは ここでも 確かめる（学習者に とって いちばん 大事）
      await waitForAsk(page, 2);
      await shot(page, "23-judge-fallback-live");
      /*
       * **理由の 名前**まで 残す（`data-fallback`）。画面の ことばは 理由を
       * まとめて しまうので、写真だけでは どこで つまずいたのかが 分からなかった。
       */
      const reason = await page.locator("[data-fallback]").first().getAttribute("data-fallback");
      test.skip(true, `AIが みかたを 返しませんでした（reason=${reason ?? "?"}）`);
    }

    // 3段（すばらしい／つたわりました／もう いちど）の どれかが 出る
    await expect(
      card.getByText(/すばらしい！|つたわりました！|もう いちど いってみよう/),
    ).toBeVisible();
    // ほめる ひとことと、言いかえの 見本が そろっている
    await expect(card.getByText("🌸")).toBeVisible();
    await expect(card.getByText("こう いうと もっと いいです")).toBeVisible();
    await shot(page, "23-judge-live");
  });
});
