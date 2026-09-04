import { describe, expect, it } from "vitest";
import {
  createMemoryBackend,
  recordContentProgress,
  saveListeningFinds,
  readListeningFinds,
  readListeningResult,
} from "../src/lib/progress/store";
import { collectPending, pendingCount, FLUSH_DELAY_MS } from "../src/lib/records/sync";

const ME = "11111111-1111-4111-a111-111111111111";

describe("端末のきろくを台帳へ写す（変わったぶんだけ）", () => {
  it("記録が無ければ送るものも無い", () => {
    const backend = createMemoryBackend();
    expect(pendingCount(collectPending(ME, backend))).toBe(0);
  });

  it("教材の進み具合を1行にする（しおりも運ぶ）", () => {
    const backend = createMemoryBackend();
    recordContentProgress("m2-asakai-manga", { status: "started", position: { page: 3 } }, backend);
    const pending = collectPending(ME, backend);
    expect(pending.progress).toHaveLength(1);
    expect(pending.progress[0]?.row).toMatchObject({
      profile_id: ME,
      content_id: "m2-asakai-manga",
      status: "started",
      position: { page: 3 },
    });
  });

  it("時こくの列は 送らない（DBが 打つ — 読み直すたびに おわった日が 消えないように）", () => {
    const backend = createMemoryBackend();
    recordContentProgress("m2-asakai-manga", { status: "completed" }, backend);
    expect(Object.keys(collectPending(ME, backend).progress[0]!.row)).toEqual([
      "profile_id",
      "content_id",
      "status",
      "position",
    ]);
  });

  it("リスニングは当てた ことばと 開いた％を運ぶ", () => {
    const backend = createMemoryBackend();
    saveListeningFinds(
      "asakai-listening",
      ["けんしゅう", "しゅっしゃ"],
      {
        revealPercent: 40,
        keywordsLeft: 2,
      },
      backend,
    );
    const pending = collectPending(ME, backend);
    expect(pending.listening[0]?.row).toMatchObject({
      listening_id: "asakai-listening",
      inputs: ["けんしゅう", "しゅっしゃ"],
      reveal_percent: 40,
      keywords_left: 2,
    });
  });

  it("1つも当てていないリスニングは送らない（進み具合が すでに 持っている）", () => {
    const backend = createMemoryBackend();
    saveListeningFinds("asakai-listening", [], { revealPercent: 0, keywordsLeft: 3 }, backend);
    expect(collectPending(ME, backend).listening).toHaveLength(0);
  });

  it("送った印を書けば、同じ記録は もう送らない", () => {
    const backend = createMemoryBackend();
    recordContentProgress("m2-asakai-manga", { status: "started" }, backend);
    const first = collectPending(ME, backend);
    // 送れた ぶんの 印を 置く（flushRecords が 成功したときと 同じ すがた）
    backend.set(
      "nexmax:v1:records-sent",
      JSON.stringify(Object.fromEntries(first.progress.map((one) => [one.key, one.fingerprint]))),
    );
    expect(pendingCount(collectPending(ME, backend))).toBe(0);

    // 進んだら また 送る
    recordContentProgress("m2-asakai-manga", { status: "completed" }, backend);
    expect(collectPending(ME, backend).progress).toHaveLength(1);
  });

  it("壊れた印は「まだ送っていない」として扱う（もう一度 送るだけ）", () => {
    const backend = createMemoryBackend();
    recordContentProgress("m2-asakai-manga", { status: "started" }, backend);
    backend.set("nexmax:v1:records-sent", "{壊れている");
    expect(collectPending(ME, backend).progress).toHaveLength(1);
  });

  it("ためる時間は 画面側の 待ちと そろえる（片方だけ直る事故を止める）", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/components/records-sync.tsx", "utf8"),
    );
    expect(source).toContain(
      `const FLUSH_DELAY_MS = ${FLUSH_DELAY_MS.toLocaleString("en-US").replace(/,/g, "_")};`,
    );
  });
});

describe("リスニングの保存は 古い形も 読める", () => {
  it("ただの配列（2026-09-04 より前）でも 消さずに 読む", () => {
    const backend = createMemoryBackend();
    backend.set("nexmax:v1:listening:asakai", JSON.stringify(["けんしゅう"]));
    expect(readListeningFinds("asakai", backend)).toEqual(["けんしゅう"]);
    expect(readListeningResult("asakai", backend).revealPercent).toBe(0);
  });

  it("壊れた保存値は「まだ無い」として扱う", () => {
    const backend = createMemoryBackend();
    backend.set("nexmax:v1:listening:asakai", "{壊れている");
    expect(readListeningFinds("asakai", backend)).toEqual([]);
  });
});
