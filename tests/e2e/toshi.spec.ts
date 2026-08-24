import { expect, test, type Page } from "@playwright/test";
import {
  affinity,
  answerTalk,
  placeWordsIn,
  submitAnswers,
  writeIn,
  writtenText,
  HOUKOKU_TOTAL,
  JIBUN_TOTAL,
  JUNBI_TOTAL,
  waitForAsk,
  KAISHA_ITEMS,
  joinCall,
  leaveCall,
  openedCards,
  progressText,
  readOn,
  shot,
  skipAsk,
  speakByText,
} from "./helpers";

/**
 * かいしゃステージ（企業調査）の 通し — 全教材を 学習者と同じ順に あそぶ
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

/**
 * 「ちょうさシート」の 語群の答え（content/quizsets/kaisha_houkoku.json）。
 *
 * **もんだいの id を 添える。** 全問が 1ページに 出る ので、同じ ことばの ふだが
 * いくつもの もんだいに ある（「観光DX」は 3問に ある）。id で しぼらないと
 * 別の もんだいを 触って しまう。
 */
const HOUKOKU_WORDS: readonly (readonly [string, readonly string[]])[] = [
  ["q3", ["大阪", "東京"]],
  ["q4", ["2023年10月"]],
  ["q5", ["ベトナム"]],
  ["q6", ["NMClaw", "観光DX", "Verify", "セキュリティドローン", "NEXTMAKE Internship Lab"]],
  ["q7", ["NMClaw"]],
  ["q8", ["受託開発"]],
  ["q9", ["新しい 技術", "グループの 会社", "世界の 人と 学ぶ"]],
  ["q13", ["WEB制作"]],
  ["q14", ["システム開発"]],
  ["q15", ["技術"]],
  ["q20", ["日本語", "IT"]],
  ["q21", ["N3"]],
  ["q22", ["日本語の 勉強", "ITの 勉強", "しごとの 紹介"]],
  ["q23", ["2024年9月"]],
];

/**
 * 自由入力の 12問。**どれも 代表解そのままではない**書き方にしてある
 * ——ひらがな・カタカナ・小文字・「です」つき・文で答える が 救済されている証拠を、
 * 通しの中に そのまま 残すため（判定は src/lib/text/normalize.ts）。
 */
const HOUKOKU_FREE_INPUT: readonly (readonly [string, string])[] = [
  ["q1", "2018ねんです"], // ひらがな＋です（accept「2018」に 部分一致）
  ["q2", "まついさん"], // ひらがな＋さん（accept「まつい」に 部分一致）
  ["q10", "コンティニューです"], // カタカナ＋です
  ["q11", "べとなむ"], // ひらがな（代表解は「ベトナム」）
  ["q12", "かんこうDX"], // ひらがな まじり
  ["q16", "どうぐ"], // やさしい 日本語の 言い方（「手段」でも 通る）
  ["q17", "ちょうせん"], // ひらがな
  ["q18", "ひとと ひとの しんらいです"], // 文＋です（accept「しんらい」に 部分一致）
  ["q19", "カンボジア"], // そのまま
  ["q24", "internship lab"], // 小文字
  ["q25", "リーダーです"], // です つき
  ["q26", "にほんご"], // ひらがな（代表解は「日本語」）
];

/** ヘンディさんに 話す こたえ（型文を なぞった、学習者が 書きそうな文）。 */
const HENDY_ANSWERS = [
  "はい。ほうこくします。", // 定型句
  "2018年に できました。", // 1語（数）
  "NMClaw と 観光DXです。", // 2つ
  "新しい 技術と、グループの 会社と、世界の 人と 学ぶ ことです。", // 3つ
  "CONTINUE LLC. です。", // 会社の 名前
  "ベトナムに あります。", // 1語（国）
  "日本語と ITを 学びます。", // 2つ
  "日本語の 勉強と、ITの 勉強と、しごとの 紹介です。", // 3つ
  "NEXTMAKE Internship Lab です。", // サービスの 名前
  "日本人の リーダーと いっしょに します。", // 語句
  // さいごの「技術は 何？」は「まだ 言えない（つぎへ）」で 通る
  //（答えられなくても 詰まらない 証拠）
];

/**
 * 松井社長に 話す「おもしろい」3つ（対話ゲーム・願い #177）。
 * 数は 教材の `talkGame.findCount`（content/meetings/kaisha_matsui.json）と そろえる。
 *
 * 中身は ぜんぶ ちがう ものに する——同じ 話を くり返すと 札は 開かない
 *（`alreadyFound`）ので、見つけきれずに 深掘りが 続く。
 */
const MATSUI_FINDINGS = [
  "カンボジアの プログラムが おもしろかったです。",
  "NMClaw は、はなすだけで まとまるから すごいです。",
  "かんこうDX で、まちを あるいて みたいです。",
];

/** そのあと、こんどは 学習者が 社長に 聞く。 */
const MATSUI_QUESTIONS = [
  "社長は、どうして この 会社を 作りましたか。",
  "これから、どんな ことを して みたいですか。",
  "しごとで、いちばん たのしい ことは なんですか。",
  "わたしたちに、なにを のぞんで いますか。",
];

test("かいしゃステージを 通しで あそべる（端末に 何も 置かずに 始める）", async ({ page }) => {
  await test.step("1. ステージのトップに 教材が 順に ならぶ", async () => {
    await page.goto("/kaisha");
    // 見出しは 漢字＋ふりがな。ルビが 合成されるので 名前で 引く（会社かいしゃを 知しる）。
    await expect(page.getByRole("heading", { name: /会社.*知/ })).toBeVisible();

    const list = page.locator("ol > li > a");
    await expect(list).toHaveCount(KAISHA_ITEMS.length);
    for (const [index, item] of KAISHA_ITEMS.entries()) {
      await expect(list.nth(index)).toContainText(item.kind);
    }
    await expect(page.getByText(progressText(0))).toBeVisible();
    await shot(page, "01-stage-top");

    await list.first().click();
  });

  await test.step("2. STEP 1 ページ「会社の リサーチ方法を 学ぼう」— 🔊 と ことばチップ", async () => {
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
    await frameNext(page).click();
  });

  await test.step("3. STEP 2 ページ「調査シートを うめよう」— 外のサイトへの カード", async () => {
    await expect(page).toHaveURL(/article-kaisha_nextmake_shirabe$/);

    /*
     * 本物の サイトへの リンクは **1本だけ 残して「上級」に 降格**した
     *（リニューアルで N4 学習者には 読みにくく なった ため。調べる 先は 学習用サイト）。
     */
    const external = page.locator('a[target="_blank"]');
    await expect(external).toHaveCount(1);
    await expect(external).toHaveAttribute("href", "https://nextmake.site/");
    await expect(external).toHaveAttribute("rel", /noopener/);
    await expect(external).toContainText("そとの サイト");

    /*
     * 調べる 先（学習用サイト）へは、**本文の 中の カード**から 行ける。
     * 名前で さがすと 目次の 見出しリンクと 紛れる ので、行き先で さがす。
     */
    const toSite = page.locator('article a[href="/link/nextmake_gakushu_site"]');
    await expect(toSite).toBeVisible();
    await shot(page, "04-article-extlink");

    await readToEnd(page);

    /*
     * カードを **実際に 押して** みる。ここは 2026-08-23 まで 404 だった
     *（`/link/<id>` の ルートが 無いのに `contentHref` が それを 返していた）。
     * 押せば ステージの 中の 本来のURLへ 送り返される。
     */
    await toSite.click();
    await expect(page).toHaveURL(/\/kaisha\/link$/);
  });

  await test.step("4. リンク「学習用サイト」— 開いて、読んで、おわる", async () => {
    // 入れ物の カードに、切りかえの 案内が 出て いる（気づかないと 使われない）
    await expect(page.getByText(/やさしい 日本語/)).toBeVisible();
    await shot(page, "04b-link-card");

    // 学習者と 同じ 道: ひらく → 中を 読む → おわりました
    await page
      .getByRole("button", { name: /ひらく/ })
      .first()
      .click();
    const site = page.frameLocator("iframe");
    /*
     * 学習用サイトが ほんとうに 出る（切りかえの ボタンが 2つ）。
     * ここが 白い 枠に なると、学習者は 調べる もの そのものに たどり着けない。
     */
    await expect(site.getByRole("button", { name: /やさしい/ })).toBeVisible();
    await expect(site.getByRole("button", { name: /ふりがな/ })).toBeVisible();
    await shot(page, "04c-link-site");

    /*
     * **辞典に ある 語は、その場で 意味が 出る**（2026-08-23 の 指定）。
     * 出しかたは アプリ本体（`src/components/glossary-text.tsx`）と そろえて あり、
     * ここが 死ぬと 学習者は むずかしい 語の たびに 辞典の ページへ 往復させられる。
     *
     * 押して 確かめるのは タッチの 道（e2e は 指の 端末では ない ので、
     * ホバーの 道は `hover()` で 見る）。1回目の タップで 開く ことが 大事——
     * focus が 先に 開けて click が 閉じる、という 事故が 起きやすい ところ。
     */
    const mark = site.locator(".gloss-mark").first();
    await expect(mark).toBeVisible();
    await expect(site.locator(".gloss-tip")).toHaveCount(0);
    // 貼りついた 帯の 下に 隠れた ままだと ホバーが 帯に 当たる。まん中へ 寄せてから 触る
    await mark.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
    await mark.hover();
    await expect(site.locator(".gloss-tip")).toHaveCount(1);
    await shot(page, "04d-link-gloss");

    await page.getByRole("button", { name: "おわりました", exact: true }).click();
    await expect(page.getByText("✅ おわりました").first()).toBeVisible();

    // 全画面から もどす（もどさないと 枠の「つぎは」が 覆われて 押せない）
    await page.getByRole("button", { name: /もどす/ }).click();
    await frameNext(page).click();
  });

  await test.step("5. STEP 2 もんだい「調査シート」— 26問が ぜんぶ 1ページに 出る", async () => {
    await expect(page).toHaveURL(/quiz-kaisha_houkoku$/);
    await page.getByRole("button", { name: "はじめる" }).click();

    /*
     * この 教材は `answerMode: "all"`。学習用サイトと 行き来しながら 書く ので、
     * **進まずに** 上から 下まで 書ける。26問が 同時に 見えて いる ことを 先に 見る。
     */
    /*
     * **完全一致で さがす。** 「1/26」は 「21/26」の 中にも 入って いる ので、
     * 部分一致だと 候補が 2つに なって 落ちる（問数を 増やした 日に 出た）。
     */
    await expect(page.getByText(`1/${HOUKOKU_TOTAL}`, { exact: true })).toBeVisible();
    await expect(
      page.getByText(`${HOUKOKU_TOTAL}/${HOUKOKU_TOTAL}`, { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "つぎ →" })).toHaveCount(0);

    for (const [questionId, words] of HOUKOKU_WORDS) {
      await placeWordsIn(page, questionId, words);
    }
    await shot(page, "05-quiz-wordbank");

    for (const [questionId, written] of HOUKOKU_FREE_INPUT) {
      await writeIn(page, questionId, written);
    }
    await expect(page.getByText(writtenText(HOUKOKU_TOTAL))).toBeVisible();
    await submitAnswers(page);

    await expect(page.getByText(`${HOUKOKU_TOTAL} / ${HOUKOKU_TOTAL} もん`)).toBeVisible();
    // 自分の書き方のまま通ったことを 画面が 見せる（救済が 生きている証拠）
    for (const [, written] of HOUKOKU_FREE_INPUT) {
      await expect(page.getByText(`あなたの こたえ: ${written}`)).toBeVisible();
    }
    await shot(page, "06-quiz-houkoku-result");
    await frameNext(page).click();
  });

  await test.step("6. STEP 3 ミーティング「ヘンディさんに 報告しよう」— 型文を 見ながら 文字で 話す", async () => {
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

    /*
     * さいごの1問（いちばん 開いた「どうして？」）は
     * 「すみません、つぎを おねがいします」と 言えば 通れる。
     *
     * 通した ぶんの カードは 開かない ことを、**通す 前に** 押さえる
     *——通した あとは 聞く ばんに 移り、板が 聞き出す ぶんに 入れかわる（discover）。
     */
    expect(await openedCards(page)).toBe(HENDY_ANSWERS.length);
    await skipAsk(page);

    /*
     * ぜんぶ 答えると **しゅうりょうしょう**が 出る（2026-08-21）。
     * ここでは まだ「ステージ クリア」は 出て いない——おわりを 書くのは
     * 聞く ばんを おえた ときに 移した（かぶりを 重なりでは なく 順番で 直した）。
     */
    const cert1 = page.getByRole("dialog", { name: "しゅうりょうしょうの ポップアップ" });
    await expect(cert1).toBeVisible();
    await cert1.getByRole("button").click();
    await expect(cert1).toHaveCount(0);

    /*
     * ばんの 変わり目の ことばは **2か所に 出る**（2026-08-21 の 指定で チャットにも
     * 積む ように した）。大きい 板と、あとから 読み返せる チャットの 記録。
     */
    await expect(page.getByText("とても よかったです").first()).toBeVisible();
    await expect(page.getByText("とても よかったです")).toHaveCount(2);
    /*
     * 話せた ことは **ポップアップ**に 移した（2026-08-21）。ラウンド1で 答えた ぶんと
     * ラウンド2で 聞き出した ぶんを 分けて 並べる。
     */
    const seeRecord = page.getByRole("button", { name: "話せた ことを 見る" });
    await expect(seeRecord).toBeVisible();
    await seeRecord.click();
    const review = page.getByRole("dialog", { name: "しゅうりょうしょうの ポップアップ" });
    await expect(review.getByLabel(/さんに 話した こと/)).toBeVisible();
    await review.getByRole("button", { name: "とじる" }).click();
    await expect(review).toHaveCount(0);
    await shot(page, "09-meeting-hendy-done");

    /*
     * **聞く ばんを おえるまで つぎへ 進めない**。おわりは 学習者が 押して 決める
     *（見つける ことが 0の 教材も あるので「ぜんぶ 見つけた」を おわりに できない）。
     */
    await leaveCall(page);
    const cert2 = page.getByRole("dialog", { name: "しゅうりょうしょうの ポップアップ" });
    await expect(cert2).toBeVisible();
    await cert2.getByRole("button").click();

    await frameNext(page).click();
  });

  await test.step("7. STEP 4 もんだい「会社と 自分の 関係を 考えよう」— 正解の 無い 問い", async () => {
    /*
     * ここから 先は **自分の 考え**を 作る 段（設計 md の STEP 4）。
     * 正解が 無いので、書けば 点が 入る。ここで「ちがいます」が 出たら 設計が 壊れて いる
     *（規律1: その 学習者だけの 正しい こたえを まちがいに しない）。
     */
    await expect(page).toHaveURL(/quiz-kaisha_jibun$/);
    await page.getByRole("button", { name: "はじめる" }).click();

    const boxes = page.getByRole("textbox", { name: "じゆうに 書く" });
    await expect(boxes).toHaveCount(JIBUN_TOTAL);

    /* 学習者が 書きそうな 文。数は 教材に そろえる（問いが 増えたら ここも 増える）。 */
    const written = [
      "私が 今 がんばって いる ことは 日本語です。",
      "観光DX に 興味を もちました。",
      "新しい 技術だから、興味を もちました。",
      "今 Python を 勉強して います。AIの 仕事で 使えそうです。",
      "私は AIを 使う 仕事を して みたいです。",
      "私は 日本語で 仕事が できる エンジニアに なりたいです。",
    ];
    expect(written).toHaveLength(JIBUN_TOTAL);
    for (const [at, text] of written.entries()) await boxes.nth(at).fill(text);

    await expect(page.getByText(`こたえた ${JIBUN_TOTAL} / ${JIBUN_TOTAL}`)).toBeVisible();
    await submitAnswers(page);

    await expect(page.getByText(/^正解/)).toHaveCount(0);
    await shot(page, "07-jibun-result");

    await frameNext(page).click();
  });

  await test.step("8. STEP 5 もんだい「松井社長と 話す 準備を しよう」— 9つの 準備", async () => {
    /*
     * 松井社長と 話す 前に、**自分の ことばを 作って おく** 段（設計 md の STEP 5）。
     * ここで 書いた ものが、そのまま 対話の 材料に なる。
     */
    await expect(page).toHaveURL(/quiz-kaisha_omoshiroi$/);
    await page.getByRole("button", { name: "はじめる" }).click();

    const boxes = page.getByRole("textbox", { name: "じゆうに 書く" });
    await expect(boxes).toHaveCount(JUNBI_TOTAL);

    const written = [
      "ネクストメイクは、お客さまの ホームページや アプリを 作る 会社です。",
      "日本語と ITを 勉強して、日本の 会社で はたらく プログラムです。",
      "Internship Lab で、日本人の リーダーと いっしょに 仕事を します。",
      "今 Python を 勉強して います。AIの 仕事で 使えそうです。",
      "観光DX に 興味を もちました。まちを あるくのが すきだからです。",
      "カンボジアの プログラムが 良いと 思いました。わたしの 国には まだ ないので、見て みたいからです。",
      "日本語で 報告できる エンジニアに なりたいです。",
      "社長に 聞きたい ことは、どんな 人と はたらきたいかです。",
      "日本語を がんばります。まいにち 30分、声に 出して 読みます。",
    ];
    expect(written).toHaveLength(JUNBI_TOTAL);
    for (const [at, text] of written.entries()) await boxes.nth(at).fill(text);

    await expect(page.getByText(`こたえた ${JUNBI_TOTAL} / ${JUNBI_TOTAL}`)).toBeVisible();
    await submitAnswers(page);

    /*
     * 正解の 無い 問いなので「正解」の 見出しは 1つも 出ない。
     * 画面の 漢字には ルビが 合成される（正解 → 正解せいかい）ので、
     * **完全一致では 当たらない**。前方一致で 見る。
     */
    await expect(page.getByText(/^正解/)).toHaveCount(0);
    /*
     * 書いた ものは 消えずに 残る。**かなだけの ひとかたまり**で さがす——
     * 画面の 漢字には ルビが 合成される ので、書いた 文の まま 引くと 当たらない
     *（「通訳」→「通訳つうやく」）。中身が そのままかは 単体テストが 見て いる。
     */
    await expect(page.getByText(/ないので、/)).toBeVisible();
    await shot(page, "08-junbi-result");

    await frameNext(page).click();
  });

  await test.step("9. STEP 6 対話ゲーム「松井社長と LiveAIで 話そう」— こうかんど 100%", async () => {
    await expect(page).toHaveURL(/meeting-kaisha_matsui$/);
    /*
     * ここは ヘンディさんの ミーティングとは **別の 画面**（願い #177）。
     * Zoom の 入室では なく、社長室の 舞台に 入る「はじめる」から 始まる。
     */
    await page.getByRole("button", { name: "はじめる ▶" }).click();
    await readOn(page);
    expect(await affinity(page)).toBe(0);

    // ①「おもしろい」を 話す。好感度は 1回も 下がらない（P8）
    let before = 0;
    for (const [at, finding] of MATSUI_FINDINGS.entries()) {
      /* 1回目だけ、観点の 内訳が 出た ところを 写真に 残す（証拠）。 */
      if (at === 0) {
        await page.getByLabel("文字で 答える").fill(finding);
        await page.getByRole("button", { name: "おくる" }).click();
        await expect(page.getByText(/^こうかんど \+\d+%$/)).toBeVisible({ timeout: 45_000 });
        await page.waitForTimeout(700);
        await shot(page, "10-meeting-matsui-feedback");
        await page.getByRole("button", { name: "つぎへ ▶" }).click();
      } else if (at === MATSUI_FINDINGS.length - 1) {
        /*
         * さいご＝**ばんが 変わる ターン**。内訳（話す ばんの 観点）と
         * 底上げの 行が 食い違って いない ことを、写真にも 残す
         *（2026-08-24 の 検収指摘 #1 の 再発よけ）。
         */
        await page.getByLabel("文字で 答える").fill(finding);
        await page.getByRole("button", { name: "おくる" }).click();
        await expect(page.getByText(/^こうかんど \+\d+%$/)).toBeVisible({ timeout: 45_000 });
        await expect(page.locator('[data-kanten="concrete"]')).toBeVisible();
        await expect(page.locator('[data-kanten="question"]')).toHaveCount(0);
        await page.waitForTimeout(700);
        await shot(page, "10-meeting-matsui-switch");
        await page.getByRole("button", { name: "つぎへ ▶" }).click();
      } else {
        await answerTalk(page, finding);
      }
      const now = await affinity(page);
      expect(now).toBeGreaterThanOrEqual(before);
      before = now;
      await readOn(page);
    }

    // ②見つけきったら「聞く ばん」が 開く（入口は 60%）
    await expect(page.getByText("あなたが きく ばんです")).toBeVisible();
    expect(await affinity(page)).toBeGreaterThanOrEqual(60);
    /*
     * 板は ふわりと 出る（motion）。出きる 前に 撮ると **証拠の 写真が 半透明**に なり、
     * 読めるか どうかの 判断が できない。動きが 落ち着くまで 待ってから 撮る。
     */
    await page.waitForTimeout(700);
    await shot(page, "10-meeting-matsui-listen");

    // ③こんどは 学習者が 聞く。満タンに なったら クリア
    for (const question of MATSUI_QUESTIONS) {
      if (await page.getByText("🏆 クリア！").isVisible()) break;
      await answerTalk(page, question);
      await readOn(page);
    }

    await expect(page.getByText("🏆 クリア！")).toBeVisible();
    expect(await affinity(page)).toBe(100);
    await page.waitForTimeout(700);
    await shot(page, "10-meeting-matsui-reward");
    await page.getByRole("button", { name: "おわる" }).click();
  });

  await test.step("10. ステージを おえる", async () => {
    const clear = page.getByRole("dialog", { name: "ステージ クリア" });
    await expect(clear).toBeVisible();
    await shot(page, "11-stage-clear");
    await clear.getByRole("link", { name: "ステージに もどる" }).click();

    await expect(page.getByText(progressText(KAISHA_ITEMS.length))).toBeVisible();
    /*
     * 進みぐあいの「100%」だけを 見る。松井社長の 説明文にも「100%」が 出る ように
     * なった（対話ゲーム）ので、部分一致だと 2つに 当たる。
     */
    await expect(page.getByText("100%", { exact: true })).toBeVisible();
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
  await expect(frameNext(page)).toBeVisible();
}

/**
 * 枠（ContentFrame）の「つぎは …」。
 *
 * **名前だけで さがさない**——記事の 中にも「つぎは これ — リンク …」という
 * 案内カード（articleBlock の `link`）が 出る ことが あり、名前で 引くと 2つ 当たる。
 * 枠の ほうは ゲームボタン（`btn-game`）なので、そこで 分ける。
 */
function frameNext(page: Page) {
  return page.locator("a.btn-game").filter({ hasText: "つぎは" });
}
