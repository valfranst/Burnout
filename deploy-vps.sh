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
    networks:
      - backend

networks:
  backend:

volumes:
  postgres_data:
EOF

# ─── .env ────────────────────────────────────────────────────────────────────
echo "==> Gerando ${ENV_FILE}..."
cat > "${ENV_FILE}" <<'EOF'
POSTGRES_DB=your_database_name
POSTGRES_USER=your_db_user
POSTGRES_PASSWORD=your_db_password
DATABASE_URL=postgres://your_db_user:your_db_password@postgresql:5432/your_database_name
SESSION_SECRET=generate_a_long_random_string_here
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=https://your_domain/auth/google/callback
EOF

chmod 600 "${ENV_FILE}"

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
