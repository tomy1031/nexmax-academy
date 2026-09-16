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
 * - 何も 起きない まま なら、期限（`LIVE_SETUP_TIMEOUT_MS`）で つぎを **始める**
 * - 期限を 過ぎて から つながった ものも、まだ どれも つながって いなければ **使う**。
 *   遅い 回線で「つながりかけた 先頭を 捨てて、控えも 間に 合わない」を 起こさない
 * - 使わない ものは **閉じる**（無料枠の Live は 同時に 開ける 数が 少ない）
 *
 * ## 短命トークンは 1回 使い切り
 * `live-token.ts` の `uses: 1`。ためす たびに 作り直す——1枚を 使い回すと
 * 2つ目の モデルは 必ず 断られ、「控えに 落ちる」が 見かけだけに なる。
 */

/**
 * 1つの モデルで したくの 合図を 待って、つぎの モデルを 始める までの 時間。
 *
 * **断られた ときは この 時間を 待たない**（閉じられた その場で 進む）ので、
 * これが 効くのは 何も 返って こない ときだけ。期限を 過ぎても 待つのは やめない
 *（あとから つながれば 使う）——ここは「あきらめる 時間」では なく「控えを 足す 時間」。
 */
export const LIVE_SETUP_TIMEOUT_MS = 9_000;

/**
 * 先に 作った 1枚目の 通行証を そのまま 使って よい 時間。
 *
 * 短命トークンは **2分 以内に つなぎ始めないと 使えない**（`live-token.ts` の
 * `NEW_SESSION_WINDOW_MINUTES`）。1枚目は マイクの 許可を 聞く 前に 作るので、
 * はじめての 許可ダイアログで 学習者が 迷うと 切れる。切れた 1枚で 先頭を ためすと
 * 断られて **黙って 控えに 格下げ**される ので、余裕を みて 1分で 作り直す。
 */
export const FIRST_AUTH_FRESH_MS = 60_000;

/** したくの 途中で 止まった 理由（理由の 名前だけを 運ぶ。トークンは 入れない）。 */
export class LiveSetupError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

interface Closable {
  close: () => void;
}

function closeQuietly(session: Closable): void {
  try {
    session.close();
  } catch {
    // もう 閉じて いる ものは 閉じられない（それで よい）
  }
}

/**
 * したくの 前に 閉じられた ときの 理由の 名前。
 *
 * **使いすぎ だけは 分けて 呼ぶ**。モデルが 無い・設定を 断られた のと ちがい、
 * 学習者（先生）が する ことが ちがう（時間を おく）。どちらでも **控えは ためす**——
 * 無料枠の 上限は モデルごとに 数えられる ので、先頭が 使いすぎでも 控えは 通る ことが ある。
 *
 * 閉じた 理由の 文には キーが 混ざりうる（`upstream-error.ts` と 同じ 用心）。
 * 見るだけで、外へは **決まった 名前しか 出さない**。
 */
export function reasonFromClose(event: unknown): "rateLimited" | "modelNotFound" {
  const text =
    event && typeof event === "object" && typeof (event as { reason?: unknown }).reason === "string"
      ? (event as { reason: string }).reason
      : "";
  return /quota|exhaust|rate.?limit|too many/i.test(text) ? "rateLimited" : "modelNotFound";
}

/**
 * 1回の つなぎの 段階。
 * - `waiting` … したくの 合図を 待って いる
 * - `late` ……… 期限を 過ぎた（つぎの モデルを 始めた）。あとから 届けば 使う かも しれない
 * - `ready` ……… つながって、使う ことに なった（ここから 先の 切断は「つないだ あとの 切断」）
 * - `abandoned` … 断られた・使わない ことに なった（この つなぎからの 届きものは 捨てる）
 */
export type SetupPhase = "waiting" | "late" | "ready" | "abandoned";

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
 * `waiting`／`late` なら `fail`、`ready` なら ふつうの 切断として 扱う。
 *
 * `claim` は **つながった ときに 使って よいか**を 聞く 口（`connectLiveInOrder` が 渡す）。
 * 断られたら 門が 自分で 閉じる——閉じる 前に `abandoned` に する ので、その 切断を
 * 呼ぶ 側が「つないだ あとの 切断」と 取りちがえて 張り直す ことが ない。
 * 渡さない ときは、期限の 前に 届いた ものだけ 使い、期限の あとに 届いた ものは 閉じる。
 */
export function createSetupGate<S extends Closable>(
  ms: number = LIVE_SETUP_TIMEOUT_MS,
  claim?: (session: S) => boolean,
): SetupGate<S> {
  let phase: SetupPhase = "waiting";
  /** `wait` の 前に 断られた ときの 理由（あとで `wait` が すぐ 投げる）。 */
  let early: LiveSetupError | null = null;
  let reject: ((error: Error) => void) | null = null;

  return {
    phase: () => phase,
    fail: (reason) => {
      if (phase === "late") {
        phase = "abandoned";
        return;
      }
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
          phase = "late";
          rejectWait(new LiveSetupError("timeout"));
        }, ms);
        reject = (error) => {
          clearTimeout(timer);
          rejectWait(error);
        };
        if (early) reject(early);

        connecting.then(
          (session) => {
            const was = phase;
            const usable = was === "waiting" || was === "late";
            if (usable && (claim ? claim(session) : was === "waiting")) {
              phase = "ready";
              clearTimeout(timer);
              if (was === "waiting") resolve(session);
              return;
            }
            // 使わない（先に 別の モデルが つながった・もう やめた・期限の あと）。閉じる 前に 捨てる 印
            phase = "abandoned";
            if (was === "waiting") reject?.(new LiveSetupError("superseded"));
            closeQuietly(session);
          },
          (error: unknown) => {
            const was = phase;
            if (was !== "waiting" && was !== "late") return;
            phase = "abandoned";
            if (was === "waiting") {
              clearTimeout(timer);
              rejectWait(error instanceof Error ? error : new LiveSetupError("connect"));
            }
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
 * `freshUntil`（時刻）を 過ぎて いたら 1枚目も 作り直す（`FIRST_AUTH_FRESH_MS`）。
 */
export function startingWith(
  first: LiveAuth,
  mint: () => Promise<LiveAuth>,
  freshUntil: number = Number.POSITIVE_INFINITY,
  now: () => number = Date.now,
): () => Promise<LiveAuth> {
  let spare: LiveAuth | null = first;
  return async () => {
    const auth = spare;
    spare = null;
    if (auth && now() <= freshUntil) return auth;
    return await mint();
  };
}

export type LiveConnectResult<S> =
  | { ok: true; session: S; model: string }
  /** 通行証が 作れなかった（鍵・権限・使いすぎ）。モデルを 変えても 同じ。 */
  | { ok: false; stage: "auth"; reason: string }
  /**
   * どの モデルでも つながらなかった。`reason` は **使いすぎが 1つでも あれば rateLimited**
   *（ほかの モデルが 無い だけなら、止めて いる のは 使いすぎ）、無ければ さいごの 理由。
   */
  | { ok: false; stage: "connect"; reason: string };

/**
 * モデルを 上から 順に ためし、はじめに つながった ものを 返す。
 *
 * - ためす たびに `mint` で 通行証を 作り直す（1回 使い切り）
 * - 通行証が 作れなければ そこで やめる（つぎの モデルでも 同じ 鍵で 断られる）
 * - `open` が 投げたら つぎへ（断られた・期限）。理由の 名前は `reasonOf` が 決める
 * - `open` には 3つ目の 引数 `claim` を 渡す。門（`createSetupGate`）に 渡せば、期限の
 *   あとに 遅れて つながった ものも、まだ どれも 決まって いなければ 使える
 * - 決まったら 残りは 使わない（門が 閉じる。門を 通さない `open` の ぶんは ここで 閉じる）
 * - `stop` が 真に なったら（画面を 離れた・つなぎ直しが 始まった）残りを ためさない
 * - `lateGraceMs` を 渡すと、決まらない まま 終わる ときに **期限切れで 待って いる
 *   つなぎが あれば** その 時間だけ 待つ。候補が 尽きた・つぎの 通行証が 回線の 瞬断で
 *   作れなかった——その 1秒後に 先頭が つながる 遅い 回線で、使えた ものを 捨てない
 */
export async function connectLiveInOrder<S extends Closable>(options: {
  readonly models: readonly string[];
  readonly mint: () => Promise<LiveAuth>;
  readonly open: (auth: string, model: string, claim: (session: S) => boolean) => Promise<S>;
  readonly reasonOf?: (error: unknown) => string;
  readonly stop?: () => boolean;
  readonly lateGraceMs?: number;
}): Promise<LiveConnectResult<S>> {
  const reasonOf =
    options.reasonOf ?? ((error) => (error instanceof LiveSetupError ? error.reason : "connect"));
  /** 決まった つなぎ（コールバックから 書く ので 入れ物に 持つ）。 */
  const state: { winner: { session: S; model: string } | null; finished: boolean } = {
    winner: null,
    finished: false,
  };
  let wake: () => void = () => {};
  const claimed = new Promise<null>((resolve) => {
    wake = () => resolve(null);
  });
  const claimFor =
    (model: string) =>
    (session: S): boolean => {
      if (state.winner || state.finished) return false;
      state.winner = { session, model };
      wake();
      return true;
    };
  /** いま 決まって いる つなぎ（関数で 読む。コールバックが 書きかえる ので、その場の 絞り込みに 頼らない）。 */
  const decided = () => state.winner;
  const reasons: string[] = [];

  /** 通行証が 作れずに やめた ときの 理由（鍵・権限・使いすぎ・回線）。 */
  let authFailure: string | null = null;

  for (const model of options.models) {
    if (decided() || options.stop?.()) break;
    const auth = await Promise.race([options.mint(), claimed]);
    if (decided() || !auth) break;
    if (!auth.ok) {
      authFailure = auth.reason;
      break;
    }
    if (options.stop?.()) break;
    const claim = claimFor(model);
    try {
      const opened = await Promise.race([
        options.open(auth.auth, model, claim).then((session) => ({ session })),
        claimed,
      ]);
      // 門を 通さない `open` は ここで 決める。先に 別の ものが 決まって いたら 閉じる
      if (opened && decided()?.session !== opened.session && !claim(opened.session)) {
        closeQuietly(opened.session);
      }
    } catch (error) {
      reasons.push(reasonOf(error));
    }
  }

  const grace = options.lateGraceMs ?? 0;
  if (grace > 0 && !decided() && !options.stop?.() && reasons.includes("timeout")) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      claimed,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), grace);
      }),
    ]);
    clearTimeout(timer);
  }

  state.finished = true;
  const winner = decided();
  if (winner) return { ok: true, ...winner };
  if (authFailure !== null) return { ok: false, stage: "auth", reason: authFailure };
  const reason = reasons.includes("rateLimited")
    ? "rateLimited"
    : (reasons[reasons.length - 1] ?? "upstream");
  return { ok: false, stage: "connect", reason };
}
