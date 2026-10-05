"use server";

import crypto from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createCosmeticUploadTarget, uploadR2Object, getPublicUrl, type UploadTarget } from "@/lib/r2";
import { cosmeticAssetUrl, nthTexture } from "@/lib/cosmetics/asset-url";
import { parseNexoPack, withSelfDrop } from "@/lib/cosmetics/nexo-pack";
import { suggestCosmeticNameAndType } from "@/lib/cosmetics/translate";
import { publishCosmeticToServer } from "@/lib/cosmetics/publish";
import { COSMETIC_ITEM_ID_RE } from "@/lib/cosmetics/grant";
import { revalidatePath } from "next/cache";
import type { CosmeticType, Prisma } from "@prisma/client";

const COSMETIC_TYPES: CosmeticType[] = ["HAT", "BACKPACK", "BALLOON", "FURNITURE"];

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    throw new Error("Доступ заборонено");
  }
  return session;
}

// Every cosmetics admin action re-checks this inline (not a shared
// middleware) — same per-action pattern as lib/actions/donate-privileges.ts,
// since a Server Action is independently invocable regardless of which page
// rendered the button that calls it.
export async function createCosmeticUploadUrl(contentType: string): Promise<UploadTarget> {
  await requireAdmin();
  return createCosmeticUploadTarget(contentType);
}

type StageResult = { staged: number } | { error: string };

// Parses an uploaded pack zip (already in R2 — see createCosmeticUploadUrl)
// into DRAFT CosmeticItem rows for the admin to review. Never publishes
// anything to the live server on its own.
export async function stageUploadedPack(packKey: string, sourcePackName: string): Promise<StageResult> {
  await requireAdmin();

  let zipBuffer: Buffer;
  try {
    const res = await fetch(getPublicUrl(packKey));
    if (!res.ok) return { error: "Не вдалося завантажити пак" };
    zipBuffer = Buffer.from(await res.arrayBuffer());
  } catch {
    return { error: "Не вдалося завантажити пак" };
  }

  let models;
  try {
    models = parseNexoPack(zipBuffer);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Не вдалося розпакувати пак" };
  }
  if (models.length === 0) {
    return { error: "У паку не знайдено жодної сумісної моделі (JSON + текстура)" };
  }

  // In parallel batches — one at a time (a translation call + several R2
  // uploads each) a 141-model pack outran the function's time limit.
  const STAGE_CONCURRENCY = 8;
  let staged = 0;
  for (let i = 0; i < models.length; i += STAGE_CONCURRENCY) {
    await Promise.all(
      models.slice(i, i + STAGE_CONCURRENCY).map(async (model) => {
        const suggestion = await suggestCosmeticNameAndType(model.displayName ?? model.suggestedId.replace(/_/g, " "));
        const uid = crypto.randomBytes(4).toString("hex");
        const modelKey = `cosmetics/${model.suggestedId}-${uid}/model.json`;
        const textureKey = `cosmetics/${model.suggestedId}-${uid}/texture.png`;
        await uploadR2Object(modelKey, JSON.stringify(model.modelJson), "application/json");
        for (const [n, texture] of model.textures.entries()) {
          await uploadR2Object(nthTexture(textureKey, n), texture.png, "image/png");
          if (texture.mcmeta) await uploadR2Object(`${nthTexture(textureKey, n)}.mcmeta`, texture.mcmeta, "application/json");
        }

        const nexoItemId = `${model.suggestedId}_${uid}`;
        await createDraft({
          nexoItemId,
          name: suggestion.name,
          // A pack config with furniture Mechanics settles the type outright.
          type: model.mechanics ? "FURNITURE" : suggestion.type,
          sourceMechanics: model.mechanics ? withSelfDrop(model.mechanics, nexoItemId) : undefined,
          modelKey,
          textureKey,
          sourcePackName,
        });
        staged++;
      })
    );
  }

  revalidatePath("/admin/cosmetics");
  return { staged };
}

export type StageSingleModelInput = {
  name: string;
  type: CosmeticType;
  colorCustomizable: boolean;
  modelKey: string;
  textureKey: string;
};

export async function stageSingleModel(input: StageSingleModelInput): Promise<{ id: string } | { error: string }> {
  await requireAdmin();
  if (!input.name.trim()) return { error: "Вкажіть назву" };
  if (!COSMETIC_TYPES.includes(input.type)) return { error: "Некоректний тип" };

  const uid = crypto.randomBytes(4).toString("hex");
  const item = await createDraft({
    nexoItemId: `custom_${uid}`,
    name: input.name.trim(),
    type: input.type,
    colorCustomizable: input.colorCustomizable,
    modelKey: input.modelKey,
    textureKey: input.textureKey,
    sourcePackName: null,
  });

  revalidatePath("/admin/cosmetics");
  return { id: item.id };
}

async function createDraft(params: {
  nexoItemId: string;
  name: string;
  type: CosmeticType;
  colorCustomizable?: boolean;
  modelKey: string;
  textureKey: string;
  sourcePackName: string | null;
  sourceMechanics?: { furniture: Record<string, unknown> };
}) {
  const defaultPriceFlowers = params.type === "FURNITURE" ? 1 : 10;
  const slug = `cosmetic-${params.nexoItemId}`;

  const product = await prisma.product.create({
    data: {
      slug,
      name: params.name,
      description: "",
      category: "COSMETIC",
      active: false,
      cosmeticItem: {
        create: {
          type: params.type,
          status: "DRAFT",
          nexoItemId: params.nexoItemId,
          colorCustomizable: params.colorCustomizable ?? false,
          modelKey: params.modelKey,
          textureKey: params.textureKey,
          sourcePackName: params.sourcePackName,
          sourceMechanics: params.sourceMechanics as Prisma.InputJsonValue | undefined,
          priceFlowers: defaultPriceFlowers,
        },
      },
    },
    include: { cosmeticItem: true },
  });

  return product.cosmeticItem!;
}

// R2_PUBLIC_URL isn't a NEXT_PUBLIC_ env var, so it's only readable
// server-side — these resolve modelKey/textureKey into fetchable URLs here
// rather than making the (client) admin UI try to reconstruct them itself.
function withAssetUrls<T extends { modelKey: string; textureKey: string }>(item: T) {
  return { ...item, modelUrl: cosmeticAssetUrl(item.modelKey), textureUrl: cosmeticAssetUrl(item.textureKey) };
}

export async function listCosmeticDrafts() {
  await requireAdmin();
  const items = await prisma.cosmeticItem.findMany({
    where: { status: "DRAFT" },
    include: { product: true },
    orderBy: { createdAt: "desc" },
  });
  return items.map(withAssetUrls);
}

export async function listPublishedCosmetics() {
  await requireAdmin();
  const items = await prisma.cosmeticItem.findMany({
    where: { status: "PUBLISHED" },
    include: { product: true },
    orderBy: { createdAt: "desc" },
  });
  return items.map(withAssetUrls);
}

// Just the ids the bulk-bake tool needs to walk through — not the full
// listPublishedCosmetics() row (name, price, etc.), since with hundreds of
// items that's a lot of otherwise-unused data for a tool that only ever
// mounts one hidden viewer at a time.
export async function listCosmeticIdsMissingThumbnail(): Promise<
  { id: string; modelUrl: string; textureUrl: string }[]
> {
  await requireAdmin();
  const items = await prisma.cosmeticItem.findMany({
    where: { status: "PUBLISHED", thumbnailUrl: null },
    select: { id: true, modelKey: true, textureKey: true },
  });
  return items.map((item) => ({
    id: item.id,
    modelUrl: cosmeticAssetUrl(item.modelKey),
    textureUrl: cosmeticAssetUrl(item.textureKey),
  }));
}

export async function setCosmeticThumbnail(id: string, thumbnailUrl: string): Promise<void> {
  await requireAdmin();
  await prisma.cosmeticItem.update({ where: { id }, data: { thumbnailUrl } });
  revalidatePath("/admin");
  revalidatePath("/shop/cosmetics");
}

export type UpdateCosmeticFields = {
  name?: string;
  type?: CosmeticType;
  priceFlowers?: number;
  colorCustomizable?: boolean;
  nexoItemId?: string;
  hmcCosmeticId?: string | null;
};

export async function updateCosmeticDraft(id: string, fields: UpdateCosmeticFields): Promise<{ ok: true } | { error: string }> {
  await requireAdmin();
  const item = await prisma.cosmeticItem.findUnique({ where: { id } });
  if (!item || item.status !== "DRAFT") return { error: "Чернетку не знайдено" };

  if (fields.nexoItemId !== undefined && !COSMETIC_ITEM_ID_RE.test(fields.nexoItemId)) {
    return { error: "id має містити лише малі латинські літери, цифри та _" };
  }
  if (fields.priceFlowers !== undefined && (!Number.isFinite(fields.priceFlowers) || fields.priceFlowers < 0)) {
    return { error: "Некоректна ціна" };
  }

  await prisma.cosmeticItem.update({
    where: { id },
    data: {
      type: fields.type,
      priceFlowers: fields.priceFlowers,
      colorCustomizable: fields.colorCustomizable,
      nexoItemId: fields.nexoItemId,
      hmcCosmeticId: fields.hmcCosmeticId,
      ...(fields.name !== undefined ? { product: { update: { name: fields.name } } } : {}),
    },
  });

  revalidatePath("/admin/cosmetics");
  return { ok: true };
}

export async function deleteCosmeticDraft(id: string): Promise<void> {
  await requireAdmin();
  const item = await prisma.cosmeticItem.findUnique({ where: { id } });
  if (!item || item.status !== "DRAFT") return;
  // Cascades to CosmeticItem via the Product relation's onDelete: Cascade.
  await prisma.product.delete({ where: { id: item.productId } });
  revalidatePath("/admin/cosmetics");
}

export async function publishCosmeticItem(id: string): Promise<{ ok: true } | { error: string }> {
  await requireAdmin();
  const item = await prisma.cosmeticItem.findUnique({ where: { id }, include: { product: true } });
  if (!item) return { error: "Косметику не знайдено" };

  try {
    await publishCosmeticToServer({
      nexoItemId: item.nexoItemId,
      hmcCosmeticId: item.hmcCosmeticId,
      type: item.type,
      name: item.product.name,
      colorCustomizable: item.colorCustomizable,
      modelKey: item.modelKey,
      textureKey: item.textureKey,
      sourceMechanics: item.sourceMechanics,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Не вдалося опублікувати на сервері" };
  }

  await prisma.$transaction([
    prisma.cosmeticItem.update({ where: { id }, data: { status: "PUBLISHED" } }),
    prisma.product.update({ where: { id: item.productId }, data: { active: true } }),
  ]);

  revalidatePath("/admin/cosmetics");
  revalidatePath("/shop/cosmetics");
  return { ok: true };
}

// Edits an already-live item — re-publishes (re-pushes files + reload)
// only when the model/texture/color actually changed, not on every price
// tweak.
export async function updatePublishedCosmeticItem(
  id: string,
  fields: UpdateCosmeticFields & { modelKey?: string; textureKey?: string }
): Promise<{ ok: true } | { error: string }> {
  await requireAdmin();
  const item = await prisma.cosmeticItem.findUnique({ where: { id }, include: { product: true } });
  if (!item || item.status !== "PUBLISHED") return { error: "Косметику не знайдено" };

  const needsRepublish =
    (fields.modelKey && fields.modelKey !== item.modelKey) ||
    (fields.textureKey && fields.textureKey !== item.textureKey) ||
    (fields.colorCustomizable !== undefined && fields.colorCustomizable !== item.colorCustomizable);

  if (fields.priceFlowers !== undefined && (!Number.isFinite(fields.priceFlowers) || fields.priceFlowers < 0)) {
    return { error: "Некоректна ціна" };
  }

  await prisma.cosmeticItem.update({
    where: { id },
    data: {
      priceFlowers: fields.priceFlowers,
      colorCustomizable: fields.colorCustomizable,
      modelKey: fields.modelKey,
      textureKey: fields.textureKey,
      ...(fields.name !== undefined ? { product: { update: { name: fields.name } } } : {}),
    },
  });

  if (needsRepublish) {
    const updated = await prisma.cosmeticItem.findUniqueOrThrow({ where: { id }, include: { product: true } });
    try {
      await publishCosmeticToServer({
        nexoItemId: updated.nexoItemId,
        hmcCosmeticId: updated.hmcCosmeticId,
        type: updated.type,
        name: updated.product.name,
        colorCustomizable: updated.colorCustomizable,
        modelKey: updated.modelKey,
        textureKey: updated.textureKey,
      });
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Оновлено в базі, але не вдалося опублікувати на сервері" };
    }
  }

  revalidatePath("/admin/cosmetics");
  revalidatePath("/shop/cosmetics");
  return { ok: true };
}
