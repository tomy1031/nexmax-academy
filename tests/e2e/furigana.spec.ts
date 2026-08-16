import { expect, test } from "@playwright/test";
import { bareKanjiTexts, itemsBefore, KAISHA, knock, seedCompleted } from "./helpers";

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
  // src/components/article/article-view.tsx — ことばチップの 見出し
  "ことば — タップ すると いみが 出るよ",
  // src/components/call-shell.tsx — 通話の 人数
  "人が さんかちゅう",
  // src/components/meeting/meeting-session.tsx — 声で 話す ボタン
  "🎤 声で 話す",
  // src/components/stage/content-frame.tsx — 関門の 逃げ道
  "それでも 見る",
];

/** 学習者が いちばん 長く 見る 画面。ここが 覆えていれば 授業は 成り立つ。 */
const SCREENS: readonly { name: string; path: string; before: number }[] = [
  { name: "ステージのトップ", path: "/kaisha", before: 0 },
  { name: "よみもの（しらべかた）", path: KAISHA.article1.path, before: 0 },
  { name: "もんだい（かくにん）", path: KAISHA.quiz1.path, before: 1 },
  { name: "よみもの（ネクストメイク）", path: KAISHA.article2.path, before: 2 },
  { name: "もんだい（ほうこく）", path: KAISHA.quiz2.path, before: 3 },
  { name: "ミーティング（ヘンディ）", path: KAISHA.meetingHendy.path, before: 4 },
  { name: "ミーティング（松井社長）", path: KAISHA.meetingMatsui.path, before: 5 },
];

for (const screen of SCREENS) {
  test(`ルビの 外に 裸の漢字が 無い — ${screen.name}`, async ({ page, context }) => {
    await seedCompleted(context, itemsBefore(screen.before));
    await page.goto(screen.path);

    const bare = await bareKanjiTexts(page);
    expect(bare.filter((text) => !KNOWN_BARE_KANJI.includes(text))).toEqual([]);
  });
}

test("ミーティングの 中（入室後・答える前）にも 裸の漢字が 無い", async ({ page, context }) => {
  await seedCompleted(context, itemsBefore(4));
  await page.goto(KAISHA.meetingHendy.path);
  await knock(page);

  const bare = await bareKanjiTexts(page);
  expect(bare.filter((text) => !KNOWN_BARE_KANJI.includes(text))).toEqual([]);
});
