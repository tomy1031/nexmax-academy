import {
  PERSONALITY_AXES,
  PERSONALITY_QUESTIONS,
  getFamilyForCode,
  getPersonalityFamily,
  isPersonalityTypeCode,
} from "@/content/personality";
import { hasCompletedPersonality, latestResultsByProfile } from "@/lib/personality-stats";
import type { PersonalityResultRow, ProfileRow } from "@/lib/profile-db";

function escapeCsv(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * 教師向けCSV。未診断・壊れた行も「行としては」出す（名簿としての用途があるため）が、
 * タイプ由来の列は空にする。`getFamilyForCode` は未知コードで throw するので直接呼ばない
 * ——ダウンロードボタンの onClick で例外が飛ぶと管理画面ごと落ちる。
 */
export function buildPersonalityCsv(
  profiles: readonly ProfileRow[],
  results: readonly PersonalityResultRow[],
): string {
  const latest = latestResultsByProfile(results);
  const headers = [
    "メール",
    "なまえ",
    "性別",
    "タイプ",
    "組",
    "版",
    ...PERSONALITY_AXES,
    ...PERSONALITY_QUESTIONS.map((question) => `Q${String(question.id).padStart(2, "0")}`),
    "受験日時",
  ];

  const rows = profiles.map((profile) => {
    const latestResult = latest[profile.id];
    const complete = hasCompletedPersonality(profile);
    const family =
      complete && isPersonalityTypeCode(profile.personality_type)
        ? getPersonalityFamily(getFamilyForCode(profile.personality_type).id).name
        : "";

    return [
      profile.email,
      profile.display_name,
      profile.gender === "male" ? "男性" : "女性",
      complete ? profile.personality_type : "",
      family,
      complete ? profile.personality_version : "",
      ...PERSONALITY_AXES.map((axis) => (complete ? profile.scores[axis] : "")),
      ...PERSONALITY_QUESTIONS.map((_, index) => (complete ? (profile.answers[index] ?? "") : "")),
      latestResult?.created_at ?? profile.updated_at,
    ];
  });

  return `\uFEFF${[headers, ...rows]
    .map((row) => row.map((value) => escapeCsv(value)).join(","))
    .join("\r\n")}`;
}
