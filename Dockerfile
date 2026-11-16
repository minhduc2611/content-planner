FROM node:22-slim
WORKDIR /app
COPY package*.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run build
ENV PORT=3001
EXPOSE 3001
# Applies pending migrations on every start, then serves app + API
CMD ["sh", "-c", "npx prisma migrate deploy && node server/index.js"]
