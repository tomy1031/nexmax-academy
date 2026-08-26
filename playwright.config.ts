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
  /*
   * 手もとは **2本まで**。既定（CPUの半分）だと 手もとの Mac では `next start` が
   * 落ちる ことが あり（2026-08-19 に 実発生。ERR_CONNECTION_REFUSED が 数本）、
   * PC も 重くなる。
   *
   * CI（専有の 4コア）だけは 4本に する（2026-08-25）。`e2e` は CI で いちばん
   * 長い ジョブ（4分48秒）で、その 大半が この ステップ だから。
   *
   * **効きめは おおよそ 15%。1回の 測定を 信じない こと。**
   * 通し検証の 実測（2026-08-26）:
   *
   *   2本 … CI 160秒 ／ 開発コンテナ 164秒
   *   4本 … CI 121秒・153秒（**32秒も ぶれた**）／ 開発コンテナ 137秒
   *
   * GitHub の ランナーは 設備を 他の 利用者と 分け合うので、この 幅は 避けられない。
   * 平均で 160秒 → 約137秒 と 見る。
   *
   * **倍には ならない**——`toshi.spec.ts` の 通しプレイ 1本だけで 52秒 あり、
   * **1本の テストは 分けて 走らせられない** ので、そこが 床に なる。
   *
   * テストどうしは 独立（fullyParallel）なので 本数で 合否は 変わらない。
   * ゆらぎが 出たら CI に `E2E_WORKERS=2` を 渡せば この 行を さわらずに 戻せる。
   */
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : process.env.CI ? 4 : 2,
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
    launchOptions: {
      ...(process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : {}),
      /*
       * にせの カメラ・マイクを 使う。
       * ミーティングの 入室の 画面は **カメラが 既定で ON**（Zoom と同じ）なので、
       * 何も 渡さないと 機械の ブラウザは きょかを 断り、画面が いつも
       * 「きょかが ありません」に なる——つまり 学習者が 見る 画面を 一度も
       * 確かめられない。にせの 映像を 渡して、うつっている ほうを 検査する。
       */
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    },
  },
  webServer: {
    command: `npx next start --port ${PORT}`,
    url: `${BASE_URL}/kaisha`,
    /*
     * **立てたら 必ず 落とす。前に 立てた ものを 使い回さない。**
     *
     * 理由が 2つ ある。
     * (a) 使い回すと **直す前の ビルドに 合格を 出す**（2026-08-19 に 実発生。
     *     直した はずの 式で 直す前の 値が 1回だけ 出た。原因は 前のセッションの
     *     `next start` が ポートに 残って いた こと）。
     * (b) 残った サーバが 積み上がると **手もとの PC が 重くなる**
     *     （2026-08-19 ユーザー指定「チェックが終わったら一度閉じるようにしてほしい」）。
     *
     * ポートが ふさがって いると ここで 止まる。それは 正しい——黙って 古い ものを
     * 使うより、気づける ほうが よい（`lsof -nP -iTCP:3311` で 見て 落とす）。
     */
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
