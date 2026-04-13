FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY openapi.json ./

# Create cache directory and non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
 && mkdir -p cache && chown appuser:appgroup cache

USER appuser

# Cloud Run injects PORT at runtime (default 8080)
EXPOSE 8080

CMD ["node", "src/server.js"]
