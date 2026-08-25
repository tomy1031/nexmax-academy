/**
 * 授業前の同時アクセス確認 — 20並列で主要ページを叩き、全部返ってくるかを見る。
 *
 *   node scripts/loadcheck.mjs https://staging-academy.nexmax.workers.dev
 *
 * 2026-08-25 に単語ゲームの20人同時プレイで Cloudflare の上限超過が出たための備え
 * （docs/deploy.md §0.7）。授業と同じ「20人が一斉に入室する」形を小さく再現する。
 *
 * 注意: 対象が本番/STG のときは、この確認自体が無料枠（10万リクエスト/日）を使う。
 * 総数は 100 リクエストに抑えてある。数字を増やして連打しない。
 */

const base = process.argv[2];
if (!base) {
  console.error(
    "使い方: node scripts/loadcheck.mjs <URL>   例: https://staging-academy.nexmax.workers.dev",
  );
  process.exit(1);
}

/** 授業の入室で必ず通る道。未ログインは 307（タイトルへ）で返るが、それも Worker が生きて返した証拠。 */
const PATHS = ["/", "/map", "/arcade", "/dictionary", "/api/version"];
const PARALLEL = 20; // 授業の同時人数に合わせる

/** 1リクエスト。リダイレクトは追わない（追うと1回が2回に膨れて枠を余計に食う）。 */
async function probe(path) {
  const started = performance.now();
  try {
    const res = await fetch(new URL(path, base), { redirect: "manual" });
    const body = res.status >= 500 || res.status === 429 ? await res.text() : "";
    return {
      path,
      status: res.status,
      ms: Math.round(performance.now() - started),
      // Cloudflare の上限エラーは本文にエラー番号が入る（1027=1日の回数・1102=CPU/メモリ）
      cfError: /error (1027|1102)|exceeded/i.exec(body)?.[0] ?? null,
    };
  } catch (error) {
    return { path, status: 0, ms: Math.round(performance.now() - started), cfError: String(error) };
  }
}

const results = [];
for (const path of PATHS) {
  // 1パスにつき20人が同時に開く形。パスは順番に（全パス×20を同時にすると授業より過酷になる）
  results.push(...(await Promise.all(Array.from({ length: PARALLEL }, () => probe(path)))));
}

let failed = 0;
for (const path of PATHS) {
  const rows = results.filter((r) => r.path === path);
  const byStatus = new Map();
  for (const r of rows) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
  const times = rows.map((r) => r.ms).sort((a, b) => a - b);
  const p95 = times[Math.min(times.length - 1, Math.ceil(times.length * 0.95) - 1)];
  const ok = rows.every((r) => r.status > 0 && r.status < 500 && r.status !== 429 && !r.cfError);
  if (!ok) failed += 1;
  const statuses = [...byStatus].map(([s, n]) => `${s}×${n}`).join(" ");
  console.log(`${ok ? "✅" : "❌"} ${path.padEnd(14)} ${statuses}  p95 ${p95}ms`);
  for (const r of rows.filter((r) => r.cfError)) console.log(`   ↳ ${r.cfError}`);
}

console.log(
  failed === 0
    ? `\n${PARALLEL}並列 × ${PATHS.length}ページ、全部返ってきた。授業に出せる。`
    : `\n${failed}ページで失敗あり。docs/deploy.md §0.7 の「当日の様子を見る」でエラー番号を確かめる。`,
);
process.exit(failed === 0 ? 0 : 1);
