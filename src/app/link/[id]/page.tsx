import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { LinkView } from "@/components/link/link-view";
import { getLink, listLinks } from "@/lib/content";
import { canonicalContentPath } from "@/lib/stage-lookup";

/**
 * リンク教材の 単独URL。
 *
 * ## なぜ 要るか（2026-08-23）
 * `content-kinds.ts` は リンク教材の 行き先を `/link/<id>` と 返すのに、**その ルートが
 * 無かった**。ふだんは 誰も 気づかない——リンク教材を ステージに 1本 置くだけなら、
 * 学習者は ステージの 枠（`/kaisha/link`）から しか 入らないから。
 * けれど 記事の 中に「リンクへ 進む カード」（articleBlock の `link`）を 置いた 瞬間、
 * その カードは `/link/<id>` を 指し、**押すと 404** になった。
 *
 * ほかの 種別（もんだい・ミーティング…）と 同じに する: **ステージの 中の 教材なら
 * 本来のURLへ 送り返し**、どのステージにも 入って いない ものだけ ここで 出す
 *（スタジオで 作りかけの ものを 先生が 確かめられる 必要が ある）。
 */
export const revalidate = 60;

export async function generateStaticParams() {
  return (await listLinks()).map((link) => ({ id: link.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const link = await getLink(id);
  return { title: link ? `${link.title} | リンク` : "リンク" };
}

export default async function LinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const link = await getLink(id);
  if (!link) notFound();

  const canonical = await canonicalContentPath("link", id);
  if (canonical) redirect(canonical);

  return <LinkView link={link} />;
}
