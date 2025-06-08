import { BunFile } from "bun";
import { Server as SocketIOServer } from "socket.io";

// Define types for our data structures
interface Process {
  alias: string;
  command: string;
  commandParts: string[];
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const io = new SocketIOServer({
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: false
  }
});

// In-memory store for running processes
const runningProcesses = new Map<string, any>();

// read and parse processes.tbl
let configuredProcesses: Process[] = [];
try {
  const processesFile: BunFile = Bun.file("processes.tbl");
  const processesFileText: string = await processesFile.text();
  configuredProcesses = processesFileText.split(/\r?\n/).filter(Boolean).map((line: string): Process => {
    const [alias, ...commandParts] = line.trim().split(" ");
    const command = commandParts.join(" ");
    return { alias, command, commandParts };
  });
} catch (error: any) {
  if (error.code === 'ENOENT') {
    console.log("processes.tbl not found, creating one with example data.");
    await Bun.write("processes.tbl", "list-files ls -l\nsleepy-boy sleep 30\n");
    // re-read
    const processesFile: BunFile = Bun.file("processes.tbl");
    const processesFileText: string = await processesFile.text();
    configuredProcesses = processesFileText.split(/\r?\n/).filter(Boolean).map((line: string): Process => {
      const [alias, ...commandParts] = line.trim().split(" ");
      const command = commandParts.join(" ");
      return { alias, command, commandParts };
    });
  } else {
    console.error("Error reading processes.tbl:", error);
    process.exit(1);
  }
}

const server = Bun.serve({
  port: 3000,
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') 
        return new Response(null, { status: 204, headers: corsHeaders });

    // Endpoint to run a process
    if (url.pathname.startsWith('/run/')) {
      const alias = url.pathname.substring(5);
      const processToRun = configuredProcesses.find(p => p.alias === alias);

      if (!processToRun) {
        return new Response(`Process with alias '${alias}' not found.`, { status: 404, headers: corsHeaders });
      }

      if (runningProcesses.has(alias)) {
        return new Response(`Process '${alias}' is already running.`, { status: 400, headers: corsHeaders });
      }

      const proc = Bun.spawn(["fish", "-ic", processToRun.command], {
        stdout: "pipe",
        stderr: "pipe",
        onExit(proc, exitCode, signalCode, error) {
          runningProcesses.delete(alias);
          const exitMessage = { alias, source: 'system', data: `Process '${alias}' exited with code ${exitCode}.` };
          io.emit('log', exitMessage);
          io.emit('process-exit', { alias });
          console.log(`Process '${alias}' exited with code ${exitCode}.`);
        },
      });
      runningProcesses.set(alias, proc);

      const readAndBroadcast = async (stream: ReadableStream<Uint8Array> | null, source: 'stdout' | 'stderr') => {
        if (!stream) return;
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            const data = decoder.decode(value);
            io.emit('log', { alias, source, data });
          }
        } catch (error) {
          console.error(`Error reading ${source} for '${alias}':`, error);
        }
      };

      readAndBroadcast(proc.stdout, 'stdout');
      readAndBroadcast(proc.stderr, 'stderr');

      return new Response(`Process '${alias}' started with pid ${proc.pid}.`, { headers: corsHeaders });
    }

    // Endpoint to stop a process
    if (url.pathname.startsWith('/stop/')) {
      const alias = url.pathname.substring(6);
      const proc = runningProcesses.get(alias);

      if (!proc) {
        return new Response(`Process with alias '${alias}' is not running.`, { status: 404, headers: corsHeaders });
      }

      // Use pkill to send SIGINT to all children of the main shell process
      Bun.spawnSync(["pkill", "-P", proc.pid.toString(), "-SIGINT"]);
      const exitCode = await proc.exited;

      return new Response(`Sent SIGINT to process '${alias}' and its children with exit code ${exitCode}.`, { headers: corsHeaders });
    }

    // Endpoint to list processes
    if (url.pathname === '/processes') {
        const searchQuery = url.searchParams.get('search');
  
        let processes = configuredProcesses;
  
        if (searchQuery) {
          processes = processes.filter(p => p.alias.includes(searchQuery));
        }
  
        const processStatuses = processes.map((p) => {
          return {
            alias: p.alias,
            command: p.command,
            status: runningProcesses.has(p.alias) ? "running" : "not running"
          };
        });
  
        return new Response(JSON.stringify(processStatuses, null, 2), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

    if (url.pathname === '/') {
        return new Response("Welcome to Bun Process Manager!", {
            headers: corsHeaders
          });
    }

    return new Response("Not found.", { status: 404, headers: corsHeaders });
  },
  error(error: Error) {
    console.error("Server error:", error);
    return new Response(`<pre>${error}\n${error.stack}</pre>`, {
      status: 500,
      headers: {
        "Content-Type": "text/html",
        ...corsHeaders,
      },
    });
  }
});

io.on('connection', (socket) => {
  console.log('a user connected');

  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
});

console.log(`Bun server is running on localhost:${server.port}`);
io.listen(3003);
console.log(`Socket.IO server is listening on port 3003`);
