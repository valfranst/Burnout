# ESTÁGIO 1: Build (instalação e compilação de módulos nativos)
FROM node:22-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia apenas os arquivos de dependências primeiro (otimiza cache do Docker)
COPY package*.json ./

# Instala todas as dependências (incluindo dev necessárias para compilação nativa)
RUN npm ci

# Copia o restante do código
COPY . .

# Remove dependências de desenvolvimento para a imagem final ficar enxuta
RUN npm prune --production

# ESTÁGIO 2: Runtime (imagem final mínima)
FROM node:22-slim

# Instala tini para tratamento correto de sinais (PID 1) e curl para healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Cria usuário não-root para segurança
RUN groupadd -r appuser && useradd -r -g appuser -d /app -s /sbin/nologin appuser

WORKDIR /app

# Copia apenas o necessário do estágio de build
COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appuser /app/package.json ./package.json
COPY --from=builder --chown=appuser:appuser /app/src ./src
COPY --from=builder --chown=appuser:appuser /app/public ./public

# Roda como usuário não-root
USER appuser

EXPOSE 3000

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

# Usa tini como init para forward de sinais correto
ENTRYPOINT ["tini", "--"]
CMD ["node", "src/index.js"]
