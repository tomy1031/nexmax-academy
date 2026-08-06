import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { QuizRunner } from "@/components/quiz/quiz-runner";
import { getQuizSet, listQuizSets } from "@/lib/content";
import { canonicalContentPath } from "@/lib/stage-lookup";

/**
 * 公開分のDBコンテンツを合流させるため ISR にする（設計07 §11.1
 * 「gitコンテンツは静的生成のまま。DBコンテンツはリクエスト時取得（ISR/短いキャッシュ）」）。
 * スタジオで「こうかい」したもんだいは、再デプロイを待たずこの間隔で届く。
 */
export const revalidate = 60;
/**
 * git 由来のもんだいはビルド時に切り出す（実行時のファイル読みを起こさない）。
 * DB由来（スタジオで公開したもの）はここに現れないが、dynamicParams の既定により
 * 初回アクセスで生成され、以後は revalidate の間隔でキャッシュされる。
 */
export async function generateStaticParams() {
  return (await listQuizSets()).map((set) => ({ set: set.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ set: string }>;
}): Promise<Metadata> {
  const { set: id } = await params;
  const set = await getQuizSet(id);
  return { title: set ? `${set.title} | もんだい` : "もんだい" };
}

export default async function QuizSetPage({ params }: { params: Promise<{ set: string }> }) {
  const { set: id } = await params;
  const set = await getQuizSet(id);
  if (!set) notFound();

  // ステージに入っている教材は、本来のURL（`/<ステージ>/<種別>`）へ送り返す。
  // どのステージにも入っていない教材だけ、ここで表示する
  //（スタジオで作りかけの教材を先生が確認できる必要がある）。
  const canonical = await canonicalContentPath("quizset", id);
  if (canonical) redirect(canonical);

  return <QuizRunner set={set} />;
}
