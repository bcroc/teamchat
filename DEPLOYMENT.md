# TeamChat Deployment Guide

This guide covers deploying TeamChat for production use within your company.

## Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- Docker and Docker Compose
- PostgreSQL 16+
- Redis 7+
- (Optional) TURN server for WebRTC (coturn recommended)

## Quick Start

### 1. Generate Secrets

```bash
# Generate JWT secret (required, minimum 32 characters)
openssl rand -base64 32

# Generate PostgreSQL password
openssl rand -base64 24

# Generate Redis password
openssl rand -base64 24
```

### 2. Configure Environment

Copy the production environment template:

```bash
cd teamchat-server
cp .env.production.example .env.production
```

Edit `.env.production` with your values:

```env
JWT_SECRET=<your-generated-jwt-secret>
POSTGRES_PASSWORD=<your-postgres-password>
REDIS_PASSWORD=<your-redis-password>
CORS_ORIGIN=https://teamchat.yourcompany.com
```

### 3. Deploy with Docker Compose

```bash
# Start all services
docker-compose -f docker-compose.production.yml up -d

# Check service health
docker-compose -f docker-compose.production.yml ps

# View logs
docker-compose -f docker-compose.production.yml logs -f server
```

### 4. Initialize Database

```bash
# Run database migrations
docker-compose -f docker-compose.production.yml exec server pnpm db:push
```

## Server Configuration

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `JWT_SECRET` | Token signing secret (min 32 chars) | `openssl rand -base64 32` |
| `POSTGRES_PASSWORD` | Database password | `openssl rand -base64 24` |
| `REDIS_PASSWORD` | Cache password | `openssl rand -base64 24` |
| `CORS_ORIGIN` | Allowed client origins | `https://app.company.com` |

### Optional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | API server port |
| `RATE_LIMIT_MAX` | 100 | Max requests per minute |
| `MAX_FILE_SIZE` | 10485760 | Max upload size (bytes) |
| `TURN_URLS` | - | TURN server for WebRTC |
| `TURN_USERNAME` | - | TURN credentials |
| `TURN_CREDENTIAL` | - | TURN credentials |

## Database Backups

### Manual Backup

```bash
# Create a backup
./scripts/backup-db.sh ./backups

# Or using Docker
docker-compose -f docker-compose.production.yml --profile backup up backup
```

### Restore from Backup

```bash
# List available backups
ls -la ./backups/

# Restore specific backup
./scripts/restore-db.sh ./backups/teamchat_20240115_120000.sql.gz
```

### Automated Backups (Cron)

Add to crontab for daily backups:

```bash
# Daily backup at 2 AM
0 2 * * * cd /path/to/teamchat-server && ./scripts/backup-db.sh ./backups >> /var/log/teamchat-backup.log 2>&1
```

## Desktop Client

### Building for Distribution

```bash
cd teamchat-client

# Install dependencies
pnpm install

# Configure environment
cp app/.env.example app/.env
# Edit app/.env with your API URL

# Build for macOS
pnpm build:mac

# Build for Windows
pnpm build:win

# Build for Linux
pnpm build:linux
```

### Code Signing

#### macOS

1. Obtain an Apple Developer ID certificate
2. Set environment variables:
   ```bash
   export APPLE_ID="your-apple-id@example.com"
   export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
   export APPLE_TEAM_ID="XXXXXXXXXX"
   ```
3. Update `app/package.json`:
   ```json
   "mac": {
     "notarize": true
   }
   ```

#### Windows

1. Obtain an EV code signing certificate
2. Set environment variables:
   ```bash
   export CSC_LINK="/path/to/certificate.pfx"
   export CSC_KEY_PASSWORD="certificate-password"
   ```

### Auto-Updates

Configure the publish settings in `app/package.json`:

```json
"publish": {
  "provider": "github",
  "owner": "your-org",
  "repo": "teamchat-releases"
}
```

Or for S3:

```json
"publish": {
  "provider": "s3",
  "bucket": "your-update-bucket",
  "region": "us-east-1"
}
```

## WebRTC / Video Calls

For reliable video calls behind corporate firewalls, deploy a TURN server:

### Using Coturn

```bash
# Install coturn
apt-get install coturn

# Configure /etc/turnserver.conf
listening-port=3478
tls-listening-port=5349
realm=turn.yourcompany.com
server-name=turn.yourcompany.com
lt-cred-mech
user=teamchat:secure-password
```

### Configure TeamChat

```env
TURN_URLS=turn:turn.yourcompany.com:3478
TURN_USERNAME=teamchat
TURN_CREDENTIAL=secure-password
```

## Monitoring

### Health Checks

| Endpoint | Purpose | Response |
|----------|---------|----------|
| `GET /health` | Basic health check | `{"status": "ok"}` |
| `GET /ready` | Kubernetes readiness (checks DB/Redis) | `{"status": "ready"}` |
| `GET /live` | Kubernetes liveness | `{"status": "alive"}` |

### Prometheus Metrics (Optional)

Add to your monitoring stack:

```yaml
- job_name: 'teamchat'
  static_configs:
    - targets: ['teamchat-server:3001']
  metrics_path: '/health'
```

### Log Aggregation

Logs are output as JSON in production. Configure your log aggregator:

```yaml
# Example Fluent Bit config
[INPUT]
    Name              tail
    Path              /var/log/containers/teamchat-*.log
    Parser            docker
    Tag               teamchat.*

[OUTPUT]
    Name              elasticsearch
    Match             teamchat.*
    Host              elasticsearch
    Index             teamchat-logs
```

## Security Checklist

Before going live:

- [ ] JWT_SECRET is unique and secure (32+ chars)
- [ ] All passwords are strong and unique
- [ ] CORS_ORIGIN is set to your exact domain(s)
- [ ] TLS/HTTPS is enabled for all connections
- [ ] Database connections use SSL (`?sslmode=require`)
- [ ] Redis requires password authentication
- [ ] TURN server credentials are secure
- [ ] Code signing is configured for desktop apps
- [ ] Backups are scheduled and tested
- [ ] Monitoring/alerting is configured
- [ ] Rate limiting is appropriate for your user base

## Troubleshooting

### Server won't start

```bash
# Check logs
docker-compose -f docker-compose.production.yml logs server

# Common issues:
# - Missing JWT_SECRET
# - Database connection failed
# - Redis connection failed
```

### Video calls failing

1. Check TURN server connectivity:
   ```bash
   turnutils_uclient -T -u username -w password turn.yourcompany.com
   ```

2. Verify firewall allows UDP ports 3478, 49152-65535

### Database issues

```bash
# Connect to database
docker-compose -f docker-compose.production.yml exec postgres psql -U teamchat -d teamchat

# Check connections
SELECT * FROM pg_stat_activity WHERE datname = 'teamchat';
```

## Support

For issues and questions:
- GitHub Issues: https://github.com/your-org/teamchat/issues
- Internal Slack: #teamchat-support
