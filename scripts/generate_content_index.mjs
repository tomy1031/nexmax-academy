#!/usr/bin/env node
/**
 * content/ の JSON を1つの TS モジュールに焼き込む（実行: npm run gen:content）
 *
 * **中身は `scripts/lib/bake_content.ts` にある。** ここはその入口でしかない。
 * 焼き込みは `src/content/schema.ts`（zod）を読む必要があり、素の node からは
 * TypeScript を import できないので、tsx を噛ませた子プロセスとして呼ぶ。
 * `npm run gen:content` の並びを変えずに済ませるための薄い層である
 *（package.json は横断変更の扱いなので、ここで吸収する）。
 *
 * 焼き込みの理由・実測値・「zod の出力を焼く」根拠は bake_content.ts の冒頭に書いた。
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const BAKER = join(ROOT, "scripts", "lib", "bake_content.ts");

const result = spawnSync(process.execPath, ["--import", "tsx", BAKER], { stdio: "inherit" });
if (result.error) {
  console.error(`✗ 焼き込みを起動できませんでした: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
