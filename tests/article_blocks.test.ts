import { describe, expect, it } from "vitest";
import type { ArticleBlock } from "@/content/schema";
import {
  collectHeadings,
  contentHref,
  contentKindLabel,
  headingId,
  joinItemsForSpeech,
  shouldShowToc,
  tocHeadings,
} from "@/components/article/article-blocks";

describe("contentHref", () => {
  it("種別ごとに決まったルートへ飛ばす", () => {
    expect(contentHref("manga", "m2-asakai")).toBe("/manga/m2-asakai");
    expect(contentHref("article", "m2-asakai")).toBe("/article/m2-asakai");
    expect(contentHref("listening", "m2-asakai")).toBe("/listening/m2-asakai");
    expect(contentHref("quizset", "m2-asakai")).toBe("/quiz/m2-asakai");
    expect(contentHref("wordstage", "m2-asakai")).toBe("/wordtest/m2-asakai");
  });

  it("シナリオはLive対話の入口へ送る（/talk/:id）", () => {
    expect(contentHref("scenario", "cafe")).toBe("/talk/cafe");
  });
});

describe("contentKindLabel", () => {
  it("学習者向けの呼び名を返す", () => {
    expect(contentKindLabel("quizset").name).toBe("もんだい");
    expect(contentKindLabel("manga").emoji).toBe("📖");
  });
});

describe("headingId", () => {
  it("記事IDを前に付けて、同じ画面に2記事あってもぶつからない", () => {
    expect(headingId("a1", 3)).toBe("a1-h3");
    expect(headingId("a2", 3)).not.toBe(headingId("a1", 3));
  });
});

const heading = (level: 2 | 3, text: string): ArticleBlock => ({ kind: "heading", level, text });
const paragraph = (text: string): ArticleBlock => ({ kind: "paragraph", text });

describe("collectHeadings", () => {
  it("heading だけを、blocks 内の位置つきで拾う", () => {
    const blocks: ArticleBlock[] = [
      paragraph("はじめに"),
      heading(2, "あさの ながれ"),
      paragraph("ほんぶん"),
      heading(3, "きを つけること"),
    ];

    expect(collectHeadings(blocks)).toEqual([
      { index: 1, level: 2, text: "あさの ながれ" },
      { index: 3, level: 3, text: "きを つけること" },
    ]);
  });

  it("見出しが無ければ空", () => {
    expect(collectHeadings([paragraph("ほんぶん")])).toEqual([]);
  });
});

describe("shouldShowToc", () => {
  it("見出しが3つ以上のときだけ目次を出す", () => {
    const headings = [heading(2, "い"), heading(2, "ろ"), heading(2, "は")];
    expect(shouldShowToc(collectHeadings(headings.slice(0, 2)))).toBe(false);
    expect(shouldShowToc(collectHeadings(headings))).toBe(true);
  });
});

describe("tocHeadings", () => {
  it("番号の ある 見出しが あれば、番号の ある 行だけを 目次に 並べる（2026-09-15 の 指定）", () => {
    const entries = collectHeadings([
      heading(2, "1．朝礼って 何？"),
      heading(3, "仕事を 始める 前に、チームで 報告します"),
      heading(2, "2．朝礼の 報告は 4つです"),
      heading(3, "✅ 問題を 話す ときは、3つ 考えます"),
      heading(2, "10. さいごに"),
    ]);
    expect(tocHeadings(entries).map((entry) => entry.text)).toEqual([
      "1．朝礼って 何？",
      "2．朝礼の 報告は 4つです",
      "10. さいごに",
    ]);
  });

  it("番号の 無い ページは これまでどおり 全部 並べる", () => {
    const entries = collectHeadings([
      heading(2, "相談の テクニック"),
      heading(3, "ポイント①：30分ルール"),
      heading(2, "やって みよう"),
    ]);
    expect(tocHeadings(entries)).toEqual(entries);
  });
});

describe("joinItemsForSpeech", () => {
  it("かじょうがきを 1本の文に つないで 読ませる（項目ごとに 🔊 を 置かない）", () => {
    expect(joinItemsForSpeech(["受託開発", "自社開発"])).toBe("受託開発。自社開発。");
  });

  it("もともと 句点が ある項目でも 二重に しない", () => {
    expect(joinItemsForSpeech(["お客さまの ものを 作ります。", "じぶんの ものを 作ります"])).toBe(
      "お客さまの ものを 作ります。じぶんの ものを 作ります。",
    );
  });

  it("空の項目は 読まない（無音の 間が できない）", () => {
    expect(joinItemsForSpeech(["  ", "みる"])).toBe("みる。");
  });
});
