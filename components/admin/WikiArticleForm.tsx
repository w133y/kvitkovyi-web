"use client";

import { useState } from "react";
import type { WikiArticle, WikiCategory } from "@prisma/client";
import { createWikiArticle, updateWikiArticle, type UpsertWikiArticleInput } from "@/lib/actions/wiki";
import WikiToolbarTextarea from "./WikiToolbarTextarea";
import WikiMarkdown from "@/lib/wiki-markdown";

export default function WikiArticleForm({
  article,
  categories,
  onDone,
  onCancel,
}: {
  article?: WikiArticle;
  categories: WikiCategory[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(article?.title ?? "");
  const [content, setContent] = useState(article?.content ?? "");
  const [categoryId, setCategoryId] = useState(article?.categoryId ?? categories[0]?.id ?? "");
  const [order, setOrder] = useState(article?.order ?? 0);
  const [published, setPublished] = useState(article?.published ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const input: UpsertWikiArticleInput = { title, content, categoryId, order, published };
    const result = article ? await updateWikiArticle(article.id, input) : await createWikiArticle(input);
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onDone();
  }

  return (
    <div className="wiki-editor">
      <div className="admin-radio-row">
        <label className="admin-field" style={{ flex: 1 }}>
          Заголовок
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </label>
        <label className="admin-field" style={{ maxWidth: 220 }}>
          Категорія
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field" style={{ maxWidth: 100 }}>
          Порядок
          <input type="number" value={order} onChange={(e) => setOrder(Number(e.target.value))} />
        </label>
      </div>

      <label className="admin-checkbox-label">
        <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
        Опубліковано
      </label>

      <div className="wiki-editor-split">
        <WikiToolbarTextarea value={content} onChange={setContent} />
        <div className="wiki-editor-preview">
          <span className="wiki-editor-preview-label">Перегляд</span>
          <div className="box2 wiki-article">
            <WikiMarkdown content={content || "*Тут з'явиться перегляд статті...*"} />
          </div>
        </div>
      </div>

      {error && <p className="profile-bio-error">{error}</p>}

      <div className="admin-form-actions">
        <button type="button" onClick={save} disabled={saving || !categoryId}>
          {saving ? "Збереження..." : "Зберегти"}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          Скасувати
        </button>
      </div>
    </div>
  );
}
