import { createClient } from "@/lib/supabase/client";
import { requireOwnId } from "@/lib/supabase/claims";

/**
 * アプリ全体の せってい（`public.app_settings` — 1行だけ）
 *
 * いまの 中みは 1つ、**順路の 鍵を まとめて 外す スイッチ**。教材の 不具合で
 * 関門が 開かなく なって 授業が 止まる、という 事故（願い #333・#246）に 対する
 * 取り急ぎの レバーである。
 *
 * 読むのは **学習者 全員**（教材の画面）、書けるのは **先生だけ**（RLS）。
 * ブラウザから Supabase を 直に 見る——Worker に 仕事を させない
 *（docs/constraints.md 2026-08-26）。
 *
 * **本番も STG も 同じ DB** を 見るので、このスイッチは 両方に 同時に 効く。
 */

/** 1行しか 作らせないので、鍵も 1つで 固定（DB 側の `check (id)` と 対）。 */
const SINGLE_ROW_ID = true;

export interface AppSettings {
  /** 順路の 鍵を 外して いるか。 */
  readonly gatesUnlocked: boolean;
  /** 最後に 動かした 人（profiles.id）。まだ 誰も 動かして いなければ null。 */
  readonly updatedBy: string | null;
  /** 最後に 動かした 時刻（ISO 文字列）。 */
  readonly updatedAt: string | null;
}

const DEFAULT_SETTINGS: AppSettings = {
  gatesUnlocked: false,
  updatedBy: null,
  updatedAt: null,
};

interface SettingsRow {
  gates_unlocked?: boolean | null;
  updated_by?: string | null;
  updated_at?: string | null;
}

function fromRow(row: SettingsRow | null): AppSettings {
  if (!row) return DEFAULT_SETTINGS;
  return {
    gatesUnlocked: row.gates_unlocked === true,
    updatedBy: row.updated_by ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

/**
 * せっていを 読む。
 *
 * @returns Supabase 未設定（デモモード）・未ログインなら null。
 *   **「鍵は かかったまま」と「読めなかった」を 呼ぶ側が 区別できる**ようにする——
 *   読めなかったときに 黙って 鍵を 外すと、学習者 全員の 順路が 事故で 消える。
 */
export async function fetchAppSettings(): Promise<AppSettings | null> {
  const supabase = createClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("app_settings")
    .select("gates_unlocked, updated_by, updated_at")
    .eq("id", SINGLE_ROW_ID)
    .maybeSingle();
  if (error) throw error;
  return fromRow(data as SettingsRow | null);
}

/**
 * 順路の 鍵を 外す／かけ直す（先生だけ。実際の 関所は RLS）。
 *
 * 行が 消えて いても 動くように upsert に して ある——移行SQL が 先に 置く 1行を
 * 誰かが 消しても、スイッチが 二度と 動かない 状態には しない。
 */
export async function setGatesUnlocked(gatesUnlocked: boolean): Promise<AppSettings> {
  const supabase = createClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const updatedBy = await requireOwnId(supabase);

  const { data, error } = await supabase
    .from("app_settings")
    .upsert(
      {
        id: SINGLE_ROW_ID,
        gates_unlocked: gatesUnlocked,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    .select("gates_unlocked, updated_by, updated_at")
    .single();
  if (error) throw error;
  return fromRow(data as SettingsRow);
}
