/**
 * handoff — 「今どこにいるか」を git と台帳から復元して表示する。
 *
 * なぜ要るか: Claude がリミットで突然切れると、引き継ぎメモを書き残す時間がない。
 * そこで渡す側ではなく **受け取った側（Codex など）が到着時に引き出す** 方式にする。
 * セッション開始時・ツール切替直後に実行すれば、前のツールの記憶なしで現在地が分かる。
 *
 *   npm run handoff
 */
import { execSync } from "node:child_process";

const sh = (cmd, timeout = 15000) => {
  try {
    return execSync(cmd, { encoding: "utf8", timeout, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
};

const PROTECTED = [
  "AGENTS.md",
  "CLAUDE.md",
  "docs/design/",
  "src/content/schema.ts",
  "package.json",
];
const line = "─".repeat(64);

console.log(`\n${line}\n 現在地レポート（handoff）\n${line}`);

// 1. このスレッド
const branch = sh("git rev-parse --abbrev-ref HEAD");
sh("git fetch origin main --quiet");
const base = sh("git rev-parse --verify origin/main") ? "origin/main" : "main";
const ahead = sh(`git rev-list --count ${base}..HEAD`) || "?";
const behind = sh(`git rev-list --count HEAD..${base}`) || "?";
console.log(`\n■ このスレッド`);
console.log(`  ブランチ : ${branch}`);
console.log(
  `  main比   : 先に ${ahead} / 遅れ ${behind} ${Number(behind) > 0 ? "⚠ 作業前に main を取り込むこと" : ""}`,
);
const recent = sh("git log -3 --format='  %h %ad %s' --date=format:'%m-%d %H:%M'");
if (recent) console.log(`\n■ 直近のコミット\n${recent}`);

// 2. 未コミットの変更（＝前のツールがやりかけたこと）
const dirty = sh("git status --porcelain");
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

// 3. 他スレッド（並行ブランチ）
const others = sh(
  `git for-each-ref --sort=-committerdate --format='%(refname:short)|%(committerdate:relative)' refs/heads/`,
)
  .split("\n")
  .filter((l) => l && !l.startsWith(`${branch}|`) && !l.startsWith("main|"))
  .slice(0, 5);
if (others.length) {
  console.log(`\n■ 他の並行ブランチ（触らないこと）`);
  for (const o of others) {
    const [b, when] = o.split("|");
    console.log(`  ${b}（${when}）`);
  }
}

// 4. 台帳（GitHub Issues）
const issues = sh(
  `gh issue list --state open --limit 10 --json number,title,labels --template '{{range .}}  #{{.number}} {{.title}}{{"\\n"}}{{end}}'`,
  20000,
);
console.log(`\n■ 願いの台帳（未完了）`);
console.log(
  issues || "  （取得できず。https://github.com/tomy1031/nexmax-academy/issues を直接見る）",
);

// 5. 必読
console.log(`\n■ 作業前に読むもの`);
console.log("  AGENTS.md          … 規律と多スレッド運用ルール（ツール共通）");
console.log("  docs/constraints.md … 言われた制約の台帳（N4語彙・無料枠など）");
console.log(`\n■ 守ること（要点）`);
console.log("  ・共有ファイルは単独で変えない（コミット時に止まる。承認済みなら ALLOW_SHARED=1）");
console.log("  ・staging と本番の更新は main からのみ");
console.log("  ・報告は ✅結果 / 📁範囲 / 🧪証拠(URL+手順) / ⏭次の一手 / ❓判断(A/B)");
console.log(`${line}\n`);
