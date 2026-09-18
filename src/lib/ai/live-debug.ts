import { getGeminiKey } from "@/lib/profile";

/**
 * Live（声の つなぎ）の 記録 — どこで 止まったかを あとから 追う ため
 *
 * ## なぜ 要るか（2026-09-18）
 * 「マイクが 動かない」と 言われても、ミーティング・朝礼の 🎤 は
 *「いまは したの らんに かいて こたえて ください」としか 出さず、
 * **鍵・短命トークン・マイクの 許可・モデル の どこで 止まったか**を
 * 先生も 開発者も 確かめる 手が 無かった（入口の マイクテストも「せつぞくを ためす」も 通るのに）。
 *
 * 例外の 中身は 画面に 出さない 決まり（トークンが 混ざりうる・use-live-voice.ts）なので、
 * ここには **決まった 名前・数・ブラウザの エラー名だけ**を 残す。文字列は 必ず
 * `redactSecrets` を 通す（鍵・トークンの 形を 伏せる）。
 *
 * - 記録は いつも 取る（メモリの 中だけ・さいごの 300件）。どこにも 送らない
 * - 画面に 出すのは URL に `?debug=1` を 付けた とき（`isLiveDebugOn`）。
 *   付けると この タブの あいだ 覚える。`?debug=0` で 消える
 */

export interface LiveDebugEntry {
  /** 時刻（ms）。 */
  readonly at: number;
  /** 何の 記録か（`voice.token` など。英字で 短く）。 */
  readonly what: string;
  readonly detail: string;
  /** 止まった・断られた など、うまく いかなかった 記録か。 */
  readonly problem: boolean;
}

const MAX_ENTRIES = 300;
const MAX_DETAIL = 240;
const DEBUG_FLAG = "nexmax.liveDebug";

let entries: readonly LiveDebugEntry[] = [];
const listeners = new Set<() => void>();

/**
 * 鍵・トークンの 形を 伏せる。
 *
 * Google の 閉じた 理由の 文や ブラウザの エラー文に、まれに 鍵や トークンが
 * 混ざる（upstream-error.ts と 同じ 用心）。聞き取りの 日本語は 残す。
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/AIza[0-9A-Za-z_-]{8,}/g, "AIza…")
    .replace(/AQ\.[0-9A-Za-z_.-]{8,}/g, "AQ.…")
    .replace(/auth_tokens\/[0-9A-Za-z_.-]+/g, "auth_tokens/…")
    .replace(/([?&](?:key|access_token)=)[^&\s"']+/gi, "$1…")
    .replace(/[0-9A-Za-z_-]{40,}/g, "…");
}

/** 1件 残す。`problem` は うまく いかなかった とき（画面の reason の 横に 出す）。 */
export function liveDebug(what: string, detail = "", problem = false): void {
  const clean = redactSecrets(detail).slice(0, MAX_DETAIL);
  entries = [
    ...entries.slice(-(MAX_ENTRIES - 1)),
    { at: Date.now(), what, detail: clean, problem },
  ];
  for (const listener of listeners) listener();
}

export function subscribeLiveDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** いまの 記録（変わるまで 同じ 配列を 返す＝useSyncExternalStore に そのまま 渡せる）。 */
export function readLiveDebug(): readonly LiveDebugEntry[] {
  return entries;
}

const NO_ENTRIES: readonly LiveDebugEntry[] = [];
/** サーバでは 記録は 無い。 */
export function readLiveDebugOnServer(): readonly LiveDebugEntry[] {
  return NO_ENTRIES;
}

export function clearLiveDebug(): void {
  entries = [];
  for (const listener of listeners) listener();
}

/**
 * **さいごの つなぎはじめ（`*.start`）から あと**で、さいごに うまく いかなかった 記録。
 * 前の つなぎの 失敗を いまの 理由の 横に 出さない ため、はじめの 記録で 止める。
 */
export function lastLiveProblem(list: readonly LiveDebugEntry[] = entries): LiveDebugEntry | null {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const entry = list[i]!;
    if (entry.problem) return entry;
    if (entry.what.endsWith(".start")) return null;
  }
  return null;
}

/**
 * 例外を 短い 文に する（ブラウザの エラー名＋文）。
 * マイクの 失敗は 名前で 原因が 分かる——NotAllowedError（許可が 無い）・
 * NotFoundError（マイクが 無い）・NotReadableError（ほかの アプリが 使って いる）など。
 */
export function describeError(error: unknown): string {
  if (error && typeof error === "object") {
    const { name, message } = error as { name?: unknown; message?: unknown };
    const head = typeof name === "string" ? name : "Error";
    const body = typeof message === "string" && message ? `: ${message}` : "";
    return redactSecrets(`${head}${body}`).slice(0, MAX_DETAIL);
  }
  return redactSecrets(String(error)).slice(0, MAX_DETAIL);
}

/** WebSocket の 閉じた 知らせを 短い 文に する（コード＋理由）。 */
export function describeClose(event: unknown): string {
  if (!event || typeof event !== "object") return "closed";
  const { code, reason } = event as { code?: unknown; reason?: unknown };
  const head = typeof code === "number" ? `code ${code}` : "closed";
  const body = typeof reason === "string" && reason ? ` ${reason}` : "";
  return redactSecrets(`${head}${body}`).slice(0, MAX_DETAIL);
}

/** 押して いた あいだの 音の 大きさ（0〜1）。送った 音が 無音だったかを 見る。 */
export function pcmPeak(pcm: Int16Array): number {
  let peak = 0;
  for (let i = 0; i < pcm.length; i += 1) {
    const value = Math.abs(pcm[i]!);
    if (value > peak) peak = value;
  }
  return peak / 0x8000;
}

/**
 * マイクの 許可の 状態を 記録に 足す（granted / denied / prompt）。
 * 聞けない ブラウザ（Safari の 古い 版など）は unknown。待たない。
 */
export function noteMicPermission(where: string): void {
  const permissions = typeof navigator === "undefined" ? undefined : navigator.permissions;
  if (!permissions?.query) {
    liveDebug(`${where}.mic.permission`, "unknown");
    return;
  }
  permissions
    .query({ name: "microphone" as PermissionName })
    .then((status) => liveDebug(`${where}.mic.permission`, status.state))
    .catch(() => liveDebug(`${where}.mic.permission`, "unknown"));
}

/**
 * 記録を 画面に 出すか（`?debug=1`）。付けたら この タブの あいだ 覚える。
 * 学習者の ふだんの 画面には 出ない。
 */
export function isLiveDebugOn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const flag = new URLSearchParams(window.location.search).get("debug");
    if (flag === "1") window.sessionStorage.setItem(DEBUG_FLAG, "1");
    if (flag === "0") window.sessionStorage.removeItem(DEBUG_FLAG);
    return window.sessionStorage.getItem(DEBUG_FLAG) === "1";
  } catch {
    return false;
  }
}

function clock(at: number): string {
  const date = new Date(at);
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

/** 1行に する（画面と コピーで 同じ 形）。 */
export function formatLiveDebugEntry(entry: LiveDebugEntry): string {
  return `${clock(entry.at)} ${entry.problem ? "!! " : ""}${entry.what}${entry.detail ? ` ${entry.detail}` : ""}`;
}

/**
 * コピー用の まとめ。はじめに 端末の ようすを 数行、つぎに 記録。
 * 鍵・トークンは 入らない（記録は 入る ときに 伏せて ある）。
 */
export function liveDebugReport(list: readonly LiveDebugEntry[] = entries): string {
  const lines: string[] = [];
  if (typeof window !== "undefined") {
    lines.push(`page: ${window.location.pathname}`);
    lines.push(`ua: ${navigator.userAgent}`);
    lines.push(
      `secure=${window.isSecureContext} mediaDevices=${Boolean(navigator.mediaDevices?.getUserMedia)} ` +
        `AudioContext=${typeof AudioContext !== "undefined"} ` +
        `AudioWorklet=${typeof AudioWorkletNode !== "undefined"} ` +
        // 鍵が この 端末に あるか だけ（中身は 見ない・出さない）。鍵は 画面の 源（origin）ごと
        `key=${getGeminiKey() ? "yes" : "no"}`,
    );
  }
  lines.push(...list.map(formatLiveDebugEntry));
  return lines.join("\n");
}

/** マイクの 流れの ようす（数だけ）。ラベル（機種名）は 残さない。 */
export function describeStream(stream: MediaStream): string {
  const track = stream.getAudioTracks?.()[0];
  if (!track) return "no audio track";
  const settings = track.getSettings?.() ?? {};
  return [
    `state=${track.readyState}`,
    `muted=${track.muted}`,
    `enabled=${track.enabled}`,
    `rate=${settings.sampleRate ?? "?"}`,
    `ch=${settings.channelCount ?? "?"}`,
    `aec=${settings.echoCancellation ?? "?"}`,
  ].join(" ");
}
