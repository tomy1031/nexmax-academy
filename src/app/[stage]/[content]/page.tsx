import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { StageContentRef } from "@/content/schema";
import { ArticleView } from "@/components/article/article-view";
import { TalkSession } from "@/components/listening/live-mode";
import { ListeningPlayer } from "@/components/listening/playback-mode";
import { MangaReader } from "@/components/manga/manga-reader";
import { QuizRunner } from "@/components/quiz/quiz-runner";
import {
  getArticle,
  getListening,
  getManga,
  getQuizSet,
  getScenario,
  getStage,
  listStages,
  listWordStages,
} from "@/lib/content";
import { buildDictionary } from "@/lib/dictionary";
import { resolveStageContent, stageContentSegments } from "@/lib/stage-routes";

/**
 * ステージの中の教材（`/asakai/listening`）
 *
 * 教材の engine は種別ごとに別のコンポーネントだが、**ページは1つ**にする。
 * 種別ごとにルートを分けると、ステージの外側（見出し・戻り先・進捗）を
 * 5か所に写して回ることになり、必ずどこか1つが取り残される。
 *
 * URLの読み取り規則は src/lib/stage-routes.ts（同じ種別が1つなら ID を付けない）。
 */

/** DBで公開した教材を合流させるため ISR（設計07 §11.1）。 */
export const revalidate = 60;

export async function generateStaticParams() {
  const stages = await listStages();
  return stages.flatMap((stage) =>
    stageContentSegments(stage.contents).map((content) => ({ stage: stage.id, content })),
  );
}

/** URL から「どのステージの どの教材か」まで解く。無ければ null。 */
async function resolve(stageId: string, segment: string): Promise<StageContentRef | null> {
  const stage = await getStage(stageId);
  if (!stage) return null;
  return resolveStageContent(stage.contents, segment);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ stage: string; content: string }>;
}): Promise<Metadata> {
  const { stage, content } = await params;
  const ref = await resolve(stage, content);
  if (!ref) return { title: "きょうざい" };
  switch (ref.type) {
    case "manga":
      return { title: `${(await getManga(ref.ref))?.title ?? ""} | まんが` };
    case "article": {
      const article = await getArticle(ref.ref);
      return { title: `${article?.title ?? ""} | よみもの`, description: article?.description };
    }
    case "listening":
      return { title: `${(await getListening(ref.ref))?.title ?? ""} | リスニング` };
    case "quizset":
      return { title: `${(await getQuizSet(ref.ref))?.title ?? ""} | もんだい` };
    case "scenario":
      return { title: `${(await getScenario(ref.ref))?.title ?? ""} | たいわ` };
    case "wordstage":
      return { title: "ことば" };
  }
}

export default async function StageContentPage({
  params,
}: {
  params: Promise<{ stage: string; content: string }>;
}) {
  const { stage, content } = await params;
  const ref = await resolve(stage, content);
  if (!ref) notFound();

  switch (ref.type) {
    case "manga": {
      const manga = await getManga(ref.ref);
      if (!manga) notFound();
      return <MangaReader manga={manga} />;
    }
    case "article": {
      const article = await getArticle(ref.ref);
      if (!article) notFound();
      /*
       * 辞書は単語ステージを畳んだもの（src/lib/dictionary.ts）。ステージのぶんだけに
       * 絞らないのは、本文に出てくる ことばは前の課で習ったものが多いため——
       * このステージの単語だけに絞ると、いちばん助けが要る「前に習ったが忘れた語」に
       * 説明が出なくなる。
       */
      return <ArticleView article={article} dictionary={buildDictionary(await listWordStages())} />;
    }
    case "listening": {
      const listening = await getListening(ref.ref);
      if (!listening) notFound();
      return <ListeningPlayer listening={listening} />;
    }
    case "quizset": {
      const set = await getQuizSet(ref.ref);
      if (!set) notFound();
      return <QuizRunner set={set} />;
    }
    case "scenario": {
      const scenario = await getScenario(ref.ref);
      if (!scenario) notFound();
      return <TalkSession scenario={scenario} />;
    }
    // 単語ステージは contents[] に入らない（wordStageIds 側・行き先は /arcade）。
    // ここに来るのは壊れたデータなので 404 にする。
    case "wordstage":
      notFound();
  }
}
