/**
 * 管理画面「エラーログ」（/admin/logs）で使う、表示の決まり。
 *
 * 出すものは2つ。
 * - サイトの自動チェック: 別の Worker（workers/watch）が10分ごとに本番を見た結果。
 *   その Worker の公開ページ（JSON）をブラウザから読む。本番の Worker からは
 *   同じアカウントの workers.dev を呼べない（error 1042）ので、サーバでは読まない。
 * - ブラウザで起きたエラー: src/lib/error-report.ts が events 表へ送った記録。
 *   読めるのは管理者だけ（移行SQL 20261011170000）。
 */

/** 自動チェックの結果を返す公開ページ。中身は公開してよい結果だけ（鍵は出ない）。 */
export const SITE_CHECK_URL = "https://academy-watch.nexmax.workers.dev";

/** 自動チェックが止まったとみなす長さ。10分ごとに動くので、3回ぶん来なければ止まっている。 */
export const CHECK_STALE_MS = 30 * 60_000;

export interface SiteCheckProbe {
  readonly id: string;
  readonly code: string | null;
  readonly failures: number;
}

export interface SiteCheckStatus {
  readonly lastRunAt: string | null;
  readonly open: Readonly<Record<string, { readonly since: number; readonly text: string }>>;
  readonly last: { readonly probes?: readonly SiteCheckProbe[] } | null;
  readonly muted: string | null;
}

export interface ClientErrorRow {
  readonly at: string;
  readonly object: string | null;
  readonly result: {
    readonly kind?: string;
    readonly name?: string;
    readonly message?: string;
    readonly digest?: string | null;
    readonly logged_in?: boolean;
    readonly build?: string | null;
  } | null;
}

/** チェックする場所の名前（Worker の id → 画面の言葉）。 */
export const CHECK_LABELS: Readonly<Record<string, string>> = {
  title: "タイトル画面（/）",
  gate: "ログイン前の転送（/map）",
  health: "教材の自動チェック（/api/health/content）",
};

/** カンボジア時間（UTC+7・夏時間なし）で「10/11 18:40」の形にする。 */
export function formatIct(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const ms = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(ms)) return "—";
  const d = new Date(ms + 7 * 60 * 60_000).toISOString();
  return `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))} ${d.slice(11, 16)}`;
}

function describeCode(code: string): string {
  if (code === "1102") return "Error 1102（Worker の上限を超えた）";
  if (code === "1101") return "Error 1101（Worker が例外で止まった）";
  if (code === "timeout") return "返事がない";
  if (code === "network") return "つながらない";
  if (code === "bad-json") return "返事の形がおかしい";
  return `HTTP ${code}`;
}

/** 1か所の結果を1行で。 */
export function probeResultLabel(probe: SiteCheckProbe): string {
  if (probe.code) return `失敗（${describeCode(probe.code)}・${probe.failures}回）`;
  if (probe.failures > 0) return `正常（${probe.failures}回失敗したあとに通った）`;
  return "正常";
}

/** 全体の様子を1行で。止まっている・まだ動いていない、も見分ける。 */
export function overallLabel(
  status: SiteCheckStatus | null,
  now: number,
): {
  readonly tone: "ok" | "warn";
  readonly text: string;
} {
  if (!status || !status.lastRunAt) {
    return { tone: "warn", text: "自動チェックはまだ一度も動いていません" };
  }
  const last = Date.parse(status.lastRunAt);
  if (Number.isFinite(last) && now - last > CHECK_STALE_MS) {
    return {
      tone: "warn",
      text: `自動チェックが止まっています（最後は ${formatIct(last)}）`,
    };
  }
  const open = Object.keys(status.open ?? {}).length;
  if (open > 0) return { tone: "warn", text: `異常が続いています（${open}件）` };
  return { tone: "ok", text: "正常です" };
}

/** エラーの種類（events.result.kind）を画面の言葉に。 */
export function kindLabel(kind: string | undefined): string {
  return kind === "stale" ? "部品の読み込み" : "画面の表示";
}

/** メッセージが無いときは digest（サーバ側で伏せられたエラーの番号）を出す。 */
export function messageLabel(row: ClientErrorRow): string {
  const result = row.result ?? {};
  const name = result.name && result.name !== "Error" ? `${result.name}: ` : "";
  if (result.message) return `${name}${result.message}`;
  if (result.digest) return `${name}（サーバ側のエラー・番号 ${result.digest}）`;
  return `${name}（メッセージなし）`;
}
