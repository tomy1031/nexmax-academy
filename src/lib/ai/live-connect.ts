import type { LiveTokenResult } from "@/lib/ai/live-token";

/**
 * Live に つなぐ — モデルを **上から 順に** ためす
 *
 * ## なぜ 要るか（2026-09-16 の 検収）
 * たいわ（`use-live-session.ts`）と ミーティングの 声（`use-live-voice.ts`）は、
 * 一覧を 作って おきながら **先頭の 1つしか ためして いなかった**。
 * `models.ts` の 注記は「上から 順に ためす」なのに、先頭（3.8）を 断る 鍵では
 * 控え（3.1）に 一度も 届かず、学習者の 声が 全部 止まる。
 *
 * 見かたの つなぎ（`judge-api.ts` の `connectJudge`）は 先に この 形で 動いて いた。
 * 3つの つなぎが **同じ 1つの 順番の 決まり**を 使う ように、ここに 置く。
 *
 * ## SDK の connect は 断られても 返らない
 * `ai.live.connect` は したくの 合図（setupComplete）を 待つ
 *（@google/genai の `await setupCompletePromise`）。モデルや 設定を 断られて
 * 閉じられても **reject しない**——待ちつづける だけ。だから:
 * - 合図の 前に 閉じられた・壊れた ら、**その場で** つぎの モデルへ 進む（`fail`）
 * - 何も 起きない まま なら、期限（`LIVE_SETUP_TIMEOUT_MS`）で 進む
 * - 諦めた あとに 遅れて つながった ものは **閉じる**（つなぎを 居座らせない。
 *   無料枠の Live は 同時に 開ける 数が 少ない）
 *
 * ## 短命トークンは 1回 使い切り
 * `live-token.ts` の `uses: 1`。ためす たびに 作り直す——1枚を 使い回すと
 * 2つ目の モデルは 必ず 断られ、「控えに 落ちる」が 見かけだけに なる。
 */

/**
 * 1つの モデルで したくの 合図を 待つ 上限。
 *
 * ふだんの したくは 1〜2秒。回線の 遅い 教室でも 待てる ように 長めに とる。
 * **断られた ときは この 時間を 待たない**（閉じられた その場で 進む）ので、
 * これが 効くのは 何も 返って こない ときだけ。
 */
export const LIVE_SETUP_TIMEOUT_MS = 9_000;

/** したくの 途中で 止まった 理由（理由の 名前だけを 運ぶ。トークンは 入れない）。 */
export class LiveSetupError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

interface Closable {
  close: () => void;
}

/**
 * 1回の つなぎの 段階。
 * - `waiting` … したくの 合図を 待って いる
 * - `ready` ……… つながった（ここから 先の 切断は 「つないだ あとの 切断」）
 * - `abandoned` … 断られた・期限切れ・諦めた（この つなぎからの 届きものは 捨てる）
 */
export type SetupPhase = "waiting" | "ready" | "abandoned";

export interface SetupGate<S extends Closable> {
  readonly phase: () => SetupPhase;
  /**
   * 合図の 前に 閉じられた・壊れた（SDK の onclose / onerror から 呼ぶ）。
   * 合図の あとに 呼んでも 何も しない——その 切断は 呼ぶ 側が 別に 扱う。
   */
  readonly fail: (reason: string) => void;
  /** SDK の connect の 約束を 渡して、したくの 合図まで 待つ。 */
  readonly wait: (connecting: Promise<S>) => Promise<S>;
}

/**
 * したくの 合図を 待つ 門（1回の つなぎに 1つ）。
 *
 * 使いかた: 門を 先に 作り、SDK の コールバックの 中で `phase()` を 見て
 * `waiting` なら `fail`、`ready` なら ふつうの 切断として 扱う。
 */
export function createSetupGate<S extends Closable>(
  ms: number = LIVE_SETUP_TIMEOUT_MS,
): SetupGate<S> {
  let phase: SetupPhase = "waiting";
  /** `wait` の 前に 断られた ときの 理由（あとで `wait` が すぐ 投げる）。 */
  let early: LiveSetupError | null = null;
  let reject: ((error: Error) => void) | null = null;

  return {
    phase: () => phase,
    fail: (reason) => {
      if (phase !== "waiting") return;
      phase = "abandoned";
      const error = new LiveSetupError(reason);
      if (reject) reject(error);
      else early = error;
    },
    wait: (connecting) =>
      new Promise<S>((resolve, rejectWait) => {
        const timer = setTimeout(() => {
          if (phase !== "waiting") return;
          phase = "abandoned";
          rejectWait(new LiveSetupError("timeout"));
        }, ms);
        reject = (error) => {
          clearTimeout(timer);
          rejectWait(error);
        };
        if (early) reject(early);

        connecting.then(
          (session) => {
            if (phase === "waiting") {
              phase = "ready";
              clearTimeout(timer);
              resolve(session);
              return;
            }
            // 諦めた あとに 遅れて つながった。使わないので 閉じる
            try {
              session.close();
            } catch {
              // もう 閉じて いる ものは 閉じられない（それで よい）
            }
          },
          (error: unknown) => {
            if (phase !== "waiting") return;
            phase = "abandoned";
            clearTimeout(timer);
            rejectWait(error instanceof Error ? error : new LiveSetupError("connect"));
          },
        );
      }),
  };
}

/** つなぐ ための 通行証（短命トークン、作れない 鍵の ときだけ 鍵そのもの）。 */
export type LiveAuth = { ok: true; auth: string } | { ok: false; reason: string };

/**
 * 短命トークンの 結果 → つなぐ ための 通行証。
 *
 * 作れない キー（新形式 AQ. で 報告あり）の ときだけ、本人の キーで 直接 つなぐ。
 * 権限・使いすぎの ときは 直接 つないでも 同じ なので、その 理由の まま 返す。
 */
export function authFromToken(minted: LiveTokenResult, apiKey: string): LiveAuth {
  if (minted.ok) return { ok: true, auth: minted.token };
  const canUseKey = minted.reason === "tokenRejected" || minted.reason === "invalidRequest";
  return canUseKey ? { ok: true, auth: apiKey } : { ok: false, reason: minted.reason };
}

/**
 * 先に 作った 1枚を **最初の 1回に だけ** 使い、あとは 作り直す。
 *
 * たいわと 声は、マイクの 許可を 取る **前に** 1枚 作って 鍵を 確かめる
 *（鍵が 通らない のに マイクの 許可を 聞かない ため）。その 1枚を 捨てずに
 * 先頭の モデルで 使う。2つ目 からは 1回 使い切りなので 作り直す。
 */
export function startingWith(
  first: LiveAuth,
  mint: () => Promise<LiveAuth>,
): () => Promise<LiveAuth> {
  let spare: LiveAuth | null = first;
  return async () => {
    if (spare) {
      const auth = spare;
      spare = null;
      return auth;
    }
    return await mint();
  };
}

export type LiveConnectResult<S> =
  | { ok: true; session: S; model: string }
  /** 通行証が 作れなかった（鍵・権限・使いすぎ）。モデルを 変えても 同じ。 */
  | { ok: false; stage: "auth"; reason: string }
  /** どの モデルでも つながらなかった。`reason` は さいごに ためした ものの 理由。 */
  | { ok: false; stage: "connect"; reason: string };

/**
 * モデルを 上から 順に ためし、はじめに つながった ものを 返す。
 *
 * - ためす たびに `mint` で 通行証を 作り直す（1回 使い切り）
 * - 通行証が 作れなければ そこで やめる（つぎの モデルでも 同じ 鍵で 断られる）
 * - `open` が 投げたら つぎへ。理由の 名前は `reasonOf` が 決める
 * - `stop` が 真に なったら（画面を 離れた・つなぎ直しが 始まった）残りを ためさない
 */
export async function connectLiveInOrder<S>(options: {
  readonly models: readonly string[];
  readonly mint: () => Promise<LiveAuth>;
  readonly open: (auth: string, model: string) => Promise<S>;
  readonly reasonOf?: (error: unknown) => string;
  readonly stop?: () => boolean;
}): Promise<LiveConnectResult<S>> {
  const reasonOf =
    options.reasonOf ?? ((error) => (error instanceof LiveSetupError ? error.reason : "connect"));
  let lastReason = "upstream";
  for (const model of options.models) {
    if (options.stop?.()) break;
    const auth = await options.mint();
    if (!auth.ok) return { ok: false, stage: "auth", reason: auth.reason };
    if (options.stop?.()) break;
    try {
      return { ok: true, session: await options.open(auth.auth, model), model };
    } catch (error) {
      lastReason = reasonOf(error);
    }
  }
  return { ok: false, stage: "connect", reason: lastReason };
}
