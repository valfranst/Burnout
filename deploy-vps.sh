#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# deploy-vps.sh - Script de deploy para a VPS (rodar diretamente no servidor)
#
# Uso:
#   chmod +x deploy-vps.sh
#   ./deploy-vps.sh
#
# O script cria a pasta /opt/burnout, gera docker-compose.yml e .env,
# puxa a imagem mais recente e sobe os containers.
###############################################################################

APP_DIR="/opt/burnout"
COMPOSE_FILE="${APP_DIR}/docker-compose.yml"
ENV_FILE="${APP_DIR}/.env"

echo "==> Criando diretório ${APP_DIR}..."
sudo mkdir -p "${APP_DIR}"
sudo chown "$(whoami)":"$(whoami)" "${APP_DIR}"

# ─── docker-compose.yml ─────────────────────────────────────────────────────
echo "==> Gerando ${COMPOSE_FILE}..."
cat > "${COMPOSE_FILE}" <<'EOF'
services:
  postgresql:
    image: pgvector/pgvector:pg17
    container_name: postgres-vector
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    healthcheck:
      test:
        - CMD-SHELL
        - pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - backend

  burnout-app:
    image: valfranleao/burnout_app_0.4:latest
    container_name: burnout-app
    environment:
      NODE_ENV: production
      TF_ENABLE_ONEDNN_OPTS: "0"
      PORT: 3000
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgresql:5432/${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
      DATABASE_SSL: "false"
      SESSION_SECRET: ${SESSION_SECRET}
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET}
      GOOGLE_CALLBACK_URL: ${GOOGLE_CALLBACK_URL}
    restart: unless-stopped
    ports:
      - "127.0.0.1:8000:3000"
    depends_on:
      postgresql:
        condition: service_healthy
    volumes:
      - model_cache:/app/.model_cache
    networks:
      - backend

networks:
  backend:

volumes:
  postgres_data:
  model_cache:
EOF

# ─── .env ────────────────────────────────────────────────────────────────────
if [ -f "${ENV_FILE}" ]; then
  echo "==> ${ENV_FILE} já existe — mantendo credenciais atuais."
  echo "    Para recriar, remova o arquivo manualmente e rode o script novamente."
else
  echo "==> Gerando ${ENV_FILE} com credenciais seguras..."
  DB_PASS="$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 24)"
  SESSION_SEC="$(openssl rand -hex 32)"
  cat > "${ENV_FILE}" <<ENVEOF
POSTGRES_DB=eng_ia_aplicada
POSTGRES_USER=burnout_user
POSTGRES_PASSWORD=${DB_PASS}
DATABASE_URL=postgres://burnout_user:${DB_PASS}@postgresql:5432/eng_ia_aplicada
SESSION_SECRET=${SESSION_SEC}
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=
ENVEOF

  chmod 600 "${ENV_FILE}"
  echo ""
  echo "  ⚠  IMPORTANTE: Edite ${ENV_FILE} e preencha as variáveis do Google OAuth."
  echo "     Depois rode este script novamente para aplicar."
  echo ""
fi

# ─── Deploy ──────────────────────────────────────────────────────────────────
cd "${APP_DIR}"

echo "==> Puxando imagem mais recente..."
docker pull valfranleao/burnout_app_0.4:latest

echo "==> Subindo containers..."
docker compose --env-file "${ENV_FILE}" up -d

echo ""
echo "==> Deploy concluído!"
echo "    Postgres : 127.0.0.1:5432"
echo "    App      : 127.0.0.1:8000"
echo ""
echo "    Logs     : docker compose -f ${COMPOSE_FILE} logs -f"
echo "    Parar    : docker compose -f ${COMPOSE_FILE} down"
echo "    Restart  : docker compose -f ${COMPOSE_FILE} restart"
