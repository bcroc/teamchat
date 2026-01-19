#!/bin/bash
# ============================================
# TeamChat PostgreSQL Restore Script
# ============================================
# Usage: ./restore-db.sh <backup_file>
#
# Environment variables:
#   DATABASE_URL - PostgreSQL connection string (required)
#
# WARNING: This will DROP and recreate the database!

set -euo pipefail

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

# Check arguments
if [ $# -lt 1 ]; then
    log_error "Usage: $0 <backup_file>"
    echo ""
    echo "Available backups:"
    ls -lh ./backups/teamchat_*.sql.gz 2>/dev/null || echo "  No backups found in ./backups/"
    exit 1
fi

BACKUP_FILE="$1"

# Check required environment variables
if [ -z "${DATABASE_URL:-}" ]; then
    log_error "DATABASE_URL environment variable is required"
    exit 1
fi

# Check if backup file exists
if [ ! -f "${BACKUP_FILE}" ]; then
    log_error "Backup file not found: ${BACKUP_FILE}"
    exit 1
fi

# Extract database name from DATABASE_URL
DB_NAME=$(echo "${DATABASE_URL}" | sed -n 's/.*\/\([^?]*\).*/\1/p')

log_warn "WARNING: This will restore the database from backup!"
log_warn "Database: ${DB_NAME}"
log_warn "Backup file: ${BACKUP_FILE}"
log_warn ""
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "${CONFIRM}" != "yes" ]; then
    log_info "Restore cancelled"
    exit 0
fi

log_info "Starting restore from ${BACKUP_FILE}..."

# Perform the restore
if gunzip -c "${BACKUP_FILE}" | psql "${DATABASE_URL}"; then
    log_info "Restore completed successfully!"
else
    log_error "Restore failed!"
    exit 1
fi

log_info "Database restore complete!"
log_info "You may need to restart the application server."
