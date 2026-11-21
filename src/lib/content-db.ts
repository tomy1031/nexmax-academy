/**
 * コンテンツのDB読み込み（サーバ専用）
 *
 * 管理画面・Codex工房が保存した教材（Supabase `contents` 表）を読む。
 * git の content/*.json 側は src/lib/content.ts が読み、両者を合流させる（設計07 §11.1）。
 *
 * ここは「静かに諦める」層である。Supabase 未設定のローカル開発や、
 * マイグレーション未適用の環境でも git 由来のコンテンツだけでアプリが動くことを
 * 保証するため、読めない状況は例外にせず空配列にして返す。
 *
 * クライアントコンポーネントから import しないこと。
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { cache } from "react";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { contentSchema, type Content } from "@/content/schema";
import { getSupabasePublicConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type ContentStatus = "draft" | "published";

/** DB由来のコンテンツ1件（本体＋公開状態などの台帳情報）。 */
export interface DbContentEntry {
  content: Content;
  status: ContentStatus;
  /** どのステージに置くつもりか（管理画面の絞り込み用。参照の正はステージ側）。 */
  stageId: string | null;
  updatedAt: string;
}

interface ContentRow {
  id: string;
  kind: string;
  data: unknown;
  status: string;
  stage_id: string | null;
  updated_at: string;
}

const SELECT_COLUMNS = "id, kind, data, status, stage_id, updated_at";

/**
 * Next の制御用エラー（動的レンダリングへの切り替え・redirect・notFound）かどうか。
 *
 * これらは「失敗」ではなくフレームワークの合図なので、握りつぶすとページが
 * 静的なまま固まる。digest / code の値で見分ける（内部モジュールを import しない）。
 */
function isNextControlFlowError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const digest = (e as { digest?: unknown }).digest;
  if (
    typeof digest === "string" &&
    (digest === "DYNAMIC_SERVER_USAGE" || digest.startsWith("NEXT_"))
  )
    return true;
  const code = (e as { code?: unknown }).code;
  return code === "NEXT_STATIC_GEN_BAILOUT";
}

/**
 * 公開分だけを読むための、Cookie を使わないクライアント。
 *
 * 公開済みの教材は誰でも読めるデータで（RLS: status='published' or is_admin）、
 * セッションを必要としない。ここで Cookie を読むと、それだけでページが
 * 動的レンダリングに落ちてしまい、学習者ページを静的化・ISR できなくなる
 *（設計07 §11.1「gitコンテンツは静的生成のまま。DBコンテンツはISR」）。
 */
function createPublicClient() {
  const cfg = getSupabasePublicConfig();
  if (!cfg) return null;
  return createPlainClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * `contents` 表を読む。
 *
 * - 既定は公開分のみ。Cookie を使わないので、静的生成・ISR の途中からでも読める。
 * - `includeDrafts` は管理画面用。下書きは本人のセッションが要る（RLSで管理者に限られる）。
 * - 行の `data` を contentSchema で検証し、通ったものだけ返す。
 *   規格が進化して古い行が残っていても、学習者の画面は壊れない。
 *
 * ## 1リクエスト1回に畳む（重要）
 * 呼ぶたびにDBへ往復し、返ってきた全行を zod で検証していた。
 * 1画面で `getStage` → `getManga` → `getArticle` … と種別ごとに呼ぶので、
 * ステージの教材が5本あるだけで**10回以上**走る。
 * これで Cloudflare Workers の上限に当たって 500（Error 1102）になった。
 *
 * React の `cache()` は**同じリクエストの中でだけ**結果を使い回す
 *（リクエストをまたいで古い値を返すことはない）。引数で分かれると畳めないので、
 * 公開分と下書き入りを別の関数に分けてある。
 *
 * ## API ルートでは cache() が効かない（2026-11-21）
 * `cache()` が畳むのは **React がページを組み立てている間だけ**。API ルート（route.ts）は
 * React の描画の外で動くので、呼ぶたびに本体が走る（Next 16 / React 19 の実装で確かめた。
 * 描画の外では使い回しの入れ物を毎回新しく作る）。教材の健康しらべ（`/api/health/content`）は
 * 1回で一覧を種類ぶん呼ぶので、**1回の要求で studio_contents を約21回 丸ごと引いていた**。
 * 見張り（workers/watch）が10分ごとに叩き、1日 約560MB。Supabase の無料枠（月5GB）を超えて
 * 2026-11-20 から全員がログインできなくなった。
 *
 * API ルートで教材を読むときは **`withDbContentScope` で包む**。中では1回に畳む
 *（`tests/supabase_egress_budget.test.ts` が回数を数えて守る）。
 */
export async function fetchDbContents(opts?: {
  includeDrafts?: boolean;
}): Promise<DbContentEntry[]> {
  return opts?.includeDrafts ? fetchWithDrafts() : fetchPublished();
}

/** 公開分だけ（学習者の画面・ISR から呼ばれる）。 */
const fetchPublished = cache(async (): Promise<DbContentEntry[]> => readInScope(false));

/** 下書きも含む（管理画面。本人のセッションが要る）。 */
const fetchWithDrafts = cache(async (): Promise<DbContentEntry[]> => readInScope(true));

/* ------------------------------------------------------------------ *
 * 1回の要求の枠（API ルート用）
 * ------------------------------------------------------------------ */

/** 1回の要求の中で studio_contents を引いた回数・行数・大きさ（UTF-8 のバイト数・おおよそ）。 */
export interface DbContentScopeStats {
  fetches: number;
  rows: number;
  bytes: number;
}

interface DbContentScope extends DbContentScopeStats {
  published?: Promise<DbContentEntry[]>;
  withDrafts?: Promise<DbContentEntry[]>;
}

/*
 * 要求ごとの入れ物。Cloudflare Workers でも nodejs_compat で使える（Next 自身も使っている）。
 * **要求をまたいで使い回さない**——先生が管理画面で直した教材を、次の要求ですぐ出すため。
 * モジュールの変数に覚える形（またぐ形）にすると、Workers では別の要求の I/O を
 * 待つことにもなり、動かない。
 */
const requestScope = new AsyncLocalStorage<DbContentScope>();

/**
 * API ルートで教材を読むときの枠。中で何度 `fetchDbContents()`・`list*()` を呼んでも、
 * studio_contents を引くのは公開分・下書き入りそれぞれ1回まで。
 *
 * 読めなかった結果（空）も その要求の中では使い回す。DB が止まっているときに
 * 1回の要求から何度も引き直さない（ページの `cache()` と同じ ふるまい）。
 * 入れ子にしたときは外側の枠を使う。
 *
 * `fn` に渡す stats は、その要求で引いた回数・行数・大きさ（健康しらべが答えに出す）。
 */
export function withDbContentScope<T>(
  fn: (stats: Readonly<DbContentScopeStats>) => Promise<T>,
): Promise<T> {
  const outer = requestScope.getStore();
  if (outer) return fn(outer);
  const scope: DbContentScope = { fetches: 0, rows: 0, bytes: 0 };
  return requestScope.run(scope, () => fn(scope));
}

function readInScope(includeDrafts: boolean): Promise<DbContentEntry[]> {
  const scope = requestScope.getStore();
  if (!scope) return readContents(includeDrafts, null);
  const key = includeDrafts ? "withDrafts" : "published";
  return (scope[key] ??= readContents(includeDrafts, scope));
}

const utf8 = new TextEncoder();

async function readContents(
  includeDrafts: boolean,
  scope: DbContentScope | null,
): Promise<DbContentEntry[]> {
  let supabase: NonNullable<Awaited<ReturnType<typeof createClient>>> | null;
  try {
    supabase = includeDrafts ? await createClient() : createPublicClient();
  } catch (e) {
    // Next の制御用エラー（動的レンダリングへの切り替え等）は握りつぶさない
    if (isNextControlFlowError(e)) throw e;
    // Supabase 未設定など想定内の失敗だけ、git 側だけで組み立てる
    return [];
  }
  if (!supabase) return [];

  let query = supabase.from("studio_contents").select(SELECT_COLUMNS);
  if (!includeDrafts) query = query.eq("status", "published");

  const { data, error } = await query;
  if (scope) scope.fetches++;
  // テーブル未作成・権限なし・接続不良のいずれも「DBには何もない」として扱う
  if (error || !data) return [];
  if (scope) {
    // 大きさは 枠の 中（API ルート）でだけ 測る。ページの 組み立てに 手間を 足さない
    scope.rows += data.length;
    scope.bytes += utf8.encode(JSON.stringify(data)).length;
  }

  return (data as ContentRow[]).flatMap((row) => toEntry(row));
}

function toEntry(row: ContentRow): DbContentEntry[] {
  const parsed = contentSchema.safeParse(row.data);
  if (!parsed.success) return [];
  // 台帳の id/kind と中身がずれた行は合流の前提（IDで引ける）を壊すため使わない
  if (parsed.data.id !== row.id || parsed.data.kind !== row.kind) return [];
  return [
    {
      content: parsed.data,
      status: row.status === "published" ? "published" : "draft",
      stageId: row.stage_id,
      updatedAt: row.updated_at,
    },
  ];
}
