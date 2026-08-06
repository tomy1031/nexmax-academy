import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { StageContentRef } from "@/content/schema";
import {
  StageDetail,
  type StageContentItem,
  type StageWordItem,
} from "@/components/stage/stage-detail";
import type { FuriganaEntry } from "@/lib/text/furigana";
import {
  getArticle,
  getListening,
  getManga,
  getQuizSet,
  getScenario,
  getStage,
  listStages,
  getWordStage,
} from "@/lib/content";
import { sortStages } from "@/lib/map-data";
import { stageContentPath } from "@/lib/stage-routes";

/**
 * ステージのトップ（`/asakai`）— コンテンツの入れ物と順序を見せる画面（設計07 §3）
 *
 * URLの1段目がそのままステージID。`/stage/<id>` という段を挟まないので、
 * 中の教材は `/asakai/listening` と、URLを見ただけで場所が分かる形になる。
 *
 * 1段目を占めるぶん、アプリのルート（`/map` など）と名前がぶつかりうる。
 * 静的なルートが必ず勝つので、ぶつかったステージには永久にたどり着けない。
 * だから `stageSchema` の `RESERVED_STAGE_IDS` が保存の時点で弾く。
 */

/**
 * 公開分のDBコンテンツを合流させるため ISR にする（設計07 §11.1
 * 「gitコンテンツは静的生成のまま。DBコンテンツはリクエスト時取得（ISR/短いキャッシュ）」）。
 * スタジオで「こうかい」した教材は、再デプロイを待たずこの間隔で届く。
 */
export const revalidate = 60;

/**
 * git 由来の教材はビルド時に切り出す（実行時のファイル読みを起こさない）。
 * DB由来（スタジオで公開したもの）はここに現れないが、dynamicParams の既定により
 * 初回アクセスで生成され、以後は revalidate の間隔でキャッシュされる。
 */
export async function generateStaticParams() {
  return (await listStages()).map((item) => ({ stage: item.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ stage: string }>;
}): Promise<Metadata> {
  const { stage: id } = await params;
  const stage = await getStage(id);
  return { title: stage ? `${stage.title} | ステージ` : "ステージ" };
}

/**
 * 参照先の見出しを引く。参照切れ（null）はここでは落とさず一覧から外す
 * — 参照整合は lint:content が先に落とす契約なので、画面は壊さないほうを選ぶ。
 *
 * 読み辞書も一緒に持ち帰る。ステージ詳細の一覧は学習者が最初に見る画面なので、
 * ここで裸の漢字を出さない（AGENTS.md 規律2 — 表示時にエンジンがルビを合成する）。
 */
interface LoadedRef {
  title: string;
  description: string;
  furigana?: readonly FuriganaEntry[];
}

export async function loadRef(ref: StageContentRef): Promise<LoadedRef | null> {
  switch (ref.type) {
    case "manga": {
      const manga = await getManga(ref.ref);
      return (
        manga && {
          title: manga.title,
          description: manga.description,
          furigana: manga.furigana,
        }
      );
    }
    case "article": {
      const article = await getArticle(ref.ref);
      return (
        article && {
          title: article.title,
          description: article.description,
          furigana: article.furigana,
        }
      );
    }
    case "listening": {
      const listening = await getListening(ref.ref);
      return (
        listening && {
          title: listening.title,
          description: listening.description,
          furigana: listening.furigana,
        }
      );
    }
    case "quizset": {
      const set = await getQuizSet(ref.ref);
      return set && { title: set.title, description: set.description, furigana: set.furigana };
    }
    case "scenario": {
      const scenario = await getScenario(ref.ref);
      return (
        scenario && {
          title: scenario.title,
          description: scenario.subtitle,
          furigana: scenario.furigana,
        }
      );
    }
    case "wordstage": {
      const stage = await getWordStage(ref.ref);
      return (
        stage && {
          title: stage.title,
          description: stage.description,
          furigana: stage.furigana,
        }
      );
    }
  }
}

export default async function StagePage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage: id } = await params;
  const stage = await getStage(id);
  if (!stage) notFound();

  /**
   * マップの上から数えた番号。ステージの `order` そのものではない
   *（`order` は並び替えの結果でしかなく飛び番になりうる）。
   * マップと同じ数え方をしないと、地図で「STEP 02」だったものが中に入ると
   * 「STEP 30」になる。
   */
  const published = sortStages((await listStages()).filter((s) => s.status === "published"));
  const number = published.findIndex((s) => s.id === stage.id) + 1;

  // contents[] の並びがそのまま学習順（順序の正はステージ側 — 設計07 §3）。
  const resolved = await Promise.all(
    stage.contents.map(async (ref, index): Promise<StageContentItem | null> => {
      const found = await loadRef(ref);
      const href = stageContentPath(stage.id, stage.contents, index);
      if (!found || !href) return null;
      return {
        id: ref.ref,
        type: ref.type,
        title: found.title,
        description: found.description,
        furigana: found.furigana,
        href,
      };
    }),
  );
  const items = resolved.filter((item): item is StageContentItem => item !== null);

  // 単語ステージは独立したアプリ（ことばアーケード）なので行き先も /arcade のまま。
  // ステージからすぐ開けることだけを保証する。参照切れは一覧から外す。
  const loadedWordStages = await Promise.all(
    stage.wordStageIds.map(async (wordStageId): Promise<StageWordItem | null> => {
      const wordStage = await getWordStage(wordStageId);
      return (
        wordStage && {
          id: wordStage.id,
          title: wordStage.title,
          description: wordStage.description,
        }
      );
    }),
  );
  const wordStages = loadedWordStages.filter((item): item is StageWordItem => item !== null);

  return (
    <StageDetail
      stage={{
        id: stage.id,
        number: number > 0 ? number : 1,
        title: stage.title,
        reading: stage.reading,
        description: stage.description,
      }}
      items={items}
      wordStages={wordStages}
    />
  );
}
