import type {
  PersonalityAnswer,
  PersonalityScores,
  PersonalityTypeId,
} from "@/content/personality";
import type { Gender } from "@/lib/profile";
import { createClient } from "@/lib/supabase/client";

export interface ProfileRow {
  id: string;
  email: string;
  display_name: string;
  gender: Gender;
  personality_type: PersonalityTypeId;
  answers: PersonalityAnswer[];
  scores: PersonalityScores;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface OwnProfileInput {
  displayName: string;
  gender: Gender;
  personalityType: PersonalityTypeId;
  answers: PersonalityAnswer[];
  scores: PersonalityScores;
}

export interface AdminProfilePatch {
  displayName?: string;
  gender?: Gender;
  personalityType?: PersonalityTypeId;
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
      },
      { onConflict: "id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return profile as ProfileRow;
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
