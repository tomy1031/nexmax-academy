import { expect, test, type Page } from "@playwright/test";
import {
  choiceButtons,
  goNext,
  goToConfirm,
  placeWords,
  submitAnswers,
  waitForAsk,
  hearts,
  KAISHA_ITEMS,
  joinCall,
  multiButtons,
  openedCards,
  shot,
  skipAsk,
  speakByText,
} from "./helpers";

/**
 * かいしゃステージ（企業調査）の 通し — 6教材を 学習者と同じ順に あそぶ
 *
 * **端末には何も置かずに始める。** 関門（前の教材を終えるまで開かない）も
 * 本物のまま通る——つまりこの1本が緑なら、学習者が最初から最後まで
 * 進める道がつながっている、ということが 人の手を借りずに 分かる。
 *
 * 声（マイク）と AIの判定は ここでは使わない。鍵の要らない道（文字で答える・
 * 規則ベースの受け止め）だけで最後まで行けることが、教室の既定の姿だから
 * （docs/teaching/kaisha_授業の1枚.md §4）。
 *
 * ## 画面の文字を そのまま 探さない
 * 本文の漢字には ルビが 合成される（「報告」→「報告ほうこく」）ので、
 * 漢字を含む文字列で 画面を 探すと 当たらない。**かなだけの ひとかたまり**を
 * 手がかりにする。
 */

/** もんだい1「しらべかたの かくにん」の 正しい選択肢の位置（content/quizsets/kaisha_shirabekata_check.json）。 */
const CHECK_ANSWERS = [0, 2, 1, 0, 0];

/** もんだい2「ほうこくの じゅんび」の 語群の答え（content/quizsets/kaisha_houkoku.json）。 */
const HOUKOKU_WORDS: readonly (readonly string[])[] = [
  ["ホームページや アプリ"],
  ["大阪", "東京"],
  ["2018"],
  ["受託開発"],
  ["エンジニア"],
];

/**
 * 自由入力の 4問。**どれも 代表解そのままではない**書き方にしてある
 * ——ひらがな・「です」つき・文で答える の3つが 救済されている証拠を、
 * 通しの中に そのまま 残すため（判定は src/lib/text/normalize.ts）。
 */
const HOUKOKU_FREE_INPUT = [
  "くるまの かいしゃです", // ひらがな＋です＋部分一致（代表解は「くるま」）
  "にほんごの きょういく", // ひらがな＋部分一致（代表解は「教育」）
  "ぶんかです", // ひらがな＋です（代表解は「価値」・accept に「ぶんか」）
  "ほうこくします", // ひらがな（代表解は「報告します」）
];

/** ヘンディさんに 話す こたえ（型文を なぞった、学習者が 書きそうな文）。 */
const HENDY_ANSWERS = [
  "はい。ほうこくします。",
  "ネクストメイクは、ホームページや アプリを 作る 会社です。",
  "お客さまは、たとえば くるまの 会社です。",
  "いろいろな 国の エンジニアが はたらいて います。",
  "お客さまの ものを 作る、受託開発です。",
  "本社は 大阪に あります。",
  "2018年に できました。",
  "日本語と ITの 教育を して います。",
  "たとえば、「文化」が ありました。",
  // 10問目は「まだ 言えない（つぎへ）」で 通る（答えられなくても 詰まらない証拠）
];

/** 松井社長に 話す 5問ぶんの こたえ。 */
const MATSUI_ANSWERS = [
  "ソピアです。よろしく おねがいします。",
  "カンボジアの プログラムが おもしろかったです。",
  "わたしの 学校の ことが 書いて あったからです。",
  "わたしは アプリを 作る しごとを して みたいです。",
  "社長は、どうして この 会社を 作りましたか。",
];

test("かいしゃステージを 6教材 通しで あそべる（端末に 何も 置かずに 始める）", async ({
  page,
}) => {
  await test.step("1. ステージのトップに 6教材が 順に ならぶ", async () => {
    await page.goto("/kaisha");
    // 見出しは 漢字＋ふりがな。ルビが 合成されるので 名前で 引く（会社かいしゃを 知しる）。
    await expect(page.getByRole("heading", { name: /会社.*知/ })).toBeVisible();

    const list = page.locator("ol > li > a");
    await expect(list).toHaveCount(KAISHA_ITEMS.length);
    for (const [index, item] of KAISHA_ITEMS.entries()) {
      await expect(list.nth(index)).toContainText(item.kind);
    }
    await expect(page.getByText("6つ の うち 0つ おわりました")).toBeVisible();
    await shot(page, "01-stage-top");

    await list.first().click();
  });

  await test.step("2. ページ「かいしゃの しらべかた」— 🔊 と ことばチップ", async () => {
    await expect(page).toHaveURL(/article-kaisha_shirabekata$/);

    // 読み上げは 本文にも かじょうがきにも 付いている（音に 逃げる 道を ふさがない）
    const speakers = await page.getByRole("button", { name: "よみあげる" }).count();
    expect(speakers).toBeGreaterThan(3);

    // ことばチップ: タップすると 読み・英語・意味 が出る
    await page.getByRole("button", { name: "会社概要" }).first().click();
    await expect(page.getByText("かいしゃがいよう — Company overview")).toBeVisible();
    await shot(page, "02-article-vocab");
    await page.getByRole("button", { name: "とじる" }).click();

    await readToEnd(page);
    await page.getByRole("link", { name: "つぎは" }).click();
  });

  await test.step("3. もんだい「しらべかたの かくにん」— 6問", async () => {
    await expect(page).toHaveURL(/quiz-kaisha_shirabekata_check$/);
    await page.getByRole("button", { name: "はじめる" }).click();

    // 既定の やりかたは「まとめて 出す」——途中では 採点しない（先生が 管理画面で 決める）
    for (const answer of CHECK_ANSWERS) {
      await choiceButtons(page).nth(answer).click();
      await goNext(page);
    }
    // さいごは 複数えらぶ（3つの目＋💎）
    for (const index of [0, 1, 2, 3]) await multiButtons(page).nth(index).click();
    await goToConfirm(page);
    await submitAnswers(page);

    await expect(page.getByText("6 / 6 もん")).toBeVisible();
    await shot(page, "03-quiz-check-result");
    await page.getByRole("link", { name: "つぎは" }).click();
  });

  await test.step("4. ページ「ネクストメイクを しらべよう」— 外のサイトへの カード", async () => {
    await expect(page).toHaveURL(/article-kaisha_nextmake_shirabe$/);

    const external = page.locator('a[target="_blank"]');
    await expect(external).toHaveCount(1);
    await expect(external).toHaveAttribute("href", "https://nextmake.site/");
    await expect(external).toHaveAttribute("rel", /noopener/);
    await expect(external).toContainText("そとの サイト");
    await shot(page, "04-article-extlink");

    await readToEnd(page);
    await page.getByRole("link", { name: "つぎは" }).click();
  });

  await test.step("5. もんだい「ほうこくの じゅんび」— 語群と 自由入力", async () => {
    await expect(page).toHaveURL(/quiz-kaisha_houkoku$/);
    await page.getByRole("button", { name: "はじめる" }).click();

    for (const words of HOUKOKU_WORDS) {
      await placeWords(page, words);
      await goNext(page);
    }
    await shot(page, "05-quiz-wordbank");

    for (const [index, written] of HOUKOKU_FREE_INPUT.entries()) {
      await page.getByLabel("こたえを 入力する").fill(written);
      if (index === HOUKOKU_FREE_INPUT.length - 1) await goToConfirm(page);
      else await goNext(page);
    }
    await submitAnswers(page);

    await expect(page.getByText("9 / 9 もん")).toBeVisible();
    // 自分の書き方のまま通ったことを 画面が 見せる（救済が 生きている証拠）
    for (const written of HOUKOKU_FREE_INPUT) {
      await expect(page.getByText(`あなたの こたえ: ${written}`)).toBeVisible();
    }
    await shot(page, "06-quiz-houkoku-result");
    await page.getByRole("link", { name: "つぎは" }).click();
  });

  await test.step("6. ミーティング「ヘンディさんに 報告する」— 型文を 見ながら 文字で 話す", async () => {
    await expect(page).toHaveURL(/meeting-kaisha_houkoku_meeting$/);

    // 入室の前に「はなす まえに」。見出しの漢字には ふりがなが 合成されている
    await expect(page.getByText("はなす まえに")).toBeVisible();
    await expect(page.locator("h1 ruby").first()).toBeVisible();
    await expect(page.getByText("カメラは ONで はじまります")).toBeVisible();
    /*
      さんかする 前の 画面（Zoom と 同じ）。カメラは 既定で ON なので、
      相手に 見られる 前に 自分の うつり方を 見て、けす／つける を 選べる。
    */
    await expect(page.getByRole("button", { name: "カメラを けす" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator("video")).toHaveCount(1);
    // マイクの ためしは、じぶんが 話す 教材だけに 出る
    await page.getByRole("button", { name: "マイクを ためす" }).click();
    await expect(page.getByRole("meter", { name: "マイクの おおきさ" })).toBeVisible();
    await shot(page, "07-meeting-lobby");

    await joinCall(page);
    // ロビーで 選んだ カメラの 状態が そのまま 部屋へ 続く
    await expect(page.getByRole("button", { name: "カメラを けす" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    /*
     * 型文は **ポップアップ**（2026-08-20 の 指定）。出しっぱなしを やめた ので、
     * 「押すと 出る／読んだら 閉じる」を 見る。
     */
    await page.getByRole("button", { name: "ヒントを 見る" }).click();
    const hint = page.getByRole("dialog", { name: "ヒントの ポップアップ" });
    await expect(hint.getByText("はい。ほうこくします。")).toBeVisible();
    await hint.getByRole("button", { name: "とじる" }).click();
    await expect(hint).toHaveCount(0);
    await shot(page, "08-meeting-inroom");

    expect(await openedCards(page)).toBe(0);
    for (const [index, answer] of HENDY_ANSWERS.entries()) {
      await speakByText(page, answer);
      await expect(page.getByText("🌸").first()).toBeVisible();
      expect(await openedCards(page)).toBe(index + 1);
      // ボタンを 押さなくても つぎの しつもんが 出る（会話が 止まらない）
      await waitForAsk(page, index + 2);
    }

    // さいごの1問は「すみません、つぎを おねがいします」と 言えば 通れる
    await skipAsk(page);
    expect(await openedCards(page)).toBe(HENDY_ANSWERS.length);

    /*
     * ぜんぶ 答えると **しゅうりょうしょう**が 出る（2026-08-21）。
     * ここでは まだ「ステージ クリア」は 出て いない——おわりを 書くのは
     * 聞く ばんを おえた ときに 移した（かぶりを 重なりでは なく 順番で 直した）。
     */
    const cert1 = page.getByRole("dialog", { name: "しゅうりょうしょうの ポップアップ" });
    await expect(cert1).toBeVisible();
    await cert1.getByRole("button").click();
    await expect(cert1).toHaveCount(0);

    await expect(page.getByText("とても よかったです")).toBeVisible();
    await expect(page.getByLabel("きょう はなせた こと")).toBeVisible();
    await shot(page, "09-meeting-hendy-done");

    /*
     * **聞く ばんを おえるまで つぎへ 進めない**。おわりは 学習者が 押して 決める
     *（見つける ことが 0の 教材も あるので「ぜんぶ 見つけた」を おわりに できない）。
     */
    await page.getByRole("button", { name: "ミーティングを おわる" }).click();
    const cert2 = page.getByRole("dialog", { name: "しゅうりょうしょうの ポップアップ" });
    await expect(cert2).toBeVisible();
    await cert2.getByRole("button").click();

    await page.getByRole("link", { name: "つぎは" }).click();
  });

  await test.step("7. ミーティング「松井社長と 話す」— ハートと とっておきの話", async () => {
    await expect(page).toHaveURL(/meeting-kaisha_matsui$/);
    await joinCall(page);

    expect(await hearts(page)).toBe(0);
    let before = 0;
    for (const [index, answer] of MATSUI_ANSWERS.entries()) {
      await speakByText(page, answer);
      await expect(page.getByText("🌸").first()).toBeVisible();
      const now = await hearts(page);
      expect(now).toBeGreaterThan(before);
      before = now;
      if (index + 2 <= MATSUI_ANSWERS.length) await waitForAsk(page, index + 2);
    }

    // 完走で とっておきの話が 開く（教材の threshold は 4）
    await expect(page.getByLabel("とっておきの はなし")).toBeVisible();
    expect(await hearts(page)).toBeGreaterThanOrEqual(4);
    await shot(page, "10-meeting-matsui-reward");

    /* こちらの ミーティングも、おえるのは 学習者が 押して 決める */
    const cert = page.getByRole("dialog", { name: "しゅうりょうしょうの ポップアップ" });
    if (await cert.isVisible()) await cert.getByRole("button").click();
    await page.getByRole("button", { name: "ミーティングを おわる" }).click();
    await expect(cert).toBeVisible();
    await cert.getByRole("button").click();
  });

  await test.step("8. ステージを おえる", async () => {
    const clear = page.getByRole("dialog", { name: "ステージ クリア" });
    await expect(clear).toBeVisible();
    await shot(page, "11-stage-clear");
    await clear.getByRole("link", { name: "ステージに もどる" }).click();

    await expect(page.getByText("6つ の うち 6つ おわりました")).toBeVisible();
    await expect(page.getByText("100%")).toBeVisible();
    await shot(page, "12-stage-top-done");
  });
});

/**
 * ページを さいごまで 読む。
 *
 * 「おわった」は 末尾の しるしが 見えた ことで 決まる（article-view.tsx の
 * IntersectionObserver）。だから スクロールを 本当に 起こして、枠の
 * 「つぎは …」が 出るまで 待つ——出た＝おわったことが 進捗に 書けた、である。
 */
async function readToEnd(page: Page): Promise<void> {
  await page.getByText("さいごまで よんだね").scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 2000);
  await expect(page.getByRole("link", { name: "つぎは" })).toBeVisible();
}
