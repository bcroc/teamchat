# TeamChat Client

Desktop application for TeamChat - a Slack-like team communication app with real-time messaging, voice/video calls, and screen sharing.

## Features

- **Cross-platform** - macOS, Windows, and Linux
- **Real-time Messaging** - Channels, DMs, threads, reactions
- **Voice/Video Calls** - WebRTC-powered 1:1 and group calls
- **Screen Sharing** - Share your screen in calls
- **Modern UI** - Slack-inspired design with Tailwind CSS

## Tech Stack

- **Framework**: Electron + Vite
- **UI**: React + TypeScript + Tailwind CSS
- **State**: React Query + Zustand
- **WebRTC**: Custom implementation for calls
- **Real-time**: Socket.io client

## Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- TeamChat server running (see [teamchat-server](../teamchat-server))

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set up environment

```bash
cp .env.example .env
# Edit .env to point to your API server
```

### 3. Start development

```bash
pnpm dev
```

This will start the Electron app in development mode with hot reload.

## Project Structure

```
teamchat-client/
├── app/                      # Electron application
│   ├── src/
│   │   ├── main/             # Electron main process
│   │   ├── preload/          # Preload scripts
│   │   └── renderer/         # React application
│   │       └── src/
│   │           ├── components/
│   │           ├── hooks/
│   │           ├── stores/
│   │           └── pages/
│   ├── electron.vite.config.ts
│   ├── tailwind.config.js
│   └── package.json
├── packages/
│   ├── shared/               # Shared types & schemas
│   └── webrtc/               # WebRTC utilities
├── pnpm-workspace.yaml
└── package.json
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start in development mode |
| `pnpm build` | Build the application |
| `pnpm build:mac` | Build for macOS |
| `pnpm build:win` | Build for Windows |
| `pnpm build:linux` | Build for Linux |
| `pnpm test` | Run tests |
| `pnpm lint` | Lint code |
| `pnpm format` | Format code |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | API server URL | http://localhost:3000 |
| `VITE_WS_URL` | WebSocket server URL | ws://localhost:3000 |
| `VITE_TURN_SERVER_URL` | TURN server URL (optional) | - |

## Building for Production

### macOS

```bash
pnpm build:mac
```

Outputs: `dist-electron/TeamChat-*.dmg`, `dist-electron/TeamChat-*.zip`

### Windows

```bash
pnpm build:win
```

Outputs: `dist-electron/TeamChat Setup *.exe`, `dist-electron/TeamChat *.exe` (portable)

### Linux

```bash
pnpm build:linux
```

Outputs: `dist-electron/TeamChat-*.AppImage`, `dist-electron/teamchat_*.deb`

## Packages

### @teamchat/shared

Shared types, Zod validation schemas, and constants used by both client and server.

```bash
cd packages/shared
pnpm build
```

### @teamchat/webrtc

WebRTC utilities for voice/video calls:
- `PeerConnection` - WebRTC peer connection wrapper
- `CallStateMachine` - Call state management

```bash
cd packages/webrtc
pnpm build
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Quick search |
| `Cmd/Ctrl + N` | New message |
| `Cmd/Ctrl + Shift + M` | Mute/unmute (in call) |
| `Cmd/Ctrl + Shift + V` | Toggle video (in call) |
| `Esc` | Close modal/panel |

## Related Repositories

- [teamchat-server](../teamchat-server) - Backend API server

## License

Private - All rights reserved
