"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createWikiUploadTarget, type UploadTarget } from "@/lib/r2";
import { logError } from "@/lib/admin-log";
import { revalidatePath } from "next/cache";
import type { WikiCategory, WikiArticle } from "@prisma/client";

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    throw new Error("Доступ заборонено");
  }
  return session;
}

function slugify(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/['"]/g, "")
      .replace(/[^a-zа-яіїєґ0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "stattya"
  );
}

// Appends -2, -3, ... until the slug is free — same idea as a filename
// collision, just for the wiki's URL segments.
async function uniqueSlug(base: string, ignoreId?: string): Promise<string> {
  let slug = base;
  let n = 2;
  for (;;) {
    const existing = await prisma.wikiArticle.findUnique({ where: { slug } });
    if (!existing || existing.id === ignoreId) return slug;
    slug = `${base}-${n++}`;
  }
}

async function uniqueCategorySlug(base: string, ignoreId?: string): Promise<string> {
  let slug = base;
  let n = 2;
  for (;;) {
    const existing = await prisma.wikiCategory.findUnique({ where: { slug } });
    if (!existing || existing.id === ignoreId) return slug;
    slug = `${base}-${n++}`;
  }
}

// --- Public reads ---

export type WikiCategoryWithArticles = WikiCategory & { articles: WikiArticle[] };

// For the sidebar — every category with its published articles, in display
// order. Unpublished drafts never reach this (they're admin-only, surfaced
// through listWikiArticlesForAdmin instead).
export async function getWikiCategories(): Promise<WikiCategoryWithArticles[]> {
  return prisma.wikiCategory.findMany({
    orderBy: { order: "asc" },
    include: {
      articles: {
        where: { published: true },
        orderBy: { order: "asc" },
      },
    },
  });
}

export async function getWikiArticle(categorySlug: string, articleSlug: string): Promise<WikiArticle | null> {
  const article = await prisma.wikiArticle.findUnique({ where: { slug: articleSlug } });
  if (!article || !article.published) return null;
  const category = await prisma.wikiCategory.findUnique({ where: { id: article.categoryId } });
  if (!category || category.slug !== categorySlug) return null;
  return article;
}

// --- Admin: categories ---

export async function listWikiCategoriesForAdmin(): Promise<WikiCategoryWithArticles[]> {
  await requireAdmin();
  return prisma.wikiCategory.findMany({
    orderBy: { order: "asc" },
    include: { articles: { orderBy: { order: "asc" } } },
  });
}

export type WikiActionResult = { ok: true } | { error: string };

export async function createWikiCategory(title: string, order: number): Promise<WikiActionResult> {
  await requireAdmin();
  const trimmed = title.trim();
  if (!trimmed) return { error: "Введіть назву категорії" };
  const slug = await uniqueCategorySlug(slugify(trimmed));
  await prisma.wikiCategory.create({ data: { title: trimmed, slug, order } });
  revalidatePath("/admin");
  revalidatePath("/wiki");
  return { ok: true };
}

export async function updateWikiCategory(id: string, title: string, order: number): Promise<WikiActionResult> {
  await requireAdmin();
  const trimmed = title.trim();
  if (!trimmed) return { error: "Введіть назву категорії" };
  await prisma.wikiCategory.update({ where: { id }, data: { title: trimmed, order } });
  revalidatePath("/admin");
  revalidatePath("/wiki");
  return { ok: true };
}

export async function deleteWikiCategory(id: string): Promise<WikiActionResult> {
  await requireAdmin();
  const articleCount = await prisma.wikiArticle.count({ where: { categoryId: id } });
  if (articleCount > 0) {
    return { error: "Спочатку видаліть або перенесіть статті цієї категорії" };
  }
  await prisma.wikiCategory.delete({ where: { id } });
  revalidatePath("/admin");
  revalidatePath("/wiki");
  return { ok: true };
}

// --- Admin: articles ---

export type UpsertWikiArticleInput = {
  title: string;
  content: string;
  categoryId: string;
  order: number;
  published: boolean;
};

export async function createWikiArticle(input: UpsertWikiArticleInput): Promise<WikiActionResult> {
  const session = await requireAdmin();
  const title = input.title.trim();
  if (!title) return { error: "Введіть заголовок статті" };
  if (!input.categoryId) return { error: "Оберіть категорію" };

  const slug = await uniqueSlug(slugify(title));
  await prisma.wikiArticle.create({
    data: {
      title,
      slug,
      content: input.content,
      categoryId: input.categoryId,
      order: input.order,
      published: input.published,
      authorUserId: session.user?.id ?? null,
    },
  });
  revalidatePath("/admin");
  revalidatePath("/wiki");
  return { ok: true };
}

export async function updateWikiArticle(id: string, input: UpsertWikiArticleInput): Promise<WikiActionResult> {
  await requireAdmin();
  const title = input.title.trim();
  if (!title) return { error: "Введіть заголовок статті" };
  if (!input.categoryId) return { error: "Оберіть категорію" };

  const current = await prisma.wikiArticle.findUnique({ where: { id } });
  if (!current) return { error: "Статтю не знайдено" };

  const slug = title === current.title ? current.slug : await uniqueSlug(slugify(title), id);
  await prisma.wikiArticle.update({
    where: { id },
    data: {
      title,
      slug,
      content: input.content,
      categoryId: input.categoryId,
      order: input.order,
      published: input.published,
    },
  });
  revalidatePath("/admin");
  revalidatePath("/wiki");
  return { ok: true };
}

export async function deleteWikiArticle(id: string): Promise<WikiActionResult> {
  await requireAdmin();
  await prisma.wikiArticle.delete({ where: { id } });
  revalidatePath("/admin");
  revalidatePath("/wiki");
  return { ok: true };
}

// --- Admin: image upload (editor toolbar) ---

export type WikiUploadTargetResult = ({ ok: true } & UploadTarget) | { error: string };

export async function getWikiUploadTarget(contentType: string): Promise<WikiUploadTargetResult> {
  await requireAdmin();
  if (!contentType.startsWith("image/")) return { error: "Файл має бути зображенням" };
  try {
    return { ok: true, ...(await createWikiUploadTarget(contentType)) };
  } catch (err) {
    await logError("getWikiUploadTarget: failed", err);
    return { error: "Не вдалося підготувати завантаження" };
  }
}
