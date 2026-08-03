import { describe, expect, it } from "vitest";
import {
  createMemoryBackend,
  readContentProgress,
  recordContentProgress,
  subscribeProgress,
} from "../src/lib/progress/store";

describe("コンテンツ進捗（stage内の教材）", () => {
  it("未記録なら null", () => {
    const backend = createMemoryBackend();
    expect(readContentProgress("m2-asakai-manga", backend)).toBeNull();
  });

  it("started → completed へ進む", () => {
    const backend = createMemoryBackend();
    recordContentProgress("m2-asakai-manga", { status: "started" }, backend);
    recordContentProgress("m2-asakai-manga", { status: "completed" }, backend);
    expect(readContentProgress("m2-asakai-manga", backend)?.status).toBe("completed");
  });

  it("completed は started で上書きされない（読み直しても おわった は消えない）", () => {
    const backend = createMemoryBackend();
    recordContentProgress("m2-asakai-manga", { status: "completed" }, backend);
    const next = recordContentProgress(
      "m2-asakai-manga",
      { status: "started", position: { page: 3, panel: 1 } },
      backend,
    );
    expect(next.status).toBe("completed");
    const stored = readContentProgress("m2-asakai-manga", backend);
    expect(stored?.status).toBe("completed");
    // しおり（position）は最新を残す
    expect(stored?.position).toEqual({ page: 3, panel: 1 });
  });

  it("position を省略して記録しても前回のしおりを保つ", () => {
    const backend = createMemoryBackend();
    recordContentProgress("m2-asakai-manga", { status: "started", position: { page: 2 } }, backend);
    recordContentProgress("m2-asakai-manga", { status: "started" }, backend);
    expect(readContentProgress("m2-asakai-manga", backend)?.position).toEqual({ page: 2 });
  });

  it("記録すると subscribeProgress の購読者に通知が飛ぶ", () => {
    const backend = createMemoryBackend();
    let calls = 0;
    const unsubscribe = subscribeProgress(() => {
      calls += 1;
    });
    recordContentProgress("m2-asakai-article", { status: "started" }, backend);
    expect(calls).toBe(1);
    unsubscribe();
    recordContentProgress("m2-asakai-article", { status: "completed" }, backend);
    expect(calls).toBe(1);
  });
});
