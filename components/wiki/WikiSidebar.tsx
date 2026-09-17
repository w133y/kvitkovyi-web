import Link from "next/link";
import type { WikiCategoryWithArticles } from "@/lib/actions/wiki";

// Plain Server Component — the active article is known from the page's own
// route params, so this doesn't need usePathname/client-side state.
export default function WikiSidebar({
  categories,
  activeArticleId,
}: {
  categories: WikiCategoryWithArticles[];
  activeArticleId?: string;
}) {
  return (
    <aside className="wiki-sidebar">
      <h2 className="wiki-sidebar-title">ВІКІ</h2>
      {categories.map((category) => (
        <div key={category.id} className="wiki-sidebar-group">
          <span className="wiki-sidebar-category">{category.title}</span>
          {category.articles.length > 0 && (
            <ul>
              {category.articles.map((article) => (
                <li key={article.id}>
                  <Link
                    href={`/wiki/${category.slug}/${article.slug}`}
                    className={article.id === activeArticleId ? "active" : ""}
                  >
                    {article.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {categories.every((c) => c.articles.length === 0) && (
        <p className="wiki-sidebar-empty">Поки що немає статей.</p>
      )}
    </aside>
  );
}
