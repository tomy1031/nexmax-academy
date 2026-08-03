import { describe, expect, it } from "vitest";
import { contentSchema } from "@/content/schema";
import {
  emptyArticleBlock,
  emptyManga,
  emptyMangaPanel,
  emptyStage,
} from "@/components/studio/drafts";
import { describePath, messageForReason } from "@/components/studio/issue-text";
import { appendItem, moveItem, removeAt, replaceAt } from "@/components/studio/list-ops";

/**
 * スタジオのエディタが依存する純粋ロジックの検査。
 * 並べ替えは学習順そのもの（設計07 §3）なので、端での操作で壊れないことを確かめる。
 */

describe("list-ops", () => {
  const items = ["a", "b", "c"];

  it("上へ・下へで隣と入れ替わる", () => {
    expect(moveItem(items, 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(items, 1, 1)).toEqual(["a", "c", "b"]);
  });

  it("端をこえる指定では何も動かない", () => {
    expect(moveItem(items, 0, -1)).toEqual(items);
    expect(moveItem(items, 2, 1)).toEqual(items);
    expect(moveItem(items, 9, -1)).toEqual(items);
  });

  it("元の配列を書き換えない", () => {
    moveItem(items, 0, 1);
    removeAt(items, 0);
    replaceAt(items, 0, "z");
    expect(items).toEqual(["a", "b", "c"]);
  });

  it("消す・差し替える・足す", () => {
    expect(removeAt(items, 1)).toEqual(["a", "c"]);
    expect(replaceAt(items, 1, "z")).toEqual(["a", "z", "c"]);
    expect(appendItem(items, "d")).toEqual(["a", "b", "c", "d"]);
  });
});

describe("issue-text", () => {
  it("zodのパスを先生に読める場所名にする", () => {
    expect(describePath("pages.0.panels.1.lines.0.text")).toBe(
      "ページ 1番目 › コマ 2番目 › セリフ 1番目 › 本文",
    );
    expect(describePath("contents.2.ref")).toBe("コンテンツ 3番目 › 参照先のID");
    expect(describePath("")).toBe("ぜんたい");
  });

  it("APIのreasonを日本語の説明にする", () => {
    expect(messageForReason("forbidden")).toContain("先生");
    expect(messageForReason("notConfigured")).toContain("データベース");
    expect(messageForReason("なぞ")).toContain("もう一度");
  });
});

describe("drafts", () => {
  it("空のステージは kind と既定値がそろっている（中身は先生が埋める）", () => {
    const stage = emptyStage();
    expect(stage.kind).toBe("stage");
    expect(stage.status).toBe("draft");
    expect(stage.contents).toEqual([]);
    // 空のままでは保存の検査で止まる = 意図どおり
    expect(contentSchema.safeParse(stage).success).toBe(false);
  });

  it("空の漫画は1ページ1コマから始まる", () => {
    const manga = emptyManga();
    expect(manga.pages).toHaveLength(1);
    expect(manga.pages[0]?.panels).toHaveLength(1);
    expect(emptyMangaPanel().image.status).toBe("empty");
  });

  it("記事のブロックはどの種類でもスキーマに通る形で生まれる", () => {
    const kinds = ["heading", "paragraph", "image", "callout", "list", "steps", "vocab"] as const;
    for (const kind of kinds) {
      const article = {
        kind: "article",
        id: "draft-check",
        title: "たしかめ",
        description: "エディタの初期値の検査",
        blocks: [emptyArticleBlock(kind)],
      };
      const parsed = contentSchema.safeParse(article);
      expect(parsed.success, `${kind} が通らない`).toBe(true);
    }
  });
});
