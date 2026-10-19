import { createClient } from "@/lib/supabase/client";
import { requireOwnId } from "@/lib/supabase/claims";

/**
 * 組ごとの 表示／非表示 — 先生の 画面（クラスの 設定）の 読み書き（願い #589）
 *
 * 表は `group_visibility`。読むのも 書くのも 先生だけ（RLS）。学習者の 画面は
 * `src/lib/group-visibility.ts`（DB の 関数 `my_group_visibility()`）を 使う。
 *
 * **隠す もの が 1つも 無く なったら 行を 消す**——行が 無い 組は 全部 見える（既定）。
 * 空の 行を 残すと「何か 設定して ある 組」に 見える。
 */

export interface GroupVisibilityRow {
  readonly university: string;
  readonly cohort: number;
  readonly hiddenStages: readonly string[];
  readonly hiddenContents: readonly string[];
}

function client() {
  const supabase = createClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function fetchAllGroupVisibility(): Promise<GroupVisibilityRow[]> {
  const { data, error } = await client()
    .from("group_visibility")
    .select("university, cohort, hidden_stages, hidden_contents");
  if (error) throw error;
  return (
    (data ?? []) as {
      university: string;
      cohort: number;
      hidden_stages: string[] | null;
      hidden_contents: string[] | null;
    }[]
  ).map((row) => ({
    university: row.university,
    cohort: row.cohort,
    hiddenStages: row.hidden_stages ?? [],
    hiddenContents: row.hidden_contents ?? [],
  }));
}

export async function saveGroupVisibility(row: GroupVisibilityRow): Promise<void> {
  const supabase = client();
  if (row.hiddenStages.length === 0 && row.hiddenContents.length === 0) {
    const { error } = await supabase
      .from("group_visibility")
      .delete()
      .eq("university", row.university)
      .eq("cohort", row.cohort);
    if (error) throw error;
    return;
  }
  const updatedBy = await requireOwnId(supabase);
  const { error } = await supabase.from("group_visibility").upsert({
    university: row.university,
    cohort: row.cohort,
    hidden_stages: [...row.hiddenStages],
    hidden_contents: [...row.hiddenContents],
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
