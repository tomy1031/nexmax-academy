import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LiveMeeting } from "@/components/meeting/live-mode";
import { getScenario, listScenarios } from "@/lib/content";

export function generateStaticParams() {
  return listScenarios().map((scenario) => ({ scenario: scenario.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ scenario: string }>;
}): Promise<Metadata> {
  const { scenario: id } = await params;
  const scenario = getScenario(id);
  return { title: scenario ? `${scenario.title} | ミーティング` : "ミーティング" };
}

export default async function LiveMeetingPage({
  params,
}: {
  params: Promise<{ scenario: string }>;
}) {
  const { scenario: id } = await params;
  const scenario = getScenario(id);
  if (!scenario) notFound();

  return <LiveMeeting scenario={scenario} />;
}
