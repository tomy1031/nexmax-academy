import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { TalkSession } from "@/components/listening/live-mode";
import { getScenario, listScenarios } from "@/lib/content";

/**
 * 公開分のDBコンテンツを合流させるため ISR にする（設計07 §11.1
 * 「gitコンテンツは静的生成のまま。DBコンテンツはリクエスト時取得（ISR/短いキャッシュ）」）。
 * スタジオで「こうかい」したシナリオは、再デプロイを待たずこの間隔で届く。
 */
export const revalidate = 60;
/**
 * git 由来のシナリオはビルド時に切り出す（実行時のファイル読みを起こさない）。
 * DB由来（スタジオで公開したもの）はここに現れないが、dynamicParams の既定により
 * 初回アクセスで生成され、以後は revalidate の間隔でキャッシュされる。
 */
export async function generateStaticParams() {
  return (await listScenarios()).map((scenario) => ({ scenario: scenario.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ scenario: string }>;
}): Promise<Metadata> {
  const { scenario: id } = await params;
  const scenario = await getScenario(id);
  return { title: scenario ? `${scenario.title} | たいわ` : "たいわ" };
}

export default async function TalkPage({ params }: { params: Promise<{ scenario: string }> }) {
  const { scenario: id } = await params;
  const scenario = await getScenario(id);
  if (!scenario) notFound();

  return <TalkSession scenario={scenario} />;
}
