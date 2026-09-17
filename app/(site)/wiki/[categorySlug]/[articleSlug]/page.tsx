import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getWikiArticle, getWikiCategories } from "@/lib/actions/wiki";
import WikiSidebar from "@/components/wiki/WikiSidebar";
import WikiMarkdown from "@/lib/wiki-markdown";

// Next's dynamic route params arrive still percent-encoded for non-ASCII
// segments (confirmed by logging the raw value: "мем" came through as the
// literal string "%D0%BC%D0%B5%D0%BC") — the router doesn't decode these
// itself, unlike query string values. Cyrillic slugs are the default here
// (slugify keeps Cyrillic rather than transliterating), so every Cyrillic
// article 404'd until this decodes them back to real characters first.
function decodeSlug(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ categorySlug: string; articleSlug: string }>;
}): Promise<Metadata> {
  const { categorySlug, articleSlug } = await params;
  const article = await getWikiArticle(decodeSlug(categorySlug), decodeSlug(articleSlug));
  return { title: article ? `${article.title} - Вікі - Квітковий` : "Вікі - Квітковий" };
}

export default async function WikiArticlePage({
  params,
}: {
  params: Promise<{ categorySlug: string; articleSlug: string }>;
}) {
  const { categorySlug, articleSlug } = await params;
  const [article, categories] = await Promise.all([
    getWikiArticle(decodeSlug(categorySlug), decodeSlug(articleSlug)),
    getWikiCategories(),
  ]);

  if (!article) notFound();

  return (
    <div className="wiki-layout">
      <WikiSidebar categories={categories} activeArticleId={article.id} />
      <main className="wiki-main">
        <article className="box2 wiki-article">
          <h2>
            <b>{article.title}</b>
          </h2>
          <WikiMarkdown content={article.content} />
        </article>
      </main>
    </div>
  );
}
