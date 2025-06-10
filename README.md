# WDPCM - Web Dev Process Manager

![WDPCM Interface](https://private-user-images.githubusercontent.com/77280141/453307118-4a88823a-1a3a-4927-a3f6-c901eb64e066.png?jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3NDk1MzU5ODcsIm5iZiI6MTc0OTUzNTY4NywicGF0aCI6Ii83NzI4MDE0MS80NTMzMDcxMTgtNGE4ODgyM2EtMWEzYS00OTI3LWEzZjYtYzkwMWViNjRlMDY2LnBuZz9YLUFtei1BbGdvcml0aG09QVdTNC1ITUFDLVNIQTI1NiZYLUFtei1DcmVkZW50aWFsPUFLSUFWQ09EWUxTQTUzUFFLNFpBJTJGMjAyNTA2MTAlMkZ1cy1lYXN0LTElMkZzMyUyRmF3czRfcmVxdWVzdCZYLUFtei1EYXRlPTIwMjUwNjEwVDA2MDgwN1omWC1BbXotRXhwaXJlcz0zMDAmWC1BbXotU2lnbmF0dXJlPTQ3ODNlOTE2OWNjNzFiMDFjNWQxYzY3MjE4OGNmZWU4NTUxM2NkMTY0NTZhZWNjZWZkNDBmNDI2M2IxMmUyZDYmWC1BbXotU2lnbmVkSGVhZGVycz1ob3N0In0.m3mbc1nR6JgSARtw83g-NC6CWrf-SG7mgXvziUgArMg)

A modern, real-time web-based process control manager built with Node.js, Hono, and Svelte. WDPCM allows you to manage, monitor, and control system processes through an intuitive web interface with real-time logging and status updates using terminal emulation.

## ✨ Features

- **🚀 Real-time Process Management**: Start, stop, and monitor processes through a web interface
- **📊 Live Process Monitoring**: Real-time stdout/stderr streaming via WebSockets with terminal emulation
- **🔍 Process Discovery**: Search and filter through configured processes
- **⚡ High Performance**: Built with Hono web framework for ultra-fast performance
- **🎨 Modern UI**: Clean, responsive Svelte frontend with TailwindCSS
- **🔧 Configuration-based**: Define processes in a simple `processes.tbl` file
- **🌐 CORS Enabled**: Secure cross-origin requests support
- **📱 Responsive Design**: Works seamlessly on desktop and mobile devices
- **💻 Terminal Emulation**: Full terminal experience with node-pty and xterm.js

## 🏗️ Architecture

```
WDPCM/
├── backend/              # Node.js + Hono + TypeScript backend
│   ├── src/
│   │   ├── index.ts      # Main server with REST API and WebSocket
│   │   └── lib/
│   │       └── parser.ts # Process configuration parser
│   ├── processes.tbl     # Process definitions
│   ├── package.json      # Backend dependencies
│   └── tsconfig.json     # TypeScript configuration
├── frontend/             # Svelte + TailwindCSS frontend
│   ├── src/              # Svelte components and app logic
│   ├── package.json      # Frontend dependencies
│   └── ...              # Vite build configuration
├── package.json          # Root project scripts
└── .gitignore           # Git ignore rules
```

### Tech Stack

**Backend:**
- [Node.js](https://nodejs.org/) - JavaScript runtime
- [Hono](https://hono.dev/) - Ultra-fast web framework
- [Socket.IO](https://socket.io/) - Real-time WebSocket communication
- [node-pty](https://github.com/microsoft/node-pty) - Terminal emulation
- TypeScript - Type safety and modern JS features

**Frontend:**
- [Svelte](https://svelte.dev/) - Reactive frontend framework
- [SvelteKit](https://kit.svelte.dev/) - Full-stack Svelte framework
- [TailwindCSS](https://tailwindcss.com/) - Utility-first CSS framework
- [Vite](https://vitejs.dev/) - Fast build tool and dev server
- [xterm.js](https://xtermjs.org/) - Terminal component for web

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

### Running the Application

#### Development Mode
```bash
# Run both backend and frontend in development mode
npm run dev
```

#### Production Mode
```bash
# Run both backend and frontend in production mode
npm run prod
```

#### Manual Startup

1. **Start the Backend Server**
   ```bash
   cd backend
   npm run dev    # Development with hot reload
   npm run start  # Production mode
   ```
   - REST API will be available at `http://localhost:3000`
   - WebSocket server will be available at `http://localhost:3001`

2. **Start the Frontend Development Server**
   ```bash
   cd frontend
   bun run dev    # or npm run dev
   ```
   - Frontend will be available at `http://localhost:5173`

## 📋 Process Configuration

WDPCM uses a `processes.tbl` file located in the `backend/` directory to define available processes. 

### Format

```
alias command
```

### Example `processes.tbl`

```
list-files ls -la
system-info uname -a
disk-usage df -h
memory-info free -h
network-test ping -c 4 google.com
sleepy-test sleep 30
log-monitor tail -f /var/log/syslog
htop htop
fastfetch fastfetch
```

## 🔌 API Endpoints

### REST API (Port 3000)

- `GET /` - Welcome message
- `GET /processes` - List all configured processes with status
- `GET /processes?search=<query>` - Search processes by alias or command
- `POST /processes/start/<alias>` - Start a process by alias
- `POST /processes/stop/<alias>` - Stop a running process by alias

### WebSocket Events (Port 3001)

- `process-started` - Process start notifications
- `process-data` - Real-time process output (stdout/stderr)
- `process-exited` - Process termination notifications
- `process-stopped` - Process stop notifications
- `pty-resize` - Terminal resize events

## 📡 Usage Examples

### Starting a Process

```bash
curl -X POST http://localhost:3000/processes/start/list-files
```

### Stopping a Process

```bash
curl -X POST http://localhost:3000/processes/stop/list-files
```

### Listing Processes

```bash
curl http://localhost:3000/processes
```

Response:
```json
[
  {
    "alias": "list-files",
    "command": "ls -la",
    "status": "running"
  },
  {
    "alias": "sleepy-test",
    "command": "sleep 30",
    "status": "stopped"
  }
]
```

### Searching Processes

```bash
curl "http://localhost:3000/processes?search=htop"
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
bun run build     # Production build
bun run preview   # Preview production build
```

### Environment Configuration

The application uses the following default ports:
- Backend REST API: `3000`
- Socket.IO Server: `3001`
- Frontend Dev Server: `5173`

These can be modified in the respective configuration files.

## 🔒 Security Considerations

- CORS is enabled for all origins (`*`) - configure appropriately for production
- Process execution uses the user's default shell or bash fallback
- Terminal emulation provides full shell access - implement authentication for production
- Consider implementing rate limiting and input validation for production deployments
- Validate process aliases to prevent command injection

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

---

**Built with ❤️ using Node.js, Hono, Svelte, and modern web technologies** 
