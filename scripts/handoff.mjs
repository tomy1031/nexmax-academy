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

const branch = sh("git rev-parse --abbrev-ref HEAD");
sh("git fetch origin main --quiet");
const base = sh("git rev-parse --verify origin/main") ? "origin/main" : "main";
const baseSha = sh(`git rev-parse ${base}`);
const ahead = sh(`git rev-list --count ${base}..HEAD`) || "?";
const behind = sh(`git rev-list --count HEAD..${base}`) || "?";
const dirty = sh("git status --porcelain");
const dirtyCount = dirty ? dirty.split("\n").length : 0;

// ── デプロイ状態（/api/version にビルド時SHAが焼き込まれている。未デプロイ期間は「確認不可」）
async function deployState(url) {
  try {
    // クエリはエッジキャッシュ避け（/api/version は s-maxage が長く、素のURLは古い版を返しうる）
    const res = await fetch(`${url}/api/version?t=${Date.now()}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { label: "確認不可（/api/version 未デプロイ。次回デプロイ後に有効）" };
    const { sha } = await res.json();
    if (!sha) return { label: "確認不可（SHAなし）" };
    if (sha === baseSha) return { label: "main と同一 ✅", sha };
    const gap = sh(`git rev-list --count ${sha}..${base}`);
    const when = sh(`git log -1 --format=%ad --date=format:'%m-%d %H:%M' ${sha}`);
    return {
      label: gap
        ? `main の ${gap} コミット前 ⚠（${sha.slice(0, 7)}・${when || "?"}）`
        : `main に無いコミット ⚠（${sha.slice(0, 7)}）`,
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
if (mainWt && mainWt.branch !== "main") {
  const mBehind = sh(`git rev-list --count ${mainWt.sha}..${base}`) || "?";
  const mDirty = sh(`git -C ${JSON.stringify(mainWt.path)} status --porcelain`);
  const mDirtyCount = mDirty ? mDirty.split("\n").length : 0;
  mainWarning =
    `⚠ リポジトリ本体が ${mainWt.branch} のまま` +
    `（mainから ${mBehind} 遅れ・未コミット ${mDirtyCount} 件）。本体で新セッションを開かない`;
}

const [prod, stg] = await Promise.all([
  deployState("https://academy.nexmax.workers.dev"),
  deployState("https://staging-academy.nexmax.workers.dev"),
]);

// ── 次の一手（状態から機械的に導出）
let next = "台帳から次の願いを選ぶ";
if (Number(behind) > 0) next = `origin/main を取り込む（${behind} コミット遅れ）`;
else if (dirtyCount > 0) next = "未コミットの変更を確認してから続きを判断する";
else if (prod.sha && prod.sha !== baseSha) next = "本番と main の差を確認する（台帳 #5）";

console.log(`\n${line}\n 現在地レポート（handoff）\n${line}`);
console.log(`\n■ サマリ`);
console.log(`  あなた : ${branch}（main比 +${ahead}/-${behind}・未コミット ${dirtyCount} 件）`);
console.log(`  本番   : ${prod.label}`);
console.log(`  STG    : ${stg.label}`);
if (mainWarning) console.log(`  ${mainWarning}`);
console.log(`  次の一手: ${next}`);

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

console.log(`\n■ 作業前に読むもの`);
console.log("  AGENTS.md（規律・ツール共通） / docs/constraints.md（言われた制約の台帳）");
console.log(`${line}\n`);
