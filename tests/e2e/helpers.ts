import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";

/**
 * 通し検証の道具箱 — かいしゃステージ（企業調査）を 学習者と同じ手つきで さわるための部品
 *
 * 画面の言葉（「こたえる」「はなす」）で操作を書けるようにして、
 * テスト本体には **何を確かめたいか** だけが残るようにする。
 */

/* ------------------------------------------------------------------ *
 * ステージの並び（content/stages/kaisha.json と同じ順）
 * ------------------------------------------------------------------ */

export interface KaishaItem {
  /** 進捗キー＝コンテンツID（localStorage の `nexmax:v1:content:<id>`）。 */
  readonly id: string;
  /** 学習者が見るURL（組み立ての規則は src/lib/stage-routes.ts）。 */
  readonly path: string;
  /** ステージ一覧に出る種別の呼び名。 */
  readonly kind: string;
}

/**
 * かいしゃステージの教材。名前で 呼べるようにしておく（番号だけだと 読めない）。
 *
 * 並びは 配布資料（`会社研究/` の HTML 4枚）の 5つの STEP そのもの
 *（2026-08-27 に 6つ→5つへ まとめた。「会社と 自分の 関係」は
 * 「松井社長と 話す 準備」に 吸収された）:
 * STEP1 調べかたを 学ぶ → STEP2 サイトを 見て 調査シートを うめる →
 * STEP3 ヘンディさんに 報告 → STEP4 社長と 話す 準備（ページ＋フォーム）→
 * STEP5 社長と 話す。
 */
export const KAISHA = {
  /** STEP 1 NEXT MAKEを 調べよう！ */
  /*
   * ページが **2本に なった**ので、URL に ID が 付く
   *（`stageContentPath`: 同じ 種別が 2つ以上 なら `-ID` を 足す）。
   * 短い `/kaisha/article` は いまも 1本目を 指す（`resolveStageContent`）。
   */
  article1: {
    id: "kaisha_shirabekata",
    path: "/kaisha/article-kaisha_shirabekata",
    kind: "ページ",
  },
  site: {
    id: "nextmake_gakushu_site",
    path: "/kaisha/link-nextmake_gakushu_site",
    kind: "リンク",
  },
  /** STEP 2 の 調査シート。 */
  sheet: { id: "kaisha_houkoku", path: "/kaisha/quiz-kaisha_houkoku", kind: "もんだい" },
  /** STEP 3 ヘンディさんに 報告しよう。 */
  meetingHendy: {
    id: "kaisha_houkoku_meeting",
    path: "/kaisha/meeting-kaisha_houkoku_meeting",
    kind: "ミーティング",
  },
  /** STEP 4 の ページ「松井社長と 話す 準備を しよう」。 */
  article2: {
    id: "kaisha_matsui_junbi",
    path: "/kaisha/article-kaisha_matsui_junbi",
    kind: "ページ",
  },
  /** STEP 4 の フォーム「松井社長に 何を 話す？」。 */
  junbi: {
    id: "kaisha_omoshiroi",
    path: "/kaisha/quiz-kaisha_omoshiroi",
    kind: "もんだい",
  },
  /** STEP 5 松井社長と LiveAIで 話そう。 */
  meetingMatsui: {
    id: "kaisha_matsui",
    path: "/kaisha/meeting-kaisha_matsui",
    kind: "ミーティング",
  },
} as const satisfies Record<string, KaishaItem>;

/** 学習者が進む順（content/stages/kaisha.json の contents[] と同じ並び）。 */
export const KAISHA_ITEMS: readonly KaishaItem[] = [
  KAISHA.article1,
  KAISHA.site,
  KAISHA.sheet,
  KAISHA.meetingHendy,
  KAISHA.article2,
  KAISHA.junbi,
  KAISHA.meetingMatsui,
];

/**
 * まとめて 出す（`answerMode: "submit"`）を 見る 教材＝朝会ステージの もんだい。
 *
 * かいしゃステージは 6つの STEP に なり、まとめて 出す の 教材が 無くなった
 *（2026-08-25）。「はじめに」の かくにんテストは **関門では ない**（`gates: false`）ので
 * 開いた 瞬間に「ステージ クリア」の 板が かぶさる——押せる ものが 無くなるので 使えない。
 */
export const ASAKAI_QUIZ = {
  id: "sample_horenso",
  path: "/asakai/quiz",
  /** 関門を あけるために 先に おわらせておく 教材（content/stages/asakai.json）。 */
  before: ["m2-asakai-manga", "m2-asakai-article", "sample_asakai"],
} as const;

/** 朝会の もんだいの 問数。**教材から 読む**（`HOUKOKU_TOTAL` と 同じ 理由）。 */
export const ASAKAI_QUIZ_TOTAL: number = (
  JSON.parse(
    readFileSync(join(__dirname, "..", "..", "content", "quizsets", "sample_horenso.json"), "utf8"),
  ) as { questions: unknown[] }
).questions.length;

/**
 * ステージのトップに 出る 進みぐあいの 文（「7つ の うち 2つ おわりました」）。
 *
 * 数を **ベタ書きしない**。前は「6つ の うち …」と 書いて いて、ステージに 教材を
 * 1本 足した 日に 4つの spec が いっせいに 落ちた（2026-08-23）。
 */
export function progressText(done: number): string {
  return `${KAISHA_ITEMS.length}つ の うち ${done}つ おわりました`;
}

/**
 * 「調査シート」の 問題数。**教材から 読む**。
 *
 * ここを ベタ書きして いた ため、サイトの ページが 増えて 問題を 3つ 足した 日に
 * teishutsu / tsuzuki の 5本が いっせいに 落ちた（2026-08-24）。
 * ステージの 数（`progressText`）で 同じ ことを 一度 やって いる——同じ 轍を 踏まない。
 */
export const HOUKOKU_TOTAL: number = (
  JSON.parse(
    readFileSync(join(__dirname, "..", "..", "content", "quizsets", "kaisha_houkoku.json"), "utf8"),
  ) as { questions: unknown[] }
).questions.length;

/** 「こたえた n / 26」の 文（全問1ページの 進みぐあい）。 */
export function writtenText(done: number): string {
  return `こたえた ${done} / ${HOUKOKU_TOTAL}`;
}

/**
 * 「松井社長に 何を 話す？」の 問数。**教材から 読む**（`HOUKOKU_TOTAL` と 同じ 理由）。
 */
export const JUNBI_TOTAL: number = (
  JSON.parse(
    readFileSync(
      join(__dirname, "..", "..", "content", "quizsets", "kaisha_omoshiroi.json"),
      "utf8",
    ),
  ) as { questions: unknown[] }
).questions.length;

/**
 * その教材より前の教材のID（関門を開けるために「おわった」ことにする分）。
 *
 * **番号ではなく教材そのものを受ける。** 前は `itemsBefore(4)` のように番号で
 * 呼んでいて、ステージに教材を1本 足しただけで **15か所が いっせいに ずれた**
 *（2026-08-23、学習用サイトのリンクを 3番目に 入れたとき）。番号は「どの教材の
 * 手前か」を語らないので、ずれても テストは 静かに 別の 画面を 見に行く。
 */
export function itemsBefore(item: KaishaItem): string[] {
  const at = KAISHA_ITEMS.findIndex((candidate) => candidate.id === item.id);
  if (at < 0) throw new Error(`かいしゃステージに ない 教材です: ${item.id}`);
  return KAISHA_ITEMS.slice(0, at).map((candidate) => candidate.id);
}

/* ------------------------------------------------------------------ *
 * 端末に残るもの（進捗・鍵）を先に置く
 * ------------------------------------------------------------------ */

/**
 * 教材を「おわった」ことにして、関門（ゲート）を開ける。
 *
 * 本来の順路（ロックが効くこと）は `junro.spec.ts` が別に確かめる。
 * ここで開けてよいのは、**その教材だけを見たいテスト**のため。
 * 保存の形は `src/lib/progress/store.ts` の `recordContentProgress` と同じ。
 */
export async function seedCompleted(
  context: BrowserContext,
  contentIds: readonly string[],
): Promise<void> {
  await context.addInitScript(
    (ids: string[]) => {
      for (const id of ids) {
        window.localStorage.setItem(
          `nexmax:v1:content:${id}`,
          JSON.stringify({ status: "completed" }),
        );
      }
    },
    [...contentIds],
  );
}

/** 端末に 残った 正式な成績（`src/lib/progress/store.ts` の TestResult）。無ければ null。 */
export async function readTestResult(page: Page, stageId: string): Promise<unknown> {
  return page.evaluate((id: string) => {
    const raw = window.localStorage.getItem(`nexmax:v1:test:${id}`);
    return raw === null ? null : JSON.parse(raw);
  }, stageId);
}

/**
 * Gemini の鍵を **学習者と同じ経路（BYOK・端末の中）** に置く。
 *
 * サーバの環境変数には足さない。`src/lib/profile.ts` の `getGeminiKey()` は
 * localStorage しか見ておらず、`/api/meeting/judge` へは本人の鍵として渡る
 * （鍵をビルドに渡すと OpenNext がバンドルへ焼き込む — docs/deploy.md §0.2）。
 */
export async function seedGeminiKey(context: BrowserContext, key: string): Promise<void> {
  await context.addInitScript((value: string) => {
    window.localStorage.setItem("nexmax.geminiKey", value);
  }, key);
}

/* ------------------------------------------------------------------ *
 * 証拠を残す
 * ------------------------------------------------------------------ */

/** 人が見たいときだけ見られるように、節目の画面を撮って成果物に置く。 */
export async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `e2e-screens/${name}.png`, fullPage: true });
}

/* ------------------------------------------------------------------ *
 * ふりがなの覆い（ルビの外に 裸の漢字が 無いか）
 * ------------------------------------------------------------------ */

/**
 * 画面に出ている「ルビの付いていない漢字」を集める（規律2の実画面チェック）。
 *
 * `<ruby>` の中は base も rt も 覆われている扱い。`<script>` `<style>` の中は
 * 学習者が読む文ではないので数えない（Next.js の埋め込みデータが引っかかるだけ）。
 */
export async function bareKanjiTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const KANJI = /[々一-鿿]/;
    const found: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = node.nodeValue ?? "";
      if (KANJI.test(text)) {
        let element = node.parentElement;
        let covered = false;
        while (element) {
          const tag = element.tagName;
          if (tag === "RUBY" || tag === "SCRIPT" || tag === "STYLE" || tag === "TEMPLATE") {
            covered = true;
            break;
          }
          element = element.parentElement;
        }
        if (!covered) found.push(text.trim());
      }
      node = walker.nextNode();
    }
    return [...new Set(found)];
  });
}

/* ------------------------------------------------------------------ *
 * もんだい（quizset）の操作
 * ------------------------------------------------------------------ */

/**
 * 4択の選択肢。ルビが合成されるので文字では選ばず、**並びの番号**で選ぶ
 *（「会社か 見る」が画面では「会社かいしゃか 見みる」になるため）。
 *
 * **漢字を含むボタンは `getByRole("button", { name })` では掴めない。**
 * アクセシブル名がルビの境目で割れる（「えらび直す」→「えらび 直 なお す」）ので、
 * 名前での部分一致も外れる。`getByText()` か 並び順で掴むこと
 *（画面には見えているのにテストだけタイムアウトする——2026-08-19 に2度踏んだ）。
 */
export function choiceButtons(page: Page): Locator {
  return page.locator("ul li button");
}

/** 複数選択の選択肢（`aria-pressed` を持つのは この型だけ）。 */
export function multiButtons(page: Page): Locator {
  return page.locator("li > button[aria-pressed]");
}

/**
 * 語群の あなを 埋める。語のボタンは 表記で選べる
 *（あなのボタンは aria-label が付いていて、語の名前では当たらない）。
 *
 * **押した だけでは 出さない**。既定の やりかた（まとめて 出す）には
 * 「こたえる」ボタンが 無く、進むのは `goNext()` だから。
 */
export async function placeWords(page: Page, words: readonly string[]): Promise<void> {
  for (const word of words) {
    await page.getByRole("button", { name: word }).first().click();
  }
}

/**
 * 語群を 置く。**もんだいの id で 場所を しぼる。**
 *
 * ぜんぶ 1ページの 教材（`answerMode: "all"`）では 全問の 語群が 同時に 画面に ある。
 * 同じ ことばの ふだが いくつもの もんだいに 出る ので
 *（「システム開発」は 2問、「観光DX」は 3問に ある）、画面ぜんたいから `.first()` で
 * 引くと **別の もんだいの ふだを 押す**——しかも 見た目は 進むので 気づかない。
 * 板は `<li id="q-<もんだいのid>">`（`quiz-runner.tsx` の `AllQuestionsCard`）。
 */
export async function placeWordsIn(
  page: Page,
  questionId: string,
  words: readonly string[],
): Promise<void> {
  const row = page.locator(`#q-${questionId}`);
  for (const word of words) {
    /*
     * **ぴったり一致で 引く。** 語群の ふだは `aria-label` に ルビ前の ことばを 持つ
     *（`question-types.tsx`）。ゆるい 一致だと 「日本語」が 「日本語の 勉強」にも
     * 当たって、どちらが 押されたか 分からなく なる。
     */
    await row.getByRole("button", { name: word, exact: true }).first().click();
  }
}

/** 自由入力の もんだいに 書く（上と 同じ 理由で もんだいの id で しぼる）。 */
export async function writeIn(page: Page, questionId: string, text: string): Promise<void> {
  await page.locator(`#q-${questionId}`).getByLabel("こたえを 入力する").fill(text);
}

/**
 * 順不同の 入力（`list`）の 欄を 上から 埋める。
 *
 * 語群と ちがい ふだが 無い ので、**打つ**。どの 欄に 書いても よいのは
 * 採点の 側が 順を 見ない ため（`gradeDraft`）。
 */
export async function writeListIn(
  page: Page,
  questionId: string,
  values: readonly string[],
): Promise<void> {
  const row = page.locator(`#q-${questionId}`);
  for (const [at, value] of values.entries()) {
    await row.getByLabel(`${at + 1}つめを 入力する`).fill(value);
  }
}

/**
 * 4択の もんだいで **番号で** えらぶ（全問1ページの 教材）。
 *
 * 文字で えらばないのは、ルビが 合成されて 選択肢の 文が
 * 「新あたらしい」の ように 変わる ため（`choiceButtons` の 覚書と 同じ 理由）。
 */
export async function pickChoiceIn(page: Page, questionId: string, at: number): Promise<void> {
  await page.locator(`#q-${questionId}`).locator("ul li button").nth(at).click();
}

/**
 * 複数選択の もんだいで、いくつかを えらぶ（全問1ページの やりかた）。
 *
 * `aria-pressed` を 持つのは この 型だけ（`multiButtons` の 覚書）。
 * 押した ものは 押しっぱなしに なるので、**えらぶ ものだけ**を 順に 押す。
 */
export async function pickMultiIn(
  page: Page,
  questionId: string,
  indexes: readonly number[],
): Promise<void> {
  const buttons = page.locator(`#q-${questionId}`).locator("li > button[aria-pressed]");
  for (const at of indexes) await buttons.nth(at).click();
}

/** 語群を 埋めて「こたえる」まで（1問ずつ の やりかたの 教材だけ）。 */
export async function fillWordBank(page: Page, words: readonly string[]): Promise<void> {
  await placeWords(page, words);
  await page.getByRole("button", { name: "こたえる" }).click();
}

/** 解説を読んで つぎの問題へ（1問ずつ の やりかた）。 */
export async function goNextQuestion(page: Page): Promise<void> {
  await page.getByRole("button", { name: "つぎへ" }).click();
}

/* ---- まとめて 出す（既定の やりかた）の 操作 ---- */

/** つぎの もんだいへ（ここでは 採点しない）。 */
export async function goNext(page: Page): Promise<void> {
  await page.getByRole("button", { name: "つぎ →" }).click();
}

/** さいごの もんだいから「出す まえの かくにん」へ。 */
export async function goToConfirm(page: Page): Promise<void> {
  await page.getByRole("button", { name: "さいごに かくにん →" }).click();
}

/**
 * ぜんぶ 出して 採点させる。
 * ルビが 合成されて「こたえを 出だす」に なるので 部分一致で さがす。
 *
 * **出す まえに 確認の 板が 出る**（2026-08-27 の 指定）。押した 瞬間に 採点が
 * 確定する ので、1枚 はさんで から 採点に 進む。板は どの やりかたでも 同じ。
 */
export async function submitAnswers(page: Page): Promise<void> {
  await page.getByRole("button", { name: /こたえを 出/ }).click();
  const confirm = page.getByRole("dialog", { name: "こたえを 出す かくにん" });
  await expect(confirm).toBeVisible();
  // ルビが 語の 中に 入る（「出だします」）ので、ふりがなの 入らない ところで さがす
  await confirm.getByRole("button", { name: /はい/ }).click();
  await expect(confirm).toHaveCount(0);
}

/** 正解したことを 画面の言葉で 確かめる（禁止語は使わない・規律1）。 */
export async function expectQuizCorrect(page: Page): Promise<void> {
  await expect(page.getByText("よく できました").first()).toBeVisible();
}

/* ------------------------------------------------------------------ *
 * ミーティングの操作
 * ------------------------------------------------------------------ */

/** さんかする 前の 画面から 入室する（Zoom と 同じ 入りかた）。 */
export async function joinCall(page: Page): Promise<void> {
  await page.getByRole("button", { name: "ミーティングに さんかする" }).click();
}

/** 文字を 入れて 送るだけ（判定の ポップアップは 待たない）。 */
async function sendAnswer(page: Page, text: string): Promise<void> {
  await page.getByLabel("こたえを 入力する").fill(text);
  await page.getByRole("button", { name: "おくる" }).click();
}

/**
 * 文字で答える（声は 実機のマイクが要るので 自動では通らない）。
 *
 * 判定は **AIに 通せた ときも 通せなかった ときも** ポップアップで 出る
 *（2026-08-20 の 指定「1個ずつ 確実に フローが 進むように」）。鍵の 無い
 * 検証でも 同じ ポップアップが 出るので、読んで 押す ところまでを 1つの 操作に する。
 */
export async function speakByText(page: Page, text: string): Promise<void> {
  await sendAnswer(page, text);
  await dismissJudge(page);
}

/** 判定の ポップアップを 読んで 閉じる（つぎへ／もう いちど）。 */
export async function dismissJudge(page: Page): Promise<void> {
  const popup = page.getByRole("dialog", { name: "はんていの ポップアップ" });
  await expect(popup).toBeVisible({ timeout: 45_000 });
  await popup.getByRole("button").click();
  await expect(popup).toHaveCount(0);
}

/**
 * つぎの しつもんが 出るまで 待つ。
 *
 * 「つぎへ →」ボタンは 無くなった（判定が 通れば 自分で 進む）。会話の 教材で
 * 進む ために ボタンを 押させない、という 作りに 合わせて、**画面に しつもんが
 * 1つ 増えた こと**を 待つ。
 */
export async function waitForAsk(page: Page, count: number): Promise<void> {
  await expect(page.locator('[data-kind="ask"]')).toHaveCount(count);
}

/**
 * 答えられないときの出口。**ボタンでは なく ことば**で 言う
 *（実際の 会議で 使う 救援の 言い方を そのまま 練習に する）。
 */
export async function skipAsk(page: Page): Promise<void> {
  // 逃げの ひとことは 判定に かけない（ポップアップは 出ない）
  await sendAnswer(page, "すみません、つぎを おねがいします");
}

/**
 * ひらいた カードの 数。
 *
 * 板の 見出しは 漢字＋ふりがなに なった（2026-08-21）ので、**地の 文では 数えない**
 *——ルビが 入ると 字づらが「答こたえると」に なり、書いた とおりには 当たらない。
 * 板が 自分で 名のる 名前（`aria-label`）で 見る。
 */
export async function openedCards(page: Page): Promise<number> {
  const label = await page
    .getByLabel(/ひらいた カード \d+ \/ \d+/)
    .first()
    .getAttribute("aria-label");
  const match = /(\d+) \/ (\d+)/.exec(label ?? "");
  return match ? Number(match[1]) : -1;
}

/**
 * ミーティングを おえる（Zoom と 同じ「たいしつ」から 出る）。
 *
 * 「ミーティングを おわる」ボタンは 消した（2026-08-21 の 指定「たいしつ が あるので
 * 不要」）。おわりの しゅうりょうしょうは この 道から 出る。
 */
export async function leaveCall(page: Page): Promise<void> {
  await page.getByRole("button", { name: "たいしつ" }).click();
  await page.getByRole("button", { name: "言いました。おわる" }).click();
}

/** いま貯まっているハート（好感度モードの ミーティングに 出る）。 */
export async function hearts(page: Page): Promise<number> {
  const label = await page
    .locator('[aria-label="こうかんど メーター"] [role="img"]')
    .getAttribute("aria-label");
  const match = /(\d+)/.exec(label ?? "");
  return match ? Number(match[1]) : -1;
}

/* ------------------------------------------------------------------ *
 * 対話ゲーム（松井社長・願い #177）
 * ------------------------------------------------------------------ */

/** いまの 好感度（%）。丸い リングの 読み上げから 取る。 */
export async function affinity(page: Page): Promise<number> {
  const label = await page
    .locator('[role="img"][aria-label*="パーセント"]')
    .first()
    .getAttribute("aria-label");
  const match = /(\d+)/.exec(label ?? "");
  return match ? Number(match[1]) : -1;
}

/**
 * 社長の ことばを 読み進めて、自分の ばんまで 出す。
 *
 * セリフは 1つずつ 出るので、「つぎへ」が 見えて いる あいだは 押し続ける。
 * 上限を 置くのは、進まなく なった ときに **テストが 止まらず 落ちる**ため。
 */
export async function readOn(page: Page, limit = 6): Promise<void> {
  const next = page.getByRole("button", { name: "つぎへ ▶" });
  for (let i = 0; i < limit; i += 1) {
    if (await page.getByLabel("文字で 答える").isVisible()) return;
    if (!(await next.isVisible())) return;
    await next.click();
  }
}

/** 文字で 答えて、見かたの 板を 読んで 閉じる。 */
export async function answerTalk(page: Page, text: string): Promise<void> {
  await page.getByLabel("文字で 答える").fill(text);
  await page.getByRole("button", { name: "おくる" }).click();
  const gain = page.getByText(/^こうかんど \+\d+%$/);
  await expect(gain).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: "つぎへ ▶" }).click();
}
