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
  type Article,
  type Content,
  type Manga,
  type Meeting,
  type QuizSet,
  type Scenario,
  type Stage,
  type WordStage,
} from "@/content/schema";
import { fetchDbContents } from "@/lib/content-db";

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

/* ------------------------------------------------------------------ *
 * スタジオ系コンテンツ（stage / manga / article — 設計07）
 *
 * ここだけ async: git の JSON と Supabase の公開分を内部で合流させるため。
 * DB未設定のローカル開発では git の JSON だけで全機能が動く（設計07 §11.1）。
 * ------------------------------------------------------------------ */

/**
 * git 由来とDB由来を合流する。同一IDは DB が勝つ。
 * 管理画面での修正が常に最新として表示されるようにするためである（設計07 §11.1）。
 */
export function mergeContentsById<T extends { id: string }>(
  gitItems: readonly T[],
  dbItems: readonly T[],
): T[] {
  const byId = new Map<string, T>();
  for (const item of gitItems) byId.set(item.id, item);
  for (const item of dbItems) byId.set(item.id, item);
  return [...byId.values()];
}

/** DBの公開分から指定 kind だけを取り出す。 */
async function listPublishedFromDb<K extends Content["kind"]>(
  kind: K,
): Promise<Extract<Content, { kind: K }>[]> {
  const entries = await fetchDbContents();
  return entries
    .map((entry) => entry.content)
    .filter((c): c is Extract<Content, { kind: K }> => c.kind === kind);
}

export async function listStages(): Promise<Stage[]> {
  const git = parseAll().filter((c): c is Stage => c.kind === "stage");
  return mergeContentsById(git, await listPublishedFromDb("stage")).sort(
    (a, b) => a.step - b.step || a.id.localeCompare(b.id),
  );
}

export async function getStage(id: string): Promise<Stage | null> {
  return (await listStages()).find((stage) => stage.id === id) ?? null;
}

export async function listMangas(): Promise<Manga[]> {
  const git = parseAll().filter((c): c is Manga => c.kind === "manga");
  return mergeContentsById(git, await listPublishedFromDb("manga")).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
}

export async function getManga(id: string): Promise<Manga | null> {
  return (await listMangas()).find((manga) => manga.id === id) ?? null;
}

export async function listArticles(): Promise<Article[]> {
  const git = parseAll().filter((c): c is Article => c.kind === "article");
  return mergeContentsById(git, await listPublishedFromDb("article")).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
}

export async function getArticle(id: string): Promise<Article | null> {
  return (await listArticles()).find((article) => article.id === id) ?? null;
}
