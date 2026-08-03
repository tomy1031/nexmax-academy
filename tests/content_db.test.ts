import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * DB由来コンテンツの読み込みと、git との合流規則（設計07 §11.1）。
 *
 * 守りたい性質:
 *  - Supabase 未設定・テーブル未作成でもアプリは止まらない（git だけで動く）
 *  - 学習者向けの一覧に下書きが混ざらない
 *  - 同一IDは DB が勝つ（管理画面での修正が常に最新）
 */

const { createClientMock, plainClientMock, configMock } = vi.hoisted(() => ({
  /** Cookie 版（管理画面の下書き読み取り用）。 */
  createClientMock: vi.fn(),
  /** Cookie を使わない版（公開分の読み取り用。静的生成・ISRから呼べる）。 */
  plainClientMock: vi.fn(),
  configMock: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("@supabase/supabase-js", () => ({ createClient: plainClientMock }));
vi.mock("@/lib/env", () => ({ getSupabasePublicConfig: configMock }));

const { fetchDbContents } = await import("@/lib/content-db");
const { listStages, listMangas, mergeContentsById } = await import("@/lib/content");

interface Row {
  id: string;
  kind: string;
  data: unknown;
  status: string;
  stage_id: string | null;
  updated_at: string;
}

/**
 * Supabase クライアントの替え玉。
 * `.eq()` で積まれた条件を実際に行へ適用するので、「下書きを除いているか」を
 * 呼び出しの形ではなく結果で確かめられる。
 */
function fakeClient(rows: Row[], error: { code?: string } | null = null) {
  const filters: [string, unknown][] = [];
  const builder = {
    eq(column: string, value: unknown) {
      filters.push([column, value]);
      return builder;
    },
    then(resolve: (value: { data: Row[] | null; error: unknown }) => unknown) {
      const data = error
        ? null
        : rows.filter((row) =>
            filters.every(
              ([column, value]) => (row as unknown as Record<string, unknown>)[column] === value,
            ),
          );
      return Promise.resolve(resolve({ data, error }));
    },
  };
  const client = { from: () => ({ select: () => builder }) };
  return { client, filters };
}

function stageData(over: Record<string, unknown> = {}) {
  return {
    kind: "stage",
    id: "db_stage",
    step: 3,
    title: "テストのしま",
    reading: "てすとのしま",
    description: "テストのための ステージ",
    color: "leaf",
    status: "published",
    contents: [{ ref: "sample_horenso", type: "quizset" }],
    wordStageIds: [],
    ...over,
  };
}

function row(over: Partial<Row> = {}): Row {
  const data = over.data ?? stageData();
  const kindOf = (value: unknown) => (value as { kind?: string }).kind ?? "stage";
  const idOf = (value: unknown) => (value as { id?: string }).id ?? "db_stage";
  return {
    id: idOf(data),
    kind: kindOf(data),
    data,
    status: "published",
    stage_id: null,
    updated_at: "2026-08-03T00:00:00.000Z",
    ...over,
  };
}

function useRows(rows: Row[], error: { code?: string } | null = null) {
  const fake = fakeClient(rows, error);
  createClientMock.mockResolvedValue(fake.client);
  plainClientMock.mockReturnValue(fake.client);
  return fake;
}

beforeEach(() => {
  createClientMock.mockReset();
  plainClientMock.mockReset();
  configMock.mockReset();
  // 既定は「Supabase 設定あり」。未設定の場合は各テストで null を返す
  configMock.mockReturnValue({ url: "https://example.supabase.co", anonKey: "anon" });
});

describe("fetchDbContents", () => {
  it("Supabase 未設定なら空を返す（git だけで動く）", async () => {
    configMock.mockReturnValue(null);
    createClientMock.mockResolvedValue(null);
    await expect(fetchDbContents()).resolves.toEqual([]);
    await expect(fetchDbContents({ includeDrafts: true })).resolves.toEqual([]);
  });

  it("公開分の読み取りは Cookie を使わない（静的生成・ISRから呼べる）", async () => {
    useRows([row()]);
    await fetchDbContents();
    // Cookie 版に触れていないこと。触れるとページが動的レンダリングに落ちる
    expect(createClientMock).not.toHaveBeenCalled();
    expect(plainClientMock).toHaveBeenCalledTimes(1);
  });

  it("リクエスト外で Cookie が読めなくても落ちない（管理画面経路）", async () => {
    createClientMock.mockRejectedValue(new Error("cookies() outside request"));
    await expect(fetchDbContents({ includeDrafts: true })).resolves.toEqual([]);
  });

  it("Next の動的レンダリング要求は握りつぶさず投げ直す", async () => {
    // 握りつぶすと静的HTMLにDB由来の教材が焼き付いたまま配られる
    const dynamicError = Object.assign(new Error("Dynamic server usage: cookies"), {
      digest: "DYNAMIC_SERVER_USAGE",
    });
    createClientMock.mockRejectedValue(dynamicError);
    await expect(fetchDbContents({ includeDrafts: true })).rejects.toBe(dynamicError);
  });

  it("redirect / notFound の合図も投げ直す", async () => {
    const notFound = Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), {
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    createClientMock.mockRejectedValue(notFound);
    await expect(fetchDbContents({ includeDrafts: true })).rejects.toBe(notFound);
  });

  it("テーブル未作成なら空を返す", async () => {
    useRows([row()], { code: "42P01" });
    await expect(fetchDbContents()).resolves.toEqual([]);
  });

  it("既定では公開分だけを返す（下書きを除く）", async () => {
    useRows([
      row({ id: "pub", data: stageData({ id: "pub" }), status: "published" }),
      row({ id: "wip", data: stageData({ id: "wip" }), status: "draft" }),
    ]);
    const entries = await fetchDbContents();
    expect(entries.map((e) => e.content.id)).toEqual(["pub"]);
    expect(entries[0]?.status).toBe("published");
  });

  it("includeDrafts なら下書きも返す（管理画面用）", async () => {
    useRows([
      row({ id: "pub", data: stageData({ id: "pub" }), status: "published" }),
      row({ id: "wip", data: stageData({ id: "wip" }), status: "draft" }),
    ]);
    const entries = await fetchDbContents({ includeDrafts: true });
    expect(entries.map((e) => e.content.id).sort()).toEqual(["pub", "wip"]);
  });

  it("スキーマに通らない行は捨てる（規格が進化しても画面が壊れない）", async () => {
    useRows([
      row({ id: "ok", data: stageData({ id: "ok" }) }),
      row({ id: "broken", data: { kind: "stage", id: "broken" }, kind: "stage" }),
    ]);
    const entries = await fetchDbContents();
    expect(entries.map((e) => e.content.id)).toEqual(["ok"]);
  });

  it("台帳の id/kind と中身がずれた行は捨てる", async () => {
    useRows([row({ id: "other_id", data: stageData({ id: "db_stage" }) })]);
    await expect(fetchDbContents()).resolves.toEqual([]);
  });

  it("stageId・updatedAt を台帳から引き継ぐ", async () => {
    useRows([row({ stage_id: "stage_m7", updated_at: "2026-08-03T12:00:00.000Z" })]);
    const entries = await fetchDbContents();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.stageId).toBe("stage_m7");
    expect(entries[0]?.updatedAt).toBe("2026-08-03T12:00:00.000Z");
  });
});

describe("mergeContentsById", () => {
  it("同一IDは DB が勝つ", () => {
    const merged = mergeContentsById(
      [
        { id: "a", from: "git" },
        { id: "b", from: "git" },
      ],
      [{ id: "a", from: "db" }],
    );
    expect(merged).toEqual([
      { id: "a", from: "db" },
      { id: "b", from: "git" },
    ]);
  });

  it("DBにしかないものは足される", () => {
    const merged = mergeContentsById([{ id: "a" }], [{ id: "c" }]);
    expect(merged.map((m) => m.id)).toEqual(["a", "c"]);
  });

  it("DBが空なら git のまま", () => {
    const git = [{ id: "a" }, { id: "b" }];
    expect(mergeContentsById(git, [])).toEqual(git);
  });
});

describe("ローダーの合流", () => {
  it("listStages は DB の公開ステージを含め、下書きは含めない", async () => {
    useRows([
      row({ id: "db_pub", data: stageData({ id: "db_pub", step: 5 }) }),
      row({ id: "db_wip", data: stageData({ id: "db_wip", step: 6 }), status: "draft" }),
    ]);
    const ids = (await listStages()).map((s) => s.id);
    expect(ids).toContain("db_pub");
    expect(ids).not.toContain("db_wip");
  });

  it("listStages は step 順に並べる（DB由来も同じ並びに入る）", async () => {
    useRows([
      row({ id: "later", data: stageData({ id: "later", step: 9 }) }),
      row({ id: "earlier", data: stageData({ id: "earlier", step: 2 }) }),
    ]);
    const steps = (await listStages()).map((s) => s.step);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
  });

  it("同一IDの git ステージは DB 版に置き換わる", async () => {
    // git 側の実データに依存しないよう、まず git だけの一覧を取る
    createClientMock.mockResolvedValue(null);
    const gitStages = await listStages();

    const target = gitStages[0];
    if (!target) {
      // git にまだ stage が無い段階でも、この規則は mergeContentsById で担保している
      expect(gitStages).toEqual([]);
      return;
    }

    useRows([
      row({
        id: target.id,
        data: { ...target, title: "DBがわの タイトル", status: "published" },
      }),
    ]);
    const merged = await listStages();
    expect(merged.find((s) => s.id === target.id)?.title).toBe("DBがわの タイトル");
    expect(merged.filter((s) => s.id === target.id)).toHaveLength(1);
  });

  it("listMangas も DB の公開分を合流する", async () => {
    useRows([
      row({
        id: "db_manga",
        kind: "manga",
        data: {
          kind: "manga",
          id: "db_manga",
          format: "yonkoma",
          title: "テストの まんが",
          description: "テストの ための まんが",
          pages: [{ panels: [{ lines: [{ speaker: "narration", text: "はじまり" }] }] }],
        },
      }),
    ]);
    const ids = (await listMangas()).map((m) => m.id);
    expect(ids).toContain("db_manga");
  });
});
