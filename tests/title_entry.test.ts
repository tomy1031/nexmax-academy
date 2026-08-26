/**
 * タイトル画面が URL から 受け取る ものの 検査（2026-08-26）。
 *
 * タイトル画面を 作りおきで 返せる 静的ページに した ぶん、`?next=` と
 * `?error=auth` の 読み取りは サーバから ブラウザへ 移った（docs/deploy.md §0.10）。
 * **移しても 規則が 変わって いない**ことを ここで 押さえる——とくに
 * 「自分のサイトの 道だけ 受ける」は、外の URL へ 飛ばされない ための 守り。
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_NEXT, readTitleParams, safeNext } from "@/lib/title-entry";

describe("safeNext", () => {
  it("自分のサイトの道はそのまま受ける", () => {
    expect(safeNext("/map")).toBe("/map");
    expect(safeNext("/kaisha/quiz-kaisha_houkoku")).toBe("/kaisha/quiz-kaisha_houkoku");
  });

  it("外へ出るURLは受けない", () => {
    // プロトコル相対（`//host`）はブラウザでは外のサイトになる。
    expect(safeNext("//evil.example/steal")).toBe(DEFAULT_NEXT);
    expect(safeNext("https://evil.example/steal")).toBe(DEFAULT_NEXT);
    expect(safeNext("javascript:alert(1)")).toBe(DEFAULT_NEXT);
  });

  it("無いときは既定の行き先", () => {
    expect(safeNext(null)).toBe(DEFAULT_NEXT);
    expect(safeNext(undefined)).toBe(DEFAULT_NEXT);
    expect(safeNext("")).toBe(DEFAULT_NEXT);
  });
});

describe("readTitleParams", () => {
  it("ミドルウェアが付けた行き先を読む", () => {
    // 未ログインで /map を開くと `/?next=%2Fmap` へ返される（src/middleware.ts）。
    expect(readTitleParams("?next=%2Fmap")).toEqual({ next: "/map", hadAuthError: false });
  });

  it("ログインの失敗を読む", () => {
    // /auth/callback が失敗すると `/?error=auth` へ返す。
    expect(readTitleParams("?error=auth")).toEqual({ next: DEFAULT_NEXT, hadAuthError: true });
  });

  it("`?` が無くても読める", () => {
    expect(readTitleParams("next=%2Fmap").next).toBe("/map");
  });

  it("何も付いていないときは既定", () => {
    expect(readTitleParams("")).toEqual({ next: DEFAULT_NEXT, hadAuthError: false });
  });

  it("外へ出る行き先は既定に落とす", () => {
    expect(readTitleParams("?next=https%3A%2F%2Fevil.example").next).toBe(DEFAULT_NEXT);
  });
});
