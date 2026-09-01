/**
 * ものさし合わせの 結果を 1枚の 表に する。
 *
 * `tests/e2e/taiwa.eval.spec.ts` が 1件ずつ 書き足した `eval-results/taiwa.jsonl` を 読む。
 * テストの 出力は 上から 流れて いくので、**最後に まとめて 見る 場所**を 別に 置く。
 *
 * 使い方: `npm run eval:taiwa`（この スクリプトまで 通しで 走る）
 */
import { existsSync, readFileSync } from "node:fs";

const FILE = "eval-results/taiwa.jsonl";

if (!existsSync(FILE)) {
  console.log("測定の 結果が ありません（鍵が 無くて ぜんぶ とばした 可能性）。");
  console.log("鍵は ~/.nexmax/gemini-key か GEMINI_API_KEY に 置いて ください。");
  process.exit(0);
}

const rows = readFileSync(FILE, "utf8")
  .split("\n")
  .filter((line) => line.trim() !== "")
  .map((line) => JSON.parse(line));

const measured = rows.filter((one) => !one.skipped);
const skipped = rows.filter((one) => one.skipped);
const width = Math.max(12, ...measured.map((one) => [...one.name].length));
const pad = (text, to) => text + " ".repeat(Math.max(0, to - [...text].length));

console.log("");
console.log("=== 採点の ものさし合わせ ===");
console.log(`${pad("ケース", width)}  こうかんど  ずれ`);
console.log("-".repeat(width + 22));

let off = 0;
for (const one of measured) {
  const mark = one.diffs.length === 0 ? "○" : `✗ ${one.diffs.join(" / ")}`;
  off += one.diffs.length;
  console.log(`${pad(one.name, width)}  ${pad(one.gained.replace("こうかんど ", ""), 9)}  ${mark}`);
}

console.log("-".repeat(width + 22));
const checked = measured.reduce((sum, one) => sum + one.checked, 0);
console.log(`測った ケース: ${measured.length} ／ 観点: ${checked} ／ **ずれ: ${off}**`);
if (skipped.length > 0) {
  // 「通せなかった」を 黙って 0件に しない——測れて いない ことが 分かるように 出す
  console.log(
    `AIに 通せず 数えなかった: ${skipped.length}件（${skipped.map((o) => o.name).join("、")}）`,
  );
}
console.log("");
