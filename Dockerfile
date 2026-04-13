# ── Build stage ──────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl openssl-dev

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src/

RUN npm run build

# ── Production stage ─────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install OpenSSL for Prisma runtime
RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install --omit=dev && npm cache clean --force

RUN npx prisma generate

COPY --from=builder /app/dist ./dist/

EXPOSE 3001

CMD ["node", "dist/server.js"]
