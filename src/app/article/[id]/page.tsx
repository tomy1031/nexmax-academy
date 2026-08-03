import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArticleView } from "@/components/article/article-view";
import { getArticle, listArticles } from "@/lib/content";

/** 実行時にファイルを読まないよう、全記事を静的に切り出す（設計03 §2）。 */
export async function generateStaticParams() {
  return (await listArticles()).map((article) => ({ id: article.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const article = await getArticle(id);
  return {
    title: article ? `${article.title} | よみもの` : "よみもの",
    description: article?.description,
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = await getArticle(id);
  if (!article) notFound();

  return <ArticleView article={article} />;
}
