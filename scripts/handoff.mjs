/**
 * handoff — 「今どこにいるか」を git と台帳から復元して表示する。
 *
 * なぜ要るか: Claude がリミットで突然切れると、引き継ぎメモを書き残す時間がない。
 * そこで渡す側ではなく **受け取った側（Codex など）が到着時に引き出す** 方式にする。
 * セッション開始時・ツール切替直後に実行すれば、前のツールの記憶なしで現在地が分かる。
 *
 * 表示は2層: 最初の「サマリ」だけで全体（自分・本番・STG・本体の異常）が掴めること。
 * ユーザーはワーキングメモリーが枯渇気味 — 冒頭数行がすべてだと思って書く。
 *
 *   npm run handoff
 */
import { execSync } from "node:child_process";
import { basename } from "node:path";

const sh = (cmd, timeout = 15000) => {
  try {
    return execSync(cmd, { encoding: "utf8", timeout, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
};

// 保護パスの正リストは scripts/check_protected_paths.mjs（検問）。ここは表示用の要約。
const PROTECTED = [
  "AGENTS.md",
  "CLAUDE.md",
  "docs/design/",
  "src/content/schema.ts",
  "src/app/globals.css",
  "public/img/characters/",
  "package.json",
  ".github/",
  ".claude/settings.json",
];
const line = "─".repeat(64);

/*
 * 比べる相手は **2つある**（2026-08-27 の統合ブランチ運用から）。
 *
 *   STG  … `integration`（作業ブランチのマージ先。マージのたび自動更新）
 *   本番 … `main`（`integration` からの昇格先。授業のある火・水・金 17:05 ICT に自動）
 *
 * ここを1本（origin/main）にしていたころは、**正常なのに STG が恒久的に ⚠** になった
 * ——STG に載っているのは main ではないのだから、当たり前に食い違う。
 * 作業ブランチの基準も `integration` である（PR の宛先がそこなので）。
 */
const STG_BRANCH = "integration";
const PROD_BRANCH = "main";

const branch = sh("git rev-parse --abbrev-ref HEAD");
// **1本ずつ取る。** まとめて渡すと、片方が origin に無いだけで fetch 全体が失敗し、
// もう片方まで古いままになる。
for (const ref of [STG_BRANCH, PROD_BRANCH]) sh(`git fetch origin ${ref} --quiet`);

/** ref が手もとに無いときは、ローカルの同名ブランチへ落とす（オフラインでも動くように）。 */
const resolveBase = (name) =>
  sh(`git rev-parse --verify origin/${name}`) ? `origin/${name}` : name;

const stgBase = resolveBase(STG_BRANCH);
const prodBase = resolveBase(PROD_BRANCH);
const stgBaseSha = sh(`git rev-parse ${stgBase}`);
const prodBaseSha = sh(`git rev-parse ${prodBase}`);

// 作業ブランチは integration から切って integration へ戻す。差はそこと比べる。
const base = stgBase;
const ahead = sh(`git rev-list --count ${base}..HEAD`) || "?";
const behind = sh(`git rev-list --count HEAD..${base}`) || "?";
const dirty = sh("git status --porcelain");
const dirtyCount = dirty ? dirty.split("\n").length : 0;

// ── デプロイ状態（/api/version にビルド時SHAが焼き込まれている。未デプロイ期間は「確認不可」）
//
// **比べる相手を引数で受ける。** STG は integration、本番は main。
// 1本の基準で両方を見ていたころは、STG が正常でも ⚠ を出し続けていた。
async function deployState(url, baseRef, baseRefSha, baseLabel) {
  try {
    // クエリはエッジキャッシュ避け（/api/version は s-maxage が長く、素のURLは古い版を返しうる）
    const res = await fetch(`${url}/api/version?t=${Date.now()}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { label: "確認不可（/api/version 未デプロイ。次回デプロイ後に有効）" };
    const { sha } = await res.json();
    if (!sha) return { label: "確認不可（SHAなし）" };
    if (sha === baseRefSha) return { label: `${baseLabel} と同一 ✅`, sha };
    // `gap` は **文字列**。"0" でも truthy なので、そのまま真偽に使うと
    // 「0 コミット前 ⚠」という意味の無い表示になる（実際に出ていた）。
    // 数えられなかったとき（そのコミットが手もとに無い）も "" が返るので、
    // **0 と「数えられない」を混ぜない**——`Number("")` は 0 になってしまう。
    const gapRaw = sh(`git rev-list --count ${sha}..${baseRef}`);
    const when = sh(`git log -1 --format=%ad --date=format:'%m-%d %H:%M' ${sha}`);
    if (gapRaw === "") {
      return { label: `${baseLabel} と照合できず ⚠（${sha.slice(0, 7)}）`, sha };
    }
    return {
      label:
        Number(gapRaw) > 0
          ? `${baseLabel} の ${gapRaw} コミット前 ⚠（${sha.slice(0, 7)}・${when || "?"}）`
          : `${baseLabel} に無いコミット ⚠（${sha.slice(0, 7)}）`,
      sha,
    };
  } catch {
    return { label: "確認不可（オフライン/タイムアウト）" };
  }
}

// ── worktree 一覧（フォルダ名とブランチは一致しないことがある — 転用の歴史があるため）
function worktrees() {
  const raw = sh("git worktree list --porcelain");
  if (!raw) return [];
  return raw.split("\n\n").map((block) => {
    const get = (key) => (block.match(new RegExp(`^${key} (.+)$`, "m")) || [])[1] || "";
    return {
      path: get("worktree"),
      sha: get("HEAD"),
      branch: get("branch").replace("refs/heads/", "") || "(detached)",
      prunable: /^prunable/m.test(block),
    };
  });
}

const wts = worktrees();
const mainWt = wts[0]; // 先頭は常にリポジトリ本体
let mainWarning = "";
if (mainWt && mainWt.branch !== PROD_BRANCH) {
  const mBehind = sh(`git rev-list --count ${mainWt.sha}..${base}`) || "?";
  const mDirty = sh(`git -C ${JSON.stringify(mainWt.path)} status --porcelain`);
  const mDirtyCount = mDirty ? mDirty.split("\n").length : 0;
  mainWarning =
    `⚠ リポジトリ本体が ${mainWt.branch} のまま` +
    `（${STG_BRANCH}から ${mBehind} 遅れ・未コミット ${mDirtyCount} 件）。本体で新セッションを開かない`;
}

const [prod, stg] = await Promise.all([
  deployState("https://academy.nexmax.workers.dev", prodBase, prodBaseSha, PROD_BRANCH),
  deployState("https://staging-academy.nexmax.workers.dev", stgBase, stgBaseSha, STG_BRANCH),
]);

// ── 本番待ち: 統合ブランチに入っているのに、まだ本番へ出ていない変更。
//
// **「本番OK」を待っているのではない。** 授業のある火・水・金 17:05 ICT に
// ワークフローが自動で `integration` → `main` を昇格して本番へ出す（docs/deploy.md §0.6）。
// ここに出るのは「次の授業前に届くもの」の一覧である。
// 何日も居座るようなら、自動デプロイが落ちている（Actions を見る）。
let pendingProd = [];
if (prod.sha && prod.sha !== stgBaseSha) {
  const raw = sh(
    `git log --first-parent --format='  %h %ad %s' --date=format:'%m-%d %H:%M' ${prod.sha}..${stgBase}`,
  );
  // sh() が全体を trim するので、1行目だけ字下げが落ちる。そろえ直す
  if (raw) pendingProd = raw.split("\n").map((l) => (l.startsWith("  ") ? l : `  ${l}`));
}

// ── 次の一手（状態から機械的に導出）
//
// **ユーザーに「本番OK」を求める文言を出さない。** 2026-08-21 にその運用はやめた
// （docs/constraints.md）。いまは「授業前に時刻で出る」ので、待つ相手が人ではない。
let next = "台帳から次の願いを選ぶ";
if (Number(behind) > 0) next = `origin/${STG_BRANCH} を取り込む（${behind} コミット遅れ）`;
else if (dirtyCount > 0) next = "未コミットの変更を確認してから続きを判断する";
else if (pendingProd.length)
  next =
    `本番待ち ${pendingProd.length} 件 — 次の授業前（火・水・金 17:05 ICT）に自動で出ます。` +
    "先に出すなら Actions「デプロイ」→ Run workflow → production";
else if (prod.sha && prod.sha !== prodBaseSha)
  next = `本番と ${PROD_BRANCH} の差を確認する（docs/deploy.md §0.6）`;

console.log(`\n${line}\n 現在地レポート（handoff）\n${line}`);
console.log(`\n■ サマリ`);
console.log(
  `  あなた : ${branch}（${STG_BRANCH}比 +${ahead}/-${behind}・未コミット ${dirtyCount} 件）`,
);
console.log(`  本番   : ${prod.label}（配信元 ${PROD_BRANCH}）`);
console.log(`  STG    : ${stg.label}（配信元 ${STG_BRANCH}）`);
if (mainWarning) console.log(`  ${mainWarning}`);
console.log(`  次の一手: ${next}`);

if (pendingProd.length) {
  console.log(
    `\n■ 本番待ち（${STG_BRANCH} にあり本番に無い。火・水・金 17:05 ICT に自動で出ます。docs/deploy.md §0.6）`,
  );
  for (const l of pendingProd.slice(0, 12)) console.log(l);
  if (pendingProd.length > 12) console.log(`  …ほか ${pendingProd.length - 12} 件`);
}

// ── DB: 移行SQLが流れているか（2026-08-26 の事故）。
//
// コードは本番に載ったのに DB が受け付けない、という状態が2日間 誰にも見えなかった。
// 画面にも CI にも印が出ず、たまたま DB を覗いて気づいた（30人ログイン / 名簿23人）。
// ここは全ツール共通の入口なので、**確かめられないなら確かめられないと言う**。
//
// **`sh` を使わない。** `sh` は失敗した実行の出力を捨てるので、流し忘れが
// 見つかったとき（＝いちばん出したいとき）だけ何も出ない、という穴になる。
// ここは終了コードに関わらず、標準出力も標準エラーもそのまま拾う。
console.log(`\n■ DB（移行SQL）`);
const migrations = (() => {
  try {
    return execSync("node scripts/check_migrations.mjs 2>&1", {
      encoding: "utf8",
      timeout: 60000,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    return String(error.stdout ?? "") + String(error.stderr ?? "");
  }
})();
for (const l of (migrations.trim() || "（見張りを実行できませんでした）").split("\n")) {
  console.log(`  ${l}`);
}

const recent = sh("git log -3 --format='  %h %ad %s' --date=format:'%m-%d %H:%M'");
if (recent) console.log(`\n■ 直近のコミット\n${recent}`);

console.log(`\n■ 未コミットの変更`);
if (!dirty) {
  console.log("  なし（きれいな状態）");
} else {
  for (const l of dirty.split("\n")) {
    const file = l.slice(3);
    const warn = PROTECTED.some((p) => file.includes(p)) ? "  ⚠共有ファイル" : "";
    console.log(`  ${l}${warn}`);
  }
  console.log("  → やりかけの可能性。内容を確認してから続きを判断すること");
}

// ── 並行スレッド: worktree ↔ ブランチの対応表（名前が当てにならないので必ずここで見る）
const cwd = sh("git rev-parse --show-toplevel");
const others = wts.filter((w) => w.path !== cwd);
if (others.length) {
  console.log(`\n■ 並行スレッド（worktree ⇄ ブランチ。触らないこと）`);
  for (const w of others) {
    const dir = basename(w.path);
    const slug = dir.replace(/-[0-9a-f]{6}$/, "");
    const isRepoRoot = w.path === mainWt?.path;
    const mismatch =
      !isRepoRoot && w.branch !== "(detached)" && !w.branch.includes(slug) ? "⇄名前と不一致" : "";
    const last = sh(`git log -1 --format='%h %ad %s' --date=format:'%m-%d' ${w.sha}`);
    const wDirty = sh(`git -C ${JSON.stringify(w.path)} status --porcelain`);
    const wDirtyCount = wDirty ? wDirty.split("\n").length : 0;
    const marks = [
      isRepoRoot ? "（リポジトリ本体）" : "",
      wDirtyCount ? `未コミット${wDirtyCount}件` : "",
      w.prunable ? "prunable（git worktree prune で掃除可）" : "",
      mismatch,
    ]
      .filter(Boolean)
      .join("・");
    console.log(`  ${dir}`);
    console.log(`    → ${w.branch}  ${last}${marks ? `  ${marks}` : ""}`);
  }
}

// ── 台帳（GitHub Issues）
const originUrl = sh("git remote get-url origin")
  .replace(/\.git$/, "")
  .replace(/^git@github\.com:/, "https://github.com/");
const issues = sh(
  `gh issue list --state open --limit 10 --json number,title --template '{{range .}}  #{{.number}} {{.title}}{{"\\n"}}{{end}}'`,
  20000,
);
console.log(`\n■ 願いの台帳（未完了）`);
console.log(issues || `  （取得できず。${originUrl}/issues を直接見る）`);

/*
 * 検証の 道順を 毎回 出す。
 *
 * なぜ ここに 書くか: 手もとで build・e2e全件・cf:build を ぜんぶ 回すと **約9分**
 * かかり、そのあと CI が **同じ ことを もう一度** 5分かけて やる。2026-08-25 の
 * 実測では、この 二重ばらいが 1回の 修正の 待ち時間の いちばん 大きい 塊だった。
 * ドキュメントに 書いても セッションが 変わると 読まれないので、毎回 目に 入る
 * ここに 出す。
 */
console.log(`\n■ 検証の はやい道（手もとで 全部 回さない — CI が 同じ ことを やる）`);
console.log(
  "  押す前   : node scripts/check_fast.mjs   … 整形・型・コンテンツ・単体を 並列で 約25秒",
);
console.log("             （git push の pre-push が 自動で 回す。CI の 赤の 大半は ここで 出る）");
console.log(
  "  e2e      : npx playwright test tests/e2e/<直したところ>.spec.ts … 全件は CI に任せる",
);
console.log("  大きさ   : CI の size ジョブに任せる（手もとの cf:build は 81秒）");
console.log("  くわしくは docs/自動でたしかめる1枚.md §7");

console.log(`\n■ 作業前に読むもの`);
console.log("  AGENTS.md（規律・ツール共通） / docs/constraints.md（言われた制約の台帳）");
console.log(`${line}\n`);
