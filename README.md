# WDPCM - Web Dev Process Manager

![WDPCM Interface](https://github.com/user-attachments/assets/4a88823a-1a3a-4927-a3f6-c901eb64e066)

A modern, real-time web-based process control manager built with Node.js, Hono, and Svelte. WDPCM allows you to manage, monitor, and control system processes through an intuitive web interface with real-time logging and status updates using terminal emulation.

## ✨ Features

- **🚀 Real-time Process Management**: Start, stop, and monitor processes through a web interface
- **📊 Live Process Monitoring**: Real-time stdout/stderr streaming via WebSockets with terminal emulation
- **🔍 Process Discovery**: Search and filter through configured processes
- **⚡ High Performance**: Built with Hono web framework for ultra-fast performance
- **🎨 Modern UI**: Clean, responsive Svelte frontend with TailwindCSS
- **🔧 Configuration-based**: Define processes in a simple SQLite database
- **🌐 CORS Enabled**: Secure cross-origin requests support
- **📱 Responsive Design**: Works seamlessly on desktop and mobile devices
- **💻 Terminal Emulation**: Full terminal experience with node-pty and xterm.js
- **🖥️ Desktop Application**: Native desktop app built with Electron
- **⚙️ Environment Configuration**: Flexible configuration via environment variables

## 🏗️ Architecture

```
WDPCM/
├── backend/              # Node.js + Hono + TypeScript backend
│   ├── src/
│   │   ├── index.ts      # Main server with REST API and WebSocket
│   │   └── lib/
│   │       └── db.ts     # Database operations
│   ├── package.json      # Backend dependencies
│   └── tsconfig.json     # TypeScript configuration
├── frontend/             # Svelte + TailwindCSS frontend
│   ├── src/              # Svelte components and app logic
│   ├── package.json      # Frontend dependencies
│   └── build/           # Static build output
├── desktop/             # Electron desktop application
│   ├── main.mjs         # Electron main process
│   └── preload.cjs      # Preload script
├── package.json         # Root project scripts
└── .gitignore          # Git ignore rules
```

### Tech Stack

**Backend:**
- [Node.js](https://nodejs.org/) - JavaScript runtime
- [Hono](https://hono.dev/) - Ultra-fast web framework
- [Socket.IO](https://socket.io/) - Real-time WebSocket communication
- [node-pty](https://github.com/microsoft/node-pty) - Terminal emulation
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - SQLite database
- TypeScript - Type safety and modern JS features

**Frontend:**
- [Svelte](https://svelte.dev/) - Reactive frontend framework
- [SvelteKit](https://kit.svelte.dev/) - Full-stack Svelte framework
- [TailwindCSS](https://tailwindcss.com/) - Utility-first CSS framework
- [Vite](https://vitejs.dev/) - Fast build tool and dev server
- [xterm.js](https://xtermjs.org/) - Terminal component for web

**Desktop:**
- [Electron](https://www.electronjs.org/) - Cross-platform desktop framework

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18.0.0
- [npm](https://npmjs.com/) or [Bun](https://bun.sh/) (optional, but recommended for frontend)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd wdpcm
   ```

2. **Install all dependencies**
   ```bash
   npm run initiate
   ```
   
   Or manually:
   ```bash
   # Install backend dependencies
   cd backend
   npm install
   
   # Install frontend dependencies
   cd ../frontend
   bun install  # or npm install
   ```

## 🖥️ Running the Application

### Development Mode (Web)
```bash
# Run both backend and frontend in development mode
npm run dev
```

### Production Mode (Web)
```bash
# Run both backend and frontend in production mode
npm run prod
```

### Desktop Application

```bash
# Build and run desktop app in development mode
npm run desktop:dev

# Build desktop distribution (Linux AppImage)
npm run desktop:dist
```

### Manual Startup

1. **Start the Backend Server**
   ```bash
   cd backend
   npm run dev    # Development with hot reload
   npm run start  # Production mode
   ```
   - REST API will be available at `http://localhost:7589`
   - WebSocket server will be available at `http://localhost:7590`

2. **Start the Frontend Development Server**
   ```bash
   cd frontend
   bun run dev    # or npm run dev
   ```
   - Frontend will be available at `http://localhost:5173`

## ⚙️ Environment Configuration

WDPCM can be configured using the following environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `WDPCM_API_PORT` | `7589` | Backend REST API port |
| `WDPCM_SOCKET_PORT` | `7590` | WebSocket server port |
| `WDPCM_FRONTEND_URL` | `http://localhost:7591` | Frontend URL for browser opening |
| `WDPCM_OPEN_BROWSER` | `true` | Whether to open browser automatically |
| `WDPCM_DB_PATH` | `backend/data.db` | Path to SQLite database file |

### Example Usage

```bash
# Custom ports
WDPCM_API_PORT=8080 WDPCM_SOCKET_PORT=8081 npm run dev

# Don't open browser
WDPCM_OPEN_BROWSER=false npm run start

# Custom database location
WDPCM_DB_PATH=/var/lib/wdpcm/data.db npm run start
```

## 📋 Process Configuration

WDPCM stores process configurations in an SQLite database. Processes can be managed via the REST API.

### Process Schema

- **alias**: Unique identifier for the process
- **command**: The shell command to execute
- **status**: Current status (running/stopped)

### Example API Usage

**Create a process:**
```bash
curl -X POST http://localhost:7589/processes \
  -H "Content-Type: application/json" \
  -d '{"alias": "list-files", "command": "ls -la"}'
```

**List all processes:**
```bash
curl http://localhost:7589/processes
```

## 🔌 API Endpoints

### REST API (Default Port 7589)

- `GET /` - Welcome message
- `GET /processes` - List all configured processes with status
- `GET /processes/:alias` - Get specific process details
- `POST /processes` - Create a new process configuration
- `PUT /processes/:alias` - Update a process configuration
- `DELETE /processes/:alias` - Delete a process configuration
- `POST /processes/start/:alias` - Start a process by alias
- `POST /processes/stop/:alias` - Stop a running process by alias

### WebSocket Events (Default Port 7590)

- `process-started` - Process start notifications
- `process-data` - Real-time process output (stdout/stderr)
- `process-exited` - Process termination notifications
- `process-stopped` - Process stop notifications
- `pty-resize` - Terminal resize events

## 📡 Usage Examples

### Starting a Process

```bash
curl -X POST http://localhost:7589/processes/start/list-files
```

### Stopping a Process

```bash
curl -X POST http://localhost:7589/processes/stop/list-files
```

### Listing Processes

```bash
curl http://localhost:7589/processes
```

Response:
```json
[
  {
    "alias": "list-files",
    "command": "ls -la",
    "status": "stopped"
  },
  {
    "alias": "sleepy-test",
    "command": "sleep 30",
    "status": "running"
  }
]
```

## 🛠️ Development

### Backend Development

```bash
cd backend
npm run dev       # Development with tsx watch mode
npm run build     # Build TypeScript to JavaScript
npm run start     # Run production build
```

### Frontend Development

```bash
cd frontend
bun run dev       # Development server
bun run build     # Production build (static)
bun run preview   # Preview production build
```

The frontend is configured to build as a static site (using `@sveltejs/adapter-static`), making it suitable for both web deployment and desktop embedding.

### Desktop Development

```bash
# Prepare builds for desktop
npm run desktop:prepare

# Rebuild native modules for Electron
npm run desktop:rebuild-native

# Run desktop app in development
npm run desktop:dev

# Build desktop distribution
npm run desktop:dist
```

### Desktop-specific Environment Variables

When running in desktop mode, the following additional variables are available:

| Variable | Description |
|----------|-------------|
| `WDPCM_RENDERER_API_URL` | API URL for renderer process |
| `WDPCM_RENDERER_SOCKET_URL` | WebSocket URL for renderer process |

## 🔒 Security Considerations

- CORS is enabled for all origins (`*`) - configure appropriately for production
- Process execution uses the user's default shell or bash fallback
- Terminal emulation provides full shell access - implement authentication for production
- Consider implementing rate limiting and input validation for production deployments
- Validate process aliases to prevent command injection
- Desktop app uses context isolation and preload scripts for security

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

---

**Built with ❤️ using Node.js, Hono, Svelte, Electron, and modern web technologies**
