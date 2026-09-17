# Wiki (design spec)

Date: 2026-09-17

## Goal

A wiki section, visually consistent with the rest of the site (not a bolted-on
Nextra theme), with admin-only article authoring. "Nextra" in the original
ask refers to its look (sidebar tree of categories → articles) — the actual
implementation is plain Next.js pages + Postgres, not the Nextra package,
since Nextra's file-based `.mdx` model doesn't support in-app editing on
Vercel (read-only filesystem in production).

## Data model (Prisma)

```prisma
model WikiCategory {
  id       String        @id @default(cuid())
  title    String
  slug     String        @unique
  order    Int           @default(0)
  articles WikiArticle[]
}

model WikiArticle {
  id           String       @id @default(cuid())
  title        String
  slug         String       @unique
  content      String       // markdown source (may include the constrained
                             // alignment HTML — see Rendering below)
  categoryId   String
  category     WikiCategory @relation(fields: [categoryId], references: [id])
  order        Int          @default(0)
  published    Boolean      @default(true)
  authorUserId String?
  author       User?        @relation(fields: [authorUserId], references: [id])
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  @@index([categoryId])
}
```

## Routes

- `/wiki` — index: sidebar + either the first published article or a plain
  overview if none exist yet.
- `/wiki/[categorySlug]/[articleSlug]` — article page, same sidebar.
- No separate editor route — authoring lives in `/admin`'s new "Вікі"
  section, matching every other admin-managed content type on this site.

## Rendering

- `react-markdown` + `remark-gfm` (tables, strikethrough, etc.) — new,
  minimal dependencies, no MDX compile step, works identically in the
  server-rendered article page and the client-rendered admin preview.
- `rehype-raw` + `rehype-sanitize` with a custom schema: only `div`/`span`
  tags, only a `style` attribute, only `text-align: left|center|right`
  values pass through. This is what backs the toolbar's alignment buttons
  (wrapping selected text in `<div style="text-align:center">…</div>`) —
  markdown itself has no alignment concept. Nothing else raw-HTML gets
  through, even though the author is always an admin.

## Layout / visual match

Reuses the existing `/leaderboard` two-column pattern (`.lb2-layout`-style:
sticky ~280px sidebar + main content, both dark cards) rather than
introducing a new layout language. Sidebar: category group labels (not
links) with their articles nested under them as links; the current
article's link gets the same gold "active" treatment already used
elsewhere (`.lb2-sort-item.active`, etc.). Article body renders inside a
`.box2`-style dark card, standard site typography/colors.

## Admin editor

- Plain `<textarea>` (markdown source) + a live preview pane beside it
  (same renderer as the public page, so preview matches reality) — not a
  full WYSIWYG library (Tiptap, etc.); keeps the stored format as portable
  plain markdown.
- A toolbar above the textarea inserts markdown at the cursor position:
  **Bold**, *Italic*, H2, H3, bullet list, numbered list, quote, link,
  image upload, align left/center/right. No markdown knowledge required to
  use it.
- Image upload reuses the existing R2 presigned-upload flow built for the
  gallery (`lib/r2.ts`'s `createGalleryUploadTarget` pattern) — a sibling
  `createWikiUploadTarget` keyed under `wiki/` instead of `gallery/`, same
  direct-browser-to-R2 upload (still needed on Vercel: the 4.5MB serverless
  body limit applies here too). The toolbar button uploads, then inserts
  `![alt](url)` at the cursor.
- Category management: create/rename/reorder. Article management:
  create/edit/delete/publish-toggle, assign to a category, set order.

## Server actions (`lib/actions/wiki.ts`)

Public reads (no auth): `getWikiCategories()` (with their published articles,
for the sidebar), `getWikiArticle(categorySlug, articleSlug)`.

Admin-only writes (reusing the `requireAdmin()` pattern from
`lib/actions/gallery.ts`): `createWikiCategory`, `updateWikiCategory`,
`deleteWikiCategory`, `createWikiArticle`, `updateWikiArticle`,
`deleteWikiArticle`, `getWikiUploadTarget` (image upload).

## Nav / footer wiring

- `components/layout/SiteHeader.tsx`'s `NAV_LINKS` array gains
  `{ href: "/wiki", label: "Вікі" }` — already shared by both the desktop
  plate and the mobile menu, so this one line covers both.
- `components/layout/SiteFooter.tsx` gains a matching footer link.

## Out of scope (not requested)

- Article revision history / version control.
- Full-text search.
- Non-admin (e.g. moderator-only) authoring tiers — admin-only, per the ask.
