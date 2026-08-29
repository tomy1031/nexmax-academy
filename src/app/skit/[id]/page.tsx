import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { SkitView } from "@/components/skit/skit-view";
import { getSkit, listSkits } from "@/lib/content";
import { canonicalContentPath } from "@/lib/stage-lookup";

/**
 * スキット教材の 単独URL。
 *
 * ほかの 種別と 同じ 作りに する: **ステージの 中の 教材なら 本来のURLへ 送り返し**、
 * どの ステージにも 入って いない ものだけ ここで 出す（スタジオで 作りかけの
 * ものを 先生が 確かめられる 必要が ある）。
 *
 * `content-kinds.ts` が `/skit/<id>` を 返すので、ここが 無いと 記事の 中の
 * リンクカードが 404 を 指す——リンク教材で 2026-08-23 に 実際に 起きた 型である。
 */
export const revalidate = 300;

export async function generateStaticParams() {
  return (await listSkits()).map((skit) => ({ id: skit.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const skit = await getSkit(id);
  return { title: skit ? `${skit.title} | スキット` : "スキット" };
}

export default async function SkitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const skit = await getSkit(id);
  if (!skit) notFound();

  const canonical = await canonicalContentPath("skit", id);
  if (canonical) redirect(canonical);

  return <SkitView skit={skit} />;
}
