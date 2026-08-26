#!/usr/bin/env node
/**
 * ブランチごとの確認URLへ版を上げる。
 *
 * なぜ必要か:
 *   `wrangler versions upload --preview-alias staging` は**ブランチの中身を
 *   staging 全体に載せる**。部分デプロイという概念が無いので、複数セッションが
 *   同じ `staging` へ上げると、最後に上げた者以外の作業が確認URLから消える。
 *   2026-08-04、診断の文言だけを上げたつもりが、main にあったマップの7コミットを
 *   staging から巻き戻す事故が実際に起きた。
 *
 *   Cloudflare のエイリアスはブランチ単位で持てるので、確認URLを分ければ
 *   互いを踏まなくなる（1000件まで保持・古い順に破棄）。
 *   https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/
 *
 * 使い方:
 *   npm run cf:branch            # 今のブランチ名から確認URLを決めて上げる
 *   npm run cf:branch -- shindan # 名前を明示する
 *   npm run cf:staging           # `staging` へ上げる。**main の中身のときだけ許可**
 *
 * `staging` を main 専用にしてあるのは、
 * 「staging を見れば統合された最新が分かる」を成り立たせるため。
 * 作業ブランチの確認は各自のエイリアスで行う。
 * 判定はブランチ名ではなく**中身**（HEAD が origin/main と同一か）で行う。
 * 理由は `mayPublishShared` を参照。
 *
 * ログインについて:
 *   確認URLはホスト名が変わるので、Supabase の Redirect URLs に
 *   ワイルドカード1行の登録が要る（区切りは `.` と `/` だけなので `*` がホスト名にかかる）。
 *       https://*-academy.nexmax.workers.dev/**
 *   これ1行で将来のエイリアスも全部通る。手順は docs/deploy.md §0.3。
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { cachePopulated, CACHE_EMPTY_MESSAGE } from "./lib/cache_populated.mjs";

/** エイリアス名 + "-" + Worker名 が DNS ラベル上限の63文字を超えられない。 */
const DNS_LABEL_LIMIT = 63;

/** main の内容を上げるときだけ使える、統合版の確認URL。 */
const SHARED_ALIAS = "staging";

const MAIN_BRANCHES = new Set(["main", "master"]);

/**
 * `staging` へ上げてよいか。
 *
 * 守りたいのは「staging に載っているのは main だ」という性質であって、
 * ブランチ名そのものではない。**worktree を使っていると main は1か所でしか
 * checkout できない**ので、ブランチ名だけで判定すると、
 * main へ早送り済みの作業ブランチからも上げられなくなる
 * （そのとき唯一の逃げ道が「main の worktree から上げる」になるが、
 * そこに他セッションの未コミット変更があると、それごと staging に載ってしまう）。
 *
 * そこで**内容で判定する**。HEAD が origin/main と同一なら、
 * ブランチ名が何であれ staging に載るのは main の中身そのもの。
 *
 * @param {string} branch 現在のブランチ名
 * @param {string} headSha HEAD のコミット
 * @param {string | null} mainSha origin/main のコミット（取得できなければ null）
 * @returns {boolean}
 */
export function mayPublishShared(branch, headSha, mainSha) {
  if (MAIN_BRANCHES.has(branch)) return true;
  return mainSha !== null && headSha === mainSha;
}

/**
 * ブランチ名を Cloudflare のエイリアスに変換する。
 *
 * 規則（Cloudflare 側の制約）: 英小文字・数字・ダッシュのみ。先頭は英小文字。
 * `claude/character-personality-design-2328fd` のような名前はそのまま使えない。
 *
 * @param {string} branch ブランチ名
 * @param {number} maxLength エイリアスに使える最大長
 * @returns {string} 変換後のエイリアス
 */
export function toAlias(branch, maxLength) {
  const sanitized = branch
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-") // `/` や `_` や日本語をまとめてダッシュにする
    .replace(/-+/g, "-")
    .replace(/^[^a-z]+/, "") // 先頭が数字やダッシュだと Cloudflare に拒否される
    .replace(/-+$/, "");

  if (sanitized === "") {
    throw new Error(
      `ブランチ名「${branch}」からエイリアスを作れません（英小文字が1文字も残りません）。` +
        `\n  npm run cf:branch -- <名前> で明示してください。`,
    );
  }

  // 末尾がダッシュで終わらないように、切り詰めてから改めて落とす。
  return sanitized.slice(0, maxLength).replace(/-+$/, "");
}

/**
 * `wrangler versions upload` に渡す引数。
 *
 * assets モード（ブランチ確認URL）のときだけ Worker の変数 `OPEN_NEXT_CACHE=assets` を足す。
 * これが付いた版は作りおきを **静的アセット**から読む（KV書き込み0件）。
 * **staging・本番には絶対に付けない** —— 付くと先生の直しが60秒で出なくなる。
 *
 * @param {string} alias 確認URLのエイリアス
 * @param {boolean} assetsMode 静的アセットから読む版にするか
 * @returns {string[]}
 */
export function buildUploadArgs(alias, assetsMode) {
  const args = ["versions", "upload", "--preview-alias", alias];
  if (assetsMode) args.push("--var", "OPEN_NEXT_CACHE:assets");
  return args;
}

/** wrangler.jsonc から Worker 名を読む（改名に追随させるため直書きしない）。 */
function readWorkerName() {
  const source = fs.readFileSync(path.join(process.cwd(), "wrangler.jsonc"), "utf-8");
  const matched = source.match(/"name"\s*:\s*"([^"]+)"/);
  if (!matched?.[1]) throw new Error("wrangler.jsonc から Worker 名を読めませんでした。");
  return matched[1];
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf-8" }).trim();
}

/** origin/main のコミット。取れなければ null（ネットワーク不通など）。 */
function originMainSha() {
  try {
    // 判定を古い ref で通してしまわないよう、比較の直前に取り直す。
    execFileSync("git", ["fetch", "origin", "main", "--quiet"], { stdio: "ignore" });
    return git("rev-parse", "origin/main");
  } catch {
    return null;
  }
}

function main() {
  const workerName = readWorkerName();
  const maxAliasLength = DNS_LABEL_LIMIT - workerName.length - 1; // 連結する "-" のぶん
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  const requested = process.argv[2];
  const alias = requested ? toAlias(requested, maxAliasLength) : toAlias(branch, maxAliasLength);

  if (
    alias === SHARED_ALIAS &&
    !mayPublishShared(branch, git("rev-parse", "HEAD"), originMainSha())
  ) {
    console.error(
      [
        "",
        `✗ \`${SHARED_ALIAS}\` に上げられるのは main の中身だけです（いまは ${branch}）。`,
        "",
        "  確認URLは共有なので、ここへ上げると他のセッションの作業が消えます。",
        "  作業ブランチの確認には自分のエイリアスを使ってください:",
        "",
        "      npm run cf:branch",
        "",
        "  main を上げたいときは、main に切り替えるか、",
        "  このブランチを main へ早送りしてから実行してください",
        "  （HEAD が origin/main と同一なら、ブランチ名が何でも通ります）。",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }

  if (MAIN_BRANCHES.has(branch) && alias !== SHARED_ALIAS) {
    console.log(`ℹ main から \`${alias}\` へ上げます（\`${SHARED_ALIAS}\` ではありません）。`);
  }

  console.log(`→ ${branch} を https://${alias}-${workerName}.<subdomain>.workers.dev へ上げます`);

  // 作りおきページ（プリレンダー）の置き場は2つある（open-next.config.ts 参照）。
  //
  //  - assets モード（`OPEN_NEXT_CACHE=assets`。ブランチ確認URL用）
  //      Worker の静的アセットへ**ローカルでコピー**してから上げる。KV書き込みは0件。
  //      コピーは upload より**先**でなければならない（上げるのは .open-next/assets の中身）。
  //  - 既定（staging・本番）
  //      upload の**あと**に KV へ投入する。1回およそ68件の書き込みになる。
  //
  // なぜ分けるか: KV無料枠は書き込み1000件/日。キャッシュキーに buildId が入るため
  // 版を上げるたびに68件を丸ごと書き直しており、2026-08-22 に上限へ当たった。
  const assetsMode = process.env.OPEN_NEXT_CACHE === "assets";

  if (assetsMode) {
    console.log("→ 作りおきを静的アセットへ写します（KVは使いません）");
    const copied = spawnSync("npx", ["opennextjs-cloudflare", "populateCache", "local"], {
      stdio: "inherit",
    });
    if ((copied.status ?? 1) !== 0) {
      console.error(
        "\n✗ 作りおきを静的アセットへ写せませんでした。このまま上げると全ページが" +
          "\n  フルSSRになり、無料プランの CPU 上限（1リクエスト10ms）で Error 1102 に" +
          "\n  なります。中止します。\n",
      );
      process.exit(copied.status ?? 1);
    }
  }

  // assets モードでは **Worker の変数として** 渡す。open-next.config.ts の分岐は
  // ビルド時ではなく **実行時**に評価されるため（nodejs_compat + compatibility_date
  // 2025-04-01 以降で process.env が Worker の変数から埋まる）。
  // おかげで**束ねたものは staging 用と同一**で、「ブランチでは動いたのに STG で違う」が起きない。
  const result = spawnSync("wrangler", buildUploadArgs(alias, assetsMode), {
    stdio: "inherit",
  });
  if (result.error || result.status !== 0) {
    // `wrangler` は node_modules/.bin にしか無い。`npm run cf:branch` 経由なら PATH に
    // 入るが、`node scripts/preview_alias.mjs` と直叩きすると ENOENT で落ちる。
    // 以前はここが黙って終了していて、上げたつもりで上がっていなかった。
    console.error(
      `\n✗ wrangler versions upload に失敗しました${result.error ? `: ${result.error.message}` : ""}` +
        "\n  `npm run cf:branch` で実行してください（wrangler は node_modules/.bin にあります）。\n",
    );
    process.exit(result.status ?? 1);
  }

  if (!assetsMode) {
    // ビルド時プリレンダーを KV の incrementalCache へ投入する。
    // `opennextjs-cloudflare deploy`（cf:deploy）は自動でやるが、ここは素の
    // `wrangler versions upload` なので自前で呼ぶ。
    const populate = spawnSync("npx", ["opennextjs-cloudflare", "populateCache", "remote"], {
      encoding: "utf-8",
    });
    // 拾ってから流す（判定に使うため `inherit` にできない）。
    if (populate.stdout) process.stdout.write(populate.stdout);
    if (populate.stderr) process.stderr.write(populate.stderr);
    if (!cachePopulated(populate.status, `${populate.stdout ?? ""}${populate.stderr ?? ""}`)) {
      console.error(CACHE_EMPTY_MESSAGE);
      process.exit(populate.status || 1);
    }
  }

  process.exit(0);
}

// テストから import したときは実行しない。
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main();
}
