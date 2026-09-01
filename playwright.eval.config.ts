import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * ものさし合わせ（`*.eval.spec.ts`）だけを 走らせる 設定
 *
 * ## なぜ ふだんの 通し検証と 分けるか（2026-09-01 の 指定）
 * こちらは **Gemini に 何本も 投げて、期待と 返答の 差分を 測る**もの。
 * PR や マージの たびに 走らせる ものでは ない:
 *
 * - 1本ごとに 実際の 判定を 呼ぶ ので、**枠（BYOK の 鍵）と 時間**を 食う
 * - AIの 返しは 揺れる。ふだんの 検証に 混ぜると、揺れで 赤く なった とき
 *   **本当の 不具合と 見分けが つかなく なる**
 *
 * ## 走らせ方
 * ```
 * npm run build            # 先に ビルド（webServer は next start を 立てるだけ）
 * npm run eval:taiwa       # 鍵は 環境変数 か ~/.nexmax/gemini-key
 * ```
 *
 * 直列（`workers: 1`）に するのは、同じ 鍵へ 一度に 投げると 混み合う ため。
 * 数が 増えたら 時間は かかるが、**測りたいのは 速さでは なく ずれ**である。
 */
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: ["**/*.eval.spec.ts"],
  /** 表を 順に 読みたい ので 直列。鍵への 同時投げも 避ける。 */
  workers: 1,
  /* 揺れを 測るのが 目的なので、**やり直しで 隠さない**。 */
  retries: 0,
  reporter: [["list"]],
});
