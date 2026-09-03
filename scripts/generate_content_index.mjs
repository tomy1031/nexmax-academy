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

/**
 * 順に 走らせる。辞書（2つ目）は content/ の vocab / wordstage から 作るので、
 * 教材の 焼き込みとは 独立に 動く（並びに 意味は 無いが、失敗を まとめて 出す）。
 */
const BAKERS = [
  join(ROOT, "scripts", "lib", "bake_content.ts"),
  // ポップアップ辞書を public/ の 1枚に する（ページの 積み荷から 降ろす）。
  join(ROOT, "scripts", "lib", "bake_dictionary.ts"),
  // 単語テストの セットも 同じく public/ の 1枚に する。
  join(ROOT, "scripts", "lib", "bake_wordsets.ts"),
];

for (const baker of BAKERS) {
  const result = spawnSync(process.execPath, ["--import", "tsx", baker], { stdio: "inherit" });
  if (result.error) {
    console.error(`✗ 焼き込みを起動できませんでした: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
