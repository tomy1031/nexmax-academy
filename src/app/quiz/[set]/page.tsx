import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { QuizRunner } from "@/components/quiz/quiz-runner";
import { getQuizSet, listQuizSets } from "@/lib/content";
import { learnerDictionary } from "@/lib/dictionary-server";
import { canonicalContentPath } from "@/lib/stage-lookup";

/**
 * 公開分のDBコンテンツを合流させるため ISR にする（設計07 §11.1
 * 「gitコンテンツは静的生成のまま。DBコンテンツはリクエスト時取得（ISR/短いキャッシュ）」）。
 * スタジオで「こうかい」したもんだいは、再デプロイを待たずこの間隔で届く。
 */
/*
 * 7日。無料枠の CPU 10ms では 作り直しの フルSSR（280〜570ms）が 落ち、
 * 鮮度が 更新されないまま 毎リクエスト 繰り返す ため（2026-09-02 に 授業中の
 * 本番で 発生）。理由の 全文は src/app/[stage]/[content]/page.tsx と
 * docs/deploy.md §0.13。有料プランに したら 300 へ 戻してよい。
 */
export const revalidate = 604800;
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

  return <QuizRunner set={set} dictionary={await learnerDictionary()} />;
}
