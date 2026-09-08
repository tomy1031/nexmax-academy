import { describe, expect, it } from "vitest";
import {
  createMemoryBackend,
  recordContentProgress,
  saveListeningFinds,
  readListeningFinds,
  readListeningResult,
} from "../src/lib/progress/store";
import {
  collectPending,
  flushRecords,
  pendingCount,
  FLUSH_DELAY_MS,
} from "../src/lib/records/sync";

const ME = "11111111-1111-4111-a111-111111111111";
const SOMEONE_ELSE = "22222222-2222-4222-a222-222222222222";

describe("端末のきろくを台帳へ写す（変わったぶんだけ）", () => {
  it("記録が無ければ送るものも無い", () => {
    const backend = createMemoryBackend();
    expect(pendingCount(collectPending(backend))).toBe(0);
  });

  it("教材の進み具合を1行にする（しおりも運ぶ）", () => {
    const backend = createMemoryBackend();
    recordContentProgress("m2-asakai-manga", { status: "started", position: { page: 3 } }, backend);
    const pending = collectPending(backend);
    expect(pending.progress).toHaveLength(1);
    expect(pending.progress[0]?.row).toMatchObject({
      content_id: "m2-asakai-manga",
      status: "started",
      position: { page: 3 },
    });
  });

  it("時こくの列は 送らない（DBが 打つ — 読み直すたびに おわった日が 消えないように）", () => {
    const backend = createMemoryBackend();
    recordContentProgress("m2-asakai-manga", { status: "completed" }, backend);
    expect(Object.keys(collectPending(backend).progress[0]!.row)).toEqual([
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
    const pending = collectPending(backend);
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
    expect(collectPending(backend).listening).toHaveLength(0);
  });

  it("送った印を書けば、同じ記録は もう送らない", () => {
    const backend = createMemoryBackend();
    recordContentProgress("m2-asakai-manga", { status: "started" }, backend);
    const first = collectPending(backend);
    // 送れた ぶんの 印を 置く（flushRecords が 成功したときと 同じ すがた）
    backend.set(
      "nexmax:v1:records-sent",
      JSON.stringify({
        owner: ME,
        marks: Object.fromEntries(first.progress.map((one) => [one.key, one.fingerprint])),
      }),
    );
    expect(pendingCount(collectPending(backend))).toBe(0);

    // 進んだら また 送る
    recordContentProgress("m2-asakai-manga", { status: "completed" }, backend);
    expect(collectPending(backend).progress).toHaveLength(1);
  });

  it("壊れた印は「まだ送っていない」として扱う（もう一度 送るだけ）", () => {
    const backend = createMemoryBackend();
    recordContentProgress("m2-asakai-manga", { status: "started" }, backend);
    backend.set("nexmax:v1:records-sent", "{壊れている");
    expect(collectPending(backend).progress).toHaveLength(1);
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

/* ------------------------------------------------------------------ *
 * 流す（flushRecords）
 *
 * supabase-js は **投げずに `{ error }` を 返す**ので、落ちた ときに 印が つかない
 * ことは 目では 確かめられない。偽物の クライアントを 差して 固定する。
 * ------------------------------------------------------------------ */

interface Call {
  table: string;
  rows: Record<string, unknown>[];
}

/** 使う ぶんだけの 偽物。`fail` に 挙げた 表だけ `{ error }` を 返す。 */
function fakeClient({ profileId = ME, fail = [] as string[], calls = [] as Call[] } = {}) {
  return {
    calls,
    client: {
      auth: {
        getClaims: async () => ({
          data: profileId ? { claims: { sub: profileId } } : null,
          error: null,
        }),
      },
      from(table: string) {
        return {
          upsert: async (rows: Record<string, unknown>[]) => {
            calls.push({ table, rows });
            return fail.includes(table)
              ? { error: { code: "PGRST999", message: "つながりません" } }
              : { error: null };
          },
        };
      },
    } as unknown as Parameters<typeof flushRecords>[1],
  };
}

function sentLedger(backend: ReturnType<typeof createMemoryBackend>) {
  const raw = backend.get("nexmax:v1:records-sent");
  return raw ? (JSON.parse(raw) as { owner: string; marks: Record<string, string> }) : null;
}

describe("台帳へ 流す", () => {
  it("送れたら 印が つき、2回目は 何も 送らない", async () => {
    const backend = createMemoryBackend();
    recordContentProgress("m2-asakai-manga", { status: "completed" }, backend);
    const first = fakeClient();
    expect(await flushRecords(backend, first.client)).toEqual({ sent: 1, more: false });
    expect(first.calls[0]?.table).toBe("content_progress");
    // 送る 直前に 持ち主を 足す（端末の 走査では 持たない）
    expect(first.calls[0]?.rows[0]).toMatchObject({ profile_id: ME, status: "completed" });
    expect(sentLedger(backend)).toMatchObject({ owner: ME });

    const second = fakeClient();
    expect(await flushRecords(backend, second.client)).toEqual({ sent: 0, more: false });
    expect(second.calls).toHaveLength(0);
  });

  it("送れなかったら 印を つけない（次に もう一度 送れる）", async () => {
    const backend = createMemoryBackend();
    recordContentProgress("m2-asakai-manga", { status: "started" }, backend);
    const broken = fakeClient({ fail: ["content_progress"] });
    expect(await flushRecords(backend, broken.client)).toEqual({ sent: 0, more: true });
    expect(sentLedger(backend)).toBeNull();
    // 同じ ものが まだ 残って いる
    expect(collectPending(backend).progress).toHaveLength(1);
  });

  it("片方だけ 落ちたら、通った ほうにだけ 印が つく", async () => {
    const backend = createMemoryBackend();
    recordContentProgress("m2-asakai-manga", { status: "started" }, backend);
    saveListeningFinds(
      "asakai-listening",
      ["けんしゅう"],
      { revealPercent: 10, keywordsLeft: 2 },
      backend,
    );
    const half = fakeClient({ fail: ["listening_results"] });
    expect(await flushRecords(backend, half.client)).toEqual({ sent: 1, more: true });
    const marks = Object.keys(sentLedger(backend)?.marks ?? {});
    expect(marks).toEqual(["nexmax:v1:content:m2-asakai-manga"]);
    // 落ちた ほうは 次も 送る
    expect(collectPending(backend).listening).toHaveLength(1);
  });

  it("ログインして いなければ 何も 送らず、印も つけない（デモモード）", async () => {
    const backend = createMemoryBackend();
    recordContentProgress("m2-asakai-manga", { status: "started" }, backend);
    const anon = fakeClient({ profileId: "" });
    expect(await flushRecords(backend, anon.client)).toEqual({ sent: 0, more: true });
    expect(anon.calls).toHaveLength(0);
    expect(sentLedger(backend)).toBeNull();
  });

  it("送る ものが 無ければ 名乗りにも 行かない（教室は 1本の 回線）", async () => {
    const backend = createMemoryBackend();
    let asked = 0;
    const client = {
      auth: {
        getClaims: async () => {
          asked += 1;
          return { data: { claims: { sub: ME } }, error: null };
        },
      },
      from: () => ({ upsert: async () => ({ error: null }) }),
    } as unknown as Parameters<typeof flushRecords>[1];
    expect(await flushRecords(backend, client)).toEqual({ sent: 0, more: false });
    expect(asked).toBe(0);
  });

  it("共有の 端末で 持ち主が 変わったら、前の人の ぶんを 引き取らない", async () => {
    const backend = createMemoryBackend();
    // アヤが 1本 終えて 送った
    recordContentProgress("m2-asakai-manga", { status: "completed" }, backend);
    await flushRecords(backend, fakeClient().client);
    // 流し切る 前に 1本 進めて、ログアウト（端末の 記録は 残る）
    recordContentProgress("renraku-manga", { status: "completed" }, backend);
    // 次に 別の 人が ログインする
    const other = fakeClient({ profileId: SOMEONE_ELSE });
    expect(await flushRecords(backend, other.client)).toEqual({ sent: 0, more: false });
    expect(other.calls).toHaveLength(0);
    expect(sentLedger(backend)?.owner).toBe(SOMEONE_ELSE);
    // 引き取らないと 決めた ぶんは、もう 送ろうとしない
    expect(collectPending(backend).progress).toHaveLength(0);
  });

  it("リスニングを「はじめから」に しても 台帳が 古い 数字の まま 残らない", async () => {
    const backend = createMemoryBackend();
    saveListeningFinds(
      "asakai-listening",
      ["けんしゅう", "しゅっしゃ"],
      { revealPercent: 60, keywordsLeft: 1 },
      backend,
    );
    await flushRecords(backend, fakeClient().client);
    // 「はじめから」を 押す（当てた ことばを ぜんぶ 捨てる）
    saveListeningFinds("asakai-listening", [], { revealPercent: 0, keywordsLeft: 3 }, backend);
    const again = fakeClient();
    expect(await flushRecords(backend, again.client)).toEqual({ sent: 1, more: false });
    expect(again.calls[0]?.rows[0]).toMatchObject({
      inputs: [],
      reveal_percent: 0,
      keywords_left: 3,
    });
  });
});
