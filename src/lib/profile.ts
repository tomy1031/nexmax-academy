import {
  isPersonalityScores,
  isPersonalityTypeCode,
  PERSONALITY_QUESTIONS,
  type PersonalityScores,
  type PersonalityTypeCode,
} from "@/content/personality";

export type Gender = "male" | "female";
export type MapView = "map" | "cards";

/**
 * 診断が完了しているか（20問そろっているか）。
 *
 * 「profiles に行があるか」で判定してはいけない。名前と性別だけ入って診断が
 * 未完了の行は正当に存在しうる（DB制約が answers=[] を許している）のに、
 * 行の有無で弾くと `/welcome` と `/map` を往復して詰む。
 * 判定はここに一本化する。
 */
export function isDiagnosisComplete(answers: unknown): boolean {
  return Array.isArray(answers) && answers.length === PERSONALITY_QUESTIONS.length;
}

export interface NexmaxProfile {
  displayName: string;
  gender: Gender;
  type: PersonalityTypeCode;
  scores: PersonalityScores;
  createdAt: string;
}

/** 表示用キャッシュ。正データは Supabase の profiles（07 §8.1）。 */
const PROFILE_KEY = "nexmax.profile.v3";
/** v3 で回答形式・スコアの意味が変わったため、旧版は読まずに削除する。 */
const LEGACY_PROFILE_KEYS = ["nexmax.profile.v1", "nexmax.profile.v2"];
const GEMINI_KEY = "nexmax.geminiKey";
const MAP_VIEW_KEY = "nexmax.mapView";

const GENDERS: Gender[] = ["male", "female"];

function storage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function isProfile(value: unknown): value is NexmaxProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<NexmaxProfile>;
  return (
    typeof profile.displayName === "string" &&
    profile.displayName.trim().length > 0 &&
    profile.displayName.length <= 20 &&
    GENDERS.includes(profile.gender as Gender) &&
    isPersonalityTypeCode(profile.type) &&
    isPersonalityScores(profile.scores) &&
    typeof profile.createdAt === "string"
  );
}

function removeLegacyProfile(): void {
  const target = storage();
  if (!target) return;
  for (const key of LEGACY_PROFILE_KEYS) target.removeItem(key);
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

export function clearNexmaxCache(): void {
  const target = storage();
  if (!target) return;

  for (let index = target.length - 1; index >= 0; index -= 1) {
    const key = target.key(index);
    if (key?.startsWith("nexmax.")) target.removeItem(key);
  }
}
