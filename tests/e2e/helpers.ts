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

/** かいしゃステージの6教材。名前で 呼べるようにしておく（番号だけだと 読めない）。 */
export const KAISHA = {
  article1: {
    id: "kaisha_shirabekata",
    path: "/kaisha/article-kaisha_shirabekata",
    kind: "ページ",
  },
  quiz1: {
    id: "kaisha_shirabekata_check",
    path: "/kaisha/quiz-kaisha_shirabekata_check",
    kind: "もんだい",
  },
  article2: {
    id: "kaisha_nextmake_shirabe",
    path: "/kaisha/article-kaisha_nextmake_shirabe",
    kind: "ページ",
  },
  quiz2: { id: "kaisha_houkoku", path: "/kaisha/quiz-kaisha_houkoku", kind: "もんだい" },
  meetingHendy: {
    id: "kaisha_houkoku_meeting",
    path: "/kaisha/meeting-kaisha_houkoku_meeting",
    kind: "ミーティング",
  },
  meetingMatsui: {
    id: "kaisha_matsui",
    path: "/kaisha/meeting-kaisha_matsui",
    kind: "ミーティング",
  },
} as const satisfies Record<string, KaishaItem>;

/** 学習者が進む順（content/stages/kaisha.json の contents[] と同じ並び）。 */
export const KAISHA_ITEMS: readonly KaishaItem[] = [
  KAISHA.article1,
  KAISHA.quiz1,
  KAISHA.article2,
  KAISHA.quiz2,
  KAISHA.meetingHendy,
  KAISHA.meetingMatsui,
];

/** i 番目より前の教材のID（関門を開けるために「おわった」ことにする分）。 */
export function itemsBefore(index: number): string[] {
  return KAISHA_ITEMS.slice(0, index).map((item) => item.id);
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
 */
export async function submitAnswers(page: Page): Promise<void> {
  await page.getByRole("button", { name: /こたえを 出/ }).click();
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

/** ひらいた カードの 数（「こたえると、カードが ひらきます（n / m）」）。 */
export async function openedCards(page: Page): Promise<number> {
  const label = await page
    .getByText(/カードが ひらきます（\s*\d+\s*\/\s*\d+\s*）/)
    .first()
    .innerText();
  const match = /（\s*(\d+)\s*\/\s*(\d+)\s*）/.exec(label);
  return match ? Number(match[1]) : -1;
}

/** いま貯まっているハート（松井社長のミーティングだけに出る）。 */
export async function hearts(page: Page): Promise<number> {
  const label = await page
    .locator('[aria-label="こうかんど メーター"] [role="img"]')
    .getAttribute("aria-label");
  const match = /(\d+)/.exec(label ?? "");
  return match ? Number(match[1]) : -1;
}
