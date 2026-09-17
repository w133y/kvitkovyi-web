import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getWikiCategories } from "@/lib/actions/wiki";
import WikiSidebar from "@/components/wiki/WikiSidebar";

export const metadata: Metadata = {
  title: "Вікі - Квітковий",
};

export default async function WikiIndexPage() {
  const categories = await getWikiCategories();
  const firstArticle = categories.find((c) => c.articles.length > 0)?.articles[0];
  const firstCategory = firstArticle && categories.find((c) => c.articles.includes(firstArticle));

  // Landing on a blank "pick something" welcome card when there's already
  // an obvious default (the first article) just adds an extra click for
  // everyone — /wiki now goes straight there, and only falls back to the
  // welcome card once there's genuinely nothing to redirect to yet.
  if (firstArticle && firstCategory) {
    // The HTTP Location header redirect() writes can only hold ASCII —
    // slugify() keeps Cyrillic slugs as-is (no transliteration), so an
    // un-encoded one here crashes with "Invalid character in header
    // content" instead of redirecting.
    redirect(`/wiki/${encodeURIComponent(firstCategory.slug)}/${encodeURIComponent(firstArticle.slug)}`);
  }

  return (
    <div className="wiki-layout">
      <WikiSidebar categories={categories} />
      <main className="wiki-main">
        <div className="box2 wiki-welcome">
          <h2>
            <b>Вікі Квіткового</b>
          </h2>
          <p>Поки що немає жодної статті.</p>
        </div>
      </main>
    </div>
  );
}
