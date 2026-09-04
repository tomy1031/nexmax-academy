import { expect, test, type Page } from "@playwright/test";
import {
  affinity,
  answerTalk,
  writeListIn,
  submitAnswers,
  writeIn,
  writtenText,
  HOUKOKU_TOTAL,
  JUNBI_TOTAL,
  pickChoiceIn,
  pickMultiIn,
  waitForAsk,
  KAISHA,
  KAISHA_ITEMS,
  SHUGYO_TOTAL,
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
/**
 * 5つの サービスは **入力**（語群では ない・2026-08-27 の 指定）。
 * サイトの 並びと わざと ちがう 順で 打つ——採点が 順を 見ない ことの 証拠に する。
 */
const HOUKOKU_LIST: readonly (readonly [string, readonly string[]])[] = [
  ["q5", ["Verify", "NEXTMAKE Internship Lab", "NMClaw", "セキュリティドローン", "観光DX"]],
];

/**
 * 自由入力の 6問。**どれも 代表解そのままではない**書き方にしてある
 * ——ひらがな・カタカナ・小文字・「です」つき・文で答える が 救済されている証拠を、
 * 通しの中に そのまま 残すため（判定は src/lib/text/normalize.ts）。
 */
const HOUKOKU_FREE_INPUT: readonly (readonly [string, string])[] = [
  ["q1", "ネクストメイク"], // カタカナ（代表解は「株式会社 NEXT MAKE」）
  ["q2", "まついさん"], // ひらがな＋さん（accept「まつい」に 部分一致）
  ["q6", "エヌエムクロー"], // カタカナ（代表解は「NMClaw」）
  ["q7", "コンティニューです"], // カタカナ＋です
  ["q8", "かわむら"], // ひらがな（名字だけ）
  ["q18", "ひとと ひとの しんらいです"], // 文＋です（accept「しんらい」に 部分一致）
  ["q19", "どうぐ"], // やさしい 日本語の 言い方（「手段」でも 通る）
];

/**
 * 4択の 16問。**もんだいの id と 正解の 番号**の 組で 持つ。
 *
 * 文字で えらばないのは、ルビが 合成される ので 掴めない ため（`choiceButtons` の 覚書）。
 * 番号を ここに 書き写して いるのは、**教材の 並びが 変わったら テストも 落ちる**
 * ように する ため——落ちれば 人が 見に 行ける。
 *
 * 並びは **`id` を たねに した 決まった 順**に 入れかえて ある（2026-08-28 の 許可）。
 * 配布資料の HTML は 16問中 15問で 正解が いちばん 上に あり、読まずに 上を 押すだけで
 * 15/16 に なって いた。教材を 直せば ここも 落ちる——落ちれば 人が 見に 行ける。
 */
const HOUKOKU_CHOICES: readonly (readonly [string, number])[] = [
  ["q3", 0],
  ["q4", 3],
  ["q9", 2],
  ["q10", 2],
  ["q11", 3],
  ["q12", 3],
  ["q13", 3],
  ["q14", 2],
  ["q15", 0],
  ["q16", 3],
  ["q17", 0],
  ["q20", 1],
  ["q21", 0],
  ["q22", 1],
  ["q23", 3],
  ["q24", 3],
];

/**
 * 複数選択の 1問（カンボジアの 人の いい ところ）。正解は **4つ ぜんぶ**。
 *
 * 選択肢が 5つ（うち 4つが 正解）から **4つ ぜんぶ 正解**に なった（#244）ので、
 * 押す 番号も 詰める。ここが `[0, 1, 2, 4]` の まま だった ため、5つ目を 待ち続けて
 * 通し検証が 90秒で 落ちて いた。
 */
const HOUKOKU_MULTI: readonly (readonly [string, readonly number[]])[] = [["q25", [0, 1, 2, 3]]];

/**
 * ヘンディさんに 話す こたえ（型文を なぞった、学習者が 書きそうな文）。
 *
 * **並びは 調査シートの POINT と 同じ**（2026-08-28）。学習者は
 * 「📋 自分の こたえ」を 上から なぞって 報告できる。
 * さいごの1問（日本人の だれと）は わざと 残す——「まだ 言えない」で 通れる ことを 見る。
 */
const HENDY_ANSWERS = [
  "2018年に できました。", // POINT 1 いつ できた（数だけ）
  "まついさんです。", // POINT 1 社長の 名前（ひらがな＋さんでも 通る）
  "NMClaw と 観光DXです。", // POINT 2 サービスを 2つ
  "CONTINUE LLC. です。", // POINT 3 グループの 会社の 名前
  "ベトナムに あります。", // POINT 3 オフィスの 国
  "三好市の ために、まちを めぐる しくみを 作りました。", // POINT 4 実績を 1つ
  "技術は 道具です。", // POINT 5 大切に する 考えかた
  "日本語と ITを 学びます。", // POINT 6 何と 何を 学ぶ
  "しごとの 紹介を して くれます。", // POINT 6 サポート
  "NEXTMAKE Internship Lab です。", // POINT 6 そのあとの サービス
  // さいごの「日本人の だれと？」は「まだ 言えない（つぎへ）」で 通る
  //（答えられなくても 詰まらない 証拠）
];

/**
 * 松井社長に 話す「おもしろい」3つ（対話ゲーム・願い #177）。
 * 数は 教材の `talkGame.findCount`（content/meetings/kaisha_matsui.json）と そろえる。
 *
 * 中身は ぜんぶ ちがう ものに する——同じ 話を くり返すと 札は 開かない
 *（`alreadyFound`）ので、見つけきれずに 深掘りが 続く。
 */
/**
 * 社長の 出だしの しつもん（`talkGame.openers`）に 1つずつ 答える。
 *
 * **本数を そろえる**（2026-08-31）。しつもんを 使いきった ところで 聞く ばんへ 移るので、
 * ここが 足りないと 聞く ばんに とどかない。並びは 準備フォームの ①〜⑤ と 同じ。
 */
const MATSUI_FINDINGS = [
  "カンボジアの プログラムが おもしろかったです。",
  "わたしは にほんごが とくいだから、ほうこくに つかいたいです。",
  "かんこうDX で、まちを あるいて みたいです。",
  "カンボジアの がくせいは、あたらしい ことを はやく おぼえると おもいます。",
  "にほんへ いくまでに、にほんごを がんばりたいです。はなしたいからです。",
];

/** そのあと、こんどは 学習者が 社長に 聞く。 */
const MATSUI_QUESTIONS = [
  "社長は、どうして この 会社を 作りましたか。",
  "これから、どんな ことを して みたいですか。",
  "しごとで、いちばん たのしい ことは なんですか。",
  "わたしたちに、なにを のぞんで いますか。",
];

/**
 * STEP 6 の リスニングで「聞こえた」ことに する ことば。
 *
 * 学習者が やる ことと 同じ——**打った ことばが 原稿の 上で 光る**。
 * キーワード（6つ）だけでは 10% しか ひらかないので、カタカナや ふつうの 語も
 * まぜて 30%の 関所を 越える。**原稿に 出て こない 語を 混ぜない こと**
 *（混ぜると ミスが 増えるだけで、関所は 越えられない）。
 */
const HEARD = [
  "SES",
  "受託開発",
  "自社開発",
  "会社",
  "仕事",
  "サービス",
  "お客様",
  "チーム",
  "エンジニア",
  "アプリ",
  "場所",
  "働きます",
  "喜んで",
  "自分",
  "タイプ",
  "アイデア",
  "NMClaw",
  "観光DX",
];

/**
 * 「就業形態の かくにん」の 4択（`content/quizsets/kaisha_shugyo_keitai_check.json`）。
 *
 * 文字では なく **番号**で えらぶ（ルビが 合成されるので 文字では 掴めない
 *——`HOUKOKU_CHOICES` の 覚書と 同じ）。教材の 並びを 変えたら ここも 落ちる。
 */
const SHUGYO_CHOICES: readonly (readonly [string, number])[] = [
  ["q_ses", 0],
  ["q_jutaku", 1],
  ["q_jisha", 1],
  ["q_ii_ses", 0],
  ["q_ii_jutaku", 1],
  ["q_ii_jisha", 2],
  ["q_zenbu", 3],
  // さいごは 学習者じしんの こたえ（正解も 不正解も ない）
  ["q_yaritai", 0],
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

  await test.step("2. STEP 1 ページ「会社の 調べかたを 学ぼう」— 🔊 と ことばチップ", async () => {
    await expect(page).toHaveURL(new RegExp(`${KAISHA.article1.path}$`));

    // 読み上げは 本文にも かじょうがきにも 付いている（音に 逃げる 道を ふさがない）
    const speakers = await page.getByRole("button", { name: "よみあげる" }).count();
    expect(speakers).toBeGreaterThan(3);

    // ことばチップ: タップすると 読み・英語・意味 が出る
    await page.getByRole("button", { name: "会社概要" }).first().click();
    await expect(page.getByText("かいしゃがいよう — Company overview")).toBeVisible();
    /*
     * 撮るのは **閉じる 前**。`shot` は fullPage なので ページが 動き、
     * マウスが チップから 外れて 吹き出しが 自分で 閉じる（さし絵が 増えて
     * ページが 長く なった 2026-08-25 に 出た）。だから 閉じるのは
     * マウスに たよらない Escape で 行う。
     */
    await shot(page, "02-article-vocab");
    await page.keyboard.press("Escape");
    await expect(page.getByText("かいしゃがいよう — Company overview")).toHaveCount(0);

    await readToEnd(page);
    await frameNext(page).click();
  });

  await test.step("3. リンク「学習用サイト」— 開いて、読んで、おわる", async () => {
    await expect(page).toHaveURL(/\/kaisha\/link$/);
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

  await test.step("4. STEP 2 もんだい「調査シート」— 全問が 1ページに 出る", async () => {
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

    /*
     * **POINT の 見出しが 章ごとに 1回 出る**（2026-08-28 に MISSION から 改名。
     * 会社の MISSION と ことばが かぶって いた）。25問が 見出しなしで 並ぶと、
     * いま どの 話を 調べて いるのかが 画面から 消える。
     */
    await expect(page.getByRole("heading", { name: /POINT 1/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /POINT 6/ })).toBeVisible();

    /*
     * **ぜんぶ うめるまで「こたえを 出す」は 出ない**（`requireAll`）。
     * のこりが ある あいだは 理由と 次の 一手だけが 出る。
     */
    await expect(page.getByRole("button", { name: /こたえを 出/ })).toHaveCount(0);
    // ルビが 語の 中に 入る（「書かくと」）ので、ふりがなの 入らない ところで さがす
    await expect(page.getByText(/もん です/)).toBeVisible();

    for (const [questionId, values] of HOUKOKU_LIST) {
      await writeListIn(page, questionId, values);
    }
    await shot(page, "05-quiz-list");

    for (const [questionId, written] of HOUKOKU_FREE_INPUT) {
      await writeIn(page, questionId, written);
    }
    for (const [questionId, at] of HOUKOKU_CHOICES) {
      await pickChoiceIn(page, questionId, at);
    }
    for (const [questionId, indexes] of HOUKOKU_MULTI) {
      await pickMultiIn(page, questionId, indexes);
    }
    await expect(page.getByText(writtenText(HOUKOKU_TOTAL))).toBeVisible();
    // ぜんぶ うまったので、ここで はじめて 出す ボタンが 出る
    await expect(page.getByRole("button", { name: /こたえを 出/ })).toBeVisible();
    await submitAnswers(page);

    await expect(page.getByText(`${HOUKOKU_TOTAL} / ${HOUKOKU_TOTAL} もん`)).toBeVisible();
    /*
     * 自分の 書き方の まま 通った ことを 画面が 見せる（救済が 生きて いる 証拠）。
     * けっかの 行では **合って いた 問いの「口に 出す ことば」＝自分の こたえ**なので、
     * その ことばが そのまま 出る（2026-08-25 の 作り直し）。
     */
    for (const [, written] of HOUKOKU_FREE_INPUT) {
      /*
       * 文字で さがすと **ルビの `<rt>`** に 当たる ことが ある（「にほんご」は
       * 「日本語」の 読みでも ある）。`<rt>` は ルビを 消して いると 隠れて いる ので、
       * 行（listitem）ごと 引く。
       */
      await expect(page.getByRole("listitem").filter({ hasText: written }).first()).toBeVisible();
    }
    // できた しるしが 全行に 付く
    await expect(page.getByText("✓ できた")).toHaveCount(HOUKOKU_TOTAL);
    await shot(page, "06-quiz-houkoku-result");
    await frameNext(page).click();
  });

  await test.step("5. STEP 3 ミーティング「ヘンディさんに 報告しよう」— 型文を 見ながら 文字で 話す", async () => {
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
     * **さっき 調べた ことを 見ながら 話す**（2026-08-27 の 指定）。
     * 調査シートの こたえが、会話の 最中に ひきだしで 開く——25問を 覚えて
     * 会話に 入るか、別の タブを 行ったり 来たり する しか なかった ところ。
     * 絞りは「ほうこくの しるし」だけ（`notes[].reportOnly`）。
     */
    await page.getByRole("button", { name: /こたえを/ }).click();
    const notebook = page.getByRole("dialog", { name: "自分の こたえ" });
    await expect(notebook).toBeVisible();
    /*
     * 出るのは **自分が 書いた こたえ**（かなだけの ひとかたまりで さがす）。
     * 「コンティニューです」は q9（ほうこくの しるしが ある 問い）に 書いた もの。
     * しるしの 無い 問いは 絞りで 落ちる ので、ここに 出て こない。
     */
    await expect(notebook.getByText("コンティニューです")).toBeVisible();
    await shot(page, "08b-meeting-notebook");
    await notebook.getByRole("button", { name: /閉/ }).click();
    await expect(notebook).toHaveCount(0);

    /*
     * 型文は **ポップアップ**（2026-08-20 の 指定）。出しっぱなしを やめた ので、
     * 「押すと 出る／読んだら 閉じる」を 見る。
     */
    await page.getByRole("button", { name: "ヒントを 見る" }).click();
    const hint = page.getByRole("dialog", { name: "ヒントの ポップアップ" });
    // ルビが 語の 中に 入る（「2018年ねんに」）ので、ふりがなの 入らない ところで さがす
    await expect(hint.getByText(/できました/)).toBeVisible();
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
     * さいごの1問（日本人の だれと 仕事を するか）は
     * 「すみません、つぎを おねがいします」と 言えば 通れる。
     *
     * 通した ぶんの カードは 開かない ことを、**通す 前に** 押さえる
     *——通した あとは 聞く ばんに 移り、板が 聞き出す ぶんに 入れかわる（discover）。
     */
    expect(await openedCards(page)).toBe(HENDY_ANSWERS.length);
    await skipAsk(page);

    /*
     * ぜんぶ 答えると **しゅうりょうしょう**が 出て、閉じると そこで おわり。
     * この 教材には **聞く ばんが 無い**（`discover` が 空）——2026-08-25 の 指定
     *「会社を知るについては ヘンディへの 質問は 不要。次への ロックを 解除してほしい」。
     */
    await expect(page.getByRole("button", { name: /さんに しつもん/ })).toHaveCount(0);
    const cert1 = page.getByRole("dialog", { name: "しゅうりょうしょうの ポップアップ" });
    await expect(cert1).toBeVisible();
    await cert1.getByRole("button").click();
    await expect(cert1).toHaveCount(0);

    /*
     * おわりの ことばは **2か所に 出る**（2026-08-21 の 指定で チャットにも 積む）。
     * 大きい 板と、あとから 読み返せる チャットの 記録。
     */
    await expect(page.getByText("とても よかったです")).toHaveCount(2);
    // 話せた ことは ポップアップで 見返せる
    const seeRecord = page.getByRole("button", { name: "話せた ことを 見る" });
    await expect(seeRecord).toBeVisible();
    await shot(page, "09-meeting-hendy-done");

    /*
     * **ここで つぎへ 進める**。前は 聞く ばんを おえるまで 修了が 書かれず、
     * ぜんぶ 答えても 先へ 行けなかった（2026-08-25 の 指摘）。
     */
    await leaveCall(page);
    /*
     * たいしつの あとに しゅうりょうしょうが もう一度 出る ことが ある
     *（見返しの ぶん）。出て いたら 閉じてから つぎへ。
     */
    const cert2 = page.getByRole("dialog", { name: "しゅうりょうしょうの ポップアップ" });
    if (await cert2.isVisible().catch(() => false)) {
      await cert2.getByRole("button").first().click();
      await expect(cert2).toHaveCount(0);
    }
    await frameNext(page).click();
  });

  await test.step("6. STEP 4 ページ「松井社長と 話す 準備を しよう」— 前と 後を くらべる", async () => {
    /*
     * ここから 先は **自分の 考え**を 作る 段（配布資料 03）。
     * 読みものは「ヘンディさんへの 報告と 何が ちがう？」を 2枚 並べて 見せる。
     */
    await expect(page).toHaveURL(/article-kaisha_matsui_junbi$/);
    await expect(page.getByRole("heading", { name: /報告.*ちがう/ })).toBeVisible();
    /*
     * **まだ 無い 絵の ところは 空けずに わくを 出す**（2026-08-27 の 指定）。
     * 空だと 作り忘れが 画面から 見えない。ここには 空わくが 6か所 あった。
     *
     * 2026-08-28 に **ぜんぶ 絵に した**ので 0 に する。0 で 固定して おくと、
     * 絵を 消した ときや 差しかえに 失敗した ときに ここが 落ちる——
     * 「空わくを 出す」決まりは 生きた まま、**作り忘れの 見張り**として 効き つづける。
     */
    /*
     * 2026-08-31 に 準備は 6問（社長の しつもんと 1対1）。「Japanese IT Pathway は
     * どんな プログラム？」は 同じ日に 外した ので、カードは 6枚に なった。
     * **空わくは 0**。0 で 固定して おくと、絵を 消した ときや 差しかえに
     * 失敗した ときに ここが 落ちる——「空わくを 出す」決まりは 生きた まま、
     * 作り忘れの 見張りとして 効き つづける。
     */
    await expect(page.locator('[data-slot="empty"]')).toHaveCount(0);
    /* 「これから 考える 6つの こと」の 6枚 ＋ A/B の 分かれ道 2枚。 */
    await expect(page.locator('img[src*="/img/articles/kaisha_matsui_junbi/"]')).toHaveCount(8);
    await shot(page, "07-junbi-article");

    await readToEnd(page);
    await frameNext(page).click();
  });

  await test.step("7. STEP 4 もんだい「松井社長に 何を 話す？」— 英語→日本語の 2欄", async () => {
    /*
     * 松井社長と 話す 前に、**自分の ことばを 作って おく**（配布資料 04）。
     * ここで 書いた ものが、そのまま 対話の 材料に なる。
     */
    await expect(page).toHaveURL(/quiz-kaisha_omoshiroi$/);
    await page.getByRole("button", { name: "はじめる" }).click();

    /*
     * 欄は **日本語の 1つだけ**（2026-08-27 の 指定で 英語の 下書き欄を 外した。
     * 英語で 考えて よい ことは 先生が 口で 言う）。
     */
    const jp = page.getByRole("textbox", { name: "じゆうに 書く" });
    await expect(jp).toHaveCount(JUNBI_TOTAL);
    await expect(page.getByRole("textbox", { name: "えいごで 下書きする" })).toHaveCount(0);

    // ぜんぶ うめるまで 出せない（`requireAll`）
    await expect(page.getByRole("button", { name: /こたえを 出/ })).toHaveCount(0);

    /*
     * **並びは 社長の しつもんの 順**（①〜⑥ が 出だしの しつもんと 1対1、
     * ⑦ は 聞く ばんの ぶん）。
     */
    const written = [
      "観光DX が いいと 思いました。まちを あるきたいからです。",
      "私は 日本語が 得意です。報告に 使いたいです。",
      "私は AIを 使う 仕事を やって みたいです。",
      "カンボジアの 学生は 新しい ことを 早く おぼえると 思います。",
      "私は 日本語を がんばりたいです。日本で はたらきたいからです。",
      "社長に 聞きたい ことは、どうして この 会社を 作りましたかです。",
    ];
    expect(written).toHaveLength(JUNBI_TOTAL);
    for (const [at, text] of written.entries()) await jp.nth(at).fill(text);
    await expect(page.getByText(`こたえた ${JUNBI_TOTAL} / ${JUNBI_TOTAL}`)).toBeVisible();
    await submitAnswers(page);

    /*
     * 正解の 無い 問いなので「正解」の 見出しは 1つも 出ない。
     * 画面の 漢字には ルビが 合成される（正解 → 正解せいかい）ので、
     * **完全一致では 当たらない**。前方一致で 見る。
     */
    await expect(page.getByText(/^正解/)).toHaveCount(0);
    /*
     * **点も ％も 出さない**（2026-08-27 の 指定「答えが ないので 答え合わせと いう
     * 形では ない」）。free だけの セットは `minLength` を 越えれば 必ず 満点に なる ので、
     * 前は ここに「5 / 5 もん せいかい 100%」と 出て いた——学習者の 考えに
     * 点が ついたように 見える。数えて よいのは「いくつ 書けたか」だけ。
     */
    await expect(page.getByText(/もん せいかい/)).toHaveCount(0);
    await expect(page.getByText("100%")).toHaveCount(0);
    // ルビが 合成される ので かなの 続きでは 引けない（「書かけました」に なる）
    await expect(page.getByText(`${JUNBI_TOTAL} / ${JUNBI_TOTAL} つ 書`)).toBeVisible();
    await expect(page.getByRole("button", { name: "書き直す" })).toBeVisible();
    /*
     * 書いた ものは 消えずに 残る。**かなだけの ひとかたまり**で さがす——
     * 画面の 漢字には ルビが 合成される ので、書いた 文の まま 引くと 当たらない。
     */
    await expect(page.getByText(/あるきたいからです/)).toBeVisible();
    await shot(page, "08-junbi-result");

    await frameNext(page).click();
  });

  await test.step("8. STEP 6 対話ゲーム「松井社長と LiveAIで 話そう」— こうかんど 100%", async () => {
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
        /*
         * **内訳は その しつもんの 観点だけ**（2026-08-31 の 指定）。
         * さいごの しつもん（⑥日本に 行くまでに）の 見る ところは りゆうと 気もちなので、
         * 「会社の ことが 入って いる」は **並ばない**——その しつもんが 聞いて いない
         * ことで 点が 動かない、という 決まりが ここに 出る。
         * 「しつもんの 形」は 話す ばんには 出さない（やって いない ことを 責めない）。
         */
        await expect(page.locator('[data-kanten="reason"]')).toBeVisible();
        await expect(page.locator('[data-kanten="feeling"]')).toBeVisible();
        await expect(page.locator('[data-kanten="concrete"]')).toHaveCount(0);
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

  await test.step("9. STEP 6 リスニング「就業形態」— 資料より 先に 聞く", async () => {
    /*
     * **スライドより 先**（2026-09-01 の 指定）。先に 資料を 見せると、
     * 聞き取りでは なく 読んだ ことを 思い出す 練習に なる。
     *
     * ステージに リスニングは **1本だけ**なので URL に ID は 付かない
     *（`stageContentPath`）。ここが `-ID` 付きに なったら、ステージに
     * 2本目の リスニングが 入った という こと。
     */
    await frameNext(page).click();
    await expect(page).toHaveURL(/\/kaisha\/listening$/);
    await page.getByRole("button", { name: "はじめる" }).click();

    const heard = page.getByLabel("聞こえた ことばを 入力する");
    for (const word of HEARD) {
      await heard.fill(word);
      await page.getByRole("button", { name: "はんてい" }).click();
    }
    /*
     * 30% ひらくと こたえあわせへ 進める（`revealGoal`）。**この 語の 並びで
     * 関所を 越えられる** ことが、教材の 側の 検査でも ある——キーワードを
     * 入れ替えて 越えられなく なったら、ここが 落ちる。
     */
    await expect(page.getByText(/げんこうが \d+% ひらきました/)).toBeVisible();
    await shot(page, "13-listening-typing");

    await page.getByRole("button", { name: "こたえあわせに すすむ" }).click();
    await expect(page.getByRole("heading", { name: "こたえあわせ" })).toBeVisible();
    await frameNext(page).click();
  });

  await test.step("10. STEP 6 ページ「仕事の 3つの タイプを 確かめよう」— 聞いた ことを 資料で 確かめる", async () => {
    await expect(page).toHaveURL(/article-kaisha_shugyo_keitai$/);
    /*
     * カード 3枚（SES・受託開発・自社開発）。**絵に 字は 無い**——説明は カードの
     * text に HTML で 置いて ある（設計01 §4-10「画像内に重要テキストを閉じ込めない」）。
     *
     * 旧アプリからの 移植では 全体1枚の スライド＋切り出し3枚の 4枚だったが、
     * 全体の 1枚は **字が 絵に 焼き込まれて いて**「（例：タンバム）」が 直せず、
     * 2026-09-03 に 捨てた（タンバムは 自社開発の 主流では なく なった）。
     * 絵が 消えた ことに 気づける ように、枚数を 固定して 見張る。
     */
    await expect(page.locator('img[src*="/img/articles/kaisha_shugyo_keitai/"]')).toHaveCount(3);
    await expect(page.locator('[data-slot="empty"]')).toHaveCount(0);
    await shot(page, "14-shugyo-keitai-slide");

    await readToEnd(page);
    await frameNext(page).click();
  });

  await test.step("11. STEP 6 もんだい「仕事の 3つの タイプの かくにん」— 内容確認＋自分の こたえ", async () => {
    await expect(page).toHaveURL(/quiz-kaisha_shugyo_keitai_check$/);
    await page.getByRole("button", { name: "はじめる" }).click();

    /* この 教材も `answerMode: "all"`。9問が 同時に 見えて いる（4択・3択＋自由記述1）。 */
    await expect(page.getByText(`1/${SHUGYO_TOTAL}`, { exact: true })).toBeVisible();
    // ぜんぶ うめるまで 出す ボタンは 出ない（`requireAll`）
    await expect(page.getByRole("button", { name: /こたえを 出/ })).toHaveCount(0);

    for (const [questionId, at] of SHUGYO_CHOICES) {
      await pickChoiceIn(page, questionId, at);
    }
    // 「どうして やって みたいか」は 自由記述。正解も 不正解も 無い（type: free）
    await writeIn(page, "q_naze", "いろいろな 会社を 見たいからです。");
    await shot(page, "15-shugyo-check");

    await expect(page.getByRole("button", { name: /こたえを 出/ })).toBeVisible();
    await submitAnswers(page);
    await expect(page.getByText(`${SHUGYO_TOTAL} / ${SHUGYO_TOTAL} もん`)).toBeVisible();
  });

  await test.step("12. ステージを おえる", async () => {
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
