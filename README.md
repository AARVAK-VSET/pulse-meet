# PulseMeet 🎥

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node: >=18](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![Organization](https://img.shields.io/badge/Organization-AARVAK--VSET-purple.svg)](https://github.com/AARVAK-VSET)
[![Event](https://img.shields.io/badge/TSJ%202026-Patch%20Wars-orange.svg)](https://github.com/AARVAK-VSET)

> **PulseMeet** is a modern, lightweight, peer-to-peer WebRTC video conferencing and meeting workspace built with React, Material-UI, NestJS, and TypeScript. Seamlessly schedule, launch, and collaborate in real-time.

---

## ⚡ Highlights

- **Instant Meeting Spaces**: Create one-click rooms with unique shareable URLs.
- **WebRTC High-Fidelity Streaming**: Low-latency peer-to-peer video and audio communication.
- **Calendar & Room Booking**: Schedule meetings with integrated calendar views and room availability statuses.
- **Chrome Extension Support**: Includes dedicated build target for a browser extension popup.
- **Monorepo Architecture**: Clean separation of `client`, `server`, and shared DTO/domain models with npm workspaces.
- **Docker Ready**: Turnkey `docker-compose` orchestration for local and production deployment.

---

## 🛠️ Tech Stack

- **Client**: React 18, Vite, Material-UI (MUI), Emotion, React Router 6
- **Server**: NestJS 10, Express, SQLite3, Winston, Google Cloud Auth
- **Shared**: Shared domain models, validation classes, and TypeScript contracts

---

## 🚀 Quick Start

### Option 1: Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/AARVAK-VSET/pulse-meet.git
cd pulse-meet

# Launch client and server via Docker Compose
npm run start:docker
```

### Option 2: Local Development

```bash
# 1. Install dependencies across all workspaces
npm install

# 2. Build shared workspace
npm run build:shared

# 3. Start client and server concurrently
npm run start:all
```

- Web Client: [http://localhost:3000](http://localhost:3000)
- API Server: [http://localhost:8000](http://localhost:8000)

---

## 📁 Repository Structure

```
pulse-meet/
├── client/              # React frontend application (Vite)
│   ├── src/
│   │   ├── components/  # Video canvas, room controls, meeting schedulers
│   │   ├── hooks/       # WebRTC and media device hooks
│   │   └── pages/       # Route views
│   └── public/
├── server/              # NestJS backend API & signaling server
│   ├── src/
│   │   ├── auth/        # Token authentication & session guards
│   │   ├── rooms/       # Meeting room lifecycle management
│   │   └── calendar/    # Room reservation handlers
├── shared/              # Cross-boundary TypeScript interfaces & DTOs
├── docker-compose.yml   # Multi-container orchestration
├── package.json         # Monorepo root manifest
└── README.md
```

---

## 🤝 Contributing to Patch Wars 2026

We welcome contributions from all **Patch Wars (TSJ 2026)** participants!

1. Fork this repository: `https://github.com/AARVAK-VSET/pulse-meet`
2. Claim an open issue by commenting `"Claiming this issue"` on the issue thread.
3. Create your feature branch: `git checkout -b fix/issue-<number>`
4. Implement your solution and verify builds: `npm run build`
5. Submit a pull request referencing your issue: `Fixes #12`

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more details.  
Maintained by **[AARVAK-VSET](https://github.com/AARVAK-VSET)**.
