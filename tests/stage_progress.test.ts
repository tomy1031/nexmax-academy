import { describe, expect, it } from "vitest";
import {
  CONTENT_KIND_META,
  contentHref,
  decodeStatuses,
  statusCode,
  summarizeStageProgress,
  type ContentStatusCode,
} from "@/components/stage/stage-progress";
import { CONTENT_REF_TYPES } from "@/content/schema";

const codes = (key: string): ContentStatusCode[] => decodeStatuses(key);

describe("contentHref", () => {
  it("種別ごとに決められたルートへ向ける", () => {
    expect(contentHref("manga", "m2-asakai-manga")).toBe("/manga/m2-asakai-manga");
    expect(contentHref("article", "m2-asakai-article")).toBe("/article/m2-asakai-article");
    expect(contentHref("meeting", "m2-asakai-meeting")).toBe("/meeting/m2-asakai-meeting");
    expect(contentHref("quizset", "m2-asakai-quiz")).toBe("/quiz/m2-asakai-quiz");
    expect(contentHref("scenario", "s1-hearing")).toBe("/meeting/live/s1-hearing");
    expect(contentHref("wordstage", "stage12_asakai")).toBe("/arcade/stage12_asakai");
  });

  it("スキーマの全種別に見た目と行き先がある", () => {
    for (const type of CONTENT_REF_TYPES) {
      expect(CONTENT_KIND_META[type].icon.length).toBeGreaterThan(0);
      expect(contentHref(type, "x")).toMatch(/^\/[a-z/]+\/x$/);
    }
  });
});

describe("statusCode", () => {
  it("進捗なし・とちゅう・おわった を1文字に畳む", () => {
    expect(statusCode(null)).toBe("0");
    expect(statusCode(undefined)).toBe("0");
    expect(statusCode({ status: "started" })).toBe("1");
    expect(statusCode({ status: "completed" })).toBe("2");
  });

  it("decodeStatuses は知らない文字を未着手として読む", () => {
    expect(decodeStatuses("021x")).toEqual(["0", "2", "1", "0"]);
  });
});

describe("summarizeStageProgress", () => {
  it("最初の「まだ おわっていない」コンテンツを次の行き先にする", () => {
    const summary = summarizeStageProgress(codes("2200"));
    expect(summary).toMatchObject({ done: 2, total: 4, percent: 50, nextIndex: 2, allDone: false });
  });

  it("とちゅうのものは「おわった」に数えず、そこへ戻す", () => {
    const summary = summarizeStageProgress(codes("2120"));
    expect(summary.done).toBe(2);
    expect(summary.nextIndex).toBe(1);
    expect(summary.allDone).toBe(false);
  });

  it("順番どおりでなくても、前に残った未完了を先に指す", () => {
    expect(summarizeStageProgress(codes("0222")).nextIndex).toBe(0);
  });

  it("全部おわったら先頭に戻す（もういちど 見る）", () => {
    const summary = summarizeStageProgress(codes("2222"));
    expect(summary).toMatchObject({ done: 4, total: 4, percent: 100, nextIndex: 0, allDone: true });
  });

  it("コンテンツが1つも解決できないときは行き先を持たない", () => {
    expect(summarizeStageProgress([])).toMatchObject({
      done: 0,
      total: 0,
      percent: 0,
      nextIndex: -1,
      allDone: false,
    });
  });

  it("割り切れない割合は四捨五入する", () => {
    expect(summarizeStageProgress(codes("200")).percent).toBe(33);
  });
});
