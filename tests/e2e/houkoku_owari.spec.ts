import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { KAISHA, KAISHA_ITEMS, itemsBefore, seedCompleted, shot } from "./helpers";

/**
 * ヘンディさんに ぜんぶ 答えた 人は、**必ず** つぎへ 進める
 *
 * ## 何が 起きて いたか（2026-08-28 の 指摘「全部終わったけど次に進めません」）
 * この ミーティングには **聞く ばんが 無い**（`discover` が 空）。ぜんぶ 答えると
 * その場で しゅうりょうしょうが 出て、**それを 閉じた ときに** 修了が 書かれる。
 * つまり おわりの 道が 1本しか なく、**閉じずに 画面を 出た 人**——授業の チャイム・
 * 回線の ゆらぎ・更新ボタン——には もう 二度と 出す 道が 無かった。
 * 次に 開くと 画面は「おわった 顔」を するのに 進捗は とちゅうの ままで、
 * 枠（ContentFrame）は つぎの 教材を 開かない。**詰む**。
 *
 * ## ここで 何を 見張るか
 * 「答えきった 端末」を 先に 置いてから 開き、**入室しなくても つぎへ 進める**ことを 見る。
 * 通しの 道（しゅうりょうしょうを 閉じて 進む）は `toshi.spec.ts` が 別に 通す——
 * こちらが 見るのは **閉じ忘れという 落とし穴**の ほうである。
 */

/**
 * ヘンディさんの **つぎ**の 教材。**並びから 引く**（`itemsBefore` と 同じ 理由）。
 * ここを 名前で 決め打ちすると、STEP 4 の 中身が 入れ替わった 日に 静かに ずれる
 *（2026-08-28 に 実際に ずれた: `kaisha_jibun` → `kaisha_matsui_junbi`）。
 */
const NEXT_ITEM = KAISHA_ITEMS[KAISHA_ITEMS.indexOf(KAISHA.meetingHendy) + 1]!;

/** ヘンディさんの しつもんの 数。**教材から 読む**（`HOUKOKU_TOTAL` と 同じ 理由）。 */
const HENDY_QUESTIONS: number = (
  JSON.parse(
    readFileSync(
      join(__dirname, "..", "..", "content", "meetings", "kaisha_houkoku_meeting.json"),
      "utf8",
    ),
  ) as { questions: unknown[] }
).questions.length;

test("しゅうりょうしょうを 閉じずに 出ても、もどれば つぎへ 進める", async ({ page, context }) => {
  await seedCompleted(context, itemsBefore(KAISHA.meetingHendy));

  /*
   * ぜんぶ 答えた ところで 画面を 出た 人の 端末を 作る
   *（`src/lib/meeting/resume.ts` の 保存の 形）。修了（`content:` の completed）は
   * **わざと 書かない**——それが 閉じ忘れた 人の 端末の 姿である。
   */
  await context.addInitScript((index: number) => {
    window.localStorage.setItem(
      "nexmax:v1:meeting-resume:kaisha_houkoku_meeting",
      JSON.stringify({
        meetingId: "kaisha_houkoku_meeting",
        index,
        openIds: [],
        answers: {},
        affection: { perQuestion: {}, finished: false },
        round: "ask",
        found: [],
        missedIds: [],
      }),
    );
  }, HENDY_QUESTIONS);

  await page.goto(KAISHA.meetingHendy.path);

  // つぎの 教材（STEP 4）への ボタンが 出て、押せる
  const next = page.locator("a.btn-game").filter({ hasText: "つぎは" });
  await expect(next).toBeVisible();
  await shot(page, "31-hendy-owari-tsugi");

  await next.click();
  await expect(page).toHaveURL(new RegExp(`${NEXT_ITEM.path}$`));
});
