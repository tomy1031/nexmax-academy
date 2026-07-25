import type { PersonalityTypeId } from "@/content/personality";

export type Gender = "male" | "female" | "other";
export type MapView = "map" | "cards";

export interface NexmaxProfile {
  gender: Gender;
  type: PersonalityTypeId;
  answers: boolean[];
  createdAt: string;
}

const PROFILE_KEY = "nexmax.profile.v1";
const GEMINI_KEY = "nexmax.geminiKey";
const MAP_VIEW_KEY = "nexmax.mapView";

const GENDERS: Gender[] = ["male", "female", "other"];
const PERSONALITY_TYPES: PersonalityTypeId[] = ["leader", "idea", "heart", "challenge"];

function storage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function isProfile(value: unknown): value is NexmaxProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<NexmaxProfile>;
  return (
    GENDERS.includes(profile.gender as Gender) &&
    PERSONALITY_TYPES.includes(profile.type as PersonalityTypeId) &&
    Array.isArray(profile.answers) &&
    profile.answers.length === 12 &&
    profile.answers.every((answer) => typeof answer === "boolean") &&
    typeof profile.createdAt === "string"
  );
}

export function getProfile(): NexmaxProfile | null {
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
  storage()?.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function getGeminiKey(): string {
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
