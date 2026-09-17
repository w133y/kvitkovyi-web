"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WikiArticle } from "@prisma/client";
import type { WikiCategoryWithArticles } from "@/lib/actions/wiki";
import { createWikiCategory, updateWikiCategory, deleteWikiCategory, deleteWikiArticle } from "@/lib/actions/wiki";
import WikiArticleForm from "./WikiArticleForm";

function CategoryRow({ category, onSaved }: { category: WikiCategoryWithArticles; onSaved: () => void }) {
  const [title, setTitle] = useState(category.title);
  const [order, setOrder] = useState(category.order);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateWikiCategory(category.id, title, order);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteWikiCategory(category.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <div className="wiki-admin-row">
      <div className="admin-radio-row">
        <label className="admin-field" style={{ flex: 1 }}>
          Назва
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="admin-field" style={{ maxWidth: 100 }}>
          Порядок
          <input type="number" value={order} onChange={(e) => setOrder(Number(e.target.value))} />
        </label>
      </div>
      {error && <p className="profile-bio-error">{error}</p>}
      <div className="admin-form-actions">
        <button type="button" onClick={save} disabled={pending}>
          Зберегти
        </button>
        <button type="button" onClick={remove} disabled={pending}>
          Видалити
        </button>
      </div>
    </div>
  );
}

function NewCategoryForm({ nextOrder, onCreated }: { nextOrder: number; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    setError(null);
    startTransition(async () => {
      const result = await createWikiCategory(title, nextOrder);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setTitle("");
      onCreated();
    });
  }

  return (
    <div className="wiki-admin-row">
      <div className="admin-radio-row">
        <label className="admin-field" style={{ flex: 1 }}>
          Нова категорія
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Напр. Правила" />
        </label>
        <div className="admin-form-actions">
          <button type="button" onClick={create} disabled={pending || !title.trim()}>
            Додати
          </button>
        </div>
      </div>
      {error && <p className="profile-bio-error">{error}</p>}
    </div>
  );
}

function ArticleRow({
  article,
  categoryTitle,
  onEdit,
  onSaved,
}: {
  article: WikiArticle;
  categoryTitle: string;
  onEdit: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!confirm(`Видалити статтю "${article.title}"?`)) return;
    startTransition(async () => {
      await deleteWikiArticle(article.id);
      onSaved();
    });
  }

  return (
    <div className="admin-player-row" style={{ cursor: "default" }}>
      <div>
        <b>{article.title}</b>
        <span style={{ marginLeft: 8 }}>{categoryTitle}</span>
        {!article.published && <span className="admin-gallery-pending" style={{ marginLeft: 8 }}>Чернетка</span>}
      </div>
      <div className="admin-form-actions">
        <button type="button" onClick={onEdit}>
          Редагувати
        </button>
        <button type="button" onClick={remove} disabled={pending}>
          Видалити
        </button>
      </div>
    </div>
  );
}

type Tab = "manage" | "editor";

export default function AdminWiki({ initialCategories }: { initialCategories: WikiCategoryWithArticles[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("manage");
  const [editing, setEditing] = useState<WikiArticle | "new" | null>(null);

  function refresh() {
    setEditing(null);
    setTab("manage");
    router.refresh();
  }

  function openEditor(article: WikiArticle | "new") {
    setEditing(article);
    setTab("editor");
  }

  const categories = initialCategories;
  const allArticles = categories.flatMap((c) => c.articles.map((a) => ({ article: a, categoryTitle: c.title })));

  return (
    <div>
      <div className="wiki-admin-tabs">
        <button type="button" className={tab === "manage" ? "active" : ""} onClick={() => setTab("manage")}>
          Категорії та статті
        </button>
        <button type="button" className={tab === "editor" ? "active" : ""} onClick={() => setTab("editor")}>
          Написати статтю
        </button>
      </div>

      {tab === "editor" ? (
        <WikiArticleForm
          article={editing === "new" || editing === null ? undefined : editing}
          categories={categories}
          onDone={refresh}
          onCancel={() => setTab("manage")}
        />
      ) : (
        <div className="admin-achievements">
          <div>
            <h4 className="admin-gallery-photos-title">Категорії</h4>
            <div className="wiki-admin-categories">
              {categories.map((c) => (
                <CategoryRow key={c.id} category={c} onSaved={refresh} />
              ))}
            </div>
            <NewCategoryForm nextOrder={categories.length} onCreated={refresh} />
          </div>

          <div>
            <h4 className="admin-gallery-photos-title">Статті</h4>
            {categories.length === 0 ? (
              <p className="admin-privileges-summary">Спочатку створіть категорію.</p>
            ) : allArticles.length === 0 ? (
              <p className="admin-privileges-summary">Ще немає статей.</p>
            ) : (
              <div className="admin-achievements-list">
                {allArticles.map(({ article, categoryTitle }) => (
                  <ArticleRow
                    key={article.id}
                    article={article}
                    categoryTitle={categoryTitle}
                    onEdit={() => openEditor(article)}
                    onSaved={refresh}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
