# TeamChat Server

Backend API server for TeamChat - a Slack-like team communication app with real-time messaging, voice/video calls, and screen sharing.

## Features

- **REST API** - Fastify-powered HTTP endpoints
- **Real-time** - Socket.io for messaging and WebRTC signaling
- **Authentication** - JWT with httpOnly cookies
- **Database** - PostgreSQL with Prisma ORM
- **Caching/Presence** - Redis for real-time features
- **File Uploads** - Local file storage with multipart support

## Prerequisites

- Node.js >= 18.0.0
- Docker (for PostgreSQL and Redis)
- pnpm (recommended) or npm

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set up environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Start infrastructure

```bash
pnpm docker:up
```

### 4. Set up database

```bash
pnpm db:generate   # Generate Prisma client
pnpm db:migrate    # Run migrations
pnpm db:seed       # Seed sample data (optional)
```

### 5. Start development server

```bash
pnpm dev
```

The API will be available at `http://localhost:3000`.

## Project Structure

```
teamchat-server/
├── src/
│   ├── index.ts          # Entry point
│   ├── app.ts            # Fastify app setup
│   ├── routes/           # REST API endpoints
│   ├── socket/           # WebSocket handlers
│   ├── middleware/       # Auth, validation
│   └── lib/              # DB, Redis, utilities
├── prisma/
│   ├── schema.prisma     # Database schema
│   ├── migrations/       # Database migrations
│   └── seed.ts           # Seed data
├── packages/
│   └── shared/           # Shared types & schemas
└── uploads/              # File storage directory
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server with hot reload |
| `pnpm build` | Build for production |
| `pnpm start` | Start production server |
| `pnpm test` | Run tests |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:migrate` | Run database migrations |
| `pnpm db:push` | Push schema changes (dev) |
| `pnpm db:seed` | Seed the database |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm docker:up` | Start Docker containers |
| `pnpm docker:down` | Stop Docker containers |

## API Endpoints

### Authentication
- `POST /auth/signup` - Create account
- `POST /auth/login` - Login
- `POST /auth/logout` - Logout
- `POST /auth/refresh` - Refresh token

### Workspaces
- `GET /workspaces` - List workspaces
- `POST /workspaces` - Create workspace
- `GET /workspaces/:id` - Get workspace details

### Channels
- `GET /workspaces/:id/channels` - List channels
- `POST /workspaces/:id/channels` - Create channel
- `GET /channels/:id` - Get channel details

### Messages
- `GET /messages` - Get messages (with pagination)
- `POST /messages` - Send message
- `PATCH /messages/:id` - Edit message
- `DELETE /messages/:id` - Delete message

### Direct Messages
- `GET /workspaces/:id/dms` - List DM threads
- `POST /workspaces/:id/dms` - Create DM thread

### Calls (WebRTC Signaling)
- `POST /calls/start` - Start a call
- `POST /calls/join` - Join a call
- `POST /calls/leave` - Leave a call

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `HOST` | Server host | 0.0.0.0 |
| `NODE_ENV` | Environment | development |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `REDIS_URL` | Redis connection string | - |
| `JWT_SECRET` | JWT signing secret | - |
| `JWT_REFRESH_SECRET` | Refresh token secret | - |
| `CORS_ORIGIN` | Allowed CORS origin | - |

## Related Repositories

- [teamchat-client](../teamchat-client) - Desktop application (Electron + React)

## License

Private - All rights reserved
