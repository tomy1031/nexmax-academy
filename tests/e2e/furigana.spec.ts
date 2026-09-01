import { expect, test } from "@playwright/test";
import {
  bareKanjiTexts,
  itemsBefore,
  KAISHA,
  joinCall,
  readOn,
  seedCompleted,
  type KaishaItem,
} from "./helpers";

/**
 * ふりがなの 覆い（規律2）を **実画面で** 見張る
 *
 * `npm run lint:content` は 教材データ（JSON）の 読み辞書を 検査するが、
 * **画面が 自分で 出す 文字**（ボタン・見出し・見守りの ひとこと）は 通らない。
 * ここは 出来上がった 画面を 見て、`<ruby>` の 外に 裸の漢字が 増えていないかを 見る。
 *
 * ## いま 覆えていない ところ（既知）
 * 下の一覧は **2026-08-16 に この検査を 入れた 時点で 残っていた** 裸の漢字。
 * 直すか どうかは 画面の 持ち主が 決めることなので、ここでは 数を 増やさない
 * ことだけを 守る。1つ 直したら この一覧からも 1行 消す。
 *
 * ## AIの 返事は 数えない
 * 相手の 返事・助言は その場で 作られる 文なので 読み辞書を 持てない
 *（だから かなだけで 返させている — judge-card.tsx）。答える 前の 画面だけを 見る。
 */
const KNOWN_BARE_KANJI: readonly string[] = [
  // src/components/stage/content-frame.tsx — 関門の 逃げ道
  "それでも 見る",
];

/**
 * 学習者が いちばん 長く 見る 画面。ここが 覆えていれば 授業は 成り立つ。
 *
 * `open` は「その 教材を 開く」ので、関門は その 手前まで 開けて おく。
 * 番号では なく 教材そのもので 書く——番号だと ステージに 1本 足した だけで
 * 全部 ずれる（`itemsBefore` の 覚書）。
 */
const SCREENS: readonly { name: string; path: string; open: KaishaItem }[] = [
  { name: "ステージのトップ", path: "/kaisha", open: KAISHA.article1 },
  { name: "ページ（会社の 調べかた）", path: KAISHA.article1.path, open: KAISHA.article1 },
  { name: "リンク（学習用サイト）", path: KAISHA.site.path, open: KAISHA.site },
  { name: "もんだい（調査シート）", path: KAISHA.sheet.path, open: KAISHA.sheet },
  { name: "ページ（社長と 話す 準備）", path: KAISHA.article2.path, open: KAISHA.article2 },
  { name: "もんだい（社長に 何を 話す）", path: KAISHA.junbi.path, open: KAISHA.junbi },
  { name: "ミーティング（ヘンディ）", path: KAISHA.meetingHendy.path, open: KAISHA.meetingHendy },
  { name: "ミーティング（松井社長）", path: KAISHA.meetingMatsui.path, open: KAISHA.meetingMatsui },
  { name: "ページ（就業形態を 確かめよう）", path: KAISHA.article3.path, open: KAISHA.article3 },
];

for (const screen of SCREENS) {
  test(`ルビの 外に 裸の漢字が 無い — ${screen.name}`, async ({ page, context }) => {
    await seedCompleted(context, itemsBefore(screen.open));
    await page.goto(screen.path);

    const bare = await bareKanjiTexts(page);
    expect(bare.filter((text) => !KNOWN_BARE_KANJI.includes(text))).toEqual([]);
  });
}

/*
 * 見つからなかった ときの 画面（`src/app/not-found.tsx`）。
 * **どの URL からでも 来る**ので、学習者が どの 課に いても 目に 入る。
 * 上の SCREENS と 分けて 書くのは、進み具合の 種まきが 要らないため。
 */
test("ルビの 外に 裸の漢字が 無い — ページが 見つからないとき", async ({ page }) => {
  await page.goto("/kore-wa-nai-page");

  const bare = await bareKanjiTexts(page);
  expect(bare.filter((text) => !KNOWN_BARE_KANJI.includes(text))).toEqual([]);
});

test("ミーティングの 中（入室後・答える前）にも 裸の漢字が 無い", async ({ page, context }) => {
  await seedCompleted(context, itemsBefore(KAISHA.meetingHendy));
  await page.goto(KAISHA.meetingHendy.path);
  await joinCall(page);

  const bare = await bareKanjiTexts(page);
  expect(bare.filter((text) => !KNOWN_BARE_KANJI.includes(text))).toEqual([]);
});

/**
 * 対話ゲーム（松井社長）の 中も 見る（願い #177）。
 *
 * ロビーは 上の SCREENS で 見て いるが、**舞台に 入って からが 本番**——
 * 名前ふだ・役職・セリフ枠・自分の ばんの 見出しは、入る まで 画面に 無い。
 * 答える 前で 止めるのは、AIの 返事を 数えない ため（この ファイル冒頭の 覚書）。
 */
test("対話ゲームの 中（はじめた あと・答える前）にも 裸の漢字が 無い", async ({
  page,
  context,
}) => {
  await seedCompleted(context, itemsBefore(KAISHA.meetingMatsui));
  await page.goto(KAISHA.meetingMatsui.path);
  await page.getByRole("button", { name: "はじめる ▶" }).click();
  await readOn(page);
  await expect(page.getByLabel("文字で 答える")).toBeVisible();

  const bare = await bareKanjiTexts(page);
  expect(bare.filter((text) => !KNOWN_BARE_KANJI.includes(text))).toEqual([]);
});
