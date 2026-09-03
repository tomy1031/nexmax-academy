import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 学習者ページに `revalidate` を 置かない（2026-09-03）
 *
 * `revalidate` を 置くと、その 時間が すぎた 作りおきは「古い」に なる。OpenNext の
 * 横取りは 古いものを 見つけると **リクエストの 中で** 作り直しを 頼み、Worker が
 * 自分自身へ HEAD を 投げて **まるごと フルSSR** する。フルSSR 1回は 実測 280〜570ms
 * ——無料枠の CPU 上限 10ms の 30〜60倍で 落ちる。落ちても 鮮度は 更新されないので、
 * **次の リクエストも また 作り直そうとする**。輪が 閉じない。
 *
 * 2026-09-02 の 授業中、本番で これが 起きた:
 *
 *     outcome=exceededCpu cpu=10ms  Error: Worker exceeded CPU time limit.
 *     log: ['Revalidation failed for /kaisha/link with status 503']
 *
 * はじめは 7日（604800）に 逃がしたが、それは「7日 以内に かならず デプロイが ある」
 * ときしか 効かない。自動デプロイは 中身が 同じなら 出さない（scripts/lib/should_deploy.mjs）
 * ので、連休で 1週間 止まれば **7日目に 全ページが いっせいに 古く なって 輪が 再開する**。
 * だから 時間で 逃げるのを やめ、**作り直しの 経路に そもそも 入らない**ことを ここで 固定する。
 *
 * 実行時に 新しくする 必要が どうしても 出たら、この 検査を 消すのでは なく
 * **どのページを なぜ 例外に するか**を ここに 書き足す（消すと 輪が 黙って 戻る）。
 */
const APP = join(process.cwd(), "src", "app");

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...routeFiles(path));
    } else if (/^(page|route|layout)\.tsx?$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

/** URL に なる 順路（`src/app/` からの 相対）。 */
function rel(path: string): string {
  return path.slice(APP.length + 1);
}

const FILES = routeFiles(APP);

describe("学習者ページは 作り直さない 作りおき", () => {
  it("src/app の どこにも `export const revalidate` が ない", () => {
    const armed = FILES.filter((path) =>
      /export\s+const\s+revalidate\b/.test(readFileSync(path, "utf8")),
    ).map(rel);
    expect(armed).toEqual([]);
  });

  /**
   * 辞書 701語を サーバで 描かない（2026-09-03）
   *
   * `learnerDictionary()` を ページの props に 渡して いた ころ、作りおき 1件は
   * **1.5MB** あった（同じ 読みもので 渡さない 経路は 32KB）。作りおきに 当たって
   * いても Worker は その 1.5MB を 毎回 JSON から 起こし直して 指紋を 取り直すので、
   * 1リクエスト 50〜137ms —— 無料枠の CPU 上限 10ms を 超える。
   *
   * いまは `public/dictionary/learner.json` を **ブラウザが 取りに 行く**
   *（src/lib/dictionary-store.ts）。`public/` は Cloudflare が Worker を 起こさずに
   * 返すので、この ぶんの CPU は 0 に なる。サーバ側で 束を 組み立て直す コードが
   * 生えたら、また 積み荷に 入る —— ここで 止める。
   */
  it("ページは 辞書の 束を サーバで 組み立てない", () => {
    const offenders = FILES.filter((path) => {
      const src = readFileSync(path, "utf8");
      return /\b(learnerDictionary|buildDictionary)\b/.test(src);
    }).map(rel);
    expect(offenders).toEqual([]);
  });

  it("学習者が 開く 18の ページは `force-static`", () => {
    const learner = [
      "[stage]/[content]/page.tsx",
      "[stage]/page.tsx",
      "article/[id]/page.tsx",
      "dictionary/page.tsx",
      "link/[id]/page.tsx",
      "listening/[listening]/page.tsx",
      "listening/page.tsx",
      "manga/[id]/page.tsx",
      "map/page.tsx",
      "quest/[id]/page.tsx",
      "quiz/[set]/page.tsx",
      "quiz/page.tsx",
      "skit/[id]/page.tsx",
      "slides/[id]/page.tsx",
      "talk/[scenario]/page.tsx",
      "talk/page.tsx",
      "wordtest/[stage]/page.tsx",
      "wordtest/page.tsx",
    ];
    const missing = learner.filter((route) => {
      const path = join(APP, route);
      return !/export\s+const\s+dynamic\s*=\s*"force-static"/.test(readFileSync(path, "utf8"));
    });
    expect(missing).toEqual([]);
  });
});
