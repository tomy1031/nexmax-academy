import type { Queue } from "@opennextjs/aws/types/overrides";
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";
import memoryQueue from "@opennextjs/cloudflare/overrides/queue/memory-queue";
import expiringKvIncrementalCache from "./src/lib/cache/kv-expiring-cache";

/**
 * ISR（学習者ページ14ルートの `revalidate = 60`）を実際に効かせるための設定。
 *
 * 2026-08-13 まで incrementalCache 未設定（「ISRを使っていない」前提のまま）だったため、
 * キャッシュが常にミスして全ページ・全プリフェッチが毎回フルSSRされ、1人の閲覧でも
 * Worker の CPU 上限（無料プランは1リクエスト 10ms）を超えていた
 * （Error 1102「Worker exceeded resource limits」）。作りおきを置く場所は必須である。
 *
 * - queue: memoryQueue。60秒を過ぎたページは古いまま即返し、裏で自分自身へ
 *   再生成を頼む（WORKER_SELF_REFERENCE バインディングが必要）。先生の直しは
 *   これまでどおり最大60秒で画面に出る。
 *   （`dummy` キューは送信時に FatalError を投げるので使えない。)
 * - enableCacheInterception: キャッシュに載っているページ（RSCプリフェッチ含む）を
 *   Next のサーバを起こさずに返す。認証ゲート（middleware）はこの横取りより先に
 *   走ることを実装で確認済み（@opennextjs/aws routingHandler.js）。
 *
 * ## 作りおきの置き場を2つに分ける理由（2026-08-23）
 *
 * KV の無料枠は **書き込み1000件/日**。作りおきページは約68枚あり、キャッシュの
 * キーが `incremental-cache/<buildId>/<hash>.cache` ——**buildId はビルドのたびに
 * 変わる**ので、版を1回上げるだけで68枚を丸ごと新規に書く。前回ぶんは1枚も
 * 使い回されない。実測（8/13〜8/22の9日）で KV に 10,534件・buildId 167種類、
 * つまり 1日18回ほど上げていて、68×18 ≒ 1,260件/日 で上限を突破していた。
 *
 * 上げる回数の大半は **AIが作業中に自分で確かめるためのブランチ確認URL**
 * （`npm run cf:branch`）で、ユーザーが見るのは staging と本番だけ。
 * そこで**ブランチ確認URLだけ、置き場を KV から Workers の静的アセットに移す**。
 * 静的アセットは Worker の荷物として一緒に上がるので **KV書き込みは0件**になる。
 *
 * - `OPEN_NEXT_CACHE=assets` … ブランチ確認URL用。読み取り専用。
 *   ページはビルド時点の中身で固定される（60秒ごとの作り直しは空振りしてログに出るが、
 *   画面には正しい内容が出る）。ビルド時に DB（studio_contents）も読んでいるので、
 *   **ビルドした時点の先生の直しは入っている**。以後の直しは映らないので、
 *   DBの直しが絡む確認は staging で行う。
 * - 未指定（既定） … KV。**本番だけがこちら**。revalidate ごとに先生の直しが出る。
 *
 * **STG は 2026-09-02 に assets 側へ移した。** それまでは「KV のまま温めない」
 * （2026-08-27）で、各ページ初回のフルSSRで後追いに温まる建て付けだったが、
 * **重いページは温まらない**——初回のフルSSRが Error 1102 で落ちる → 作りおきが
 * 書かれない → 次も落ちる、の堂々めぐりになる。実測で STG の KV は 13鍵しか
 * 無かった（本番は 132鍵）。同時40本を投げると、作りおきに当たる `/` は 40/40 通り、
 * 当たらないページは 31〜34/40 しか通らない。理由と数字は
 * `scripts/preview_alias.mjs` の `usesAssetsCache`。
 *
 * KV で温め直す道は塞がっている（STG は平均 8.2回/日 × 約110件 ＝ 900件/日で、
 * 無料枠の書き1000件/日を本番の温めと取り合う）。静的アセットなら KV書き込み0件。
 * 代償は **先生の直し（DB）が STG に出るのが「次のデプロイ時」になる**こと。
 * ページがビルド時点の中身で固定されるためで、STG は `integration` へマージする
 * たび上がるので遅れは数時間に収まる。管理画面（`/admin/*`）は `force-dynamic` で
 * DB を直に読むので、**スタジオ側の表示は常に真**である。
 *
 * **この分岐は実行時に評価される**（ビルド時ではない）。Worker では nodejs_compat と
 * compatibility_date 2025-04-01 以降により `process.env` が Worker の変数から埋まるので、
 * `wrangler versions upload --var OPEN_NEXT_CACHE:assets` を付けた版だけが assets 側になる
 * （scripts/preview_alias.mjs）。**束ねたものは staging 用と同一**なので、
 * 「ブランチでは動いたのに STG で違う」が起きない。
 * 作りおきを assets へ写す `populateCache` は Node 側で同じ環境変数を読む。
 *
 * 静的アセットは Worker 本体の 3MiB 制限とは別枠（無料枠は 2万ファイル/版）。
 */
const useAssetsCache = process.env.OPEN_NEXT_CACHE === "assets";

/**
 * assets モードでは **作り直しを 頼まない**（2026-09-02）。
 *
 * 静的アセットの 置き場は **読み取り専用**で、`set` は必ず失敗する
 *（`static-assets-incremental-cache.js` は「revalidation を 望まない アプリだけに
 * 使え」と 自分で 書いている）。しかも 作りおきの 鮮度は **ビルド時刻**で決まるので、
 * `revalidate = 300` の 学習者ページは **ビルドの5分後には ぜんぶ「古い」**になる。
 *
 * そこから 先が 効いてくる。OpenNext の 横取り（cacheInterceptor）は 古いと 判定すると
 * **`await queue.send(...)` を リクエストの 中で 待つ**。既定の memoryQueue は
 * `WORKER_SELF_REFERENCE` 経由で **自分自身へ HEAD を 投げ、まるごと フルSSR** する。
 * 書き込みは 読み取り専用なので 必ず 失敗し、ビルド時刻も 変わらないので、
 * **同じページが 毎リクエスト 永久に 作り直され続ける**。
 *
 * 2026-09-02、STG を assets モードへ 移した 直後に
 * `/houkoku/link-houkoku_stamp` が Error 1102 を 出したのが これである
 *（デプロイの 36分後＝とっくに 古い）。**このとき 通った 検査は 役に 立たなかった**——
 * `/` は `force-static`（作り直しが 無い）、`/api/health/content` は `force-dynamic`
 *（横取りを 通らない）で、**どちらも この罠に 当たらない 2種類**だったため。
 *
 * 何もしない キューに すると、横取りは 古い 作りおきを そのまま 返して 終わる。
 * 中身は ビルド時点で 固定されるが、それは assets モードの 前提そのもの
 *（先生の 直しは 次の デプロイで 出る — `scripts/preview_alias.mjs` の `usesAssetsCache`）。
 * **本番は KV モードなので、これまでどおり memoryQueue で 作り直す。**
 */
const noopQueue: Queue = {
  name: "noop-queue",
  send: async () => {},
};

/**
 * ## KV の前に「土地のキャッシュ」を重ねる理由（2026-08-25）
 *
 * 授業で20人が同時に遊ぶと、20人は同じ土地（同じ Cloudflare 拠点）から来る。
 * 作りおきの読み出しを毎回 KV まで取りに行くと、KV 読みの無料枠（10万/日）を
 * 全員分・全ページ分で消費する。withRegionalCache はその拠点の Cache API に
 * 写しを置き、同じ拠点からの読みは KV に触れずに返す（書きはこれまでどおり KV）。
 *
 * - `short-lived`: 写しの使い回しは最長1分。ページ側の revalidate=300 と合わせても、
 *   先生の直しが届く遅れは「最長 revalidate+1分」に収まる。
 * - ブランチ確認URL（assets 側）は読み取り専用の静的アセットなので重ねない。
 *
 * ## KV に置くものには 期限を付ける（2026-08-26）
 *
 * OpenNext の 素の KV キャッシュは 期限なしで 置くため、前の版の 作りおきが
 * **読まれないまま 永久に 残る**。実測で 14,334件・222ビルドぶん・1 GB 前後
 *（無料枠ちょうど）まで 溜まっていた。枠を 超えると 書き込みが 失敗し、
 * 作りおきが 置けなくなって Error 1102 が 再発する。
 * 期限付きの 置き場は `src/lib/cache/kv-expiring-cache.ts`（理由と 日数の 根拠も そこ）。
 */
export default defineCloudflareConfig({
  incrementalCache: useAssetsCache
    ? staticAssetsIncrementalCache
    : withRegionalCache(expiringKvIncrementalCache, { mode: "short-lived" }),
  queue: useAssetsCache ? noopQueue : memoryQueue,
  enableCacheInterception: true,
});
