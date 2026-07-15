# Backend (matchmaking + signaling + UDP relay)
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# Install workspace deps
COPY pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY server/package.json server/package.json
RUN pnpm install --frozen-lockfile=false

# Copy sources
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY server server

RUN pnpm --filter @crafttogether/server build

EXPOSE 8080/tcp
EXPOSE 19133/udp
ENV PORT=8080 RELAY_PORT=19133
CMD ["node", "server/dist/index.js"]
