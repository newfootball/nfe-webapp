# syntax=docker/dockerfile:1.7
# Production image of the TanStack Start app (Refs #64).
# Build context is the repository root: `docker build -f apps/start/Dockerfile .`
# (Coolify: build pack Dockerfile, base directory `/`, Dockerfile `/apps/start/Dockerfile`).
# The root `.dockerignore` restricts the context to the files the build needs.
ARG BUN_VERSION=1.3.14

# ---------------------------------------------------------------------------
# build: install both lockfiles, build the client and SSR bundles, scan the
# client bundle for server-only content.
# ---------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-slim AS build
WORKDIR /repo
ENV NODE_ENV=production

# Root dependencies are needed because Start imports the shared Button and `cn`
# helper from the repository root (Vite resolves their packages from there).
# `--ignore-scripts` skips the root `prisma generate` postinstall.
COPY package.json bun.lock .npmrc ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY apps/start/package.json apps/start/bun.lock ./apps/start/
RUN cd apps/start && bun install --frozen-lockfile --ignore-scripts

COPY tsconfig.json ./
COPY src/lib/utils.ts ./src/lib/utils.ts
COPY components/ui/button.tsx ./components/ui/button.tsx
COPY messages ./messages
COPY app/globals.css ./app/globals.css
COPY public ./public
COPY apps/start ./apps/start

# A value only the build knows: `check:client` fails if a bundler ever inlines
# `process.env` into the client artifacts. Never set a real secret here.
ARG NFE_PRIVATE_BUNDLE_CANARY=nfe-private-bundle-canary-7c1e4b
ENV NFE_PRIVATE_BUNDLE_CANARY=${NFE_PRIVATE_BUNDLE_CANARY}
RUN cd apps/start && bun run build

# ---------------------------------------------------------------------------
# runtime-deps: production dependencies of apps/start only. The SSR bundle
# externalizes its packages, so they must exist next to `dist/` at runtime.
# ---------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-slim AS runtime-deps
WORKDIR /app
COPY apps/start/package.json apps/start/bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts

# ---------------------------------------------------------------------------
# runtime: alpine + ffmpeg (media processing spawns ffmpeg/ffprobe) + curl for
# the container health check. Runs as the unprivileged `bun` user. No source,
# no lockfile for the root app, no env file: configuration comes from the
# environment at run time (see docs/migration/start-production.md).
# ---------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-alpine AS runtime
RUN apk add --no-cache ffmpeg curl ca-certificates
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

COPY --chown=bun:bun apps/start/package.json ./package.json
COPY --from=runtime-deps --chown=bun:bun /app/node_modules ./node_modules
COPY --from=build --chown=bun:bun /repo/apps/start/dist ./dist
COPY --chown=bun:bun apps/start/server ./server

USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["bun", "server/production.ts"]
