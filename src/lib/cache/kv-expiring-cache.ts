import type { IncrementalCache } from "@opennextjs/aws/types/overrides";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";

/**
 * 作りおき（ISR）の置き場に **有効期限を付ける**（2026-08-26）。
 *
 * ## なぜ要るか
 *
 * OpenNext の KV キャッシュは `kv.put` に期限を渡していない
 *（実装に「TODO: Figure out how to best leverage KV's TTL.」が残っている）。
 * キャッシュのキーは `incremental-cache/<buildId>/<hash>.cache` で、
 * **buildId は版を上げるたびに変わる**ので、前の版のぶんは
 * **二度と読まれないのに消えない**。
 *
 * 実測（2026-08-26）:
 *   - KV に 14,334 キー・222 ビルドぶんが 残っていた
 *   - 1ビルド = 66件・5.71 MB → 222ビルドで **1 GB 前後**（無料枠ちょうど）
 *   - デプロイは 1日 13回（直近7日で93回）＝ **1日 76 MB ずつ 増える**
 *
 * 保存量の枠を超えると **書き込みが失敗する**。作りおきが置けなくなると
 * 全アクセスがフルSSRに戻り、Error 1102 が再発する（それを避けるために
 * KV を入れたので、本末転倒になる）。
 *
 * ## なぜ 7日か
 *
 * 今の 1日 76 MB で 7日 ≒ 530 MB。無料枠 1 GB に対して 半分ほどで 頭打ちになる。
 * 短すぎると、見られていないページの 作りおきが 先に 消えて、次に 開いた人が
 * 1回だけ フルSSR を 引く（正しさは 変わらないが 遅い）。
 *
 * **見られているページは 期限切れに ならない**——`revalidate = 300` で
 * 作り直すたびに ここを 通って 期限が 延びるため。つまり 消えるのは
 * 「7日 だれも 見なかった ページ」と「前の版の 置き土産」だけである。
 *
 * 増える量が 変わったら（デプロイ回数・ページ数）この日数を 見直す。
 * 目安: `保存量 ≒ 1日あたりの MB × 日数` を 1 GB の 半分に 収める。
 *
 * ## 作りかた
 *
 * `get` と `delete` は 元の実装に そのまま 任せる。`set` だけ 期限を 足して
 * 置き直す。**キーの 作り方は 元の実装のものを そのまま 借りる**
 *（`getKVKey` は TypeScript 上 protected だが 実体は ただのメソッド）。
 * 自前で 組み直すと、書く鍵と 読む鍵が ずれた ときに **キャッシュが
 * 永久に 当たらない**——しかも 画面は 正しく 出るので 気づけない。
 */

/** 作りおきを 置いておく 日数。上のコメントの 計算を 変えるときは ここも 直す。 */
const TTL_DAYS = 7;
const TTL_SECONDS = TTL_DAYS * 24 * 60 * 60;

/** KV の 結び先。OpenNext が 探す 固定名（wrangler.jsonc と そろえる）。 */
const BINDING_NAME = "NEXT_INC_CACHE_KV";

/** 元の実装が 持つ 鍵の 作り方を 借りるための 型。 */
type KeyMaker = {
  getKVKey(key: string, cacheType?: unknown): string;
};

/**
 * 使う ぶんだけの KV の 型。
 *
 * `@cloudflare/workers-types` を 足さないのは、この1ファイルの ために
 * 依存と `tsconfig` の `types` を 触りたくないため（`put` しか 使わない）。
 */
type KvPut = {
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

const expiringKvIncrementalCache: IncrementalCache = {
  name: kvIncrementalCache.name,

  // 読み出しと 消しは 元の実装の まま（鍵の 作り方も 挙動も 変えない）。
  get: kvIncrementalCache.get.bind(kvIncrementalCache),
  delete: kvIncrementalCache.delete.bind(kvIncrementalCache),

  async set(key, value, cacheType) {
    const env = getCloudflareContext().env as unknown as Record<string, KvPut | undefined>;
    const kv = env[BINDING_NAME];
    // 結び先が 無いときは 元の実装に 任せる（例外の 出しかたを そろえる）。
    if (!kv) return kvIncrementalCache.set(key, value, cacheType);

    const kvKey = (kvIncrementalCache as unknown as KeyMaker).getKVKey(key, cacheType);
    try {
      await kv.put(
        kvKey,
        JSON.stringify({
          value,
          // 元の実装と同じ。Workers の Date.now() は 最後のI/Oの時刻を返す。
          lastModified: Date.now(),
        }),
        { expirationTtl: TTL_SECONDS },
      );
    } catch {
      // 置けなくても 学習は 止めない（元の実装も 握りつぶしている）。
      // 次に 開いた人が フルSSR を 引くだけで、画面は 正しく 出る。
    }
  },
};

export default expiringKvIncrementalCache;
export { TTL_SECONDS, TTL_DAYS };
