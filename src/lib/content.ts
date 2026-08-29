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

import { cache } from "react";
import {
  contentSchema,
  type Article,
  type Character,
  type Content,
  type LinkContent,
  type Listening,
  type Manga,
  type Meeting,
  type QuizSet,
  type Scenario,
  type Skit,
  type Slides,
  type Stage,
  type WordStage,
  type VocabBook,
  type VocabWord,
  type StoredWordStage,
} from "@/content/schema";
import { GIT_CONTENTS } from "@/content/git-contents.generated";
import { fetchDbContents } from "@/lib/content-db";
import { hydrateArticle, hydrateManga, hydrateWordStage } from "@/lib/vocabulary";

/**
 * 一覧はどれも `cache()` で包んである。
 *
 * 1画面で `getStage` → `getManga` → `getArticle` … と何度も呼ばれ、そのたびに
 * DBへ往復して全行を zod で検証していた。ステージの教材が5本あるだけで10回以上走り、
 * Cloudflare Workers の上限に当たって 500（Error 1102）になった。
 * `cache()` は**同じリクエストの中でだけ**結果を使い回す（またいで古い値は返さない）。
 */

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

/**
 * git（リポジトリの content/*.json）に 実体が ある `種別:id` の 一覧。
 *
 * DB版を けしても、ここに ある id は **次の 読み込みで また 出てくる**——実体が
 * リポジトリに あるからで、スタジオからは 消せない。「けしました」と 言えるのは
 * ここに 無い ものだけである（2026-08-29。git にも ある ステージ `asakai` を
 * スタジオで けして「消えない」と 報告が あった。DB版が 消えた ぶん、git版が
 * そのまま 表に 出ていた）。
 *
 * 種別も 鍵に 入れる。同じ id の ページと もんだいが 別物として 並ぶ ことが ある
 *（`/api/health/content` と 同じ 数えかた）。
 */
let gitIdCache: Set<string> | null = null;

export function gitContentIds(): Set<string> {
  if (!gitIdCache) gitIdCache = new Set(parseAll().map((c) => `${c.kind}:${c.id}`));
  return gitIdCache;
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

export const listCharacters = cache(async (): Promise<Character[]> => {
  const git = parseAll().filter((c): c is Character => c.kind === "character");
  return mergeContentsById(git, await listPublishedFromDb("character")).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
});

export async function getCharacter(id: string): Promise<Character | null> {
  return (await listCharacters()).find((character) => character.id === id) ?? null;
}

/**
 * ことばの 正（`content/vocab/vocabulary.json`）。語彙は ここからしか 引かない。
 * DBに 同じ id の 行が あれば そちらが 勝つ（先生の 直しが 常に 上）。
 */
export const listVocabBooks = cache(async (): Promise<VocabBook[]> => {
  const git = parseAll().filter((c): c is VocabBook => c.kind === "vocab");
  return mergeContentsById(git, await listPublishedFromDb("vocab")).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
});

/** すべての ことば（束を ならべた もの）。 */
export async function listVocabWords(): Promise<VocabWord[]> {
  return (await listVocabBooks()).flatMap((book) => book.words);
}

/**
 * 単語ステージ。**保存は 参照（`wordIds`）でも、返すのは 語が 入った かたち**。
 *
 * 語の 正は `content/vocab/vocabulary.json` 1つ。ここで 引いて 埋めるので、
 * ゲームも 辞書も スタジオも これまでどおり `words` を 見れば よい
 *（境目は `src/lib/vocabulary.ts` の `hydrateWordStage` 1つ）。
 * 参照が 切れた ステージは 一覧から 落ちる（`lint:content` が 別に 止める）。
 */
export const listWordStages = cache(async (): Promise<WordStage[]> => {
  const git = parseAll().filter((c): c is StoredWordStage => c.kind === "wordstage");
  const stored = mergeContentsById(git, await listPublishedFromDb("wordstage")).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const books = await listVocabBooks();
  const words = books.flatMap((book) => book.words);
  const furigana = books.flatMap((book) => book.furigana ?? []);
  return stored
    .map((stage) => hydrateWordStage(stage, words, furigana))
    .filter((stage): stage is WordStage => stage !== null);
});

export async function getWordStage(id: string): Promise<WordStage | null> {
  return (await listWordStages()).find((stage) => stage.id === id) ?? null;
}

export const listQuizSets = cache(async (): Promise<QuizSet[]> => {
  const git = parseAll().filter((c): c is QuizSet => c.kind === "quizset");
  return mergeContentsById(git, await listPublishedFromDb("quizset")).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
});

export async function getQuizSet(id: string): Promise<QuizSet | null> {
  return (await listQuizSets()).find((set) => set.id === id) ?? null;
}

export const listListenings = cache(async (): Promise<Listening[]> => {
  const git = parseAll().filter((c): c is Listening => c.kind === "listening");
  return mergeContentsById(git, await listPublishedFromDb("listening")).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
});

export async function getListening(id: string): Promise<Listening | null> {
  return (await listListenings()).find((listening) => listening.id === id) ?? null;
}

export const listScenarios = cache(async (): Promise<Scenario[]> => {
  const git = parseAll().filter((c): c is Scenario => c.kind === "scenario");
  // シナリオだけは order 昇順（一覧の並びが学習の順番そのものなので id 順にしない）。
  return mergeContentsById(git, await listPublishedFromDb("scenario")).sort(
    (a, b) => a.order - b.order,
  );
});

export async function getScenario(id: string): Promise<Scenario | null> {
  return (await listScenarios()).find((scenario) => scenario.id === id) ?? null;
}

export const listMeetings = cache(async (): Promise<Meeting[]> => {
  const git = parseAll().filter((c): c is Meeting => c.kind === "meeting");
  return mergeContentsById(git, await listPublishedFromDb("meeting")).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
});

export async function getMeeting(id: string): Promise<Meeting | null> {
  return (await listMeetings()).find((meeting) => meeting.id === id) ?? null;
}

export const listStages = cache(async (): Promise<Stage[]> => {
  const git = parseAll().filter((c): c is Stage => c.kind === "stage");
  return mergeContentsById(git, await listPublishedFromDb("stage")).sort(
    (a, b) => a.order - b.order || a.id.localeCompare(b.id),
  );
});

export async function getStage(id: string): Promise<Stage | null> {
  return (await listStages()).find((stage) => stage.id === id) ?? null;
}

export const listMangas = cache(async (): Promise<Manga[]> => {
  const git = parseAll().filter((c): c is Manga => c.kind === "manga");
  const merged = mergeContentsById(git, await listPublishedFromDb("manga")).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  // 復習語彙が 参照で 書かれて いたら、正から 中身を 埋める
  const words = await listVocabWords();
  return merged.map((manga) => hydrateManga(manga, words));
});

export async function getManga(id: string): Promise<Manga | null> {
  return (await listMangas()).find((manga) => manga.id === id) ?? null;
}

export const listArticles = cache(async (): Promise<Article[]> => {
  const git = parseAll().filter((c): c is Article => c.kind === "article");
  const merged = mergeContentsById(git, await listPublishedFromDb("article")).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  // ことばブロックが 参照で 書かれて いたら、正から 中身を 埋める（読む側は 触らない）
  const words = await listVocabWords();
  return merged.map((article) => hydrateArticle(article, words));
});

export async function getArticle(id: string): Promise<Article | null> {
  return (await listArticles()).find((article) => article.id === id) ?? null;
}

/**
 * 記事の しょうかいカード（`characters` ブロック）が 呼んでいる 人物を引く。
 *
 * 記事が持つのは id だけで、絵と名前は 人物カードが正（schema.ts）。だから
 * 表示の直前に ここで 引き合わせる。**見つからない id は 黙って落とす**——
 * 参照切れは lint:content が先に error で落とす契約なので、画面のほうは
 * 1人 欠けただけで 記事ぜんぶを 失わせない（loadRef と同じ考え方）。
 */
export async function getArticleCharacters(article: Article) {
  const refs = new Set(
    article.blocks.flatMap((block) =>
      block.kind === "characters" ? block.items.map((item) => item.ref) : [],
    ),
  );
  const found = await Promise.all([...refs].map((id) => getCharacter(id)));
  return found.flatMap((person) =>
    person
      ? [{ id: person.id, name: person.name, reading: person.reading, portrait: person.portrait }]
      : [],
  );
}

export const listSlides = cache(async (): Promise<Slides[]> => {
  const git = parseAll().filter((c): c is Slides => c.kind === "slides");
  return mergeContentsById(git, await listPublishedFromDb("slides")).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
});

export async function getSlides(id: string): Promise<Slides | null> {
  return (await listSlides()).find((slides) => slides.id === id) ?? null;
}

export const listLinks = cache(async (): Promise<LinkContent[]> => {
  const git = parseAll().filter((c): c is LinkContent => c.kind === "link");
  return mergeContentsById(git, await listPublishedFromDb("link")).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
});

export async function getLink(id: string): Promise<LinkContent | null> {
  return (await listLinks()).find((link) => link.id === id) ?? null;
}

export const listSkits = cache(async (): Promise<Skit[]> => {
  const git = parseAll().filter((c): c is Skit => c.kind === "skit");
  return mergeContentsById(git, await listPublishedFromDb("skit")).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
});

export async function getSkit(id: string): Promise<Skit | null> {
  return (await listSkits()).find((skit) => skit.id === id) ?? null;
}
