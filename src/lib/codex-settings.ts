"use client";

/**
 * Codex への つなぎ先（先生の端末に置く設定）
 *
 * 「AI設定」で入れた接続先と合言葉を、スタジオの各エディタからも読む。
 * 画面ごとに localStorage のキーを書くと、片方だけ古い名前が残って
 * 「AI設定では つながっているのに まんがだけ作れない」という状態になる。
 *
 * ## なぜ合言葉が要るか
 * 実測（2026-08-06）: **https のページからでも `ws://127.0.0.1` は開ける**
 *（`127.0.0.1` は「安全なオリジン」なので混在コンテンツで弾かれない）。
 * おかげで公開中のURLから手元の Codex を使えるが、裏返すと
 * **先生が開いた どのサイトからも叩ける**。その先にいるのはシェルを実行できる Codex。
 * ブリッジ（`scripts/codex_bridge.mjs`）が合言葉を必須にしており、ここはその置き場。
 *
 * 合言葉は**この端末の中だけ**に置く。サーバへは送らない（送る相手は手元のブリッジだけ）。
 */

const URL_KEY = "nexmax.codexUrl";
const TOKEN_KEY = "nexmax.codexToken";

export const DEFAULT_CODEX_URL = "ws://127.0.0.1:8790/codex";

export interface CodexSettings {
  /** WebSocket の接続先。ふつうは既定のまま。 */
  readonly url: string;
  /** ブリッジが起動時に表示する合言葉。 */
  readonly token: string;
}

/*
 * 画面から読むときは、**文字列を1つずつ**返すこの2つを使う
 *（`useSyncExternalStore` は毎回同じ値が返ることを求めるので、
 *  オブジェクトを組み立てて返すと無限に再描画する）。
 */
export function getCodexUrl(): string {
  return typeof window === "undefined"
    ? DEFAULT_CODEX_URL
    : (window.localStorage.getItem(URL_KEY) ?? DEFAULT_CODEX_URL);
}

export function getCodexToken(): string {
  return typeof window === "undefined" ? "" : (window.localStorage.getItem(TOKEN_KEY) ?? "");
}

export function subscribeToCodexSettings(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export function readCodexSettings(): CodexSettings {
  if (typeof window === "undefined") return { url: DEFAULT_CODEX_URL, token: "" };
  return {
    url: window.localStorage.getItem(URL_KEY) ?? DEFAULT_CODEX_URL,
    token: window.localStorage.getItem(TOKEN_KEY) ?? "",
  };
}

export function saveCodexSettings(settings: CodexSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(URL_KEY, settings.url);
  window.localStorage.setItem(TOKEN_KEY, settings.token);
}

/** 合言葉が入っているか。入っていなければ Codex は使えない（Gemini に回す）。 */
export function hasCodex(settings: CodexSettings = readCodexSettings()): boolean {
  return settings.token.trim().length > 0 && settings.url.trim().length > 0;
}

/**
 * WebSocket の接続先に合言葉を付ける。
 * ブラウザの WebSocket は独自ヘッダを付けられないので、クエリで渡すしかない。
 */
export function codexSocketUrl(settings: CodexSettings): string {
  const url = new URL(settings.url);
  url.searchParams.set("token", settings.token);
  return url.toString();
}

/**
 * ブリッジの HTTP 側（ファイルの受け渡し）の入口。
 * WebSocket の接続先から組み立てる——別々に持たせると片方だけ直して食い違う。
 */
export function codexHttpUrl(settings: CodexSettings, pathname: string): URL {
  const ws = new URL(settings.url);
  const url = new URL(`${ws.protocol === "wss:" ? "https:" : "http:"}//${ws.host}${pathname}`);
  url.searchParams.set("token", settings.token);
  return url;
}
