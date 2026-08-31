/**
 * クエストの セーブ — **端末には 1手ごと、Supabase には 節目だけ**
 *
 * ## 2つに 分ける 理由
 * 「選ばれた4人はセーブデータをシェアします」「負荷エラーの 起こらない範囲で
 * supabase への登録をお願いします」（2026-08-30 の 指定・願い #285）。
 *
 * 1手ごとに DB へ 書くと、1回の 遊びで **120回**の 書き込みに なる。教室は
 * 1本の 回線＝1つの IP から 出る ので、5台が 同時に 遊べば 上限に 近づく。
 * だから **DB へ 書くのは「場面クリア」「おしまい」「クリア」の 3つの ときだけ**
 * （1回の 遊びで 30回ほど）。1手ごとの 細かい 進みは **端末（localStorage）**に 置く
 * ——`src/lib/meeting/log.ts` の「ためて、おわりに 1回」と 同じ 考え方で、
 * 途中で 画面を 閉じても 消えない ように するのが 端末側の 役目である。
 *
 * ## 組が 同じなら 同じ セーブに 戻る
 * 鍵は **並べ替えて つないだ メンバーID**（`quest_member_key()` と 同じ 作り方）。
 * えらぶ 順番が ちがっても、同じ 4人なら きのうの つづきに 戻れる。
 *
 * ## 落ちない
 * supabase-js は 投げずに `{ error }` を 返す。必ず 受けて `console.warn` し、
 * **学習者の 画面は 止めない**。セーブは あとから 戻る ための もので、
 * いま 遊んで いる 人の ためでは ない。
 */
"use client";

import { defaultBackend, type ProgressBackend } from "@/lib/progress/store";
import { createClient } from "@/lib/supabase/client";
import { readOwnId } from "@/lib/supabase/claims";
import { parseQuestState, toSaved, type QuestState } from "@/lib/quest/state";
import type { Quest } from "@/content/schema";

const TABLE = "quest_saves";

/** 進捗ストアと同じ名前空間（あちらの定数は非公開なので、鍵の形だけ合わせる）。 */
const NAMESPACE = "nexmax:v1";

/**
 * 表がまだ無いときのコード（`quiz/results-db.ts` と同じ2つ）。
 * 移行SQLが 流れる 前でも、端末の セーブだけで 遊べる ように する。
 */
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

/**
 * 組の 鍵。**DB の `public.quest_member_key()` と 同じ 作り方**
 *（並べ替えて カンマで つなぐ）。ここがずれると、同じ 4人なのに
 * 端末と DB で ちがう セーブを 見に 行く。
 */
export function questMemberKey(memberIds: readonly string[]): string {
  return [...memberIds].sort().join(",");
}

function localKey(questId: string, memberIds: readonly string[]): string {
  return `${NAMESPACE}:quest:${questId}:${questMemberKey(memberIds)}`;
}

/* ------------------------------------------------------------------ *
 * 端末（1手ごと）
 * ------------------------------------------------------------------ */

/** 1手ごとに 端末へ 置く（通信しない）。書けない 端末でも 遊びは 続く。 */
export function saveQuestLocal(
  state: QuestState,
  memberIds: readonly string[],
  backend: ProgressBackend = defaultBackend(),
): void {
  backend.set(localKey(state.questId, memberIds), JSON.stringify(toSaved(state)));
}

/** 端末に 残って いる ところ（無ければ・壊れて いれば null）。 */
export function readQuestLocal(
  quest: Quest,
  memberIds: readonly string[],
  backend: ProgressBackend = defaultBackend(),
): QuestState | null {
  const raw = backend.get(localKey(quest.id, memberIds));
  if (!raw) return null;
  try {
    return parseQuestState(JSON.parse(raw), quest);
  } catch {
    return null;
  }
}

export function clearQuestLocal(
  questId: string,
  memberIds: readonly string[],
  backend: ProgressBackend = defaultBackend(),
): void {
  backend.remove(localKey(questId, memberIds));
}

/* ------------------------------------------------------------------ *
 * Supabase（節目だけ）
 * ------------------------------------------------------------------ */

/** 見つかった セーブ。`rowId` は 次の 上書きに 使い回す（毎回 探しに 行かない）。 */
export interface QuestSave {
  readonly rowId: string;
  readonly state: QuestState;
}

interface SaveRow {
  readonly id: string;
  readonly member_ids: string[] | null;
  readonly state: unknown;
}

/**
 * その 組の セーブを 1つ 引く（無ければ null）。
 *
 * `contains` は「その 配列を 含む」なので、**人数まで 同じ 行**に 絞り込む
 *——3人の 組で 引いた ときに 4人の 行が 混ざると、別の 組の つづきが 出る。
 */
export async function loadQuestSave(
  quest: Quest,
  memberIds: readonly string[],
): Promise<QuestSave | null> {
  const supabase = createClient();
  if (!supabase || memberIds.length === 0) return null;

  const { data, error } = await supabase
    .from(TABLE)
    .select("id, member_ids, state")
    .eq("quest_id", quest.id)
    .contains("member_ids", memberIds as string[]);

  if (error) {
    if (!MISSING_TABLE_CODES.has(error.code)) {
      console.warn("[quest-save] セーブを 読めませんでした:", error.message);
    }
    return null;
  }

  const key = questMemberKey(memberIds);
  const row = ((data ?? []) as SaveRow[]).find(
    (candidate) => questMemberKey(candidate.member_ids ?? []) === key,
  );
  if (!row) return null;

  const state = parseQuestState(row.state, quest);
  return state ? { rowId: row.id, state } : null;
}

/**
 * 節目の セーブ（**場面クリア・おしまい・クリア の 3つの ときだけ 呼ぶ**）。
 *
 * @param rowId 分かって いれば 渡す（そのまま 上書きする）。無ければ 作る。
 * @returns 書けた 行の id。書けなければ null（遊びは そのまま 続く）
 */
export async function writeQuestSave({
  state,
  memberIds,
  rowId,
}: {
  state: QuestState;
  memberIds: readonly string[];
  rowId?: string | null;
}): Promise<string | null> {
  const supabase = createClient();
  if (!supabase || memberIds.length === 0) return null;

  const ownId = await readOwnId(supabase).catch(() => null);
  // ログインして いない ときは 端末の セーブだけで 遊ぶ（RLS が 弾く ので 送らない）
  if (!ownId) return null;

  const payload = {
    quest_id: state.questId,
    member_ids: memberIds as string[],
    state: toSaved(state) as unknown,
    updated_by: ownId,
    updated_at: new Date().toISOString(),
  };

  if (rowId) {
    const { error } = await supabase.from(TABLE).update(payload).eq("id", rowId);
    if (!error) return rowId;
    console.warn("[quest-save] 上書きできませんでした:", error.message);
    return null;
  }

  const { data, error } = await supabase.from(TABLE).insert(payload).select("id").single();
  if (!error) return data?.id ?? null;

  /*
   * 一意制約（quest_id + 組）に ぶつかった＝**同じ組の 誰かが 先に 作って いた**。
   * 4人が 同じ 1行を 共有する 表なので、これは 事故では なく ふつうに 起きる。
   * その 行を 引き直して 上書きに 回る。
   */
  if (error.code === "23505") {
    const existing = await findRowId(state.questId, memberIds);
    if (existing) {
      const { error: updateError } = await supabase.from(TABLE).update(payload).eq("id", existing);
      if (!updateError) return existing;
      console.warn("[quest-save] 上書きできませんでした:", updateError.message);
    }
    return null;
  }

  if (!MISSING_TABLE_CODES.has(error.code)) {
    console.warn("[quest-save] セーブできませんでした:", error.message);
  }
  return null;
}

/** 行の id だけを 引く（中身の 形は 見ない——上書き先が 分かれば よい）。 */
async function findRowId(questId: string, memberIds: readonly string[]): Promise<string | null> {
  const supabase = createClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(TABLE)
    .select("id, member_ids")
    .eq("quest_id", questId)
    .contains("member_ids", memberIds as string[]);
  if (error) return null;

  const key = questMemberKey(memberIds);
  const row = ((data ?? []) as { id: string; member_ids: string[] | null }[]).find(
    (candidate) => questMemberKey(candidate.member_ids ?? []) === key,
  );
  return row?.id ?? null;
}
