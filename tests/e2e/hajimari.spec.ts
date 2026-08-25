import { expect, test } from "@playwright/test";
import meeting from "../../content/meetings/hajimari_meeting.json";
import { joinCall, seedCompleted, shot, skipAsk, speakByText } from "./helpers";

/** しつもんの 数（教材が 正）。 */
const MEETING_QUESTIONS = meeting.questions.length;
/** 見つける ことの 数（ラウンド2）。 */
const MEETING_DISCOVER = meeting.discover.length;

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
  /*
   * 「ミーティング」が **ことばの 辞書に 入った**（2026-08-25。かいしゃステージの
   * 単語テストに 足した ぶんが 辞書に 畳まれる）ので、この 文の 中では
   * 押せる チップに なり、字面が 「ミーティング みーてぃんぐを」に なる。
   * 上の ルビと 同じ 理由なので、同じく 正規表現で さがす。
   */
  await expect(page.getByText(/これから ミーティング.*を.*始.*めます/)).toBeVisible();

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
  const speak = page.getByRole("button", { name: /スタート（マイクを つなぐ）/ });
  await expect(speak).toBeVisible();
  await expect(page.getByText("ボタンを おしている あいだだけ")).toHaveCount(0);

  // 押しても 鍵が 無い 端末では、責めずに 書く道を 案内する（止まらせない）
  await speak.click();
  await expect(page.getByText("いまは したの らんに かいて こたえて ください")).toBeVisible();
  await expect(page.getByLabel("こたえを 入力する")).toBeEnabled();
  await shot(page, "32-hajimari-meeting-speak");
});

test("画面を 開き直しても、だまって つづきから はじまる", async ({ page, context }) => {
  await seedCompleted(context, BEFORE);
  await page.goto(MEETING);
  await joinCall(page);
  await speakByText(page, "わたしは ソクです。");
  await expect(page.getByText("🌸").first()).toBeVisible();

  // 途中で 閉じて、開き直す
  await page.goto(MEETING);
  await joinCall(page);

  /*
   * **だまって つづきから**（2026-08-21 の 指定）。
   * 「つづきから 始めますか」の 確認は 出さず、2問目に 座って いる。
   */
  await expect(page.getByText("つづきから")).toHaveCount(0);
  /* ルビが 合成されて 文が 割れる ので、かなだけの ところで 見る */
  await expect(page.getByText("あなたは、どこから").first()).toBeVisible();
  /* 1問目の カードは ひらいた まま（答えた ことが 残って いる） */
  await expect(page.getByRole("listitem", { name: /1ばんめ こたえました/ })).toBeVisible();
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

test("ぜんぶ おわると「聞く ばん」に なり、こえが 無くても 返事が ある", async ({
  page,
  context,
}) => {
  await seedCompleted(context, BEFORE);
  await page.goto(MEETING);
  await joinCall(page);

  /*
   * しつもんの 数は **教材から 取る**。ここに 数字を 書くと、しつもんを 足した 日に
   * かならず 落ちる（2026-08-21 に 6→12 で 実際に そうなった）。
   */
  for (let i = 0; i < MEETING_QUESTIONS; i += 1) {
    await skipAsk(page);
    await page.waitForTimeout(300);
  }

  /*
   * ここからは 役が 入れかわる。**足場（聞き方）を 消さない**——
   * 白い 入力欄だけ 残すのは、設計01 P6 の アンチパターン。
   * ただし **並べて 見せない**（2026-08-20 の 指定）。上から 読んで 打つだけに
   * なると 聞き出す 練習に ならない ので、こまった ときに 1つずつ 出す。
   */
  await expect(page.getByText("こんどは、あなたが")).toBeVisible();
  /*
   * ぜんぶ 終えると **しゅうりょうしょう**が 出る。
   * この とき「ステージ クリア」は **まだ 出て いない**——順番を 重なりでは なく
   * 「`completed` を 書く ところ」で 決めて いる ことの 見張り（2026-08-21）。
   */
  const certificate = page.getByRole("dialog", { name: "しゅうりょうしょうの ポップアップ" });
  await expect(certificate).toBeVisible();
  await expect(page.getByRole("dialog", { name: "ステージ クリア" })).toHaveCount(0);
  await expect(certificate.getByText("こ 話せました")).toBeVisible();
  await shot(page, "34-hajimari-certificate");
  await certificate.getByRole("button").click();
  await expect(certificate).toHaveCount(0);

  /*
   * ばんの 帯は **2つ**（「はじまり」は 消した）。ぜんぶ 答えた あとは
   * どちらも 押せて、行き来できる。
   */
  const listenTab = page.getByRole("button", { name: /さんに しつもん/ });
  await expect(listenTab).toBeEnabled();

  /*
   * **板は ばんに ついて くる**（2026-08-21 の 指定「02の 場合は 02の カードを
   * 表示して」）。帯だけ 02 に して 板が 01 の ままだと、画面の いちばん 目立つ
   * ところが 01 を 指しつづける。
   */
  await page.getByRole("button", { name: /さんから しつもん/ }).click();
  await expect(page.getByLabel(/ひらいた カード/)).toBeVisible();
  await expect(page.getByLabel(/きけた カード/)).toHaveCount(0);
  await listenTab.click();
  await expect(page.getByLabel(new RegExp(`きけた カード 0 / ${MEETING_DISCOVER}`))).toBeVisible();
  await expect(page.getByLabel(/ひらいた カード/)).toHaveCount(0);

  /*
   * 聞ける ことは **はじめから 見えて いる**（伏せない）。文の 案内は 消して
   * 板に 一本化した ので、板の ことばが そのまま 足場に なる。
   * ルビが 合成されて 文が 割れる ので、かなだけの ところで 見る。
   */
  await expect(page.getByText("むずかしい ところ").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "ヒントの しつもんを 見る" })).toHaveCount(0);
  /* 「ミーティングを おわる」は 消した（たいしつ が おわりの 道） */
  await expect(page.getByRole("button", { name: "ミーティングを おわる" })).toHaveCount(0);

  /* 「こまったら →」の 一行は 消した（言って みても 役に 立たなかった） */
  await expect(page.getByText("こまったら")).toHaveCount(0);

  /*
   * 声で つないで いない 学習者にも 返事が ある（誰も いない 部屋に しない）。
   * 責めずに、どうすれば 答えて もらえるかと、ことばが のこる ことを 伝える。
   */
  /*
   * おわりの 画面は 絵が ゆっくり 動きつづける ので、ボタンが「止まる」のを
   * 待つ 押し方だと 待ちきれない。ここは Enter で 送る（学習者も 同じ ように 送れる）。
   */
  const box = page.getByLabel("こたえを 入力する");
  await box.fill("しごとで いちばん うれしかった ことは 何ですか。");
  await box.press("Enter");
  /*
   * 「しごと」の ことばが 当たった ので、**聞き出せた**ことに なる——
   * 声が つながって いなくても、教材に 書いた 答えが 返る。
   */
  /*
   * 相手の 吹き出しにも **ルビが 合成される**ように なった（2026-08-25）ので、
   * 字面が 「知しらない 人ひとが…」に なる。正規表現で さがす。
   */
  await expect(page.getByText(/知.*らない.*人.*が わたしの.*作/)).toBeVisible();
  /* 見出しの 漢字には ルビが 入る ので、数の ところで 見る */
  await expect(page.getByText(new RegExp(`（1 / ${MEETING_DISCOVER}）`))).toBeVisible();

  // 当たらない ことばの ときは、責めずに 次の 一手を 出す
  await box.fill("きょうは あついですね。");
  await box.press("Enter");
  /*
   * 「言えましたね」の 漢字には ルビが 入る ので、地の文だけの 一致は 当たらない
   *（画面の 字は「しつもんが 言いえましたね。」に なる）。上の 数の ところと 同じ 逃し方。
   */
  await expect(page.getByText(/しつもんが .*えましたね/)).toBeVisible();
  await shot(page, "33-hajimari-free-talk");
});
