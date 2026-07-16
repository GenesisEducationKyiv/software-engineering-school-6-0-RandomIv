# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM deps AS build
ARG PRISMA_GENERATE_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/github_notifier
COPY tsconfig.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY proto ./proto
COPY public ./public
COPY src ./src
RUN DATABASE_URL=$PRISMA_GENERATE_DATABASE_URL npm run db:generate && npm run build

FROM base AS production-deps
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

FROM base AS runtime
ENV NODE_ENV=production

COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/proto ./proto
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY package.json package-lock.json ./

EXPOSE 3000
EXPOSE 50051

CMD ["sh", "-c", "npm run db:migrate:deploy && node dist/index.js"]
