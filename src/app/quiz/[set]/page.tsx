import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { QuizRunner } from "@/components/quiz/quiz-runner";
import { getQuizSet, listQuizSets } from "@/lib/content";

export function generateStaticParams() {
  return listQuizSets().map((set) => ({ set: set.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ set: string }>;
}): Promise<Metadata> {
  const { set: id } = await params;
  const set = getQuizSet(id);
  return { title: set ? `${set.title} | もんだい` : "もんだい" };
}

export default async function QuizSetPage({ params }: { params: Promise<{ set: string }> }) {
  const { set: id } = await params;
  const set = getQuizSet(id);
  if (!set) notFound();

  return <QuizRunner set={set} />;
}
