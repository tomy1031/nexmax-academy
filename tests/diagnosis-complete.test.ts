import { describe, expect, it } from "vitest";
import { PERSONALITY_QUESTIONS } from "@/content/personality";
import { isDiagnosisComplete } from "@/lib/profile";

/**
 * `/welcome` の入口判定。ここが「行の存在」に戻ると、
 * 診断が未完了の人が `/welcome` と `/map` を往復して詰む（07 §522 の穴）。
 */
describe("isDiagnosisComplete", () => {
  const full = Array.from({ length: PERSONALITY_QUESTIONS.length }, () => "a");

  it("20問そろっていれば完了とみなす", () => {
    expect(isDiagnosisComplete(full)).toBe(true);
  });

  it("未診断（空配列）は完了ではない", () => {
    expect(isDiagnosisComplete([])).toBe(false);
  });

  it("途中までの回答は完了ではない", () => {
    expect(isDiagnosisComplete(full.slice(0, PERSONALITY_QUESTIONS.length - 1))).toBe(false);
  });

  it("多すぎる回答も完了とはみなさない", () => {
    expect(isDiagnosisComplete([...full, "a"])).toBe(false);
  });

  it("配列でない値は完了ではない", () => {
    for (const value of [null, undefined, {}, "aaaa", 20]) {
      expect(isDiagnosisComplete(value)).toBe(false);
    }
  });

  it("判定の基準は設問数そのもの（定数のずれを検知する）", () => {
    expect(PERSONALITY_QUESTIONS.length).toBe(20);
  });
});
