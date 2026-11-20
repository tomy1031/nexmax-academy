import { describe, expect, it } from "vitest";
import {
  CERTIFICATE_LINKS,
  matchesTier,
  shouldAckIssued,
} from "../src/lib/certificate/link-certificates";
import { linkCertificateResult, linkLevels, LINK_MAX_LEVELS } from "../src/lib/certificate/model";

/*
 * ツール教材の 修了証の 決まり（2026-11-20・相談の 練習問題）。コードの 検収の 指摘を 固める:
 *  - ページに「出した」と 知らせるのは DB に 入った ときだけ（落ちた・見本では 知らせない）
 *  - 種類ごとに 決まった レベルの 組だけを 受ける
 *  - DB の 行の 変な 数で 画面を 止めない
 */
const SPEC = CERTIFICATE_LINKS.soudan_renshu!;

describe("ページに「出した」と 知らせて よいか", () => {
  const cert = linkCertificateResult("soudan_renshu", "t", {
    special: false,
    levels: [{ no: 1, stars: 3, fails: 0 }],
  });
  const issued = { ...cert, code: "ABCD2345", issuedAt: "", learnerName: "", attempt: 1 };

  it("DB に 入った 修了証は 知らせる", () => {
    expect(shouldAckIssued({ status: "ready", cert: { ...issued, official: true } }, false)).toBe(
      true,
    );
  });

  it("発行に 落ちた・作って いる 最中は 知らせない（次に 開いた とき 頼み直す）", () => {
    expect(shouldAckIssued({ status: "error" }, false)).toBe(false);
    expect(shouldAckIssued({ status: "issuing" }, false)).toBe(false);
    expect(shouldAckIssued(null, false)).toBe(false);
  });

  it("見本は、Supabase の 無い デモの ときだけ 知らせる（ログインが 切れて 見本に なった ときは 知らせない）", () => {
    const sample = { status: "ready" as const, cert: { ...issued, official: false } };
    expect(shouldAckIssued(sample, true)).toBe(true);
    expect(shouldAckIssued(sample, false)).toBe(false);
  });
});

describe("種類ごとに 決まった レベルの 組だけを 受ける", () => {
  const lv = (no: number) => ({ no, stars: 3, fails: 0 });

  it("レベル1〜4 は 1・2・3・4 ちょうど、特別課題は 5 だけ", () => {
    expect(matchesTier(SPEC, { tier: "main", levels: [lv(1), lv(2), lv(3), lv(4)] })).toBe(true);
    expect(matchesTier(SPEC, { tier: "main", levels: [lv(4), lv(3), lv(2), lv(1)] })).toBe(true);
    expect(matchesTier(SPEC, { tier: "special", levels: [lv(5)] })).toBe(true);
  });

  it("抜け・余り・ずれは 受けない（1つの レベルだけで パーフェクトに しない）", () => {
    expect(matchesTier(SPEC, { tier: "main", levels: [lv(1)] })).toBe(false);
    expect(matchesTier(SPEC, { tier: "main", levels: [lv(1), lv(3), lv(4), lv(5)] })).toBe(false);
    expect(matchesTier(SPEC, { tier: "main", levels: [lv(1), lv(2), lv(3), lv(4), lv(5)] })).toBe(
      false,
    );
    expect(matchesTier(SPEC, { tier: "special", levels: [lv(4)] })).toBe(false);
  });
});

describe("DB の 行の 変な 数で 画面を 止めない・落とさない", () => {
  it("レベルの 数は 上限まで、星は 0〜3 に 収める", () => {
    const levels = linkLevels({ first: 1, levels: 1e9, s1: -5, f1: 1, s2: 99, f2: 2 });
    expect(levels).toHaveLength(LINK_MAX_LEVELS);
    expect(levels[0]).toEqual({ no: 1, stars: 0, f: 1 });
    expect(levels[1]).toEqual({ no: 2, stars: 3, f: 2 });
    expect(linkLevels(null)).toEqual([]);
    expect(linkLevels({ levels: "x" })).toEqual([]);
  });
});
