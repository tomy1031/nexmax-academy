#!/usr/bin/env node
/**
 * 空気読みゲームを アプリへ 写す — `public/tools/kuuki-yomi/`
 *
 * ## なぜ 写すのか
 *
 * ゲーム「空気読み〜IT業界編〜」は **別の リポジトリ**で 作って いる（ビルドの 要らない
 * 静的な HTML と JS）。アプリでは「リンク」教材として iframe で 開く。同じ 置き場（origin）に
 * 置くと、ゲームの 中から 送る「おわった」の 合図を アプリが 受けられ、学習の 記録に 残る
 *（`src/components/link/link-view.tsx`。外の サイトからの 合図は 受けない）。
 *
 * ## 何を 写して、何を 足すか
 *
 * - 写すのは 遊ぶのに 要る `index.html`・`css/`・`js/` だけ。企画書・テスト・開発用の
 *   スクリプトは 写さない。
 * - **ゲームの 中身（画面・文・名前）は 一字も 変えない**（2026-10-16 の 指定「UIその他は
 *   変えないでそのままにしてほしい」）。足すのは `index.html` の いちばん 最後の
 *   `<script src="nexmax-bridge.js">` 1行だけで、画面には 何も 出ない。
 *   合図の 中身は `public/tools/kuuki-yomi/nexmax-bridge.js`（この スクリプトは 消さない）。
 * - どの 版を 写したかを `SOURCE.json` に 残す（ゲームの コミット）。
 *
 * ## 使いかた
 *
 * ```
 * node scripts/sync_kuuki_yomi.mjs <ゲームの フォルダ>
 * ```
 *
 * ゲームに コミットして いない 変更が あると 止まる（どの 版か 分からなく なるため）。
 * 写した あとは `npx vitest run tests/kuuki_yomi_tool.test.ts` で 合図の つなぎを 確かめる。
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const TARGET = resolve("public", "tools", "kuuki-yomi");
const BRIDGE_TAG = '<script src="nexmax-bridge.js"></script>';
const MAIN_TAG = '<script src="js/main.js"></script>';
/** 写す もの（ゲームを 遊ぶのに 要る ぶんだけ）。 */
const COPY = ["index.html", "css", "js"];

const source = process.argv[2];
if (!source) {
  console.error("使いかた: node scripts/sync_kuuki_yomi.mjs <ゲームの フォルダ>");
  process.exit(1);
}
const from = resolve(source);
for (const name of COPY) {
  if (!existsSync(join(from, name))) {
    console.error(`ゲームの フォルダに ${name} が ありません: ${from}`);
    process.exit(1);
  }
}

const git = (...args) => execFileSync("git", ["-C", from, ...args], { encoding: "utf8" }).trim();
const dirty = git("status", "--porcelain");
if (dirty) {
  console.error(
    "ゲームに コミットして いない 変更が あります。先に コミットしてください:\n" + dirty,
  );
  process.exit(1);
}

const html = readFileSync(join(from, "index.html"), "utf8");
if (!html.includes(MAIN_TAG)) {
  console.error(`index.html に ${MAIN_TAG} が 見つかりません（合図の 1行を 足す 場所が 無い）`);
  process.exit(1);
}

// 前に 写した ぶんを 消す（合図の ファイルは アプリ側の もの なので 残す）
for (const name of [...COPY, "SOURCE.json"]) {
  rmSync(join(TARGET, name), { recursive: true, force: true });
}
for (const name of COPY) {
  cpSync(join(from, name), join(TARGET, name), { recursive: true });
}
writeFileSync(join(TARGET, "index.html"), html.replace(MAIN_TAG, `${MAIN_TAG}\n  ${BRIDGE_TAG}`));
writeFileSync(
  join(TARGET, "SOURCE.json"),
  JSON.stringify(
    {
      note: "scripts/sync_kuuki_yomi.mjs が 写した ゲームの 版。中身は 手で 直さず、ゲームの リポジトリで 直して 写し直す。",
      branch: git("rev-parse", "--abbrev-ref", "HEAD"),
      commit: git("rev-parse", "HEAD"),
    },
    null,
    2,
  ) + "\n",
);
console.log(`写しました: ${from} → ${TARGET}（${git("rev-parse", "--short", "HEAD")}）`);
