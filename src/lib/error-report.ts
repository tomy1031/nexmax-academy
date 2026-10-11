/**
 * 画面の エラーを `events` 表へ 1行 送る（本番の 見張り・2026-10-11）。
 *
 * ## なぜ 要るか
 * 画面が 落ちても どこにも 記録が 無く、学習者や 先生の 申告で はじめて 分かって いた。
 * src/app/global-error.tsx（どこも 受け止められなかった エラーの 最後の 受け皿）が
 * ここを 呼んで、要約だけを Supabase に 残す。件数は 見張りの Worker（workers/watch）が
 * 数えて、続いて いれば 知らせる。
 *
 * ## 送る もの・送らない もの
 * 送る: ページの 道（クエリは 落とす）・メッセージ（伏せ字に して 短く）・digest・
 *       ログインの 有無・ビルドの SHA。時刻は DB が 決める。
 * 送らない: だれか（user_id・メール）・キー・クエリ文字列・長い 数字や トークン。
 * **ユーザーの JWT も 付けない**（anon の 鍵で 送る＝ DB は だれが 送ったか 知らない）。
 *
 * ## 増えすぎない ように（30人 同時でも）
 * - 端末ごと: 同じ エラーは 30分に 1回・どの エラーでも 1時間に 5回まで（localStorage）。
 *   localStorage が 使えない ブラウザでは、この タブの あいだだけ 覚える。
 * - 全体: DB の トリガーが 10分に 30行で ふたを する（移行SQL 20261011120000）。
 *
 * 送りっぱなしで 返事は 見ない。**送れなくても 画面には 何も 起こさない**——
 * 落ちた 画面を さらに 落とさない ことが 最優先。
 */

import { hasAuthCookieInBrowser } from "@/lib/auth-cookie";
import { buildInfo, getSupabasePublicConfig } from "@/lib/env";

/** 種類。stale = 部品の 取りこぼしで、自動の 読み直しでも 直らなかった もの。 */
export type ClientErrorKind = "render" | "stale";

export interface ClientErrorEvent {
  readonly verb: "client_error";
  readonly object: string;
  readonly result: {
    readonly kind: ClientErrorKind;
    readonly name: string;
    readonly message: string;
    readonly digest: string | null;
    readonly logged_in: boolean;
    readonly build: string | null;
  };
}

/** 端末ごとの 記録の 置き場所（localStorage の 鍵）。 */
export const REPORT_MARK = "nexmax:error-report";
/** 同じ エラーを もう一度 送るまでの 間。 */
export const SAME_ERROR_GAP_MS = 30 * 60_000;
/** 1台が 1時間に 送れる 数。 */
export const DEVICE_HOURLY_CAP = 5;

const HOUR_MS = 60 * 60_000;
const MESSAGE_MAX = 300;
const PATH_MAX = 200;

/**
 * 文から 人や 鍵に つながる ものを 伏せる。
 * 消しすぎて 原因が 読めなく なるより、**漏らす ほうが 害が 大きい**ので 広めに 伏せる。
 */
export function sanitizeErrorText(text: string, max = MESSAGE_MAX): string {
  return (
    text
      // URL の クエリと # 以降（?code= や トークンが 乗る）
      .replace(/(https?:\/\/[^\s?#"'<>]+)[?#][^\s"'<>]*/gi, "$1")
      // 相対の 道の クエリ（/auth/callback?next=…&name=… など）
      .replace(/\?[\w.%-]+=[^\s"'<>]*/g, "")
      .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "<email>")
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<id>")
      // JWT（eyJ…）・API キー・長い ランダム文字列
      .replace(/\beyJ[\w-]*\.[\w-]*\.?[\w-]*/g, "<token>")
      .replace(/\b(?=[\w-]*\d)(?=[\w-]*[a-zA-Z])[\w-]{24,}\b/g, "<token>")
      .replace(/\d{6,}/g, "<num>")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max)
  );
}

/** 道だけ（クエリ・# は 落とす）。id らしい ものは 伏せる。 */
export function sanitizePath(pathname: string): string {
  const path = pathname.split(/[?#]/)[0] || "/";
  // DB は 空白の 入った 道を 受け取らない（移行SQL 20261011120000 の 形の しばり）
  const clean = sanitizeErrorText(path.startsWith("/") ? path : `/${path}`, PATH_MAX);
  return clean.replace(/\s/g, "_") || "/";
}

function describe(error: unknown): { name: string; message: string; digest: string | null } {
  if (error && typeof error === "object") {
    const { name, message, digest } = error as {
      name?: unknown;
      message?: unknown;
      digest?: unknown;
    };
    return {
      name: typeof name === "string" ? sanitizeErrorText(name, 60) : "Error",
      message: typeof message === "string" ? sanitizeErrorText(message) : "",
      digest: typeof digest === "string" ? sanitizeErrorText(digest, 40) : null,
    };
  }
  return { name: "Error", message: sanitizeErrorText(String(error ?? "")), digest: null };
}

export function buildClientErrorEvent(
  error: unknown,
  ctx: { pathname: string; loggedIn: boolean; kind: ClientErrorKind; build: string | null },
): ClientErrorEvent {
  const { name, message, digest } = describe(error);
  return {
    verb: "client_error",
    object: sanitizePath(ctx.pathname),
    result: {
      kind: ctx.kind,
      name,
      message,
      digest,
      logged_in: ctx.loggedIn,
      build: ctx.build ? ctx.build.slice(0, 12) : null,
    },
  };
}

/** 同じ エラーかを 見分ける 印。数字の ちがい（chunk 番号など）は 同じと みなす。 */
export function errorFingerprint(event: ClientErrorEvent): string {
  const { kind, name, message, digest } = event.result;
  const text = `${kind}|${event.object}|${name}|${digest ?? message}`;
  return text.replace(/\d+/g, "#").slice(0, 200);
}

interface ReportLog {
  /** 印ごとの 最後に 送った 時刻 */
  readonly last: Record<string, number>;
  /** 送った 時刻（1時間ぶん） */
  readonly sent: readonly number[];
}

type ReportStore = Pick<Storage, "getItem" | "setItem">;

function readLog(store: ReportStore): ReportLog {
  try {
    const parsed = JSON.parse(store.getItem(REPORT_MARK) ?? "") as Partial<ReportLog>;
    const last =
      parsed.last && typeof parsed.last === "object" ? (parsed.last as Record<string, number>) : {};
    const sent = Array.isArray(parsed.sent) ? parsed.sent.filter((t) => typeof t === "number") : [];
    return { last, sent };
  } catch {
    return { last: {}, sent: [] };
  }
}

/**
 * いま 送って よいか（よければ 記録して true）。
 * 記録を 書けない ときは false——送りすぎる より、送らない ほうが ましだから。
 */
export function takeReportTicket(store: ReportStore, fingerprint: string, now: number): boolean {
  const log = readLog(store);
  const lastSame = log.last[fingerprint];
  if (typeof lastSame === "number" && now - lastSame < SAME_ERROR_GAP_MS) return false;

  const recent = log.sent.filter((t) => now - t < HOUR_MS);
  if (recent.length >= DEVICE_HOURLY_CAP) return false;

  // 古い 印は 捨てて、置き場所を 太らせない
  const last: Record<string, number> = {};
  for (const [key, at] of Object.entries(log.last)) {
    if (now - at < SAME_ERROR_GAP_MS) last[key] = at;
  }
  last[fingerprint] = now;
  try {
    store.setItem(REPORT_MARK, JSON.stringify({ last, sent: [...recent, now] }));
    return true;
  } catch {
    return false;
  }
}

/** localStorage が 使えない ブラウザの 代わり（この タブの あいだだけ）。 */
const memory = new Map<string, string>();
const memoryStore: ReportStore = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => void memory.set(key, value),
};

function browserStore(): ReportStore {
  try {
    // 参照した だけで 例外に なる 設定の ブラウザが ある（src/app/global-error.tsx と 同じ）
    const store = window.localStorage;
    store.getItem(REPORT_MARK);
    return store;
  } catch {
    return memoryStore;
  }
}

export interface ReportDeps {
  readonly config: { url: string; anonKey: string } | null;
  readonly pathname: string;
  readonly loggedIn: boolean;
  readonly build: string | null;
  readonly store: ReportStore;
  readonly now: number;
  readonly send: (url: string, init: RequestInit) => Promise<unknown>;
}

function browserDeps(): ReportDeps {
  return {
    config: getSupabasePublicConfig(),
    pathname: window.location.pathname,
    loggedIn: hasAuthCookieInBrowser(),
    build: buildInfo.sha,
    store: browserStore(),
    now: Date.now(),
    send: (url, init) => fetch(url, init),
  };
}

/**
 * 画面の エラーを 1行 送る（送ったら true）。例外は 外へ 出さない。
 * Supabase が 未設定（鍵ゼロの デモモード・e2e）なら 何も しない。
 */
export function reportClientError(
  error: unknown,
  kind: ClientErrorKind = "render",
  deps?: ReportDeps,
): boolean {
  try {
    const d = deps ?? browserDeps();
    if (!d.config) return false;

    const event = buildClientErrorEvent(error, {
      pathname: d.pathname,
      loggedIn: d.loggedIn,
      kind,
      build: d.build,
    });
    if (!takeReportTicket(d.store, errorFingerprint(event), d.now)) return false;

    void d
      .send(`${d.config.url.replace(/\/+$/, "")}/rest/v1/events`, {
        method: "POST",
        // 読み直しや 画面の 移動で 途中で 切られない ように
        keepalive: true,
        headers: {
          apikey: d.config.anonKey,
          Authorization: `Bearer ${d.config.anonKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(event),
      })
      .catch(() => {
        /* 送れなくても 画面には 何も 起こさない */
      });
    return true;
  } catch {
    return false;
  }
}
