#!/usr/bin/env node
/**
 * load_class — 授業と 同じ 混みぐあいを 作って、1102 が 出ないかを 見る。
 *
 * ## 前の 検査が 足りて いなかった こと（2026-09-03 の 指摘）
 * 「30本 同時アクセスで 1102 ゼロ」は **ログインして いない アクセス**だった。
 * 教材ページは 関所で ログイン画面へ 307 で 返されるので、**重い 処理を 1つも
 * 通って いない**。それを「合格」と 数えては いけない。
 *
 * ここでは **中身が 返って きた ことを 確かめる**:
 *   - 200 で ある こと（307 は 数えない）
 *   - 本文に 教材の 印が ある こと（ログイン画面の HTML では ない こと）
 *   - `error code: 1102` / `Worker exceeded` が 本文に 無い こと
 * どれか 1つでも 欠ければ **失敗**に する。
 *
 * ## ログインした 目で 見るには
 * ログインは Google だけ（`title-screen.tsx`）なので、合言葉での 自動ログインは できない。
 * 代わりに **すでに ログインした ブラウザの Cookie を 1つ 借りる**。
 * Cloudflare から 見れば 30人でも 同じ 人の 30本でも **同じ 混みぐあい**なので、
 * Worker と 1102 を 見るには これで 足りる。
 *
 *   1. 検証用アカウントで STG か 本番に ログインする（学習者の アカウントは 使わない）
 *   2. 開発者ツール → Application → Cookies → `sb-...-auth-token` を まるごと コピー
 *   3. 環境変数に 入れて 走らせる（**この 値は 人に 見せない**）:
 *
 *      SB_COOKIE='sb-xxxx-auth-token=...' node scripts/load_class.mjs \
 *        --base https://staging-academy.nexmax.workers.dev --n 30
 *
 * Cookie を 渡さない ときは「匿名の ぶんしか 見て いない」と はっきり 言い、
 * **合格とは 言わない**（`--allow-anon` を 付けたときだけ 走る）。
 *
 * ## 保存（Supabase 側）は ここでは やらない
 * 保存を 30回 走らせると **本物の 学習記録が 30行 増える**。検証用アカウントを
 * 用意して、docs/授業前チェック.md の 手順で 別に 行う。
 */

const args = process.argv.slice(2);
function opt(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const BASE = opt("base", "https://staging-academy.nexmax.workers.dev").replace(/\/$/, "");
const N = Number(opt("n", "30"));
const ROUNDS = Number(opt("rounds", "1"));
const allowAnon = args.includes("--allow-anon");
const cookie = process.env.SB_COOKIE ?? "";

/** 学習者が 授業で 実際に ひらく 順路。重い ものを わざと 混ぜる。 */
const PATHS = [
  "/map",
  "/kaisha",
  "/kaisha/article-kaisha_shirabekata",
  "/kaisha/meeting-kaisha_houkoku_meeting",
  "/kaisha/quiz-kaisha_houkoku",
  "/houkoku/link-houkoku_stamp",
  "/wordtest",
  "/wordtest/kaisha",
  "/dictionary",
  "/kaihatsu/quest",
];

/** 教材の ページが 返って きた 印（ログイン画面には 無い）。 */
const CONTENT_MARK = /<main|data-stage|__next_f/i;
const LOGIN_MARK = /Google で|signInWithOAuth|はじめる/i;

if (!cookie && !allowAnon) {
  console.error("✗ SB_COOKIE がありません。");
  console.error("  ログインして いない アクセスは ログイン画面へ 307 で 返るだけで、");
  console.error(
    "  **教材の 処理を 1つも 通りません**。それを 合格と 数えないため、ここで 止めます。",
  );
  console.error("  借りかたは このファイルの 冒頭。どうしても 匿名で 測るなら --allow-anon。");
  process.exit(1);
}

async function once(path) {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      redirect: "manual",
      headers: cookie ? { cookie } : {},
    });
    const body = res.status === 200 ? await res.text() : "";
    const ms = Date.now() - started;
    const is1102 = /error code: 1102|Worker exceeded/i.test(body);
    let verdict;
    if (is1102) verdict = "1102";
    else if (res.status === 307 || res.status === 302) verdict = "ログイン画面へ 転送";
    else if (res.status !== 200) verdict = `HTTP ${res.status}`;
    else if (LOGIN_MARK.test(body) && !CONTENT_MARK.test(body)) verdict = "ログイン画面が 返った";
    else if (!CONTENT_MARK.test(body)) verdict = "中身の 印が 無い";
    else verdict = "ok";
    return { path, ms, verdict, bytes: body.length };
  } catch (error) {
    return {
      path,
      ms: Date.now() - started,
      verdict: `つながらない（${error.message}）`,
      bytes: 0,
    };
  }
}

const results = [];
for (let round = 0; round < ROUNDS; round++) {
  const wave = Array.from({ length: N }, (_, i) => once(PATHS[i % PATHS.length]));
  results.push(...(await Promise.all(wave)));
  if (round + 1 < ROUNDS) await new Promise((r) => setTimeout(r, 1000));
}

const byVerdict = new Map();
for (const r of results) byVerdict.set(r.verdict, (byVerdict.get(r.verdict) ?? 0) + 1);
const times = results.map((r) => r.ms).sort((a, b) => a - b);
const pick = (q) => times[Math.min(times.length - 1, Math.floor(times.length * q))];

console.log(`■ ${BASE} へ ${N}本 同時 × ${ROUNDS}回 = ${results.length}本`);
console.log(
  `  ログイン: ${cookie ? "あり（教材の 中身まで 見た）" : "なし（匿名。合格とは 言えない）"}`,
);
console.log("■ 結果");
for (const [verdict, n] of [...byVerdict].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${n === results.length ? "✓" : verdict === "ok" ? " " : "✗"} ${verdict}: ${n}本`);
}
console.log(`■ かかった 時間  中央 ${pick(0.5)}ms / p95 ${pick(0.95)}ms / 最遅 ${times.at(-1)}ms`);

const bad = results.filter((r) => r.verdict !== "ok");
if (bad.length > 0) {
  console.log("■ だめだった ぶん（先頭10）");
  for (const r of bad.slice(0, 10)) console.log(`  ${r.verdict}  ${r.path}  ${r.ms}ms`);
}
if (!cookie) {
  console.log("⚠ 匿名なので **合格とは 数えません**（教材の 処理を 通って いない）。");
  process.exit(1);
}
process.exit(bad.length === 0 ? 0 : 1);
