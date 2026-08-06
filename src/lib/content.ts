/**
 * コンテンツの読み込み（サーバ専用）
 *
 * content/ 配下の JSON をスキーマ検証し、スタジオ（Supabase）で公開された分と
 * 合流させて返す。
 *
 * git 側は**ビルド時にバンドルへ焼き込んだモジュール**（git-contents.generated.ts）を
 * 読む。fs を実行時に触らないのは、Cloudflare Workers に fs が無く、ISR の再生成が
 * リクエスト中に走るため。以前 readdirSync で読んでいたときは、デプロイ先で
 * git 由来の教材が丸ごと消えていた（設計03 §2 / scripts/generate_content_index.mjs）。
 *
 * 読み込み関数がすべて async なのは DB を待つため。呼び出し側のページは
 * `revalidate` で ISR にすること（設計07 §11.1）。
 *
 * クライアントコンポーネントから import しないこと。
 */

import {
  contentSchema,
  type Article,
  type Content,
  type Listening,
  type Manga,
  type QuizSet,
  type Scenario,
  type Stage,
  type WordStage,
} from "@/content/schema";
import { GIT_CONTENTS } from "@/content/git-contents.generated";
import { fetchDbContents } from "@/lib/content-db";

/**
 * スキーマに通ったものだけを返す（lint:content がCIで先に落とす前提）。
 *
 * 元は content/ を readdirSync で読んでいたが、`revalidate` を付けた時点で
 * ページの再生成がリクエスト中に走るようになり、fs の無い Cloudflare Workers で
 * 黙って空になっていた（詳細ページが404、マップが既定値に後退）。
 * いまはバンドルへ焼き込んだ GIT_CONTENTS を読むので、実行環境を選ばない。
 *
 * 毎回パースし直さないよう1度だけ組み立てる（同じ配列を使い回す）。
 */
let parsedCache: Content[] | null = null;

function parseAll(): Content[] {
  if (parsedCache) return parsedCache;
  parsedCache = GIT_CONTENTS.flatMap((raw) => {
    const parsed = contentSchema.safeParse(raw);
    return parsed.success ? [parsed.data] : [];
  });
  return parsedCache;
}

/* ------------------------------------------------------------------ *
 * git と DB の合流（設計07 §11.1）
 *
 * どの kind も「git の JSON ∪ Supabase の公開分」で返す。ここを通さない
 * 読み込み関数があると、スタジオで保存して「こうかい」した教材が学習者の
 * 画面に出ず、先生には「保存できたのに開くと見つからない」としか見えない。
 * DB未設定のローカル開発では git の JSON だけで全機能が動く。
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

export async function listWordStages(): Promise<WordStage[]> {
  const git = parseAll().filter((c): c is WordStage => c.kind === "wordstage");
  return mergeContentsById(git, await listPublishedFromDb("wordstage")).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
}

export async function getWordStage(id: string): Promise<WordStage | null> {
  return (await listWordStages()).find((stage) => stage.id === id) ?? null;
}

export async function listQuizSets(): Promise<QuizSet[]> {
  const git = parseAll().filter((c): c is QuizSet => c.kind === "quizset");
  return mergeContentsById(git, await listPublishedFromDb("quizset")).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
}

export async function getQuizSet(id: string): Promise<QuizSet | null> {
  return (await listQuizSets()).find((set) => set.id === id) ?? null;
}

export async function listListenings(): Promise<Listening[]> {
  const git = parseAll().filter((c): c is Listening => c.kind === "listening");
  return mergeContentsById(git, await listPublishedFromDb("listening")).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
}

export async function getListening(id: string): Promise<Listening | null> {
  return (await listListenings()).find((listening) => listening.id === id) ?? null;
}

export async function listScenarios(): Promise<Scenario[]> {
  const git = parseAll().filter((c): c is Scenario => c.kind === "scenario");
  // シナリオだけは order 昇順（一覧の並びが学習の順番そのものなので id 順にしない）。
  return mergeContentsById(git, await listPublishedFromDb("scenario")).sort(
    (a, b) => a.order - b.order,
  );
}

export async function getScenario(id: string): Promise<Scenario | null> {
  return (await listScenarios()).find((scenario) => scenario.id === id) ?? null;
}

export async function listStages(): Promise<Stage[]> {
  const git = parseAll().filter((c): c is Stage => c.kind === "stage");
  return mergeContentsById(git, await listPublishedFromDb("stage")).sort(
    (a, b) => a.order - b.order || a.id.localeCompare(b.id),
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
