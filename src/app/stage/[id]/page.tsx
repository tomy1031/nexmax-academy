import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { StageContentRef } from "@/content/schema";
import {
  StageDetail,
  type StageContentItem,
  type StageWordItem,
} from "@/components/stage/stage-detail";
import { contentHref } from "@/components/stage/stage-progress";
import type { FuriganaEntry } from "@/lib/text/furigana";
import {
  getArticle,
  getManga,
  getMeeting,
  getQuizSet,
  getScenario,
  getStage,
  listStages,
  getWordStage,
} from "@/lib/content";

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
  return (await listStages()).map((item) => ({ id: item.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
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

async function loadRef(ref: StageContentRef): Promise<LoadedRef | null> {
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
    case "meeting": {
      const meeting = await getMeeting(ref.ref);
      return (
        meeting && {
          title: meeting.title,
          description: meeting.description,
          furigana: meeting.furigana,
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

async function resolveContent(ref: StageContentRef): Promise<StageContentItem | null> {
  const found = await loadRef(ref);
  if (!found) return null;
  return {
    id: ref.ref,
    type: ref.type,
    title: found.title,
    description: found.description,
    furigana: found.furigana,
    href: contentHref(ref.type, ref.ref),
  };
}

export default async function StagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const stage = await getStage(id);
  if (!stage) notFound();

  // contents[] の並びがそのまま学習順（順序の正はステージ側 — 設計07 §3）。
  const resolved = await Promise.all(stage.contents.map(resolveContent));
  const items = resolved.filter((item): item is StageContentItem => item !== null);

  // 単語ステージも contents[] と同じ扱い。参照切れはここで落とさず一覧から外す。
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
        step: stage.step,
        title: stage.title,
        reading: stage.reading,
        description: stage.description,
      }}
      items={items}
      wordStages={wordStages}
    />
  );
}
