import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_LEARNER_WORDS, stageSchema } from "@/content/schema";
import { checkCountryNamesInTexts } from "@/lib/content-checks";
import { DONE_MESSAGE, readLinkMessage } from "@/lib/answers/link-message";
import { sortStages } from "@/lib/map-data";

/**
 * 空気読みゲーム（public/tools/kuuki-yomi/）を 機械で 見る。
 *
 * ゲームは 別の リポジトリの 静的な ページを **そのまま 写した もの**
 *（`scripts/sync_kuuki_yomi.mjs`）なので、アプリの 検査（`npm run lint:content`）は
 * 中身を 見ない。見ない ぶん、ここで 見る。
 *
 *  1. 写した 形が こわれて いないか（読みこむ ファイルが ぜんぶ ある・どの 版か 分かる）
 *  2. ゲームの 文言に 使わない 言葉が 無いか（規律1・規律9）
 *  3. 「おわった」の 合図が アプリの 受け口と かみ合うか（nexmax-bridge.js）
 *  4. 合図が 頼る ゲームの 名前（KY.store.recordBest・UI.progress）が 変わって いないか
 *     ——写し直した ゲームで 名前が 変わると、合図だけが **黙って 届かなく なる**
 *  5. ステージの 並び（「報連相：報告」の すぐ 後）
 */

const DIR = join("public", "tools", "kuuki-yomi");
const read = (...path: string[]) => readFileSync(join(DIR, ...path), "utf8");
const LINK = JSON.parse(readFileSync(join("content", "links", "kuuki_yomi_game.json"), "utf8")) as {
  id: string;
  url: string;
};

describe("写した ゲームの 形", () => {
  const html = read("index.html");

  it("index.html が 読みこむ ファイルは 相対パスで、ぜんぶ 写して ある", () => {
    const local = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((m) => m[1]!)
      .filter((url) => !url.startsWith("https://"));
    expect(local.length).toBeGreaterThan(40);
    for (const url of local) {
      expect(url.startsWith("/"), url).toBe(false);
      expect(existsSync(join(DIR, url)), url).toBe(true);
    }
  });

  it("合図の 1行は main.js の あと（ゲームが 組み上がって から 包む）", () => {
    const main = html.indexOf('<script src="js/main.js"></script>');
    const bridge = html.indexOf('<script src="nexmax-bridge.js"></script>');
    expect(main).toBeGreaterThan(0);
    expect(bridge).toBeGreaterThan(main);
  });

  it("どの 版を 写したかが SOURCE.json に ある", () => {
    const source = JSON.parse(read("SOURCE.json")) as { commit: string };
    expect(source.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("リンク教材の 行き先が この index.html", () => {
    expect(LINK.url).toBe("/tools/kuuki-yomi/index.html");
  });
});

describe("ゲームの 文言（規律1・規律9）", () => {
  const files = [
    "index.html",
    ...readdirSync(join(DIR, "js"), { recursive: true })
      .map(String)
      .filter((name) => name.endsWith(".js"))
      .map((name) => join("js", name)),
  ];

  /**
   * 通して よい 文。3-6 で 落ちこむ 選択肢の ひとりごと（学習者に 向けた 言葉では ない）。
   * tomy さんの 修正版（10/23）の 文。tomy さんの 指定（2026-10-23）:
   * 「そもそもダメは禁止語ではありません」「無視してすすめて」。
   * 本番へ 急いで 出すための 仮の 例外。禁止語の 一覧（schema.ts）を 見直す ときに 外す。
   */
  const ALLOWED: Record<string, string[]> = {
    [join("js", "stages", "ch3.js")]: ["ああ… ダメだった…。"],
  };

  it("学習者を 見下す 言葉が 無い", () => {
    for (const file of files) {
      const text = (ALLOWED[file] ?? []).reduce((t, ok) => t.replaceAll(ok, ""), read(file));
      for (const word of FORBIDDEN_LEARNER_WORDS)
        expect(text.includes(word), `${file}: ${word}`).toBe(false);
    }
  });

  it("使わない 国名が 無い（タイトル・タイミング は 通す）", () => {
    const findings = files.flatMap((file) => checkCountryNamesInTexts(file, [read(file)]));
    expect(findings).toEqual([]);
  });
});

describe("おわりの 合図（nexmax-bridge.js）", () => {
  const BRIDGE = read("nexmax-bridge.js");
  const ORIGIN = "https://academy.example";

  /** ゲームの 中身を 最小に まねた window で 合図の ファイルを 動かす。 */
  function run({ embedded, played, total }: { embedded: boolean; played: number; total: number }) {
    const ids = Array.from(
      { length: total },
      (_, i) => `${Math.floor(i / 10) + 1}-${(i % 10) + 1}`,
    );
    const best: Record<string, string> = {};
    for (const id of ids.slice(0, played)) best[id] = "ok";
    const posted: { data: unknown; origin: string }[] = [];
    const KY = {
      stages: ids.map((id) => ({ id })),
      store: {
        recordBest(id: string, grade: string) {
          best[id] = grade;
          return { best };
        },
      },
      ui: {
        progress: () => ({ ids, played: ids.filter((id) => best[id]).length }),
      },
    };
    const win: Record<string, unknown> = { KY, location: { origin: ORIGIN } };
    win.parent = embedded
      ? { postMessage: (data: unknown, origin: string) => posted.push({ data, origin }) }
      : win;
    new Function("window", BRIDGE)(win);
    return { KY, ids, posted };
  }

  it("iframe で ない（単独で 開いた）ときは 何も 送らない", () => {
    const { KY, ids, posted } = run({ embedded: false, played: 49, total: 50 });
    KY.store.recordBest(ids[49]!, "great");
    expect(posted).toEqual([]);
  });

  it("最後の 1ステージを 遊んだ ときに 1回だけ 送る", () => {
    const { KY, ids, posted } = run({ embedded: true, played: 48, total: 50 });
    KY.store.recordBest(ids[48]!, "ky");
    expect(posted).toHaveLength(0);
    KY.store.recordBest(ids[49]!, "ok");
    expect(posted).toHaveLength(1);
    KY.store.recordBest(ids[0]!, "great");
    expect(posted).toHaveLength(1);
  });

  it("前に ぜんぶ 遊んで いた 人は、開いた だけで 届く", () => {
    const { posted } = run({ embedded: true, played: 50, total: 50 });
    expect(posted).toHaveLength(1);
  });

  it("送る 合図は アプリの 受け口が「おわった」と 読む 形（この 教材の id・同じ 置き場あて）", () => {
    const { posted } = run({ embedded: true, played: 50, total: 50 });
    const [{ data, origin }] = posted as [{ data: { type: string }; origin: string }];
    expect(data.type).toBe(DONE_MESSAGE);
    expect(readLinkMessage(data, LINK.id)).toEqual({ kind: "done" });
    expect(origin).toBe(ORIGIN);
  });
});

describe("合図が 頼る ゲームの 名前", () => {
  it("1ステージ ごとの 記録は KY.store.recordBest を その場で 呼ぶ（包めば 数えられる）", () => {
    expect(read("js", "ui", "play.js")).toContain("KY.store.recordBest(");
    expect(read("js", "core", "storage.js")).toMatch(/KY\.store = \{[^}]*recordBest/);
  });

  it("UI.progress が 遊んだ 数と 全部の 数を 返す", () => {
    const common = read("js", "ui", "common.js");
    expect(common).toMatch(/UI\.progress = function/);
    expect(common).toMatch(/return \{[^}]*\bids\b[^}]*\bplayed\b/);
  });
});

describe("ステージの 並び", () => {
  it("「空気を 読む」は 地図で「報連相：報告」の すぐ 後に 出る", () => {
    const dir = join("content", "stages");
    const stages = readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => stageSchema.parse(JSON.parse(readFileSync(join(dir, name), "utf8"))));
    const order = sortStages(stages).map((stage) => stage.id);
    expect(order[order.indexOf("houkoku") + 1]).toBe("kuuki");
  });
});
