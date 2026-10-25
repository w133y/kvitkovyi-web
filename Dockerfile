# Self-hosted build (see docker-compose.yml). Prisma needs openssl at both
# build (generate) and run time (migrate deploy, queries).
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# The VPS has 2 GB of RAM (plus swap): cap the heap so the build swaps
# instead of being OOM-killed.
RUN NODE_OPTIONS=--max-old-space-size=1536 npx next build

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build /app ./
EXPOSE 3000
# Pending migrations first, like the old `npm run build` on Vercel did.
CMD ["sh", "-c", "npx prisma migrate deploy && npx next start -p 3000"]
