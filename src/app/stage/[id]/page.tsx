import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { StageContentRef } from "@/content/schema";
import {
  StageDetail,
  type StageContentItem,
  type StageWordItem,
} from "@/components/stage/stage-detail";
import { contentHref } from "@/components/stage/stage-progress";
import {
  getArticle,
  getManga,
  getMeeting,
  getQuizSet,
  getScenario,
  getStage,
  getWordStage,
  listStages,
} from "@/lib/content";

/** 実行時にファイルを読まないよう、全ステージを静的に切り出す。 */
export async function generateStaticParams() {
  return (await listStages()).map((stage) => ({ id: stage.id }));
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
 */
async function loadRef(
  ref: StageContentRef,
): Promise<{ title: string; description: string } | null> {
  switch (ref.type) {
    case "manga": {
      const manga = await getManga(ref.ref);
      return manga && { title: manga.title, description: manga.description };
    }
    case "article": {
      const article = await getArticle(ref.ref);
      return article && { title: article.title, description: article.description };
    }
    case "meeting": {
      const meeting = getMeeting(ref.ref);
      return meeting && { title: meeting.title, description: meeting.description };
    }
    case "quizset": {
      const set = getQuizSet(ref.ref);
      return set && { title: set.title, description: set.description };
    }
    case "scenario": {
      const scenario = getScenario(ref.ref);
      return scenario && { title: scenario.title, description: scenario.subtitle };
    }
    case "wordstage": {
      const stage = getWordStage(ref.ref);
      return stage && { title: stage.title, description: stage.description };
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

  const wordStages = stage.wordStageIds.reduce<StageWordItem[]>((acc, wordStageId) => {
    const wordStage = getWordStage(wordStageId);
    if (wordStage)
      acc.push({
        id: wordStage.id,
        title: wordStage.title,
        description: wordStage.description,
      });
    return acc;
  }, []);

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
