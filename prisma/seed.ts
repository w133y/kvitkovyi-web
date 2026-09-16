import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.product.createMany({
    data: [
      {
        slug: "sponsor-bronze",
        name: "Бронзовий спонсор",
        description: "Кольоровий нік у чаті, доступ до /kit sponsor, пріоритетний вхід на сервер.",
        category: "SPONSORSHIP",
        priceCents: 9900,
        sortOrder: 1,
      },
      {
        slug: "sponsor-gold",
        name: "Золотий спонсор",
        description: "Усе з Бронзового + додаткові /home, приватний канал в Discord, значок у профілі.",
        category: "SPONSORSHIP",
        priceCents: 24900,
        sortOrder: 2,
      },
      {
        slug: "cosmetic-wings",
        name: "Крила ангела",
        description: "Косметичний ефект крил за персонажем, видимий іншим гравцям.",
        category: "COSMETIC",
        priceCents: 4900,
        sortOrder: 1,
      },
      {
        slug: "cosmetic-trail",
        name: "Слід частинок",
        description: "Різнокольоровий слід частинок під час руху.",
        category: "COSMETIC",
        priceCents: 3900,
        sortOrder: 2,
      },
    ],
    skipDuplicates: true,
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
