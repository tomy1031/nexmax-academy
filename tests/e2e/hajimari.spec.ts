import { expect, test } from "@playwright/test";
import { joinCall, seedCompleted, shot } from "./helpers";

/**
 * はじまりステージ — ヘンディさんとの ミーティング（Zoom の 入りかた・ことばの 辞書）
 *
 * ここで 見張るのは 3つ。どれも **入る 前の 画面**で 決まる ことなので、
 * 部屋の 中まで 入らないと 分からない 形には しない。
 *   1. 学習者が 何を たのまれたのかが、入る 前に 書いてある
 *   2. 入口は Zoom と 同じ（ドアの ノックでは ない）。カメラは 既定で ON、
 *      けす／つける と マイクの ためしが 入る 前に できる
 *   3. しつもんの ことばは タップで 意味が 出る（辞書は 単語ステージ＝先生が DBで 直せる）
 */

/** はじまりの ミーティング（この 種別は 1本なので URL に ID が 付かない）。 */
const MEETING = "/hajimari/meeting";
/** 手前の まんがは 関門。ここだけを 見たいので おわった ことにする。 */
const BEFORE = ["hajimari_manga"];

test("入る 前の 画面が Zoom と 同じで、カメラと マイクを 先に たしかめられる", async ({
  page,
  context,
}) => {
  await seedCompleted(context, BEFORE);
  await page.goto(MEETING);

  // 1. たのまれた ことが 入る 前に 書いてある
  await expect(page.getByText("はなす まえに")).toBeVisible();
  await expect(page.getByText("これから ミーティングを")).toBeVisible();

  // 2. カメラは 既定で ON。自分の うつり方を 相手に 見られる 前に 見られる
  await expect(page.getByRole("button", { name: "カメラを けす" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("video")).toHaveCount(1);

  // マイクは おした ときだけ。こえの 大きさが 棒で 見える
  await page.getByRole("button", { name: "マイクを ためす" }).click();
  await expect(page.getByRole("meter", { name: "マイクの おおきさ" })).toBeVisible();
  await shot(page, "30-hajimari-meeting-join");

  // けせる ことも 確かめる（うつりたくない 学習者は ここで 消してから 入る）
  await page.getByRole("button", { name: "カメラを けす" }).click();
  await expect(page.locator("video")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "カメラを つける" })).toBeVisible();
});

test("しつもんの ことばを タップすると、いみが 出る", async ({ page, context }) => {
  await seedCompleted(context, BEFORE);
  await page.goto(MEETING);
  await joinCall(page);

  // 1問目は「お名前を おしえて ください。」— 辞書に ある「名前」に 下線が つく
  const term = page.getByRole("button", { name: /名前/ });
  await expect(term).toHaveAttribute("aria-expanded", "false");
  await term.click();

  /*
   * 吹き出しは 単語ステージ（/admin/words で 先生が 直せる）の 説明そのもの。
   * 説明文の 漢字にも ルビが 合成される ので、字づらは「言葉ことばです」に なる
   * ——だから ルビの 入らない ところで 見比べる。
   */
  const note = page.getByRole("note");
  await expect(note).toContainText("よぶ ときの");
  await expect(note).toContainText("Name");
  await shot(page, "31-hajimari-meeting-dictionary");
});
