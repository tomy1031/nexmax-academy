import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NO_EDITOR_DIRS, noEditorMessage, type NoEditorType } from "@/components/studio/no-editor";
import { contentKindMeta } from "@/lib/content-kinds";

/**
 * スタジオに まだ エディタが 無い 種別の「✎ ひらく」。
 *
 * 2026-09-30 まで スキット・クエスト・リンク・タイピングの 行は 押しても 何も
 * 起きなかった（openContent の switch に case が 無かった）。たいわと 同じく、
 * 開けない 理由と 直す 場所（content/ の JSON）を 出す。
 */

const TYPES = Object.keys(NO_EDITOR_DIRS) as NoEditorType[];

describe("エディタが 無い 種別の 知らせ", () => {
  it("スキット・クエスト・リンク・タイピング・たいわ の 5つ", () => {
    expect([...TYPES].sort()).toEqual(["link", "quest", "scenario", "skit", "typing"]);
  });

  it("たいわの 文は これまでと 1字も 変わらない", () => {
    expect(noEditorMessage("scenario")).toBe(
      "たいわは まだ スタジオで 直せません（content/scenarios の JSON で 作ります）。",
    );
  });

  it.each([
    ["skit", "スキット", "content/skits"],
    ["quest", "クエスト", "content/quests"],
    ["link", "リンク", "content/links"],
    ["typing", "タイピング", "content/typing"],
  ] as const)("%s は 呼び名と 置き場を 言う", (type, label, dir) => {
    expect(contentKindMeta(type).label).toBe(label);
    expect(noEditorMessage(type)).toBe(
      `${label}は まだ スタジオで 直せません（${dir} の JSON で 作ります）。`,
    );
  });

  it.each(TYPES)("%s の 置き場は 本当に ある（JSON が 入っている）", (type) => {
    const dir = join("content", NO_EDITOR_DIRS[type]);
    expect(existsSync(dir) && statSync(dir).isDirectory(), dir).toBe(true);
    expect(
      readdirSync(dir).some((name) => name.endsWith(".json")),
      dir,
    ).toBe(true);
  });
});
