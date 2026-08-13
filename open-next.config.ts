import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";
import memoryQueue from "@opennextjs/cloudflare/overrides/queue/memory-queue";

/**
 * ISR（学習者ページ14ルートの `revalidate = 60`）を実際に効かせるための設定。
 *
 * 2026-08-13 まで incrementalCache 未設定（「ISRを使っていない」前提のまま）だったため、
 * キャッシュが常にミスして全ページ・全プリフェッチが毎回フルSSRされ、1人の閲覧でも
 * Worker の CPU 上限を超えていた（Error 1102「Worker exceeded resource limits」）。
 *
 * - incrementalCache: KV（無料枠内。R2はアカウント未有効＝課金設定が要るので使わない）
 *   バインディング名は NEXT_INC_CACHE_KV 固定（wrangler.jsonc 参照）。
 * - queue: memoryQueue。60秒を過ぎたページは古いまま即返し、裏で自分自身へ
 *   再生成を頼む（WORKER_SELF_REFERENCE バインディングが必要）。先生の直しは
 *   これまでどおり最大60秒で画面に出る。
 * - enableCacheInterception: キャッシュに載っているページ（RSCプリフェッチ含む）を
 *   Next のサーバを起こさずに返す。認証ゲート（middleware）はこの横取りより先に
 *   走ることを実装で確認済み（@opennextjs/aws routingHandler.js）。
 */
export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
  queue: memoryQueue,
  enableCacheInterception: true,
});
