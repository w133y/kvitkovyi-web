-- CreateTable
CREATE TABLE "Season" (
    "number" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Season_pkey" PRIMARY KEY ("number")
);

-- CreateTable
CREATE TABLE "SeasonPlayerStats" (
    "season" INTEGER NOT NULL,
    "uuid" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "totalMinutes" INTEGER NOT NULL,
    "playerKills" INTEGER NOT NULL,
    "deaths" INTEGER NOT NULL,
    "walkKm" DOUBLE PRECISION NOT NULL,
    "sprintKm" DOUBLE PRECISION NOT NULL,
    "swimKm" DOUBLE PRECISION NOT NULL,
    "aviateKm" DOUBLE PRECISION NOT NULL,
    "votes" INTEGER NOT NULL,
    "lastSeen" BIGINT,
    "raw" JSONB NOT NULL,

    CONSTRAINT "SeasonPlayerStats_pkey" PRIMARY KEY ("season","uuid")
);

-- CreateTable
CREATE TABLE "SeasonRewards" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "minHours" INTEGER NOT NULL DEFAULT 10,
    "playerLabel" TEXT NOT NULL DEFAULT 'Гравець',
    "playerIcon" TEXT NOT NULL DEFAULT '🌸',
    "playerColor" TEXT NOT NULL DEFAULT '#3ecf6e',
    "topCount" INTEGER NOT NULL DEFAULT 10,
    "topLabel" TEXT NOT NULL DEFAULT 'Топ-10',
    "topIcon" TEXT NOT NULL DEFAULT '🏅',
    "topColor" TEXT NOT NULL DEFAULT '#5B9BFF',
    "podiumCount" INTEGER NOT NULL DEFAULT 3,
    "podiumLabel" TEXT NOT NULL DEFAULT 'Топ-3',
    "podiumIcon" TEXT NOT NULL DEFAULT '🏆',
    "podiumColor" TEXT NOT NULL DEFAULT '#FFAA00',

    CONSTRAINT "SeasonRewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuggestionVote" (
    "messageId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "up" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuggestionVote_pkey" PRIMARY KEY ("messageId","discordUserId")
);

-- CreateIndex
CREATE INDEX "SeasonPlayerStats_season_nickname_idx" ON "SeasonPlayerStats"("season", "nickname");


-- Season 4 (the one running when this shipped) started on 30.08.2026, Kyiv time.
INSERT INTO "Season" ("number", "startedAt")
SELECT "currentSeason", TIMESTAMP '2026-08-29 21:00:00' FROM "GallerySettings" WHERE id = 'default'
ON CONFLICT DO NOTHING;
