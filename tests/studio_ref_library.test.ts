import { describe, expect, it, vi } from "vitest";
import { CONTENT_REF_TYPES } from "@/content/schema";
import { buildRefLibrary, type RefSources } from "@/components/studio/ref-library";

/**
 * ステージ編集の「もう ある 教材」一覧（`studio-shell` の library／knownIds の 元）。
 *
 * 2026-09-30 まで この一覧は 種別を 手で 並べて いて、あとから 足した
 * スキット・クエスト・リンク・タイピングが 入って いなかった。そのため ステージの
 * ながれで それらが「まだ ほぞんして いません — 学習者には 出ません。」と 出ていた
 *（実際は 学習者に 出ている）。先生は 出ている 教材を 何度も 保存し直すことになる。
 */

vi.mock("@/lib/env", () => ({ getSupabasePublicConfig: () => null }));

const { loadStudioData } = await import("@/lib/studio-data");

/** スタジオが サーバから 受け取る 一覧を、種別ごとに 並べ直す。 */
function sourcesOf(data: Awaited<ReturnType<typeof loadStudioData>>): RefSources {
  return {
    manga: data.mangas,
    article: data.articles,
    slides: data.slides,
    listening: data.listenings,
    quizset: data.quizSets,
    scenario: data.scenarios,
    meeting: data.meetings,
    wordstage: data.wordStages,
    link: data.links,
    skit: data.skits,
    quest: data.quests,
    typing: data.typings,
  };
}

describe("buildRefLibrary", () => {
  it("どの 種別も 落とさずに 並べる", () => {
    const sources = Object.fromEntries(
      CONTENT_REF_TYPES.map((type) => [type, [{ id: `x-${type}`, title: type }]]),
    ) as unknown as RefSources;
    const library = buildRefLibrary(sources);
    expect(new Set(library.map((item) => item.type))).toEqual(new Set(CONTENT_REF_TYPES));
    expect(library).toContainEqual({ id: "x-typing", type: "typing", title: "typing" });
  });

  it("単語ステージは 最後に 並べる（「ことばの ゲーム」欄が id だけで 題名を 引くため）", () => {
    const sources = Object.fromEntries(
      CONTENT_REF_TYPES.map((type) => [type, [{ id: "same", title: type }]]),
    ) as unknown as RefSources;
    expect(buildRefLibrary(sources).at(-1)?.type).toBe("wordstage");
  });
});

describe("スタジオに 渡す 教材（git）", () => {
  it("git の ステージが 指す 教材は、種別を 問わず ぜんぶ 一覧に ある", async () => {
    const data = await loadStudioData();
    const library = new Set(
      buildRefLibrary(sourcesOf(data)).map((item) => `${item.type}:${item.id}`),
    );
    const missing = data.stages.flatMap((stage) =>
      stage.contents
        .filter((item) => !library.has(`${item.type}:${item.ref}`))
        .map((item) => `${stage.id} → ${item.type}:${item.ref}`),
    );
    expect(missing).toEqual([]);
  });

  it("報告を 聞く ステージの タイピング5本が 題名つきで 選べる", async () => {
    const data = await loadStudioData();
    const stage = data.stages.find((item) => item.id === "houkoku-kiku");
    const typingRefs = stage?.contents.filter((item) => item.type === "typing") ?? [];
    expect(typingRefs).toHaveLength(5);
    const titles = new Map(
      buildRefLibrary(sourcesOf(data))
        .filter((item) => item.type === "typing")
        .map((item) => [item.id, item.title]),
    );
    for (const item of typingRefs) expect(titles.get(item.ref)).toBeTruthy();
  });

  it("エディタの 無い 種別は 名札（id と 題名）だけを 渡す（本文を 画面へ 積まない）", async () => {
    const data = await loadStudioData();
    for (const items of [data.skits, data.quests, data.links, data.typings]) {
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) expect(Object.keys(item).sort()).toEqual(["id", "title"]);
    }
  });
});
