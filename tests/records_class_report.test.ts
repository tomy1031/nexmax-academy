import { describe, expect, it } from "vitest";
import { classDateLabel, groupLabel, toClassReportView } from "../src/lib/records/class-report";
import type { ClassReportRow } from "../src/lib/records/records-db";

function row(over: Partial<ClassReportRow> = {}): ClassReportRow {
  return {
    id: "r1",
    class_date: "2026-10-07",
    university: "AUPP",
    cohort: 2,
    students: 21,
    summary: "フォローが要る人は5人。",
    follow_up: [],
    ai_suspects: [],
    stumbles: [],
    next_steps: [],
    source: "scheduled-task",
    updated_at: "2026-10-11T00:00:00Z",
    ...over,
  };
}

describe("授業ごとの回答分析を画面用に整える（要望 #599）", () => {
  it("そろった行はそのまま読む", () => {
    const view = toClassReportView(
      row({
        follow_up: [
          {
            profile_id: "p1",
            name: "セイン",
            reasons: ["初回の点が低い"],
            quotes: ["今、原因調べていますして います。"],
          },
        ],
        ai_suspects: [
          {
            profile_id: "p2",
            name: "スナ",
            quote: "何か間違いがないか確認しています",
            reason: "N3〜N2の文型",
          },
        ],
        stumbles: [
          { title: "ます形に「します」を付ける", detail: "6人", quotes: ["つなぎします"] },
        ],
        next_steps: ["名詞＋します と ます形を並べて見せる"],
      }),
    );
    expect(view.followUp).toEqual([
      {
        profileId: "p1",
        name: "セイン",
        reasons: ["初回の点が低い"],
        quotes: ["今、原因調べていますして います。"],
      },
    ]);
    expect(view.aiSuspects[0]?.name).toBe("スナ");
    expect(view.stumbles[0]?.quotes).toEqual(["つなぎします"]);
    expect(view.nextSteps).toHaveLength(1);
    expect(view.dropped).toBe(0);
  });

  it("形の崩れた項目は捨てて、捨てた数を数える（画面は落とさない）", () => {
    const view = toClassReportView(
      row({
        follow_up: [
          { name: "" },
          "文字列" as never,
          { name: "ピア" },
        ] as ClassReportRow["follow_up"],
        ai_suspects: [{ name: "スナ", quote: "", reason: "x" }],
        stumbles: [{ title: "" }],
        next_steps: ["", "練習する", 3 as never],
      }),
    );
    expect(view.followUp.map((one) => one.name)).toEqual(["ピア"]);
    expect(view.aiSuspects).toEqual([]);
    expect(view.stumbles).toEqual([]);
    expect(view.nextSteps).toEqual(["練習する"]);
    expect(view.dropped).toBe(2 + 1 + 1 + 2);
  });

  it("配列でない値が入っていても空として読む", () => {
    const view = toClassReportView(
      row({ follow_up: null as never, next_steps: "なし" as never, stumbles: {} as never }),
    );
    expect(view.followUp).toEqual([]);
    expect(view.nextSteps).toEqual([]);
    expect(view.stumbles).toEqual([]);
  });

  it("組と日付の書き方", () => {
    expect(groupLabel({ university: "AUPP", cohort: 2 })).toBe("AUPP 2期生");
    expect(groupLabel({ university: "", cohort: 0 })).toBe("組の指定なし");
    expect(classDateLabel("2026-10-07")).toBe("10/7（水）");
    expect(classDateLabel("2026-10-13")).toBe("10/13（火）");
  });
});
