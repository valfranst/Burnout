#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# db-backup-restore.sh - Backup e Restore do PostgreSQL (container Docker)
#
# Uso:
#   ./db-backup-restore.sh backup              # Backup completo
#   ./db-backup-restore.sh restore <arquivo>    # Restore a partir de um arquivo
#   ./db-backup-restore.sh list                 # Listar backups disponíveis
#
# Rodar na VPS onde os containers estão rodando.
###############################################################################

APP_DIR="/opt/burnout"
ENV_FILE="${APP_DIR}/.env"
BACKUP_DIR="/opt/backups"
CONTAINER="postgres-vector"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Carregar variáveis do .env
if [[ -f "${ENV_FILE}" ]]; then
  set -a
  source "${ENV_FILE}"
  set +a
else
  echo "ERRO: Arquivo .env não encontrado em ${ENV_FILE}"
  exit 1
fi

DB_USER="${POSTGRES_USER:-eng_01}"
DB_NAME="${POSTGRES_DB:-eng_ia_aplicada}"

mkdir -p "${BACKUP_DIR}"

# ─── Funções ─────────────────────────────────────────────────────────────────

backup() {
  local BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

  echo "==> Verificando container ${CONTAINER}..."
  if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "ERRO: Container '${CONTAINER}' não está rodando."
    echo "      Containers ativos:"
    docker ps --format '  {{.Names}} ({{.Image}})'
    exit 1
  fi

  echo "==> Fazendo backup do banco '${DB_NAME}'..."
  echo "    Usuário : ${DB_USER}"
  echo "    Destino : ${BACKUP_FILE}"
  echo ""

  docker exec -t "${CONTAINER}" \
    pg_dump -U "${DB_USER}" -d "${DB_NAME}" \
      --no-owner --no-privileges --clean --if-exists \
    | gzip > "${BACKUP_FILE}"

  local SIZE
  SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
  echo ""
  echo "==> Backup concluído! (${SIZE})"
  echo "    Arquivo: ${BACKUP_FILE}"

  # Manter apenas os últimos 10 backups
  local COUNT
  COUNT=$(ls -1 "${BACKUP_DIR}"/*.sql.gz 2>/dev/null | wc -l)
  if (( COUNT > 10 )); then
    echo "==> Removendo backups antigos (mantendo últimos 10)..."
    ls -1t "${BACKUP_DIR}"/*.sql.gz | tail -n +11 | xargs rm -f
  fi
}

restore() {
  local BACKUP_FILE="$1"

  # Se passou só o nome do arquivo, tentar no BACKUP_DIR
  if [[ ! -f "${BACKUP_FILE}" ]]; then
    if [[ -f "${BACKUP_DIR}/${BACKUP_FILE}" ]]; then
      BACKUP_FILE="${BACKUP_DIR}/${BACKUP_FILE}"
    else
      echo "ERRO: Arquivo de backup não encontrado: ${BACKUP_FILE}"
      echo "      Use './db-backup-restore.sh list' para ver os backups."
      exit 1
    fi
  fi

  echo "==> Verificando container ${CONTAINER}..."
  if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "ERRO: Container '${CONTAINER}' não está rodando."
    exit 1
  fi

  echo ""
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║  ATENÇÃO: O restore vai SUBSTITUIR todos os dados   ║"
  echo "║  do banco '${DB_NAME}'!                             ║"
  echo "╚══════════════════════════════════════════════════════╝"
  echo ""
  echo "  Arquivo: ${BACKUP_FILE}"
  echo ""
  read -rp "  Continuar? (s/N): " CONFIRM
  if [[ "${CONFIRM}" != "s" && "${CONFIRM}" != "S" ]]; then
    echo "  Cancelado."
    exit 0
  fi

  echo ""
  echo "==> Parando container burnout-app para evitar conflitos..."
  docker stop burnout-app 2>/dev/null || true

  echo "==> Restaurando banco '${DB_NAME}' a partir do backup..."

  if [[ "${BACKUP_FILE}" == *.gz ]]; then
    gunzip -c "${BACKUP_FILE}" | docker exec -i "${CONTAINER}" \
      psql -U "${DB_USER}" -d "${DB_NAME}" --single-transaction -q
  else
    docker exec -i "${CONTAINER}" \
      psql -U "${DB_USER}" -d "${DB_NAME}" --single-transaction -q < "${BACKUP_FILE}"
  fi

  echo "==> Reiniciando container burnout-app..."
  docker start burnout-app

  echo ""
  echo "==> Restore concluído com sucesso!"
}

list_backups() {
  echo "==> Backups disponíveis em ${BACKUP_DIR}:"
  echo ""
  if ls -1 "${BACKUP_DIR}"/*.sql.gz 2>/dev/null | head -1 > /dev/null 2>&1; then
    ls -lht "${BACKUP_DIR}"/*.sql.gz | awk '{printf "  %-8s %s %s %s  %s\n", $5, $6, $7, $8, $9}'
  else
    echo "  Nenhum backup encontrado."
  fi
}

# ─── Main ────────────────────────────────────────────────────────────────────

usage() {
  echo "Uso: $0 {backup|restore <arquivo>|list}"
  echo ""
  echo "  backup              Gera um backup completo (.sql.gz)"
  echo "  restore <arquivo>   Restaura o banco a partir de um backup"
  echo "  list                Lista os backups disponíveis"
  echo ""
  echo "Exemplos:"
  echo "  $0 backup"
  echo "  $0 list"
  echo "  $0 restore eng_ia_aplicada_20260225_143000.sql.gz"
  echo "  $0 restore /opt/burnout/backups/eng_ia_aplicada_20260225_143000.sql.gz"
}

case "${1:-}" in
  backup)
    backup
    ;;
  restore)
    if [[ -z "${2:-}" ]]; then
      echo "ERRO: Informe o arquivo de backup."
      echo ""
      usage
      exit 1
    fi
    restore "$2"
    ;;
  list)
    list_backups
    ;;
  *)
    usage
    exit 1
    ;;
esac
