import { expect, test } from "@playwright/test";
import { KAISHA, itemsBefore, readOn, seedCompleted, seedGeminiKey } from "./helpers";

/**
 * 採点と 会話の 流れの **ものさし合わせ**（2026-09-01 の 指定
 *「採点や会話の流れについて期待結果と返答の差分を測定して欲しい」）
 *
 * ## `taiwa-live.spec.ts` と 何が ちがうか
 * あちらは「AIが 効いて いる」ことを **1往復** 見る 合否の テスト。
 * こちらは **ものさしが 学習者の 感覚と ずれて いないか**を 何本かの 発話で 測る。
 * 落とすのでは なく **表に して 出す**のが 主な しごと——AIの 返しは 揺れるので、
 * 1回 落ちた ことより「どの 観点が どれくらい ずれるか」が 知りたい。
 *
 * ## なぜ 要るか
 * 2026-08-31 に 実際に あった 訴え:
 *
 * > 「NM CLAWが先進的でいいと思いました。…ホテル業界に応用したら…」
 * > ・会社の ことが 入って いる ／ ・りゆうが 言えた → **0点でした**
 *
 * 原因は 2つ 重なって いた（読めない 漢字で 見かたを 丸ごと 捨てて いた／
 * 見て いない ことを できて いない 顔で 出して いた）。どちらも 直したが、
 * **同じ ずれが また 起きても、人が 気づくまで 分からない**。
 * だから 学習者の 実際の ことばを 台帳に して、毎回 測る。
 *
 * ## 落とすのは「これは 絶対」の ぶんだけ
 * `must` を 付けた 観点だけ 合否に する。ほかは ずれても 表に 出すだけ——
 * AIの 揺れで CI が 赤く なると、**表そのものを 見なく なる**。
 */
test.use({ trace: "off", video: "off" });

/** 見る 観点（画面の `data-kanten` と 同じ 名前）。 */
type Kanten = "japanese" | "onTopic" | "concrete" | "reason" | "feeling" | "polite";

interface Case {
  /** 表に 出す 名前。 */
  readonly name: string;
  /** 学習者が 言う ことば。**実際に 言われた ものを そのまま 使う**。 */
  readonly say: string;
  /** そうなって ほしい 観点。 */
  readonly expect: Partial<Record<Kanten, boolean>>;
  /**
   * ここが ずれたら 落とす 観点。
   *
   * 学習者が 訴えて きた ところ（＝直した ところ）だけに 付ける。
   * 「たぶん こう なる」を 落とす 材料に すると、AIの 揺れで 毎回 赤く なる。
   */
  readonly must?: readonly Kanten[];
  /**
   * 何問目の しつもんに 向けた ことばか（既定は 1問目）。
   *
   * **ここを 間違えると 測定の ほうが 嘘に なる。** 1回目の 測定で、
   * 2問目（あなたの いい ところ）への 答えを 1問目（NEXT MAKEの どこが いい）に
   * ぶつけて いて、`onTopic: false` が 返って きた——**AIは 正しく、台帳が 誤り**だった。
   */
  readonly atAsk?: number;
}

/**
 * 台帳。**1問目（t1・見る ところは 会社の こと／りゆう）に 向けて 言う**ことばで そろえる。
 * 観点の 出かたを 比べたいので、聞かれる しつもんは 同じに して おく。
 */
const CASES: readonly Case[] = [
  {
    // 2026-08-31 に「0点だった」と 言われた ことば その1（音声の 文字起こし そのまま）
    name: "サービス名＋使いみち（訴えの ことば その1）",
    say: "NM CLAWが先進的でいいと思いました。えー、これをホテル業界とかいろんな業界に応用したら、面白いことができるんじゃないかと思ってます。",
    expect: { japanese: true, onTopic: true, concrete: true, reason: true },
    // サイトに ある サービスを 名指して いる。ここが 立たないのが 訴えの 本体
    must: ["concrete"],
  },
  {
    // その2。しつもんは ちがう ものだったが、りゆうの 見かたを 同じ 土俵で 測る
    name: "強み＋使いみち（訴えの ことば その2）",
    say: "私のいいところはコミュニケーション力が高いところです。え、客先で働く時に、コミュニケーションをお客さんととって、確実な要件定義をしてアプリケーションが作れたらいいなと思ってます。",
    // これは **2問目**（あなたの いい ところ）への 答え。1問目に ぶつけない
    atAsk: 2,
    expect: { japanese: true, onTopic: true, reason: true },
  },
  {
    name: "サービス名だけ（りゆうは 無い）",
    say: "観光DXが いいと 思いました。",
    expect: { japanese: true, onTopic: true, concrete: true, reason: false },
    must: ["concrete"],
  },
  {
    name: "気もちだけ（会社の 中身が 無い）",
    say: "とても おもしろいと 思いました。すごいです。",
    expect: { japanese: true, onTopic: true, concrete: false },
    must: ["concrete"],
  },
  {
    name: "英語（日本語で 言えて いない）",
    say: "I think this company is very interesting.",
    expect: { japanese: false },
    must: ["japanese"],
  },
];

/** 画面の 板から 観点を 読む。板に 出て いない 観点は undefined。 */
async function readKanten(page: import("@playwright/test").Page) {
  const rows = page.locator("[data-kanten]");
  const seen: Partial<Record<Kanten, boolean>> = {};
  for (let at = 0; at < (await rows.count()); at += 1) {
    const row = rows.nth(at);
    const key = (await row.getAttribute("data-kanten")) as Kanten | null;
    if (key) seen[key] = (await row.getAttribute("data-on")) === "true";
  }
  return seen;
}

test.describe("採点の ものさし（鍵が あるときだけ）", () => {
  for (const one of CASES) {
    test(`観点の 差分: ${one.name}`, async ({ page, context }) => {
      const key = process.env.GEMINI_API_KEY ?? "";
      test.skip(key === "", "GEMINI_API_KEY が 無いので とばしました");

      await seedGeminiKey(context, key);
      await seedCompleted(context, itemsBefore(KAISHA.meetingMatsui));
      await page.goto(KAISHA.meetingMatsui.path);
      await page.getByRole("button", { name: "はじめる ▶" }).click();
      await readOn(page);

      // その ことばが 向けられた しつもんまで 進む（手前は 当たりさわりの ない 一言で 通す）
      for (let at = 1; at < (one.atAsk ?? 1); at += 1) {
        await page.getByLabel("文字で 答える").fill("はい、見ました。");
        await page.getByRole("button", { name: "おくる" }).click();
        await expect(page.getByText(/^こうかんど \+\d+%$/)).toBeVisible({ timeout: 45_000 });
        await page.getByRole("button", { name: "つぎへ ▶" }).click();
        await readOn(page);
      }

      const ask = (await page.locator("[data-ask]").innerText()).trim();
      await page.getByLabel("文字で 答える").fill(one.say);
      await page.getByRole("button", { name: "おくる" }).click();
      await expect(page.getByText(/^こうかんど \+\d+%$/)).toBeVisible({ timeout: 45_000 });

      /*
       * AIに 通せない ことは 仕様の うち（鍵切れ・混雑）。そのときの 板は
       * 端末の 規則の 結果なので、**ものさしの 差分としては 数えない**。
       */
      if ((await page.getByText("みて いない ところです").count()) > 0) {
        console.log(`[eval] ${one.name}: AIに 通せませんでした（規則ベースの 板）`);
        test.skip(true, "AIに 通せませんでした");
      }

      const got = await readKanten(page);
      const gained = (await page.getByText(/^こうかんど \+\d+%$/).innerText()).trim();

      const diff: string[] = [];
      for (const [k, want] of Object.entries(one.expect) as [Kanten, boolean][]) {
        const mark = got[k] === want ? "○" : "✗";
        if (got[k] !== want) diff.push(`${k}: 期待 ${want} / 返答 ${got[k]}`);
        console.log(`[eval] ${one.name} | ${k}: ${mark} 期待=${want} 返答=${got[k]}`);
      }
      console.log(`[eval] ${one.name} | しつもん=「${ask}」 ${gained} ずれ=${diff.length}件`);

      for (const k of one.must ?? []) {
        expect(got[k], `${one.name} の ${k}（期待 ${one.expect[k]}）`).toBe(one.expect[k]);
      }
    });
  }
});

/**
 * 会話の 流れ — **判定の あと、社長は まず 返事を してから つぎを 聞く**
 *
 * 2026-08-31 の 訴え「質問に回答すると、判定画面ですぐに次の質問に行ってしまう」の
 * 直しが 生きて いるか。AIに 通せる ときは 返事も AIが 作るので、ここで 一緒に 測る。
 */
test("会話の 流れ: 判定 → 社長の 返事 → つぎの しつもん（鍵が あるときだけ）", async ({
  page,
  context,
}) => {
  const key = process.env.GEMINI_API_KEY ?? "";
  test.skip(key === "", "GEMINI_API_KEY が 無いので とばしました");

  await seedGeminiKey(context, key);
  await seedCompleted(context, itemsBefore(KAISHA.meetingMatsui));
  await page.goto(KAISHA.meetingMatsui.path);
  await page.getByRole("button", { name: "はじめる ▶" }).click();
  await readOn(page);

  const first = (await page.locator("[data-ask]").innerText()).trim();
  await page
    .getByLabel("文字で 答える")
    .fill("観光DXが おもしろいと 思いました。まちを あるいて みたいからです。");
  await page.getByRole("button", { name: "おくる" }).click();
  await expect(page.getByText(/^こうかんど \+\d+%$/)).toBeVisible({ timeout: 45_000 });

  // ①板を 閉じた つぎは **答える 欄では ない**（社長が 何か 言う）
  await page.getByRole("button", { name: "つぎへ ▶" }).click();
  await expect(page.getByLabel("文字で 答える")).toHaveCount(0);
  /*
   * **`data-line` で 引く。** 1回目は `p.text-navy` の 先頭を 取って いて、
   * ステージの 見出し（「会社を 知る」）を 社長の 返事として 記録して いた——
   * 通って いたのに 中身が ちがう、という いちばん たちの 悪い 測りかた だった。
   */
  const reply = (await page.locator("[data-line]").innerText()).trim();
  console.log(`[eval] 社長の 返事=「${reply}」`);
  expect(reply.length).toBeGreaterThan(0);
  expect(reply).not.toContain("会社を 知る");

  // ②その つぎで しつもんに 進み、1問目とは ちがう ことを 聞く
  await readOn(page);
  const second = (await page.locator("[data-ask]").innerText()).trim();
  console.log(`[eval] 1問目=「${first}」`);
  console.log(`[eval] 2問目=「${second}」`);
  expect(second).not.toBe(first);

  // ③2問目は 準備フォームの ②（前置きつき）。唐突に ならない ことを 見る
  expect(second).toContain("あなたの ことも");
});
