import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { QuestView } from "@/components/quest/quest-view";
import { getQuest, listQuests } from "@/lib/content";
import { canonicalContentPath } from "@/lib/stage-lookup";

/**
 * クエストの 単独URL。
 *
 * ほかの 種別と 同じ 作りに する: **ステージの 中の 教材なら 本来のURLへ 送り返し**、
 * どの ステージにも 入って いない ものだけ ここで 出す（スタジオで 作りかけの
 * ものを 先生が 確かめられる 必要が ある）。
 *
 * `content-kinds.ts` が `/quest/<id>` を 返すので、ここが 無いと ステージの
 * カードが 404 を 指す——リンク教材で 2026-08-23 に 実際に 起きた 型である。
 */
export const revalidate = 300;

export async function generateStaticParams() {
  return (await listQuests()).map((quest) => ({ id: quest.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const quest = await getQuest(id);
  return { title: quest ? `${quest.title} | クエスト` : "クエスト" };
}

export default async function QuestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quest = await getQuest(id);
  if (!quest) notFound();

  const canonical = await canonicalContentPath("quest", id);
  if (canonical) redirect(canonical);

  return <QuestView quest={quest} />;
}
