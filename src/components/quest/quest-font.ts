import { DotGothic16 } from "next/font/google";

/**
 * クエストの ドットの 字（DotGothic16・日本語の 漢字も ある ドット字体）
 *
 * **クエストの 中でしか 読みこまない**——ここで 宣言した 字は、使う 部品の
 * ページにだけ 付く（next/font の 決まり）。
 *
 * `preload: false` は layout.tsx の 丸ゴシックと 同じ 理由。和文の 字は Google 側で
 * 細かく 分かれて いて、preload を 有効に すると ファイルの 一覧が Worker に 焼き込まれ、
 * HTML の 先頭に preload の タグが 何百本も 並ぶ。`display: "swap"` なので、
 * 読みこむ あいだは 代わりの 字で 出て、あとから 差し替わる。
 *
 * 字の 大きさは **16px の 倍数を 基本**に する（この 字体は 16px の 升目で 作られて いる）。
 * 文（会話・問い・選択肢・解説）には 使わない——ふりがなを 読みやすく する ため、
 * いつもの 丸ゴシックの まま（`quest-styles.ts` の `.qx-t`）。
 */
export const questDotFont = DotGothic16({
  variable: "--font-dot",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});
