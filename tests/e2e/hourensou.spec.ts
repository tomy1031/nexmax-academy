import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { bareKanjiTexts, seedCompleted, shot } from "./helpers";

/**
 * 報連相の3ステージ（報告・連絡・相談）を 学習者と 同じ 道で 通す
 *
 * 旧アプリ（nextmake_onbording）からの 移植ぶん。見張るのは 3つ:
 *
 *  1. **5つの 種別が どれも 開く**（よみもの・スキット・リスニング・もんだい・リンク）。
 *     とくに **スキットは 新しい 種別**なので、ルート・ローダ・部品の どれかが
 *     つながって いないと ここで 404 に なる。
 *  2. **スキットの 行に 音が ついて いる**。音は 別の スクリプトが 作る ので、
 *     作り忘れると 教材データだけが 音を 指した 状態に なる——画面は 読み上げに
 *     落ちて 動くので、**通しでは 気づけない** 種類の 抜けである。
 *  3. **裸の 漢字が 出て いない**（規律2）。`lint:content` は データを 見るが、
 *     こちらは **実際に 描かれた 画面**を 見る。
 */

/** ステージの 中身は 教材データから 読む（画面の 並びを 決め打ちしない）。 */
function stage(id: string): { contents: { ref: string; type: string }[] } {
  return JSON.parse(readFileSync(join("content", "stages", `${id}.json`), "utf8"));
}

function skit(id: string): { lines: { speaker: string; text: string; audioUrl?: string }[] } {
  return JSON.parse(readFileSync(join("content", "skits", `${id}.json`), "utf8"));
}

const STAGES = [
  { id: "houkoku", title: "報告", skitId: "houkoku_skit" },
  { id: "renraku", title: "連絡", skitId: "renraku_skit" },
  { id: "soudan", title: "相談", skitId: "soudan_skit" },
] as const;

/**
 * ステージの中の教材のURL（`src/lib/stage-routes.ts` と 同じ 規則）。
 * 同じ 種別が 2つ以上 ある ときだけ ID を 足す。
 */
const SEGMENT: Record<string, string> = {
  article: "article",
  skit: "skit",
  listening: "listening",
  quizset: "quiz",
  link: "link",
};

function pathsOf(stageId: string): { ref: string; type: string; path: string }[] {
  const contents = stage(stageId).contents;
  return contents.map((item) => {
    const seg = SEGMENT[item.type];
    const many = contents.filter((c) => c.type === item.type).length > 1;
    return { ...item, path: `/${stageId}/${many ? `${seg}-${item.ref}` : seg}` };
  });
}

/**
 * **共有の 画面部品が 前から 持って いる 裸の 漢字**（この 移植とは 別の 話）。
 *
 * どれも 教材データでは なく 部品の 中に 直に 書かれた 文で、報連相の 前から
 * どの ステージでも 同じように 出て いる。ここで 一緒に 落とすと、
 * **自分の 教材の 抜けと 見分けが つかなく なる**ので、名ざしで 外しておく。
 * 直すのは 部品の 側（＝別のタスク）:
 *  - `src/components/stage/content-frame.tsx`（関門の 板）
 *  - `src/components/listening/playback-mode.tsx`（聞く 前の 案内）
 */
const KNOWN_BARE_UI: readonly string[] = [
  "それでも 見る",
  "👂 ここに 注目して 聞きます",
  "音を 聞いて、聞こえた ことばを 入れます。",
  "ぜんぶ 分からなくて だいじょうぶです。分かった ところから 入れてください。",
];

/** 404 を 静かに 見のがさない（ISR の 404 も 200 では 返らない）。 */
async function open(page: Page, path: string) {
  const res = await page.goto(path);
  expect(res?.status(), `${path} が ひらけない`).toBeLessThan(400);
}

for (const { id, title, skitId } of STAGES) {
  test(`報連相：${title} — ステージの 教材が ぜんぶ ひらく`, async ({ page }) => {
    await open(page, `/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("報連相");
    await shot(page, `hourensou-${id}-stage`);

    for (const item of pathsOf(id)) {
      await open(page, item.path);
      // 中身が 出て いるか（空の 枠だけが 出る 壊れ方を 弾く）
      await expect(page.getByRole("heading").first()).toBeVisible();
      // 絵の 置き場が 空の ままに なって いない（旧アプリの 当て絵が ぜんぶ 入って いる）
      await expect(page.locator('[data-slot="empty"]')).toHaveCount(0);
    }
  });

  test(`報連相：${title} — スキットが 鳴らせる`, async ({ page }) => {
    const data = skit(skitId);
    await open(page, `/${id}/skit`);

    /*
     * セリフが ぜんぶ 画面に 出て いるか。**文字列では 探さない**——ルビが 合成されると
     * 1つの 文が `<ruby>` で いくつにも 割れる ので、文まるごとの 一致は 当たらない。
     * 行の 数で 見る（1行でも 落ちたら まねる 練習に ならない）。
     */
    await expect(page.locator('[data-skit="lines"] > li')).toHaveCount(data.lines.length);

    // ト書き 以外の 行の 数だけ スピーカーが ある
    const spoken = data.lines.filter((line) => line.speaker !== "narration").length;
    await expect(page.getByRole("button", { name: "聞く" })).toHaveCount(spoken);

    // 音の ファイルが 本当に 置いて あるか（データだけが 指して いる 状態を 弾く）
    for (const line of data.lines) {
      if (!line.audioUrl) continue;
      const res = await page.request.get(line.audioUrl);
      expect(res.status(), `${line.audioUrl} が 無い`).toBe(200);
    }

    await shot(page, `hourensou-${id}-skit`);
  });

  test(`報連相：${title} — 裸の 漢字が 出て いない`, async ({ page, context }) => {
    /*
     * **順に 進んだ 学習者**として 見る。関門（🔒）が 閉じたままだと、教材の 代わりに
     * 枠の「まだ ひらけません」の 板が 出て、見たい ものが 1文字も 画面に 無い。
     */
    await seedCompleted(
      context,
      pathsOf(id).map((item) => item.ref),
    );
    for (const item of pathsOf(id)) {
      // リンク教材の 中身（iframe）は 旧アプリの ページなので この 検査の 外
      if (item.type === "link") continue;
      await open(page, item.path);
      const bare = (await bareKanjiTexts(page)).filter((text) => !KNOWN_BARE_UI.includes(text));
      expect(bare, `${item.path} に 裸の 漢字`).toEqual([]);
    }
  });
}
