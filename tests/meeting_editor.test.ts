import { describe, expect, it } from "vitest";
import { contentSchema, type Meeting } from "@/content/schema";
import {
  countLinesBySpeaker,
  emptyMeeting,
  missingKeywords,
} from "@/components/studio/meeting-drafts";

/**
 * ミーティングのエディタが依存する判定の検査。
 *
 * 「台本に無いキーワード」と「参加者を消したときに宙に浮く行」は、どちらも
 * 保存の検査（schema.ts の superRefine）で止まる形。エディタは同じ判定を先に
 * 画面へ出して先生に気づかせる役なので、スキーマとずれていないことを固める。
 */

function meeting(part: Partial<Meeting> = {}): Meeting {
  return {
    kind: "meeting",
    id: "asakai-check",
    title: "朝会",
    description: "判定の たしかめ用です。",
    focus: "こまっていることの つたえ方に 注目して 聞きます。",
    participants: [
      { id: "fujiki", name: "藤木", role: "リーダー", accent: "sky" },
      { id: "hendy", name: "ヘンディ", role: "先輩", accent: "leaf" },
    ],
    script: [
      { speaker: "narration", text: "朝の9時です。" },
      { speaker: "fujiki", text: "おはようございます。今日の予定をお願いします。" },
      { speaker: "hendy", text: "サーバーのエラーで、テストが止まりました。" },
      { speaker: "hendy", text: "原因はまだ分かりません。" },
      { speaker: "me", text: "私は仕様書を読みます。" },
    ],
    keywords: [],
    revealGoal: 30,
    ...part,
  };
}

describe("missingKeywords", () => {
  it("台本に出てこない ことばだけ 返す", () => {
    const value = meeting({ keywords: ["サーバー", "会議室", "原因", "見積もり"] });
    expect(missingKeywords(value)).toEqual(["会議室", "見積もり"]);
  });

  it("台本に ある ことばは 返さない", () => {
    const value = meeting({ keywords: ["テスト", "エラー", "予定"] });
    expect(missingKeywords(value)).toEqual([]);
  });

  it("まだ 何も入っていない 行（空文字）は 数えない", () => {
    // StringListEditor で「＋」を押した直後は空文字。ここで警告を出すと入力中がうるさい。
    const value = meeting({ keywords: ["", "エラー"] });
    expect(missingKeywords(value)).toEqual([]);
  });

  it("台本が 空でも 落ちない", () => {
    const value = meeting({ script: [], keywords: ["エラー"] });
    expect(missingKeywords(value)).toEqual(["エラー"]);
    expect(missingKeywords(meeting({ script: [], keywords: [] }))).toEqual([]);
  });

  it("スキーマと 同じ判定に なっている（行をまたいでも 台本にあると みなす）", () => {
    // schema.ts は全行をつないだ1本の文字列で見る。ここだけ行ごとに見ると、
    // 「画面では何も言われないのに保存できない」が起きる（逆もまた同じ）。
    const value = meeting({ keywords: ["ました。原因"] });
    expect(missingKeywords(value)).toEqual([]);
    expect(contentSchema.safeParse(value).success).toBe(true);
  });

  it("返した ことばが あると 保存の検査でも 止まる", () => {
    const value = meeting({ keywords: ["会議室"] });
    expect(missingKeywords(value)).toEqual(["会議室"]);
    expect(contentSchema.safeParse(value).success).toBe(false);
  });
});

describe("countLinesBySpeaker", () => {
  it("参加者ごとの 発話行数を 数える", () => {
    const value = meeting();
    expect(countLinesBySpeaker(value, "hendy")).toBe(2);
    expect(countLinesBySpeaker(value, "fujiki")).toBe(1);
  });

  it("me と narration も 数えられる", () => {
    const value = meeting();
    expect(countLinesBySpeaker(value, "me")).toBe(1);
    expect(countLinesBySpeaker(value, "narration")).toBe(1);
  });

  it("台本に いない 人は 0行", () => {
    expect(countLinesBySpeaker(meeting(), "nyam")).toBe(0);
  });

  it("台本が 空でも 落ちない", () => {
    expect(countLinesBySpeaker(meeting({ script: [] }), "hendy")).toBe(0);
  });
});

describe("emptyMeeting", () => {
  it("台本2行・参加者1人の 枠から 始まる（スキーマの下限）", () => {
    const draft = emptyMeeting();
    expect(draft.kind).toBe("meeting");
    expect(draft.script).toHaveLength(2);
    expect(draft.participants).toHaveLength(1);
    expect(draft.revealGoal).toBe(30);
    // 空のままでは保存の検査で止まる = 意図どおり
    expect(contentSchema.safeParse(draft).success).toBe(false);
  });

  it("作りたての 下書きでは キーワードの 警告を 出さない", () => {
    expect(missingKeywords(emptyMeeting())).toEqual([]);
  });
});
