/**
 * check_protected_paths — 共有ファイルの単独スレッド変更をコミット時に止める。
 *
 * なぜ要るか: Claude のフック（.claude/settings.json）は Claude でしか動かない。
 * リミット時に Codex へ切り替えると同じ事故（別スレッドの成果を壊す「ついで変更」）が
 * 素通りするため、ツールに依存しない husky pre-commit 側にも同じ検問を置く。
 *
 * 承認済みの変更を通すとき:
 *   ALLOW_SHARED=1 git commit -m "..."
 */
import { execSync } from "node:child_process";

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

if (process.env.ALLOW_SHARED === "1") process.exit(0);

let staged = "";
try {
  staged = execSync("git diff --cached --name-only", { encoding: "utf8" });
} catch {
  process.exit(0); // git が使えない状況では通す（安全側）
}

const hits = staged
  .split("\n")
  .filter(Boolean)
  .filter((f) => PROTECTED.some((p) => f.includes(p)));

if (hits.length > 0) {
  console.error("\n🛑 共有ファイルが含まれています（多スレッド運用ルール）:");
  for (const h of hits) console.error(`   - ${h}`);
  console.error(
    "\nこれらはスレッド単独で変えない決まりです。別スレッドの成果を壊した事故（2026-08-03〜05）の再発防止。",
  );
  console.error("ユーザーの承認があるなら次で通せます:");
  console.error("   ALLOW_SHARED=1 git commit -m ...\n");
  process.exit(1);
}
