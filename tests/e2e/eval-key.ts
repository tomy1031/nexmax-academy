import { existsSync, readFileSync, mkdirSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * ものさし合わせの 鍵と 結果置き場
 *
 * ## 鍵は **手もとでも 使える ように する**（2026-09-01 の 指定）
 * CI では Environment `Preview` の `GEMINI_API_KEY` が 入る。手もとには 鍵が 無いので、
 * これまで ものさし合わせは **CI に 出さないと 測れなかった**——直しても 結果が 分かるまで
 * 4分 待つ ことに なる。
 *
 * そこで **`~/.nexmax/gemini-key` も 見る**。codex の 合言葉と 同じ 置き場で、
 * リポジトリの 外である ことが 大事:
 *
 * - `.env` に 置かない。OpenNext が バンドルへ 焼き込む（`scripts/check_build_env.mjs` が 止める）
 * - `.env.local` にも 置かない。あれが あると 認証の 関所が 開いて **通し検証が 壊れる**
 *
 * 1回 置けば、あとは `npm run eval:taiwa` だけで 手もとから 測れる。
 */
export function evalKey(): string {
  const fromEnv = (process.env.GEMINI_API_KEY ?? "").trim();
  if (fromEnv !== "") return fromEnv;
  const file = join(homedir(), ".nexmax", "gemini-key");
  if (!existsSync(file)) return "";
  return readFileSync(file, "utf8").trim();
}

/** 鍵が 無い ときに 出す 案内（手もとで 何を すれば よいかを その場で 言う）。 */
export const NO_KEY_HINT =
  "鍵が ありません。`~/.nexmax/gemini-key` に 置くか、GEMINI_API_KEY=... を 付けて ください";

/** 1件ぶんの 測定結果（表に する ために 貯める）。 */
export interface EvalRow {
  readonly name: string;
  readonly ask: string;
  readonly gained: string;
  readonly diffs: readonly string[];
  readonly checked: number;
  /** AIに 通せなかった（規則ベースの 板だった）。差分としては 数えない。 */
  readonly skipped?: boolean;
}

const OUT_DIR = "eval-results";
const OUT_FILE = join(OUT_DIR, "taiwa.jsonl");

/**
 * 結果を 1行ずつ 書き足す。
 *
 * テストは 1件ずつ 別の プロセスで 走る ことも ある ので、**まとめて 持たずに 追記**する。
 * 表に するのは `scripts/eval_summary.mjs`。
 */
export function writeEvalRow(row: EvalRow): void {
  mkdirSync(OUT_DIR, { recursive: true });
  appendFileSync(OUT_FILE, `${JSON.stringify(row)}\n`, "utf8");
}
