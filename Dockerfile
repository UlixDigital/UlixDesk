# syntax=docker/dockerfile:1

# node:sqlite needs Node 22.5 or newer. The node:22 image is that release line.
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN node -e "const [major,minor]=process.versions.node.split('.').map(Number); if (major<22 || (major===22 && minor<5)) { console.error('Node >= 22.5 required, got '+process.versions.node); process.exit(1); }"
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
# pdfkit stays external. Copy its runtime closure so the slim image can
# embed the logo and the standard fonts without Chromium.
RUN node scripts/copy-pdfkit-runtime.mjs /opt/pdfkit-runtime \
  && du -sh /opt/pdfkit-runtime
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

# Prisma's migrate CLI is only needed at startup. Keep it out of the Next standalone tree.
FROM node:22-bookworm-slim AS migrate
WORKDIR /opt/migrate
RUN node -e "const [major,minor]=process.versions.node.split('.').map(Number); if (major<22 || (major===22 && minor<5)) { console.error('Node >= 22.5 required, got '+process.versions.node); process.exit(1); }"
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN npm init -y && npm install --omit=dev --no-package-lock prisma@6.19.3

FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN node -e "const [major,minor]=process.versions.node.split('.').map(Number); if (major<22 || (major===22 && minor<5)) { console.error('Node >= 22.5 required, got '+process.versions.node); process.exit(1); }"
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV CHECKPOINT_DISABLE=1
# Use the engine already copied from the build stage. Otherwise Prisma
# tries to download one on startup and the container hangs without egress.
ENV PRISMA_SCHEMA_ENGINE_BINARY=/app/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/node_modules/@prisma/engines/libquery_engine-debian-openssl-3.0.x.so.node
ENV HOME=/home/nextjs
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs --create-home --home-dir /home/nextjs nextjs
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=build --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build --chown=nextjs:nodejs /app/node_modules/@node-rs ./node_modules/@node-rs
COPY --from=build --chown=nextjs:nodejs /app/node_modules/pg ./node_modules/pg
COPY --from=build --chown=nextjs:nodejs /app/node_modules/pg-connection-string ./node_modules/pg-connection-string
COPY --from=build --chown=nextjs:nodejs /app/node_modules/pg-pool ./node_modules/pg-pool
COPY --from=build --chown=nextjs:nodejs /app/node_modules/pg-protocol ./node_modules/pg-protocol
COPY --from=build --chown=nextjs:nodejs /app/node_modules/pg-types ./node_modules/pg-types
COPY --from=build --chown=nextjs:nodejs /app/node_modules/pgpass ./node_modules/pgpass
COPY --from=build --chown=nextjs:nodejs /app/node_modules/split2 ./node_modules/split2
COPY --from=build --chown=nextjs:nodejs /app/node_modules/postgres-array ./node_modules/postgres-array
COPY --from=build --chown=nextjs:nodejs /app/node_modules/postgres-bytea ./node_modules/postgres-bytea
COPY --from=build --chown=nextjs:nodejs /app/node_modules/postgres-date ./node_modules/postgres-date
COPY --from=build --chown=nextjs:nodejs /app/node_modules/postgres-interval ./node_modules/postgres-interval
COPY --from=build --chown=nextjs:nodejs /app/node_modules/pg-int8 ./node_modules/pg-int8
COPY --from=build --chown=nextjs:nodejs /app/node_modules/xtend ./node_modules/xtend
COPY --from=build --chown=nextjs:nodejs /opt/pdfkit-runtime/ ./node_modules/
COPY --from=migrate --chown=nextjs:nodejs /opt/migrate /opt/migrate
USER nextjs
EXPOSE 3000
CMD ["node", "scripts/docker-entrypoint.mjs"]
