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

import { contentSchema, type Content } from "@/content/schema";
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
 * `contents` 表を読む。
 *
 * - 既定は公開分のみ。`includeDrafts` は管理画面用（下書きは RLS でも管理者に限られる）。
 * - 行の `data` を contentSchema で検証し、通ったものだけ返す。
 *   規格が進化して古い行が残っていても、学習者の画面は壊れない。
 */
export async function fetchDbContents(opts?: {
  includeDrafts?: boolean;
}): Promise<DbContentEntry[]> {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    // ビルド時の静的生成などリクエスト外では Cookie が読めない。git 側だけで組み立てる
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
