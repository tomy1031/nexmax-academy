import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PlaybackMeeting } from "@/components/meeting/playback-mode";
import { getMeeting, listMeetings } from "@/lib/content";

/**
 * 公開分のDBコンテンツを合流させるため ISR にする（設計07 §11.1
 * 「gitコンテンツは静的生成のまま。DBコンテンツはリクエスト時取得（ISR/短いキャッシュ）」）。
 * スタジオで「こうかい」したミーティングは、再デプロイを待たずこの間隔で届く。
 */
export const revalidate = 60;
/**
 * git 由来のミーティングはビルド時に切り出す（実行時のファイル読みを起こさない）。
 * DB由来（スタジオで公開したもの）はここに現れないが、dynamicParams の既定により
 * 初回アクセスで生成され、以後は revalidate の間隔でキャッシュされる。
 */
export async function generateStaticParams() {
  return (await listMeetings()).map((meeting) => ({ meeting: meeting.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ meeting: string }>;
}): Promise<Metadata> {
  const { meeting: id } = await params;
  const meeting = await getMeeting(id);
  return { title: meeting ? `${meeting.title} | ミーティング` : "ミーティング" };
}

export default async function MeetingPage({ params }: { params: Promise<{ meeting: string }> }) {
  const { meeting: id } = await params;
  const meeting = await getMeeting(id);
  if (!meeting) notFound();

  return <PlaybackMeeting meeting={meeting} />;
}
