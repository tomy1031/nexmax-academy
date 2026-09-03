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
/*
 * 7日。無料枠の CPU 10ms では 作り直しの フルSSR（280〜570ms）が 落ち、
 * 鮮度が 更新されないまま 毎リクエスト 繰り返す ため（2026-09-02 に 授業中の
 * 本番で 発生）。理由の 全文は src/app/[stage]/[content]/page.tsx と
 * docs/deploy.md §0.13。有料プランに したら 300 へ 戻してよい。
 */
export const revalidate = 604800;

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
