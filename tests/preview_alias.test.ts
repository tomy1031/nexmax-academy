import { describe, expect, it } from "vitest";
import {
  buildUploadArgs,
  mayPublishShared,
  shouldPopulateRemoteCache,
  toAlias,
  usesAssetsCache,
} from "../scripts/preview_alias.mjs";
import { cachePopulated } from "../scripts/lib/cache_populated.mjs";

/** wrangler.jsonc の Worker 名が "academy"（7文字）なので 63 - 7 - 1。 */
const MAX = 55;

describe("ブランチ名 → Cloudflare のエイリアス", () => {
  it("Cloudflare が受け付ける文字だけになる（英小文字・数字・ダッシュ）", () => {
    // 実際のブランチ名。`/` を含むのでそのままでは使えない。
    expect(toAlias("claude/character-personality-design-2328fd", MAX)).toBe(
      "claude-character-personality-design-2328fd",
    );
    expect(toAlias("feature/Map_UI", MAX)).toBe("feature-map-ui");
  });

  it("先頭は必ず英小文字（数字・ダッシュ始まりは拒否される）", () => {
    expect(toAlias("2328fd-design", MAX)).toBe("fd-design");
    expect(toAlias("-leading-dash", MAX)).toBe("leading-dash");
    expect(toAlias("123/main", MAX)).toBe("main");
  });

  it("ダッシュが連続せず、末尾にも残らない", () => {
    expect(toAlias("a//b__c", MAX)).toBe("a-b-c");
    expect(toAlias("trailing///", MAX)).toBe("trailing");
  });

  it("DNSラベルの63文字に収まるよう切り詰める（末尾のダッシュも残さない）", () => {
    const long = `claude/${"x".repeat(80)}`;
    const alias = toAlias(long, MAX);
    expect(alias.length).toBe(MAX);
    expect(alias.endsWith("-")).toBe(false);
    // 切り詰めた位置がダッシュでも末尾に残さない
    expect(toAlias(`${"a".repeat(MAX)}-tail`, MAX)).toBe("a".repeat(MAX));
    expect(toAlias(`${"a".repeat(MAX - 1)}-tail`, MAX)).toBe("a".repeat(MAX - 1));
  });

  it("main / integration はそのまま staging にはならない（呼び出し側で staging を渡す）", () => {
    // 共有エイリアスのガードは alias === "staging" で判定するので、
    // 何かのブランチ名が勝手に staging に化けると **ガードの入口ごと素通り**する。
    expect(toAlias("main", MAX)).toBe("main");
    expect(toAlias("integration", MAX)).toBe("integration");
  });

  it("英小文字が残らない名前は、黙って変な名前にせずエラーにする", () => {
    expect(() => toAlias("2328", MAX)).toThrow(/エイリアスを作れません/);
    expect(() => toAlias("日本語", MAX)).toThrow(/エイリアスを作れません/);
  });
});

/**
 * STG（共有エイリアス `staging`）へ上げてよいかの判定。
 *
 * **2026-08-27 に基準を main から integration へ「移した」**（外したのではない）。
 * STG の配信元が統合ブランチになったので、比べる相手が origin/integration になる。
 * ガードの仕組み——**ブランチ名ではなく中身で判定する**——はそのまま。
 */
describe("staging へ上げてよいかの判定", () => {
  const INTEGRATION = "aaaaaaa";
  const OTHER = "bbbbbbb";

  it("integration からは上げられる", () => {
    expect(mayPublishShared("integration", OTHER, INTEGRATION)).toBe(true);
  });

  it("integration へ早送り済みの作業ブランチからも上げられる（内容が同一なので）", () => {
    // worktree を使っていると同じブランチは1か所でしか checkout できない。
    // ブランチ名だけで判定すると、唯一の逃げ道が「integration の worktree から上げる」に
    // なり、そこに他セッションの未コミット変更があるとそれごと staging に載ってしまう。
    // CI（Actions「デプロイ」）は detached HEAD なので、実運用でもこの経路を通る。
    expect(mayPublishShared("claude/feature-x", INTEGRATION, INTEGRATION)).toBe(true);
    expect(mayPublishShared("HEAD", INTEGRATION, INTEGRATION)).toBe(true);
  });

  it("中身が違う作業ブランチからは上げられない（許可を広げすぎていないこと）", () => {
    // **この1本が 2026-08-04 の巻き戻し事故を直接守っている。**
    // 「MAIN_BRANCHES に integration を足すだけ」の実装にすると、
    // ブランチ名さえ合えば中身が何でも通るようになり、ここが赤くなる。
    expect(mayPublishShared("claude/feature-x", OTHER, INTEGRATION)).toBe(false);
  });

  it("main からは上げられない（main は本番の配信元であって STG のものではない）", () => {
    // 統合ブランチ運用では、main の中身を staging に載せると
    // integration に溜まっている確認前の作業が STG から消える。
    // 昇格直後（main === integration）だけは、下の中身の判定が通す。
    expect(mayPublishShared("main", OTHER, INTEGRATION)).toBe(false);
    expect(mayPublishShared("master", OTHER, INTEGRATION)).toBe(false);
    expect(mayPublishShared("main", INTEGRATION, INTEGRATION)).toBe(true);
  });

  it("origin/integration が取れないときは通さない（古い ref で誤って通さないため）", () => {
    expect(mayPublishShared("claude/feature-x", OTHER, null)).toBe(false);
    expect(mayPublishShared("main", OTHER, null)).toBe(false);
    // integration ブランチ自身は、ref が取れなくてもブランチ名で通す
    expect(mayPublishShared("integration", OTHER, null)).toBe(true);
  });
});

/**
 * 作りおきの置き場を どちらにするか（2026-09-02）。
 *
 * **STG も 静的アセット側**にした。それまでの「KV のまま温めない」（2026-08-27）は、
 * 各ページ初回のフルSSRで後追いに温まる前提だったが、重いページはその初回が
 * Error 1102 で落ちるので **永久に温まらない**。実測で STG の KV は 13鍵しか
 * 無かった（本番は 132鍵）。理由と数字は preview_alias.mjs の `usesAssetsCache`。
 *
 * KV で温め直す道は塞がっている: STG は平均 8.2回/日 × 約110件 ＝ 900件/日で、
 * 無料枠（書き込み 1000件/日）を本番の温めと取り合い、
 * **その日の本番が作りおきゼロで出る**（2026-08-26 に実発生）。
 */
describe("作りおきをどこから読ませるか", () => {
  it("STG（staging）は静的アセット側 — KV書き込み0件で全ページ分が載る", () => {
    expect(usesAssetsCache("staging", undefined)).toBe(true);
  });

  it("ブランチ確認URLは環境変数で選ぶ（これまでどおり）", () => {
    expect(usesAssetsCache("my-branch", "assets")).toBe(true);
    expect(usesAssetsCache("my-branch", undefined)).toBe(false);
  });
});

describe("上げたあとに KV の作りおきを温めるか", () => {
  it("STG（staging）では温めない — デプロイ時の KV 書き込みを 0件にする", () => {
    expect(shouldPopulateRemoteCache("staging", false)).toBe(false);
  });

  it("ブランチ確認URL（assets モード）でも温めない — すでにローカルで写してある", () => {
    expect(shouldPopulateRemoteCache("my-branch", true)).toBe(false);
    expect(shouldPopulateRemoteCache("staging", true)).toBe(false);
  });

  it("それ以外の KV モードでは温める（本番の見張りと同じ規則を通す）", () => {
    expect(shouldPopulateRemoteCache("my-branch", false)).toBe(true);
  });
});

describe("上げるときの引数（作りおきをどこから読ませるか）", () => {
  it("ブランチ確認URLには OPEN_NEXT_CACHE=assets を付ける（KV書き込み0件にするため）", () => {
    expect(buildUploadArgs("my-branch", true)).toEqual([
      "versions",
      "upload",
      "--preview-alias",
      "my-branch",
      "--var",
      "OPEN_NEXT_CACHE:assets",
    ]);
  });

  it("STG にも付ける（作りおきを必ず全ページ載せて Error 1102 を断つ）", () => {
    expect(buildUploadArgs("staging", usesAssetsCache("staging", undefined))).toEqual([
      "versions",
      "upload",
      "--preview-alias",
      "staging",
      "--var",
      "OPEN_NEXT_CACHE:assets",
    ]);
  });

  it("KV モードのときは付けない（本番と同じ経路で作りおきを読む）", () => {
    expect(buildUploadArgs("my-branch", false)).toEqual([
      "versions",
      "upload",
      "--preview-alias",
      "my-branch",
    ]);
  });
});

/**
 * 作りおき（KVキャッシュ）が入ったかの 見分け（2026-08-26）。
 *
 * **「デプロイ成功」は「作りおきが入った」ではない。** 0件のまま成功で
 * 終わった版を上げると、全アクセスがフルSSRになって Error 1102 が出る
 * （docs/deploy.md §0.9）。終了コードだけを信じない、が この検査の 中身。
 */
describe("作りおきが入ったか", () => {
  it("件数つきで成功していれば上げてよい", () => {
    expect(cachePopulated(0, "Successfully populated cache with 73 entries")).toBe(true);
  });

  it("0件なら上げない（成功と出ていても中身が無い）", () => {
    expect(cachePopulated(0, "Successfully populated cache with 0 entries")).toBe(false);
  });

  it("件数の一行が出ていなければ上げない", () => {
    // 2026-08-26 に実際に出た形。枠切れでスタックトレースだけが残る。
    expect(cachePopulated(0, "Inserting 73 assets to remote KV in chunks of 25\nError: ...")).toBe(
      false,
    );
  });

  it("終了コードが 0 でなければ上げない", () => {
    expect(cachePopulated(1, "Successfully populated cache with 73 entries")).toBe(false);
    expect(cachePopulated(null, "")).toBe(false);
  });
});
