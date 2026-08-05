import type {
  PersonalityAnswer,
  PersonalityLanguage,
  PersonalityScores,
  PersonalityTypeCode,
} from "@/content/personality";
import type { Gender } from "@/lib/profile";
import { createClient } from "@/lib/supabase/client";

/**
 * 診断方式の版。MBTI 4軸 / 16タイプ が v3（07 §8.1）。
 * DBの default に頼らず、insert / upsert が毎回この値を明示的に書く。
 * default 任せにすると、移行中に旧クライアントが送った v2 データまで v3 として記録されてしまう。
 * 履歴の差分比較は、同じ版どうしだけで行う。
 */
export const PERSONALITY_VERSION = 3;

export interface ProfileRow {
  id: string;
  email: string;
  display_name: string;
  gender: Gender;
  personality_type: PersonalityTypeCode;
  answers: PersonalityAnswer[];
  scores: PersonalityScores;
  personality_version: number;
  /** 診断に答えた言語。null は記録前のデータ（08 §8）。 */
  answer_language: PersonalityLanguage | null;
  /** 診断の途中で言語を切り替えたか。 */
  language_switched: boolean;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface OwnProfileInput {
  displayName: string;
  gender: Gender;
  personalityType: PersonalityTypeCode;
  answers: PersonalityAnswer[];
  scores: PersonalityScores;
  answerLanguage: PersonalityLanguage;
  languageSwitched: boolean;
}

export interface PersonalityResultRow {
  id: string;
  profile_id: string;
  personality_type: PersonalityTypeCode;
  answers: PersonalityAnswer[];
  scores: PersonalityScores;
  personality_version: number;
  answer_language: PersonalityLanguage | null;
  language_switched: boolean;
  created_at: string;
}

export interface PersonalityResultInput {
  personalityType: PersonalityTypeCode;
  answers: PersonalityAnswer[];
  scores: PersonalityScores;
  answerLanguage: PersonalityLanguage;
  languageSwitched: boolean;
}

export interface AdminProfilePatch {
  displayName?: string;
  gender?: Gender;
  personalityType?: PersonalityTypeCode;
}

function requireClient() {
  const supabase = createClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function fetchOwnProfile(): Promise<ProfileRow | null> {
  const supabase = requireClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data as ProfileRow | null;
}

export async function upsertOwnProfile(data: OwnProfileInput): Promise<ProfileRow> {
  const supabase = requireClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error("Authentication is required.");

  const { data: profile, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        display_name: data.displayName,
        gender: data.gender,
        personality_type: data.personalityType,
        answers: data.answers,
        scores: data.scores,
        personality_version: PERSONALITY_VERSION,
        answer_language: data.answerLanguage,
        language_switched: data.languageSwitched,
      },
      { onConflict: "id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return profile as ProfileRow;
}

export async function insertPersonalityResult(
  data: PersonalityResultInput,
): Promise<PersonalityResultRow> {
  const supabase = requireClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error("Authentication is required.");

  const { data: result, error } = await supabase
    .from("personality_results")
    .insert({
      profile_id: user.id,
      personality_type: data.personalityType,
      answers: data.answers,
      scores: data.scores,
      personality_version: PERSONALITY_VERSION,
      answer_language: data.answerLanguage,
      language_switched: data.languageSwitched,
    })
    .select("*")
    .single();
  if (error) throw error;
  return result as PersonalityResultRow;
}

/**
 * 記録台帳テーブルが未作成（マイグレーション未適用）か。
 * 履歴は補助データなので、無いときは「空」として扱い画面を止めない。
 */
function isMissingResultsTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01";
}

export async function fetchResultsForProfile(profileId: string): Promise<PersonalityResultRow[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("personality_results")
    .select("*")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingResultsTable(error)) return [];
    throw error;
  }
  return (data ?? []) as PersonalityResultRow[];
}

export async function fetchAllResults(): Promise<PersonalityResultRow[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("personality_results")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingResultsTable(error)) return [];
    throw error;
  }
  return (data ?? []) as PersonalityResultRow[];
}

export async function fetchAllProfiles(): Promise<ProfileRow[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProfileRow[];
}

export async function updateProfileAsAdmin(
  id: string,
  patch: AdminProfilePatch,
): Promise<ProfileRow> {
  const supabase = requireClient();
  const update: Record<string, string> = {};
  if (patch.displayName !== undefined) update.display_name = patch.displayName;
  if (patch.gender !== undefined) update.gender = patch.gender;
  if (patch.personalityType !== undefined) update.personality_type = patch.personalityType;

  const { data, error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as ProfileRow;
}

/**
 * 診断だけを未受験に戻す。プロフィール行は残すので `personality_results` の
 * 受験履歴も残る（削除は cascade で履歴ごと消える。§docs/deploy.md ではなく 07 §8.1）。
 *
 * `answers` と `scores` は**同時に**空へ戻す必要がある。DBの制約が
 * 「両方空」か「20問そろっている」かのどちらかしか許さないため、片方だけだと弾かれる。
 *
 * `personality_type` は not null で「未診断」を表す値がないため、前回のコードが残る。
 * 画面の判定は `isDiagnosisComplete(answers)` 側で行うので表示には影響しない。
 */
export async function resetDiagnosisAsAdmin(id: string): Promise<ProfileRow> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ answers: [], scores: {} })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as ProfileRow;
}

/**
 * プロフィールを完全に削除する。
 * **`personality_results` の受験履歴も cascade で消える**（不可逆）。
 * 診断をやり直させたいだけなら `resetDiagnosisAsAdmin` を使う。
 */
export async function deleteProfileAsAdmin(id: string): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.from("profiles").delete().eq("id", id);
  if (error) throw error;
}
