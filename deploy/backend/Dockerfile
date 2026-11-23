FROM node:22-alpine

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY server/src ./server/src
COPY server/sql ./server/sql
RUN mkdir -p server/uploads/workshops server/uploads/vehicles server/logs \
  && chown -R node:node /app/server

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=350
USER node
EXPOSE 4000
CMD ["node", "server/src/index.js"]
