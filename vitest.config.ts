import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig の paths（"@/*" → "./src/*"）を vitest 側にも通す。
  // 型だけの import は実行時に消えるため今までは不要だったが、値を import すると解決が要る。
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // 部品を そのまま 描いて 見る テスト（`renderToStaticMarkup`）は .tsx で 書く
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environment: "node",
  },
});
