# WDPCM - Web-based Distributed Process Control Manager

![WDPCM Interface](https://private-user-images.githubusercontent.com/77280141/452793126-8a171dfd-9711-4f31-997e-cc4c8cd1c26e.png?jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3NDkzOTI4NDQsIm5iZiI6MTc0OTM5MjU0NCwicGF0aCI6Ii83NzI4MDE0MS80NTI3OTMxMjYtOGExNzFkZmQtOTcxMS00ZjMxLTk5N2UtY2M0YzhjZDFjMjZlLnBuZz9YLUFtei1BbGdvcml0aG09QVdTNC1ITUFDLVNIQTI1NiZYLUFtei1DcmVkZW50aWFsPUFLSUFWQ09EWUxTQTUzUFFLNFpBJTJGMjAyNTA2MDglMkZ1cy1lYXN0LTElMkZzMyUyRmF3czRfcmVxdWVzdCZYLUFtei1EYXRlPTIwMjUwNjA4VDE0MjIyNFomWC1BbXotRXhwaXJlcz0zMDAmWC1BbXotU2lnbmF0dXJlPTZiODAyZmI0NTA5ZWJkMDJlMzdhY2IzNjMzOGYxMjMyNDFkYjExYzM5MzNmNmJjZGQ5OTZlNjYwZWEwZmZjNWImWC1BbXotU2lnbmVkSGVhZGVycz1ob3N0In0.9dDrRE4vupe55n2MDekIFR6gh1eDSXYldK9sePRAo2Q)

A modern, real-time web-based process control manager built with Bun and Svelte. WDPCM allows you to manage, monitor, and control system processes through an intuitive web interface with real-time logging and status updates.

## ✨ Features

- **🚀 Real-time Process Management**: Start, stop, and monitor processes through a web interface
- **📊 Live Process Monitoring**: Real-time stdout/stderr streaming via WebSockets
- **🔍 Process Discovery**: Search and filter through configured processes
- **⚡ High Performance**: Built with Bun runtime for ultra-fast performance
- **🎨 Modern UI**: Clean, responsive Svelte frontend with TailwindCSS
- **🔧 Configuration-based**: Define processes in a simple `processes.tbl` file
- **🌐 CORS Enabled**: Secure cross-origin requests support
- **📱 Responsive Design**: Works seamlessly on desktop and mobile devices

## 🏗️ Architecture

```
WDPCM/
├── backend/          # Bun + TypeScript backend
│   ├── server.ts     # Main server with REST API and WebSocket
│   ├── package.json  # Backend dependencies
│   └── tsconfig.json # TypeScript configuration
├── frontend/         # Svelte + TailwindCSS frontend
│   ├── src/          # Svelte components and app logic
│   ├── package.json  # Frontend dependencies
│   └── ...          # Vite build configuration
├── processes.tbl     # Process definitions (auto-generated)
└── .gitignore       # Git ignore rules
```

### Tech Stack

**Backend:**
- [Bun](https://bun.sh/) - Ultra-fast JavaScript runtime
- [Socket.IO](https://socket.io/) - Real-time WebSocket communication
- TypeScript - Type safety and modern JS features
- Fish Shell - Process execution environment

**Frontend:**
- [Svelte](https://svelte.dev/) - Reactive frontend framework
- [SvelteKit](https://kit.svelte.dev/) - Full-stack Svelte framework
- [TailwindCSS](https://tailwindcss.com/) - Utility-first CSS framework
- [Vite](https://vitejs.dev/) - Fast build tool and dev server

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh/docs/installation) >= 1.0.0
- [Node.js](https://nodejs.org/) >= 18.0.0
- [Fish Shell](https://fishshell.com/) (recommended, but not required)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd wdpcm
   ```

2. **Setup Backend**
   ```bash
   cd backend
   bun install
   ```

3. **Setup Frontend**
   ```bash
   cd ../frontend
   bun install
   # or npm install
   ```

### Running the Application

1. **Start the Backend Server**
   ```bash
   cd backend
   bun start
   ```
   - REST API will be available at `http://localhost:3000`
   - WebSocket server will be available at `http://localhost:3003`

2. **Start the Frontend Development Server**
   ```bash
   cd frontend
   bun run dev
   # or npm run dev
   ```
   - Frontend will be available at `http://localhost:5173`

## 📋 Process Configuration

WDPCM uses a `processes.tbl` file to define available processes. If this file doesn't exist, it will be automatically created with example processes.

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
```

## 🔌 API Endpoints

### REST API (Port 3000)

- `GET /` - Welcome message
- `GET /processes` - List all configured processes with status
- `GET /processes?search=<query>` - Search processes by alias
- `POST /run/<alias>` - Start a process by alias
- `POST /stop/<alias>` - Stop a running process by alias

### WebSocket Events (Port 3003)

- `log` - Real-time process output (stdout/stderr)
- `process-exit` - Process termination notifications
- `connection` - Client connection events

## 📡 Usage Examples

### Starting a Process

```bash
curl http://localhost:3000/run/list-files
```

### Stopping a Process

```bash
curl http://localhost:3000/stop/list-files
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
    "status": "not running"
  }
]
```

## 🛠️ Development

### Backend Development

```bash
cd backend
bun run server.ts         # Direct execution
bun start                 # Using package.json script
bun run --hot server.ts   # For hot reload
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
- Socket.IO Server: `3003`
- Frontend Dev Server: `5173`

These can be modified in the respective configuration files.

## 🔒 Security Considerations

- CORS is enabled for all origins (`*`) - configure appropriately for production
- Process execution uses Fish shell with interactive mode (`fish -ic`)
- Consider implementing authentication for production deployments
- Validate process aliases to prevent command injection

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

---

**Built with ❤️ using Bun, Svelte, and modern web technologies** 
