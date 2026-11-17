import "./quest-dot-font.css";

/**
 * クエストの ドットの 字（DotGothic16・日本語の 漢字も ある ドット字体）
 *
 * **クエストの 中でしか 読みこまない**——字の 定義（@font-face）は `quest-dot-font.css` に
 * あり、それを 読みこむのは この ファイルを 使う クエストの 画面だけ。
 *
 * 字の ファイルは 手元に 置いた もの（public/fonts/dot/）。2026-11-17 に next/font/google を
 * やめた（ビルドの たびに Google から 取り、Google の 返す CSS が ときどき 違う 形に なると
 * ビルドが 止まって いた。layout.tsx と 同じ 理由）。作り方は scripts/fonts/selfhost_google_fonts.mjs。
 * preload は しない。`font-display: swap` なので、読みこむ あいだは 代わりの 字で 出て、
 * あとから 差し替わる。
 *
 * 字の 大きさは **16px の 倍数を 基本**に する（この 字体は 16px の 升目で 作られて いる）。
 * 文（会話・問い・選択肢・解説）には 使わない——ふりがなを 読みやすく する ため、
 * いつもの 丸ゴシックの まま（`quest-styles.ts` の `.qx-t`）。
 *
 * `variable` は 前の next/font の 形に 合わせた クラス名（`--font-dot` を 決める）。
 */
export const questDotFont = { variable: "quest-dot-font" } as const;
