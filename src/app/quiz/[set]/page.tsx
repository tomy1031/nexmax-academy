import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { QuizRunner } from "@/components/quiz/quiz-runner";
import { getQuizSet, listQuizSets } from "@/lib/content";
import { canonicalContentPath } from "@/lib/stage-lookup";

/**
 * 公開分のDBコンテンツは **初回アクセスのとき** に合流する（設計07 §11.1
 * 「gitコンテンツは静的生成のまま。DBコンテンツはリクエスト時取得」）。
 * スタジオで「こうかい」したもんだいは、再デプロイを待たずこの間隔で届く。
 */
/*
 * **作りおきを 作り直さない**（`force-static`）。`revalidate` を 置くと、期限ぎれの
 * 作りおきを 直すために リクエストの 中で フルSSR（実測 280〜570ms）が 走り、
 * 無料枠の CPU 10ms で 落ちる。落ちても 鮮度は 更新されないので、輪が 閉じない。
 * 理由の 全文は src/app/[stage]/[content]/page.tsx と docs/deploy.md §0.13。
 */
export const dynamic = "force-static";
/**
 * git 由来のもんだいはビルド時に切り出す（実行時のファイル読みを起こさない）。
 * DB由来（スタジオで公開したもの）はここに現れないが、dynamicParams の既定により
 * 初回アクセスで生成され、以後は **作り直さない**作りおきになる。
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
