CREATE TABLE "SiteSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "disabledPages" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);
