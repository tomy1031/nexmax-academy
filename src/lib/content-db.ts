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
 */
export async function fetchDbContents(opts?: {
  includeDrafts?: boolean;
}): Promise<DbContentEntry[]> {
  let supabase: NonNullable<Awaited<ReturnType<typeof createClient>>> | null;
  try {
    supabase = opts?.includeDrafts ? await createClient() : createPublicClient();
  } catch (e) {
    // Next の制御用エラー（動的レンダリングへの切り替え等）は握りつぶさない
    if (isNextControlFlowError(e)) throw e;
    // Supabase 未設定など想定内の失敗だけ、git 側だけで組み立てる
    return [];
  }
  if (!supabase) return [];

  let query = supabase.from("contents").select(SELECT_COLUMNS);
  if (!opts?.includeDrafts) query = query.eq("status", "published");

  const { data, error } = await query;
  // テーブル未作成・権限なし・接続不良のいずれも「DBには何もない」として扱う
  if (error || !data) return [];

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
