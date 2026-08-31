/**
 * 同じ 学校・同じ 期の 学生を 引く（`public.classmates()` の 薄い 包み）
 *
 * ## なぜ 関数を 呼ぶのか
 * `profiles` の RLS は「自分の 1行だけ」なので、`select *` では **自分しか 返らない**
 *（`supabase/migrations/20260831180000_classmates.sql`）。ポリシーを ゆるめると
 * email・answers・is_admin まで 同級生に 渡って しまう ので、**要る 4つの ことだけ**を
 * 返す 関数を DB 側に 置いた。ここは それを 呼ぶだけ。
 *
 * ## 落ちない
 * supabase-js は **投げずに `{ error }` を 返す**。受け取らずに try/catch で 囲むと
 * 永久に 空の 名簿に なる（quiz-results と 同じ 流儀）。ここでは 受け取って
 * `console.warn` し、**空の 名簿を 返す**——1人でも 遊べる ように 作って あるので、
 * 名簿が 引けない 日でも クエストは 始められる。
 */
"use client";

import { isPersonalityTypeCode, type PersonalityTypeCode } from "@/content/personality";
import type { Gender } from "@/lib/profile";
import { createClient } from "@/lib/supabase/client";

export interface Classmate {
  readonly id: string;
  /** 画面に 出す 名前（`display_name` → `nickname` → `given_name` の 順）。 */
  readonly name: string;
  /** 診断が まだの 人は null。**絵を 出さずに 名前だけ**で えらべる ようにする。 */
  readonly type: PersonalityTypeCode | null;
  readonly gender: Gender;
}

/** DB が 返す 1行（`classmates()` の returns table と そろえる）。 */
interface ClassmateRow {
  readonly id: string | null;
  readonly display_name: string | null;
  readonly family_name: string | null;
  readonly given_name: string | null;
  readonly nickname: string | null;
  readonly gender: string | null;
  readonly personality_type: string | null;
}

/** 名前が どれも 空の 行にも 席を 用意する（名簿から 消さない）。 */
const NO_NAME = "クラスメイト";

function nameOf(row: ClassmateRow): string {
  return row.display_name?.trim() || row.nickname?.trim() || row.given_name?.trim() || NO_NAME;
}

/**
 * 自分と 同じ 学校・同じ 期の 学生（**自分を 含む**）。
 * ログイン前・Supabase 未設定（デモモード）・失敗の どれでも 空を 返す。
 */
export async function fetchClassmates(): Promise<readonly Classmate[]> {
  const supabase = createClient();
  if (!supabase) return [];

  const { data, error } = await supabase.rpc("classmates");
  if (error) {
    console.warn("[classmates] 名簿を 引けませんでした:", error.message);
    return [];
  }

  const rows = (data ?? []) as ClassmateRow[];
  return rows.flatMap((row) =>
    row.id
      ? [
          {
            id: row.id,
            name: nameOf(row),
            type: isPersonalityTypeCode(row.personality_type) ? row.personality_type : null,
            gender: row.gender === "female" ? ("female" as const) : ("male" as const),
          },
        ]
      : [],
  );
}
