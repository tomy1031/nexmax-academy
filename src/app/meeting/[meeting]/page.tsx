import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PlaybackMeeting } from "@/components/meeting/playback-mode";
import { getMeeting, listMeetings } from "@/lib/content";

export function generateStaticParams() {
  return listMeetings().map((meeting) => ({ meeting: meeting.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ meeting: string }>;
}): Promise<Metadata> {
  const { meeting: id } = await params;
  const meeting = getMeeting(id);
  return { title: meeting ? `${meeting.title} | ミーティング` : "ミーティング" };
}

export default async function MeetingPage({ params }: { params: Promise<{ meeting: string }> }) {
  const { meeting: id } = await params;
  const meeting = getMeeting(id);
  if (!meeting) notFound();

  return <PlaybackMeeting meeting={meeting} />;
}
