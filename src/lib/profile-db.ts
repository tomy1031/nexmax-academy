import type {
  PersonalityAnswer,
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
}

export interface PersonalityResultRow {
  id: string;
  profile_id: string;
  personality_type: PersonalityTypeCode;
  answers: PersonalityAnswer[];
  scores: PersonalityScores;
  personality_version: number;
  created_at: string;
}

export interface PersonalityResultInput {
  personalityType: PersonalityTypeCode;
  answers: PersonalityAnswer[];
  scores: PersonalityScores;
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

export async function deleteProfileAsAdmin(id: string): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.from("profiles").delete().eq("id", id);
  if (error) throw error;
}
