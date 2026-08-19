import { expect, test } from "@playwright/test";
import { joinCall, seedCompleted, shot, skipAsk, speakByText } from "./helpers";

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

test("こえの ボタンは Zoom の 画面の 中に 大きく ある（鍵が 無くても 行き止まりに しない）", async ({
  page,
  context,
}) => {
  await seedCompleted(context, BEFORE);
  await page.goto(MEETING);
  await joinCall(page);

  /*
   * ボタンは **相手の 顔と 同じ 枠の 中**（Zoom の 画面の 中）に ある。
   * 入力欄の 横の 小さな ボタンでは、どれを 押せば 声で 話せるのか 分からなかった。
   */
  const speak = page.getByRole("button", { name: "🎤 こえを つかう" });
  await expect(speak).toBeVisible();
  await expect(page.getByText("ボタンを おしている あいだだけ")).toHaveCount(0);

  // 押しても 鍵が 無い 端末では、責めずに 書く道を 案内する（止まらせない）
  await speak.click();
  await expect(page.getByText("いまは したの らんに かいて こたえて ください")).toBeVisible();
  await expect(page.getByLabel("こたえを 入力する")).toBeEnabled();
  await shot(page, "32-hajimari-meeting-speak");
});

test("つぎに 開いても、いつも 1問目から はじまる", async ({ page, context }) => {
  await seedCompleted(context, BEFORE);
  await page.goto(MEETING);
  await joinCall(page);
  await speakByText(page, "わたしは ソクです。");
  await expect(page.getByText("🌸").first()).toBeVisible();

  // 途中で 閉じて、開き直す
  await page.goto(MEETING);
  await joinCall(page);

  // 「まえの つづきから」は 出さない。1問目（名前）から もう いちど
  await expect(page.getByText("まえの つづきから")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /名前/ })).toBeVisible();
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

test("6つ おわると「聞く ばん」に なり、こえが 無くても 返事が ある", async ({ page, context }) => {
  await seedCompleted(context, BEFORE);
  await page.goto(MEETING);
  await joinCall(page);

  // 6問を ことばで 通す（「すみません、つぎを おねがいします」）
  for (let i = 0; i < 6; i += 1) {
    await skipAsk(page);
    await page.waitForTimeout(300);
  }

  /*
   * ここからは 役が 入れかわる。**足場（型文）を 消さない**——
   * 白い 入力欄だけ 残すのは、設計01 P6 の アンチパターン。
   */
  await expect(page.getByText("こんどは、あなたが")).toBeVisible();
  /* 見出しの 漢字には ルビが 合成される ので、型文の かなの ところで 見る */
  await expect(page.getByText("どんな しごとを して いますか")).toBeVisible();

  /*
   * 声で つないで いない 学習者にも 返事が ある（誰も いない 部屋に しない）。
   * 責めずに、どうすれば 答えて もらえるかと、ことばが のこる ことを 伝える。
   */
  /*
   * おわりの 画面は 絵が ゆっくり 動きつづける ので、ボタンが「止まる」のを
   * 待つ 押し方だと 待ちきれない。ここは Enter で 送る（学習者も 同じ ように 送れる）。
   */
  const box = page.getByLabel("こたえを 入力する");
  await box.fill("かいぎで「はい」と 言うのは どうしてですか。");
  await box.press("Enter");
  /*
   * 「しごと」の ことばが 当たった ので、**聞き出せた**ことに なる——
   * 声が つながって いなくても、教材に 書いた 答えが 返る。
   */
  await expect(page.getByText("あれは「わかりました」では なく")).toBeVisible();
  /* 見出しの 漢字には ルビが 入る ので、数の ところで 見る */
  await expect(page.getByText(/（1 \/ 6）/)).toBeVisible();

  // 当たらない ことばの ときは、責めずに 次の 一手を 出す
  await box.fill("きょうは あついですね。");
  await box.press("Enter");
  await expect(page.getByText("しつもんが 言えましたね。")).toBeVisible();
  await shot(page, "33-hajimari-free-talk");
});
