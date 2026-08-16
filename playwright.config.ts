import { defineConfig } from "@playwright/test";

/**
 * 通しの自動検証（Playwright）の設定
 *
 * ## なぜ 鍵ゼロで 動くのか
 * Supabase の環境変数が未設定なら `src/middleware.ts` は何もしない（デモモード）。
 * ログインの関所が開いたままなので、ビルドして `next start` するだけで
 * 学習者と同じ道を最初から最後まで機械が歩ける。鍵はどこにも要らない。
 *
 * ## ブラウザの居場所が 開発コンテナと CI で ちがう
 * CI は `npx playwright install --with-deps chromium` で入れた既定の置き場を使う。
 * 開発コンテナには最初から入っている（`/opt/pw-browsers/...`）ので、
 * `E2E_CHROMIUM_PATH` を渡してそちらを使う。**どちらでも同じテストが動く**ように、
 * ここでは環境変数がある時だけ executablePath を差し込む。
 *
 * ## サーバは このファイルが 起こす
 * `webServer` が `next start` を立てて、`/kaisha` が 200 を返すまで待つ。
 * ビルド（`npm run build`）は先に済ませておくこと——ここではビルドしない
 * （E2E のたびに 2分のビルドを回すと、直したい所に手が届かなくなる）。
 */

/** 開発のサーバ（3000）とぶつからない番号。CI では `E2E_PORT` で変えられる。 */
const PORT = Number(process.env.E2E_PORT ?? 3311);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  /** 失敗の証拠（トレース・失敗時のスクショ）の置き場。 */
  outputDir: "test-results",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  /* 1度だけ やり直す。落ち続けるものだけを 落とす（CIの ゆらぎで PR を止めない）。 */
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }], ["github"]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    browserName: "chromium",
    viewport: { width: 1280, height: 900 },
    locale: "ja-JP",
    /* 学習者の端末に近い時間帯（きろくカードの日付が写るため）。 */
    timezoneId: "Asia/Phnom_Penh",
    screenshot: "only-on-failure",
    video: "off",
    trace: "retain-on-failure",
    launchOptions: process.env.E2E_CHROMIUM_PATH
      ? { executablePath: process.env.E2E_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: `npx next start --port ${PORT}`,
    url: `${BASE_URL}/kaisha`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
