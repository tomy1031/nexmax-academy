import { expect, test } from "@playwright/test";
import {
  itemsBefore,
  KAISHA,
  joinCall,
  seedCompleted,
  shot,
  speakByText,
  waitForAsk,
} from "./helpers";

/**
 * 返事の 見かた（judge）— **鍵が 無くても 会話が 止まらない**
 *
 * Gemini の 鍵は **学習者の 端末ごと**（BYOK）。入っていない教室のほうが多いので、
 * ここが 教室の 既定の 道であり、毎回 見る 値打ちが ある（判定は 規則ベースで 決まる
 * ＝ 何度 走らせても 同じ 結果に なる）。
 *
 * 鍵が あるときの 1往復は `judge.ai.spec.ts` へ 分けた（2026-09-08）。
 * あちらは AIの 返答で 中身が 変わる ので、対話まわりを 触った ときだけ 走らせる。
 */
test.use({ trace: "off", video: "off" });

test("鍵が 無くても、規則ベースの 受け止めで 会話が 止まらない", async ({ page, context }) => {
  await seedCompleted(context, itemsBefore(KAISHA.meetingHendy));
  await page.goto(KAISHA.meetingHendy.path);
  await joinCall(page);

  await speakByText(page, "2018年に できました。");

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
