import type { PersonalityScores, PersonalityTypeId } from "@/content/personality";

export type Gender = "male" | "female";
export type MapView = "map" | "cards";

export interface NexmaxProfile {
  displayName: string;
  gender: Gender;
  type: PersonalityTypeId;
  scores: PersonalityScores;
  createdAt: string;
}

const PROFILE_KEY = "nexmax.profile.v2";
const LEGACY_PROFILE_KEY = "nexmax.profile.v1";
const GEMINI_KEY = "nexmax.geminiKey";
const MAP_VIEW_KEY = "nexmax.mapView";

const GENDERS: Gender[] = ["male", "female"];
const PERSONALITY_TYPES: PersonalityTypeId[] = ["leader", "idea", "heart", "challenge"];

function storage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function isScores(value: unknown): value is PersonalityScores {
  if (!value || typeof value !== "object") return false;
  const scores = value as Partial<PersonalityScores>;
  return PERSONALITY_TYPES.every((type) => {
    const score = scores[type];
    return typeof score === "number" && Number.isInteger(score) && score >= 0 && score <= 10;
  });
}

function isProfile(value: unknown): value is NexmaxProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<NexmaxProfile>;
  return (
    typeof profile.displayName === "string" &&
    profile.displayName.trim().length > 0 &&
    profile.displayName.length <= 20 &&
    GENDERS.includes(profile.gender as Gender) &&
    PERSONALITY_TYPES.includes(profile.type as PersonalityTypeId) &&
    isScores(profile.scores) &&
    typeof profile.createdAt === "string"
  );
}

function removeLegacyProfile(): void {
  storage()?.removeItem(LEGACY_PROFILE_KEY);
}

export function getProfile(): NexmaxProfile | null {
  removeLegacyProfile();
  const value = storage()?.getItem(PROFILE_KEY);
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    return isProfile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveProfile(profile: NexmaxProfile): void {
  if (!isProfile(profile)) {
    throw new Error("プロフィールのデータが正しくありません。");
  }
  removeLegacyProfile();
  storage()?.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function getGeminiKey(): string {
  removeLegacyProfile();
  return storage()?.getItem(GEMINI_KEY) ?? "";
}

export function saveGeminiKey(key: string): void {
  const target = storage();
  if (!target) return;

  const trimmed = key.trim();
  if (trimmed) {
    target.setItem(GEMINI_KEY, trimmed);
  } else {
    target.removeItem(GEMINI_KEY);
  }
}

export function getMapView(): MapView {
  const value = storage()?.getItem(MAP_VIEW_KEY);
  return value === "cards" ? "cards" : "map";
}

export function saveMapView(view: MapView): void {
  storage()?.setItem(MAP_VIEW_KEY, view);
}
