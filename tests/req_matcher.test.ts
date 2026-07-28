import { describe, expect, it } from "vitest";
import {
  LOCAL_CONFIDENT_HITS,
  matchLocally,
  resolveMatch,
  type MatchableReq,
} from "../src/components/meeting/req-matcher";

const REQS: MatchableReq[] = [
  { id: "r1", keywords: ["予算", "よさん", "いくら"] },
  { id: "r2", keywords: ["納期", "のうき", "いつまで"] },
  { id: "r3", keywords: ["ターゲット", "たーげっと", "お客さま"] },
];

describe("要件の判定3層", () => {
  it("AIが項目を挙げたらそれを採用する", () => {
    const outcome = resolveMatch({
      utterance: "ぜんぜん関係ない話です",
      reqs: REQS,
      aiReqId: "r2",
    });
    expect(outcome).toEqual({ reqId: "r2", source: "ai", rescued: false });
  });

  it("AIが該当なしでも、ローカルで明確なら救済する（旧アプリの誤却下対策）", () => {
    const outcome = resolveMatch({
      utterance: "予算はいくらぐらいをお考えですか。",
      reqs: REQS,
      aiReqId: null,
    });
    expect(outcome).toEqual({ reqId: "r1", source: "local", rescued: true });
  });

  it("キーワードが1つだけなら救済しない（取りこぼしより誤爆を避ける）", () => {
    const outcome = resolveMatch({
      utterance: "予算のことは あとで だいじょうぶです",
      reqs: REQS,
      aiReqId: null,
    });
    expect(outcome.reqId).toBeNull();
    expect(outcome.source).toBe("none");
  });

  it("表記がちがっても当たる", () => {
    expect(matchLocally("ヨサンは イクラですか", REQS).reqId).toBe("r1");
    expect(matchLocally("のうきは いつまでですか", REQS).reqId).toBe("r2");
  });

  it("すでに開いた項目は数えない（同じ質問で二度開かない）", () => {
    const open = new Set(["r1"]);
    expect(matchLocally("予算はいくらですか", REQS, open).reqId).toBeNull();
    expect(
      resolveMatch({ utterance: "予算はいくらですか", reqs: REQS, openIds: open, aiReqId: "r1" })
        .reqId,
    ).toBeNull();
  });

  it("AIが知らないIDを返しても採用しない", () => {
    const outcome = resolveMatch({ utterance: "こんにちは", reqs: REQS, aiReqId: "r99" });
    expect(outcome.reqId).toBeNull();
  });

  it("空の発話では何も開かない", () => {
    expect(matchLocally("", REQS)).toEqual({ reqId: null, hits: 0 });
  });

  it("いちばん多く当たった項目を選ぶ", () => {
    const result = matchLocally("納期はいつまでですか。予算も知りたいです。", REQS);
    expect(result.reqId).toBe("r2");
    expect(result.hits).toBeGreaterThanOrEqual(LOCAL_CONFIDENT_HITS);
  });
});
