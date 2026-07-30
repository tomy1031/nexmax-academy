#!/usr/bin/env node
/**
 * Cloudflare ビルド前の秘密情報ガード。
 *
 * なぜ必要か:
 *   OpenNext の `compileEnvFiles` は `.env*` の中身を**丸ごと**
 *   `.open-next/cloudflare/next-env.mjs` に書き出し、それが Worker のバンドルに入る。
 *   秘密鍵を `.env.local` に置いたまま `opennextjs-cloudflare build` を叩くと、
 *   秘密鍵がデプロイ成果物へ同梱される。ブラウザには出ないが、
 *   ダッシュボードでコードを読める相手には見え、再ビルドなしに失効させられない。
 *
 *   NEXT_PUBLIC_* は逆に**ビルド時に必要**（バンドルへ埋め込まれるため
 *   `wrangler secret` では手遅れ）。だから「公開値は渡す・秘密は渡さない」を分ける。
 *
 * 検査対象は OpenNext が実際に読む場所と同じにしてある:
 *   ファイル（優先度順）: .env → .env.{mode} → .env.local → .env.{mode}.local
 *   （`extract-project-env-vars.js` と同じ並び。mode は既定 production）
 *   加えて process.env（CI がシェル経由で渡す場合）。
 *
 * 運用:
 *   秘密が必要になったら `wrangler secret put <NAME>` で Worker 側に置く。
 *   実行時に `process.env` から読める。
 *
 * 詳細は docs/design/09_Cloudflare移行実行計画.md、docs/deploy.md。
 */
import fs from "node:fs";
import path from "node:path";

/** バンドルに入ってはいけない環境変数。増えたらここに足す。 */
const FORBIDDEN_AT_BUILD = ["SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY"];

/** ビルド時に必須の公開値（欠けるとデモモードのまま本番に出てしまう）。 */
const REQUIRED_AT_BUILD = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];

/** OpenNext は `.dev.vars` の NEXTJS_ENV でモードを決める。デプロイ時は production。 */
const mode = process.env.NEXTJS_ENV ?? "production";

/** KEY=value の最小パーサ。値の有無の判定にしか使わないので引用符の除去だけ行う。 */
function parseEnvFile(filePath) {
  const out = new Map();
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return out;
  for (const rawLine of fs.readFileSync(filePath, "utf-8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line
      .slice(0, eq)
      .replace(/^export\s+/, "")
      .trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    out.set(key, value);
  }
  return out;
}

const envFiles = [".env", `.env.${mode}`, ".env.local", `.env.${mode}.local`];

/** name -> それを非空で定義している出所の一覧 */
function sourcesDefining(name) {
  const sources = [];
  for (const file of envFiles) {
    const value = parseEnvFile(path.join(process.cwd(), file)).get(name);
    if (value !== undefined && value.trim() !== "") sources.push(file);
  }
  const fromShell = process.env[name];
  if (typeof fromShell === "string" && fromShell.trim() !== "") sources.push("process.env");
  return sources;
}

const leaked = FORBIDDEN_AT_BUILD.map((name) => [name, sourcesDefining(name)]).filter(
  ([, sources]) => sources.length > 0,
);
const missing = REQUIRED_AT_BUILD.filter((name) => sourcesDefining(name).length === 0);

const problems = [];

if (leaked.length > 0) {
  problems.push(
    "",
    `✗ ビルド環境に秘密鍵があります（mode=${mode}）。このままだと Worker のバンドルに同梱されます。`,
    ...leaked.map(([name, sources]) => `    - ${name}  ← ${sources.join(", ")}`),
    "",
    "  対処: 出所から外す（.env.local を退避するか、その行を空にする）。",
    "        実行時に必要なら `wrangler secret put <NAME>` で Worker 側に置く。",
  );
}

if (missing.length > 0) {
  problems.push(
    "",
    "✗ ビルド時に必要な公開値が未設定です（バンドルに埋まる値なので `wrangler secret` では手遅れ）。",
    ...missing.map((name) => `    - ${name}`),
    "",
    `  対処: ${envFiles.join(" / ")} か環境変数に設定してから再実行する。`,
  );
}

if (problems.length > 0) {
  console.error([...problems, ""].join("\n"));
  process.exit(1);
}

console.log(`✓ ビルド環境の検査OK（mode=${mode}・公開値あり・秘密なし）`);
