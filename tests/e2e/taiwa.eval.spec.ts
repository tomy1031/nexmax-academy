import { expect, test, type Page } from "@playwright/test";
import { KAISHA, itemsBefore, readOn, seedCompleted, seedGeminiKey } from "./helpers";
import { evalKey, NO_KEY_HINT, writeEvalRow } from "./eval-key";

/**
 * 採点と 会話の 流れの **ものさし合わせ**（2026-09-01 の 指定
 *「採点や会話の流れについて期待結果と返答の差分を測定して欲しい」「もっと多様なパターンで」）
 *
 * ## ふだんの 通し検証とは 別に 走らせる
 * `*.eval.spec.ts` は `playwright.config.ts` の `testIgnore` で 外して ある。
 * 走らせるのは `npm run eval:taiwa` の ときだけ——Gemini に 何本も 投げる ので、
 * PR や マージの たびに 回す ものでは ない（枠と 時間を 食う。AIの 揺れで 赤く なると
 * ふだんの 検証まで 信じられなく なる）。
 *
 * ## 落とすのは「これは 絶対」だけ
 * `must` を 付けた 観点だけ 合否に する。ほかは ずれても 表に 出すだけ。
 *
 * ## なぜ 要るか
 * 2026-08-31 の 訴え「当てはまって いるのに 0点」。原因は 3つ 重なって いた:
 * 読めない 漢字で 見かたを 丸ごと 捨てて いた／見て いない ことを できて いない 顔で
 * 出して いた／**りゆうの ものさしが「から・ので」だけだった**。
 * 直したが、**同じ ずれが また 起きても 人が 気づくまで 分からない**ので 台帳に して 測る。
 */
test.use({ trace: "off", video: "off" });

/** 見る 観点（画面の `data-kanten` と 同じ 名前）。 */
type Kanten = "japanese" | "onTopic" | "concrete" | "reason" | "feeling" | "polite" | "question";

interface Case {
  readonly name: string;
  /** 学習者が 言う ことば。訴えの あった ものは **文字起こしの まま**。 */
  readonly say: string;
  readonly expect: Partial<Record<Kanten, boolean>>;
  /** ここが ずれたら 落とす。直した ところ・ものさしの 両端だけに 付ける。 */
  readonly must?: readonly Kanten[];
  /**
   * 何問目の しつもんに 向けた ことばか（既定は 1問目）。
   *
   * **ここを 間違えると 測定の ほうが 嘘に なる。** 2問目への 答えを 1問目に
   * ぶつけて `onTopic: false` を もらい、AIの まちがいだと 書きかけた（2026-09-01）。
   */
  readonly atAsk?: number;
  /** 聞く ばん（学習者が しつもんする ばん）で 測る。 */
  readonly listen?: boolean;
}

/**
 * 台帳。**ものさしの 両端と、実際に 訴えの あった ことば**を 混ぜる。
 *
 * 増やす ときの 決まり: 「こう 答えたのに 点が つかない／つきすぎる」と 言われた ことばは
 * **文字起こしの まま**入れる。作った 例文は ものさしの 端を 見る ためだけに 使う。
 */
const CASES: readonly Case[] = [
  /* ---- 訴えの あった ことば（そのまま） ---- */
  {
    name: "訴え1 サービス名＋使いみち",
    say: "NM CLAWが先進的でいいと思いました。えー、これをホテル業界とかいろんな業界に応用したら、面白いことができるんじゃないかと思ってます。",
    expect: { japanese: true, onTopic: true, concrete: true, reason: true },
    must: ["concrete", "reason"],
  },
  {
    name: "訴え2 強み＋使いみち",
    say: "私のいいところはコミュニケーション力が高いところです。え、客先で働く時に、コミュニケーションをお客さんととって、確実な要件定義をしてアプリケーションが作れたらいいなと思ってます。",
    atAsk: 2,
    expect: { japanese: true, onTopic: true, reason: true },
    must: ["reason"],
  },

  /* ---- りゆうの 言い方を 変えて 測る（ここが いちばん ずれた） ---- */
  {
    name: "りゆう「から」（教科書どおり）",
    say: "観光DXが いいと 思いました。まちを あるいて みたいからです。",
    expect: { japanese: true, onTopic: true, concrete: true, reason: true },
    must: ["reason"],
  },
  {
    name: "りゆう「ので」",
    say: "NMClaw が いいと 思いました。話すだけで まとまるので、しごとが 早く なります。",
    expect: { japanese: true, onTopic: true, concrete: true, reason: true },
    must: ["reason"],
  },
  {
    name: "りゆう「〜で」（接続助詞・訴え1と 同じ 型）",
    say: "セキュリティドローンが 新しくて いいと 思いました。",
    expect: { japanese: true, onTopic: true, concrete: true, reason: true },
  },
  {
    name: "りゆう「〜たら…できる」（見通し）",
    say: "Verify を つかったら、お客さまが あんしんできると 思いました。",
    expect: { japanese: true, onTopic: true, concrete: true, reason: true },
  },
  {
    name: "りゆう なし（サービス名だけ）",
    say: "観光DXが いいと 思いました。",
    expect: { japanese: true, onTopic: true, concrete: true, reason: false },
    must: ["concrete"],
  },

  /* ---- 会社の 中身の 端（何を concrete と 数えるか） ---- */
  {
    name: "会社の 中身: お客さまの 名前",
    say: "徳島県の 三好市の しごとを して いるのが いいと 思いました。役所とも はたらけるからです。",
    expect: { japanese: true, onTopic: true, concrete: true, reason: true },
  },
  {
    name: "会社の 中身: プログラムの 名前",
    say: "Japanese IT Pathway が いいと 思いました。私たちの プログラムだからです。",
    expect: { japanese: true, onTopic: true, concrete: true, reason: true },
    must: ["concrete"],
  },
  {
    name: "会社の 中身 なし（気もちだけ）",
    say: "とても おもしろいと 思いました。すごいです。",
    expect: { japanese: true, onTopic: true, concrete: false },
    must: ["concrete"],
  },
  {
    name: "ほめただけ（中身も りゆうも 無い）",
    say: "いい 会社ですね。",
    expect: { japanese: true, concrete: false, reason: false },
    must: ["concrete"],
  },

  /* ---- ことばの 端 ---- */
  {
    name: "英語だけ",
    say: "I think this company is very interesting.",
    expect: { japanese: false },
    must: ["japanese"],
  },
  {
    name: "日本語と 英語の まじり",
    say: "私は NMClaw が interesting だと 思いました。",
    expect: { onTopic: true },
  },
  {
    name: "ていねいで ない 言い方",
    say: "観光DXが いいと 思う。まちを あるきたいから。",
    expect: { japanese: true, concrete: true, polite: false },
  },
  {
    name: "ひとことだけ",
    say: "はい。",
    expect: { japanese: true, concrete: false, reason: false },
  },
  {
    name: "かみ合って いない（聞かれて いない ことを 話す）",
    say: "きのう ともだちと ごはんを 食べました。とても おいしかったです。",
    expect: { japanese: true, onTopic: false, concrete: false },
  },

  /* ---- 聞く ばん（学習者が しつもんする） ---- */
  {
    name: "聞く ばん: 本人にしか 聞けない しつもん",
    say: "どうして この 会社を 作りましたか。",
    listen: true,
    expect: { japanese: true, question: true, concrete: true },
    must: ["question"],
  },
  {
    name: "聞く ばん: ばくぜんと した ひとこと",
    say: "がんばって ください。",
    listen: true,
    expect: { japanese: true, question: false },
    must: ["question"],
  },
];

/** 画面の 板から 観点を 読む。板に 出て いない 観点は undefined。 */
async function readKanten(page: Page) {
  const rows = page.locator("[data-kanten]");
  const seen: Partial<Record<Kanten, boolean>> = {};
  for (let at = 0; at < (await rows.count()); at += 1) {
    const row = rows.nth(at);
    const key = (await row.getAttribute("data-kanten")) as Kanten | null;
    if (key) seen[key] = (await row.getAttribute("data-on")) === "true";
  }
  return seen;
}

/** 1回 答えて 板を 出す。 */
async function answer(page: Page, say: string) {
  await page.getByLabel("文字で 答える").fill(say);
  await page.getByRole("button", { name: "おくる" }).click();
  await expect(page.getByText(/^こうかんど \+\d+%$/)).toBeVisible({ timeout: 45_000 });
}

/** 板を 閉じて つぎの しつもんまで 進む。 */
async function toNextAsk(page: Page) {
  await page.getByRole("button", { name: "つぎへ ▶" }).click();
  await readOn(page);
}

test.describe("採点の ものさし", () => {
  for (const one of CASES) {
    test(`差分: ${one.name}`, async ({ page, context }) => {
      const key = evalKey();
      test.skip(key === "", NO_KEY_HINT);

      await seedGeminiKey(context, key);
      await seedCompleted(context, itemsBefore(KAISHA.meetingMatsui));
      await page.goto(KAISHA.meetingMatsui.path);
      await page.getByRole("button", { name: "はじめる ▶" }).click();
      await readOn(page);

      if (one.listen) {
        /*
         * 聞く ばんまで 進める。好感度が 入口（60%）に とどく か、出だしの しつもんを
         * 使いきると 変わる——**回数を 決め打ちに しない**（`applyTurn` が 決める）。
         */
        for (let at = 0; at < 8; at += 1) {
          if ((await page.getByText("あなたが きく ばんです").count()) > 0) break;
          await answer(page, "観光DXが いいと 思いました。まちを あるきたいからです。");
          await toNextAsk(page);
        }
        await expect(page.getByText("あなたが きく ばんです")).toBeVisible();
      } else {
        for (let at = 1; at < (one.atAsk ?? 1); at += 1) {
          await answer(page, "はい、見ました。");
          await toNextAsk(page);
        }
      }

      const ask = (await page.locator("[data-ask]").innerText()).trim();
      await answer(page, one.say);

      /*
       * AIに 通せない ときの 板は 端末の 規則の 結果。**差分としては 数えない**
       *（数えると「AIが まちがえた」ことに なって しまう）。
       */
      if ((await page.getByText("みて いない ところです").count()) > 0) {
        writeEvalRow({ name: one.name, ask, gained: "-", diffs: [], checked: 0, skipped: true });
        test.skip(true, "AIに 通せませんでした（規則ベースの 板）");
      }

      const got = await readKanten(page);
      const gained = (await page.getByText(/^こうかんど \+\d+%$/).innerText()).trim();
      const diffs: string[] = [];
      for (const [k, want] of Object.entries(one.expect) as [Kanten, boolean][]) {
        if (got[k] !== want) diffs.push(`${k}: 期待=${want} 返答=${got[k]}`);
      }
      writeEvalRow({
        name: one.name,
        ask,
        gained,
        diffs,
        checked: Object.keys(one.expect).length,
      });
      console.log(
        `[eval] ${one.name} | ${gained} | ずれ ${diffs.length}/${Object.keys(one.expect).length}` +
          (diffs.length > 0 ? ` | ${diffs.join(" / ")}` : ""),
      );

      for (const k of one.must ?? []) {
        expect(got[k], `${one.name} の ${k}（期待 ${one.expect[k]}）`).toBe(one.expect[k]);
      }
    });
  }
});

/**
 * 会話の 流れ — **判定の あと、社長は まず 返事を してから つぎを 聞く**
 *
 * 2026-08-31 の 訴え「判定画面ですぐに次の質問に行ってしまう」の 直しが 生きて いるか。
 */
test("流れ: 判定 → 社長の 返事 → つぎの しつもん", async ({ page, context }) => {
  const key = evalKey();
  test.skip(key === "", NO_KEY_HINT);

  await seedGeminiKey(context, key);
  await seedCompleted(context, itemsBefore(KAISHA.meetingMatsui));
  await page.goto(KAISHA.meetingMatsui.path);
  await page.getByRole("button", { name: "はじめる ▶" }).click();
  await readOn(page);

  const first = (await page.locator("[data-ask]").innerText()).trim();
  await answer(page, "観光DXが おもしろいと 思いました。まちを あるいて みたいからです。");

  // ①板を 閉じた つぎは **答える 欄では ない**（社長が まず 返事を する）
  await page.getByRole("button", { name: "つぎへ ▶" }).click();
  await expect(page.getByLabel("文字で 答える")).toHaveCount(0);
  /*
   * **`data-line` で 引く。** 一度 `p.text-navy` の 先頭を 取って いて、ステージの
   * 見出し（「会社を 知る」）を 社長の 返事として 記録して いた——通って いるのに
   * 中身が ちがう、いちばん たちの 悪い 測りかた だった（2026-09-01）。
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

  // ③2問目は 準備フォームの ②（前置きつき）。唐突に ならない
  expect(second).toContain("あなたの ことも");
});
