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
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
