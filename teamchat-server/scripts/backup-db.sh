#!/bin/bash
# ============================================
# TeamChat PostgreSQL Backup Script
# ============================================
# Usage: ./backup-db.sh [backup_dir]
#
# Environment variables:
#   DATABASE_URL - PostgreSQL connection string (required)
#   BACKUP_RETENTION_DAYS - Number of days to keep backups (default: 30)

set -euo pipefail

# Configuration
BACKUP_DIR="${1:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/teamchat_${TIMESTAMP}.sql.gz"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check required environment variables
if [ -z "${DATABASE_URL:-}" ]; then
    log_error "DATABASE_URL environment variable is required"
    exit 1
fi

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"

log_info "Starting backup at ${TIMESTAMP}"
log_info "Backup destination: ${BACKUP_FILE}"

# Perform the backup
if pg_dump "${DATABASE_URL}" | gzip > "${BACKUP_FILE}"; then
    BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
    log_info "Backup completed successfully (${BACKUP_SIZE})"
else
    log_error "Backup failed!"
    rm -f "${BACKUP_FILE}"
    exit 1
fi

# Clean up old backups
log_info "Cleaning up backups older than ${RETENTION_DAYS} days..."
DELETED_COUNT=$(find "${BACKUP_DIR}" -name "teamchat_*.sql.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
if [ "${DELETED_COUNT}" -gt 0 ]; then
    log_info "Deleted ${DELETED_COUNT} old backup(s)"
fi

# List recent backups
log_info "Recent backups:"
ls -lh "${BACKUP_DIR}"/teamchat_*.sql.gz 2>/dev/null | tail -5 || log_warn "No backups found"

log_info "Backup complete!"
