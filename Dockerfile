# syntax=docker/dockerfile:1.7

###############################################################################
# QuizPlatform — one Dockerfile, two runtimes.
#
#   docker build --target api -t quiz-api .
#   docker build --target web \
#     --build-arg API_INTERNAL_URL=http://quiz-api:3001 -t quiz-web .
#
# The build stage installs the whole workspace with Bun (the packages ship
# TypeScript source, so nothing is pre-compiled); the runtime stages use Node,
# which is what both apps are actually started with.
#
# Note on API_INTERNAL_URL: Next bakes `rewrites()` into the build, so the web
# app's proxy target is fixed at image build time. Pass it as a build arg (and
# keep the runtime variable in sync for the health screen to report it).
###############################################################################

# --------------------------------------------------------------------------- #
# 1. Dependencies — cached on the manifests alone
# --------------------------------------------------------------------------- #
FROM oven/bun:1 AS deps
WORKDIR /app

COPY package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/test-utils/package.json packages/test-utils/

# No lockfile is committed (see .gitignore), so this resolves the ranges in the
# manifests. Pin the image tag for reproducible builds.
RUN bun install

# --------------------------------------------------------------------------- #
# 2. Build — typecheck the API, compile the web app
# --------------------------------------------------------------------------- #
FROM deps AS build
WORKDIR /app

COPY . .

ARG API_INTERNAL_URL="http://localhost:3001"
ENV API_INTERNAL_URL=$API_INTERNAL_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN bun run build

# --------------------------------------------------------------------------- #
# 3a. API runtime
# --------------------------------------------------------------------------- #
FROM node:22-alpine AS api
WORKDIR /app

ENV NODE_ENV=production
ENV API_PORT=3001

RUN addgroup -S app && adduser -S app -G app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api ./apps/api

USER app
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/health || exit 1

# tsx runs the TypeScript sources directly, exactly like `bun run start` locally.
CMD ["node", "--import", "tsx", "apps/api/src/index.ts"]

# --------------------------------------------------------------------------- #
# 3b. Web runtime
# --------------------------------------------------------------------------- #
FROM node:22-alpine AS web
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -S app && adduser -S app -G app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/web ./apps/web

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/login || exit 1

WORKDIR /app/apps/web
CMD ["node", "node_modules/next/dist/bin/next", "start", "--port", "3000", "--hostname", "0.0.0.0"]
