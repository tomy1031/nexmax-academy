import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // 整形は Prettier に一任し、競合する ESLint の整形ルールを無効化する（品質チェックは残す）。
  prettier,

  // 型情報を使った検査。async/await の取りこぼし（floating promise）は
  // Live対話・API Route など非同期中心の学習エンジンで最も起きやすいバグのため error にする。
  {
    files: ["src/**/*.{ts,tsx}", "scripts/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      // React 19 の <form action={serverAction}> は Promise を返すのが正規の書き方のため、
      // JSX属性への Promise 関数だけ許可する。
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/consistent-type-imports": ["warn", { fixStyle: "inline-type-imports" }],
    },
  },

  // AGENTS.md の規律「環境変数は src/lib/env.ts 経由」を機械検査にする。
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/env.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "process.env を直接読まない。src/lib/env.ts（getServerEnv / publicEnv）を経由する。",
        },
      ],
    },
  },

  /*
   * 制約台帳の 絶対ルール「Gemini flash の テキスト生成を 学習者の 画面で 使わない」を
   * 機械検査に する（2026-08-20）。
   *
   * 文章だけの 決まりに して いたら、**判定の 落とし先**として 静かに 戻って いた。
   * Live の 枠と `generateContent` の 枠は 別勘定で、後者は 学習者1人の
   * 1回の ミーティングで 使い切る。学習者が 通る コードからは 呼べなく する。
   *
   * 先生の 道具（`src/components/studio/**`）は 対象外。あちらは Codex が 本命で、
   * Gemini は 先生が 自分で 押した ときの 控えに 留まる（台帳 2026-08-07）。
   */
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/studio/**", "src/lib/ai/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/ai/generate-browser",
              importNames: ["generateFromBrowser"],
              message:
                "学習者の 画面で Gemini の generateContent（flash）を 呼ばない。無料枠を すぐ 使い切る。文字だけの 判断は Live の つなぎの 中で もらう（src/components/meeting/judge-api.ts の やり方）か、端末の 規則ベースで 済ませる。",
            },
            {
              name: "@/lib/ai/models",
              importNames: ["TEXT_MODEL"],
              message:
                "学習者の 画面で テキスト生成の モデルを 名指ししない（Gemini flash の 無料枠は すぐ 尽きる）。",
            },
          ],
        },
      ],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".claude/**",
    ".tmp*",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // OpenNext / wrangler の生成物。除外しないと ESLint がバンドルを走査して
    // ヒープを食い潰す（`npm run lint` が OOM で落ちる）。
    ".open-next/**",
    ".wrangler/**",
    "cloudflare-env.d.ts",
    // pdf.js の worker（scripts/copy_pdf_worker.mjs が写す他人のコード）。
    // 1行1.3MBの圧縮ずみファイルなので、検査しても直す先が無い。
    "public/pdfjs/**",
  ]),
]);

export default eslintConfig;
