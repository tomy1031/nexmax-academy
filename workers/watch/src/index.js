/**
 * watch — 本番の 見張り（Cloudflare Cron Trigger で 動く 別の Worker）。
 * 判定と 知らせの 文は src/watch.js。ここは Cloudflare との つなぎだけ。
 *
 * 状態（開いて いる 異常・前の 回の 失敗）は Durable Object に 1件だけ 置く。
 * **KV は 使わない**——本番の KV は 書き込み 1000件/日 の 枠を デプロイと 作りおきが 使う
 * （docs/deploy.md §0.9・§0.10）。ここが 10分ごとに 書けば 1日 144件 食う。
 * Durable Object（SQLite）は 無料枠で 1日 10万行 まで 書けて、本番の 枠とは 別。
 */

import { DurableObject } from "cloudflare:workers";
import { runWatch } from "./watch.js";

/** 見張りの 状態を 1件だけ 持つ（名前は "prod" の 1つ）。 */
export class WatchState extends DurableObject {
  async load() {
    return (await this.ctx.storage.get("state")) ?? null;
  }

  async save(state) {
    await this.ctx.storage.put("state", state);
  }
}

function stateStub(env) {
  return env.WATCH_STATE.get(env.WATCH_STATE.idFromName("prod"));
}

const handler = {
  /** Cron Trigger（UTC）。wrangler.jsonc の triggers.crons を 参照。 */
  async scheduled(event, env, ctx) {
    const stub = stateStub(env);
    ctx.waitUntil(
      runWatch(env, {
        fetch: (url, init) => fetch(url, init),
        // 本番は サービスバインディングで 見る（同じ アカウントの workers.dev は 公開 URL で 呼べない）
        probeFetch: env.PROD ? (url, init) => env.PROD.fetch(url, init) : undefined,
        // 授業前の 本番デプロイの 起こし役も 同じ 理由で サービスバインディング（1日 1回だけ 見る）
        kickerFetch: env.KICKER ? (url, init) => env.KICKER.fetch(url, init) : undefined,
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        now: () => Date.now(),
        loadState: () => stub.load(),
        saveState: (state) => stub.save(state),
        log: (line) => console.log(`cron=${event.cron} ${line}`),
      }).then((result) => {
        if (result.findings.length > 0) {
          console.log(
            `見つかった異常: ${result.findings.map((f) => `${f.key}=${f.level}`).join(" ")}`,
          );
        }
      }),
    );
  },

  /**
   * 目で 見る ための 状態（読むだけ）。鍵は 出さない。ここから 見張りは 起きない。
   * 知らせ先が 入って いるかは 有無だけ 返す。
   */
  async fetch(request, env) {
    const state = await stateStub(env).load();
    return Response.json(
      {
        prod: env.PROD_URL,
        notifyTo: {
          telegram: Boolean(env.TELEGRAM_BOT_TOKEN),
          // 送り先が 見つかったか（ボットに 1通 送れば 次の 回に 見つかる）。番号は 出さない
          telegramChat: Boolean(env.TELEGRAM_CHAT_ID || state?.telegramChatId),
          slack: Boolean(env.SLACK_WEBHOOK_URL),
          email: Boolean(env.RESEND_API_KEY && env.ALERT_EMAIL_TO),
        },
        clientErrors: Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY),
        // 一時的に 黙らせて いる 既知の 誤報（deploy の --var で 渡した ときだけ）
        muted: env.MUTE_WARNINGS ?? null,
        startedAt: state?.startedAt ? new Date(state.startedAt).toISOString() : null,
        lastRunAt: state?.lastRunAt ? new Date(state.lastRunAt).toISOString() : null,
        // 授業前の 本番デプロイの 起こし役を 最後に 見た とき（ok が false なら GitHub に 断られる）
        kicker: state?.kicker
          ? { ...state.kicker, at: new Date(state.kicker.at).toISOString() }
          : null,
        open: state?.open ?? {},
        last: state?.last ?? null,
        note: "読むだけのページです。ここから自動チェックや通知は起きません。",
      },
      {
        headers: {
          "cache-control": "no-store",
          // 管理画面のエラーログ（/admin/logs）がブラウザから読む。中身は公開してよい結果だけ
          "access-control-allow-origin": "*",
        },
      },
    );
  },
};

export default handler;
