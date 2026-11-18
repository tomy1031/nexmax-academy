/**
 * 本人の 進み具合を Supabase から 1行 読む（ツール教材の「続きから」）
 *
 * ## なぜ 要るか（2026-11-17）
 * 相談の 練習問題（`public/tools/hourensou/soudan_renshu.html`）は 静的な 1枚で、
 * 進み具合を 端末の 保存に 置く。tomy さんの 指定「状況はSupabase保存できるように」で、
 * 書く ほうは ほかの 教材と 同じ 道（`recordContentProgress` → `sync.ts`）に 乗せた。
 * ここは その 逆——**別の 端末で 開いた とき**に、本人の 行を 読んで ツールへ 返す。
 *
 * 読めるのは 本人の 行だけ（`content_progress_select_own_or_admin` の RLS）。
 * デモモード（鍵が 無い）・ログインして いない ときは `null`。ここは 何が あっても 投げない
 *——続きから 戻せなくても 練習は できる。
 */
"use client";

import { parseProgressPosition } from "@/lib/answers/link-message";
import { createClient } from "@/lib/supabase/client";
import { readOwnId } from "@/lib/supabase/claims";

export interface OwnProgress {
  /** 本人の id（ツールが「前の 人の 端末の 保存」を 捨てる 目印に 使う）。 */
  readonly owner: string;
  readonly status: "started" | "completed" | null;
  readonly position: Record<string, number> | null;
}

export async function fetchOwnContentProgress(contentId: string): Promise<OwnProgress | null> {
  const client = createClient();
  if (!client) return null;
  try {
    const owner = await readOwnId(client);
    if (!owner) return null;
    const { data, error } = await client
      .from("content_progress")
      .select("status, position")
      .eq("profile_id", owner)
      .eq("content_id", contentId)
      .maybeSingle();
    if (error || !data) return { owner, status: null, position: null };
    const row = data as { status?: unknown; position?: unknown };
    return {
      owner,
      status:
        row.status === "completed" ? "completed" : row.status === "started" ? "started" : null,
      position: parseProgressPosition(row.position),
    };
  } catch {
    return null;
  }
}
