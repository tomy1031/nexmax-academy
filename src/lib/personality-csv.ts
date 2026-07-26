import { PERSONALITY_AXES, latestResultsByProfile } from "@/lib/personality-stats";
import type { PersonalityResultRow, ProfileRow } from "@/lib/profile-db";

function escapeCsv(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

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
    ...PERSONALITY_AXES,
    ...Array.from({ length: 20 }, (_, index) => `Q${String(index + 1).padStart(2, "0")}`),
    "受験日時",
  ];
  const rows = profiles.map((profile) => {
    const latestResult = latest[profile.id];
    return [
      profile.email,
      profile.display_name,
      profile.gender === "male" ? "男性" : "女性",
      profile.personality_type,
      ...PERSONALITY_AXES.map((axis) => profile.scores[axis]),
      ...Array.from({ length: 20 }, (_, index) => profile.answers[index] ?? ""),
      latestResult?.created_at ?? profile.updated_at,
    ];
  });

  return `\uFEFF${[headers, ...rows]
    .map((row) => row.map((value) => escapeCsv(value)).join(","))
    .join("\r\n")}`;
}
