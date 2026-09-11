import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  bareKanjiTexts,
  itemsBefore,
  KAISHA,
  SHIGOTO,
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
  { name: "ステージのトップ（しごと）", path: "/shigoto", open: SHIGOTO.listening },
  { name: "ページ（仕事の 3つの タイプ）", path: SHIGOTO.article.path, open: SHIGOTO.article },
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

/**
 * **漢字の 名前の 相手**の ミーティングも 見る（2026-09-09）。
 *
 * 上の 1本は ヘンディさん——**カタカナの 名前**なので、画面が 名前を ルビに
 * 通して いなくても 裸の漢字が 出ない。夕礼で 富田さんを 相手に した とたん、
 * 好感度メーター・判定ポップアップ・修了証の 3か所で 漢字が 裸に なった。
 * 名前は データから 来る ので、**漢字の 名前を 1本 通して おかないと 見張れない**。
 */
test("ミーティングの 中（漢字の 名前の 相手）にも 裸の漢字が 無い", async ({ page, context }) => {
  const stage = JSON.parse(
    readFileSync(join(__dirname, "..", "..", "content", "stages", "asakai.json"), "utf8"),
  ) as { contents: { ref: string }[] };
  const refs = stage.contents.map((item) => item.ref);
  const at = refs.indexOf("asakai_muzukashii");
  expect(at, "夕礼の ミーティングが 朝礼・夕礼ステージに ある").toBeGreaterThan(0);

  /*
   * 手前を **1本 残して** 開く。ぜんぶ 埋めると ステージが クリアに なり、
   * 「ステージ クリア」の 板が ロビーの ボタンを 覆う（夕礼は `gates: false` なので
   * 手前が ぜんぶ 済んだ 時点で ステージが おわった ことに なる）。
   */
  await seedCompleted(context, refs.slice(0, at - 1));
  await page.goto("/asakai/meeting-asakai_muzukashii");
  await joinCall(page);

  const bare = await bareKanjiTexts(page);
  expect(bare.filter((text) => !KNOWN_BARE_KANJI.includes(text))).toEqual([]);
});

/**
 * クエストの **ログの 箱**も 見る（2026-09-11）。
 *
 * ログは 教材の 字（`option.resultText`）と 画面の 字（コードが 組み立てる 文）が
 * 同じ 箱に 並ぶ 唯一の 場所で、**どの 機械検査にも かかって いなかった**——
 * `lint:content` が 見るのは 教材データだけ（コードが 組み立てる 文は 対象外）で、
 * 上の SCREENS にも クエストが 無かった。その 穴で 「【警告】N個の…」の
 * 警・告・個 が 裸の まま 出て いた。
 *
 * **読みの まちがい（うえがった）は ここでは 見つからない。** この 検査は
 * `<ruby>` の 外の 漢字しか 数えないので、まちがった ルビは 素通りする。
 * そちらは `tests/quest_log_ruby.test.tsx` が 画面の 部品を そのまま 描いて 見張る。
 *
 * ログの 文そのものは `tests/quest_log.test.ts` が 9つの 型を ぜんぶ 固定する
 *（レベルアップと 爆発は 第8章まで 遊ばないと 出ない ので、ここでは 出せない）。
 * ここが 見るのは **画面が 自分で 出す ことば**——札・見出し・解説・3つの しらべる 窓。
 */
test("クエストの 中（ログが 出た あと）にも 裸の漢字が 無い", async ({ page }) => {
  const noBareKanji = async (where: string) => {
    const bare = await bareKanjiTexts(page);
    expect(
      bare.filter((text) => !KNOWN_BARE_KANJI.includes(text)),
      where,
    ).toEqual([]);
  };

  await page.goto("/kaihatsu/quest");
  /*
   * 名簿の ひとことは **通信が 返って から** 出る（`quest-setup.tsx` の `loading`）。
   * 待たずに 数えると 6回に 5回は まだ 画面に 無く、検査が 空振りする
   *（2026-09-11 の 検収で 実測）。出るまで 待って から 数える。
   */
  await expect(page.getByText(/名簿/)).toBeVisible();
  await noBareKanji("タイトル");

  await page.locator('[data-quest="start"]').click();
  await expect(page.locator('[data-quest="log"]')).toBeVisible();
  await noBareKanji("はじめの 1行");

  // 会話を 送って 4択を 出す（場面の 頭の セリフの 本数は 場面ごとに ちがう）
  for (let i = 0; i < 8; i += 1) {
    if (await page.locator('[data-quest="option"]').count()) break;
    await page.locator('[data-quest="next"]').first().click();
  }
  await expect(page.locator('[data-quest="option"]').first()).toBeVisible();
  await noBareKanji("4択");

  // 1手 打つと ログに 行が 積まれ、解説の 窓が 出る
  await page.locator('[data-quest="option"]').first().click();
  await expect(page.locator('[data-quest="next"]').first()).toBeVisible();
  await noBareKanji("1手 打った あと");

  for (const modal of ["history", "story", "process"] as const) {
    await page.locator(`[data-quest="${modal}"]`).click();
    await expect(page.locator('[data-quest="modal"]')).toBeVisible();
    await noBareKanji(`しらべる 窓（${modal}）`);
    await page.getByRole("button", { name: "とじる" }).click();
  }
});
