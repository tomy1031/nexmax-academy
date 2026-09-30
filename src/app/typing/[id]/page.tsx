import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { TypingView } from "@/components/typing/typing-view";
import { getTyping, listTypings } from "@/lib/content";
import { canonicalContentPath } from "@/lib/stage-lookup";

/**
 * タイピング教材の 単独URL。
 *
 * ほかの 種別と 同じ 作りに する: **ステージの 中の 教材なら 本来のURLへ 送り返し**、
 * どの ステージにも 入って いない ものだけ ここで 出す（スキットの ページと 同じ）。
 * `content-kinds.ts` が `/typing/<id>` を 返すので、ここが 無いと リンクカードが 404 を 指す。
 */
/*
 * **作りおきを 作り直さない**（`force-static`）。理由の 全文は
 * src/app/[stage]/[content]/page.tsx と docs/deploy.md §0.13。
 */
export const dynamic = "force-static";

export async function generateStaticParams() {
  return (await listTypings()).map((typing) => ({ id: typing.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const typing = await getTyping(id);
  return { title: typing ? `${typing.title} | タイピング` : "タイピング" };
}

export default async function TypingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const typing = await getTyping(id);
  if (!typing) notFound();

  const canonical = await canonicalContentPath("typing", id);
  if (canonical) redirect(canonical);

  return <TypingView typing={typing} />;
}
