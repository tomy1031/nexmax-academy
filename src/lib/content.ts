/**
 * コンテンツの読み込み（サーバ専用）
 *
 * content/ 配下の JSON をスキーマ検証して返す。ページはこれを静的生成の段階で
 * 呼ぶため、実行時のファイルアクセスは発生しない（Cloudflare など Node の fs が
 * 使えない実行環境に載せ替えても動くようにするため — 設計03 §2）。
 *
 * クライアントコンポーネントから import しないこと。
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  contentSchema,
  type Meeting,
  type QuizSet,
  type Scenario,
  type WordStage,
} from "@/content/schema";

const CONTENT_DIR = join(process.cwd(), "content");

function readAll(): unknown[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".json")) files.push(full);
    }
  };
  try {
    walk(CONTENT_DIR);
  } catch {
    return [];
  }
  return files.map((file) => JSON.parse(readFileSync(file, "utf8")) as unknown);
}

/** スキーマに通ったものだけを返す（lint:content がCIで先に落とす前提）。 */
function parseAll() {
  return readAll().flatMap((raw) => {
    const parsed = contentSchema.safeParse(raw);
    return parsed.success ? [parsed.data] : [];
  });
}

export function listWordStages(): WordStage[] {
  return parseAll()
    .filter((c): c is WordStage => c.kind === "wordstage")
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function getWordStage(id: string): WordStage | null {
  return listWordStages().find((stage) => stage.id === id) ?? null;
}

export function listQuizSets(): QuizSet[] {
  return parseAll()
    .filter((c): c is QuizSet => c.kind === "quizset")
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function getQuizSet(id: string): QuizSet | null {
  return listQuizSets().find((set) => set.id === id) ?? null;
}

export function listMeetings(): Meeting[] {
  return parseAll()
    .filter((c): c is Meeting => c.kind === "meeting")
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function getMeeting(id: string): Meeting | null {
  return listMeetings().find((meeting) => meeting.id === id) ?? null;
}

export function listScenarios(): Scenario[] {
  return parseAll()
    .filter((c): c is Scenario => c.kind === "scenario")
    .sort((a, b) => a.order - b.order);
}

export function getScenario(id: string): Scenario | null {
  return listScenarios().find((scenario) => scenario.id === id) ?? null;
}
