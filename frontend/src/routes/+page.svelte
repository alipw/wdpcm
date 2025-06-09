<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import { fly } from "svelte/transition";
	import { quintOut } from "svelte/easing";
	import { io, type Socket } from "socket.io-client";

	interface Process {
		alias: string;
		command: string;
		status: string;
	}

	interface LogMessage {
		source: "stdout" | "stderr";
		data: string;
		timestamp: Date;
	}

	let processes: Process[] = $state([]);
	let searchQuery = $state("");
	let loading = $state(false);
	let error = $state("");
	let actionLoading: { [key: string]: boolean } = $state({});

	// Debounce search state
	let searchTimeout: NodeJS.Timeout | null = $state(null);

	// Log viewer state
	let showLogModal = $state(false);
	let currentLogProcess = $state("");
	let logMessages: LogMessage[] = $state([]);
	let logStore: { [key: string]: LogMessage[] } = $state({});
	let logContainers: { [key: string]: HTMLElement } = $state({});
	let isAtBottom = $state(true);
	let isInitialLoad = $state(true);

	// Socket.io state
	let socket: Socket | null = $state(null);

	// Sidebar state
	let showSidebar = $state(false);

	// Settings state
	let openLogOnStart = $state(false);

	onMount(() => {
		fetchProcesses();
		initSocketConnection();
	});

	onDestroy(() => {
		socket?.disconnect();
	});

	function initSocketConnection() {
		socket = io("http://localhost:3003");

		socket.on("connect", () => {
			console.info("Socket.IO connected");
		});

		socket.on("disconnect", () => {
			console.warn(
				"Socket.IO disconnected. It will try to reconnect automatically.",
			);
		});

		socket.on("connect_error", (err) => {
			console.error("Socket.IO connection error:", err);
		});

		socket.on(
			"log",
			(message: {
				alias: string;
				source: "stdout" | "stderr";
				data: string;
			}) => {
				try {
					const { alias, source, data } = message;
					const newMessage: LogMessage = {
						source,
						data,
						timestamp: new Date(),
					};

					if (!logStore[alias]) {
						logStore[alias] = [];
					}
					logStore[alias] = [...logStore[alias], newMessage];

					if (alias === currentLogProcess) {
						if (isInitialLoad) {
							logMessages = [...logMessages, newMessage];
						} else {
							appendLogToDOM(newMessage, alias);
						}

						if (isAtBottom) {
							setTimeout(() => {
								if (logContainers[alias]) {
									logContainers[alias].scrollTop =
										logContainers[alias].scrollHeight;
								}
							}, 0);
						}
					}
				} catch (err) {
					console.error("Failed to parse log message:", err);
				}
			},
		);
	}

	async function fetchProcesses(showLoading: boolean = true) {
		if (showLoading) {
			loading = true;
		}
		error = "";

		try {
			const url = searchQuery
				? `http://localhost:3000/processes?search=${encodeURIComponent(searchQuery)}`
				: "http://localhost:3000/processes";

			const response = await fetch(url);

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			processes = await response.json();
		} catch (err) {
			error = err instanceof Error ? err.message : "An error occurred";
			processes = [];
		} finally {
			if (showLoading) {
				loading = false;
			}
		}
	}

	async function startProcess(alias: string) {
		actionLoading[alias] = true;
		actionLoading = { ...actionLoading };

		try {
			await fetch(`http://localhost:3000/run/${alias}`, {
				method: "POST",
			});

			await fetchProcesses(false);

			// Automatically open logs if setting is enabled
			if (openLogOnStart) {
				openLogViewer(alias);
			}
		} catch (err) {
			error =
				err instanceof Error ? err.message : "Failed to start process";
			await fetchProcesses(false);
		} finally {
			actionLoading[alias] = false;
			actionLoading = { ...actionLoading };
			await fetchProcesses(false);
		}
	}

	async function stopProcess(alias: string) {
		actionLoading[alias] = true;
		actionLoading = { ...actionLoading };

		try {
			const response = await fetch(
				`http://localhost:3000/stop/${alias}`,
				{
					method: "POST",
				},
			);

			if (!response.ok) {
				throw new Error(`Failed to stop process: ${response.status}`);
			}

			await fetchProcesses(false);
		} catch (err) {
			error =
				err instanceof Error ? err.message : "Failed to stop process";
			await fetchProcesses(false);
		} finally {
			actionLoading[alias] = false;
			actionLoading = { ...actionLoading };
		}
	}

	function toggleLogViewer(alias: string) {
		if (showLogModal && currentLogProcess === alias) {
			closeLogViewer();
			return;
		}

		openLogViewer(alias);
	}

	function openLogViewer(alias: string) {
		currentLogProcess = alias;
		logMessages = logStore[alias] || [];
		isInitialLoad = true;
		showLogModal = true;

		setTimeout(() => {
			isInitialLoad = false;
			if (logContainers[alias]) {
				logContainers[alias].scrollTop =
					logContainers[alias].scrollHeight;
			}
		}, 100);
	}

	function closeLogViewer() {
		showLogModal = false;
		isAtBottom = true;
	}

	function appendLogToDOM(message: LogMessage, alias: string) {
		if (!logContainers[alias]) return;

		const logEntry = document.createElement("div");
		logEntry.className = "mb-1";

		const timestamp = document.createElement("span");
		timestamp.className = "text-gray-500 text-xs";
		timestamp.textContent = `[${message.timestamp.toLocaleTimeString()}]`;

		const source = document.createElement("span");
		source.className = `ml-2 ${message.source === "stderr" ? "text-red-400" : "text-green-400"}`;
		source.textContent = `[${message.source.toUpperCase()}]`;

		const data = document.createElement("span");
		data.className = "ml-2 whitespace-pre-wrap";
		data.textContent = message.data;

		logEntry.appendChild(timestamp);
		logEntry.appendChild(source);
		logEntry.appendChild(data);

		logContainers[alias].appendChild(logEntry);
	}

	function checkScrollPosition() {
		if (logContainers[currentLogProcess] !== undefined) {
			const threshold = 20;
			isAtBottom =
				logContainers[currentLogProcess].scrollTop +
					logContainers[currentLogProcess].clientHeight >=
				logContainers[currentLogProcess].scrollHeight - threshold;
		}
	}

	function clearLogs() {
		if (currentLogProcess && logStore[currentLogProcess]) {
			logStore[currentLogProcess] = [];
			logMessages = [];

			if (logContainers[currentLogProcess]) {
				const entries = Array.from(
					logContainers[currentLogProcess].children,
				);
				entries.forEach((entry) => {
					if (
						entry.classList.contains("mb-1") &&
						logContainers[currentLogProcess]
					) {
						logContainers[currentLogProcess].removeChild(entry);
					}
				});
			}
		}
	}

	function debouncedSearch() {
		if (searchTimeout) {
			clearTimeout(searchTimeout);
		}

		searchTimeout = setTimeout(() => {
			fetchProcesses();
		}, 500);
	}

	function clearSearch() {
		searchQuery = "";
		if (searchTimeout) {
			clearTimeout(searchTimeout);
		}
		fetchProcesses();
	}

	function closeSidebar() {
		showSidebar = false;
	}

	function toggleSidebar() {
		showSidebar = !showSidebar;
	}
</script>

{#if showSidebar}
	<div
		class="w-80 bg-gray-800 border-r border-gray-700 flex-shrink-0 fixed h-full z-30"
		transition:fly={{ x: "-100%", duration: 500, easing: quintOut }}
	>
		<!-- Sidebar Header -->
		<div
			class="flex items-center justify-between p-4 border-b border-gray-700"
		>
			<h2 class="text-lg font-semibold text-gray-100">Settings</h2>
			<button
				onclick={toggleSidebar}
				class="text-gray-400 hover:text-gray-200 text-2xl font-bold"
				aria-label="Close sidebar"
			>
				<svg
					class="w-6 h-6 text-gray-800 dark:text-white"
					aria-hidden="true"
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					fill="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						fill-rule="evenodd"
						d="M10 4H4c-1.10457 0-2 .89543-2 2v12c0 1.1046.89543 2 2 2h6V4ZM7.79283 9.29289c.39053.39053.39053 1.02371 0 1.41421L6.5 11.9999l1.29283 1.2929c.39053.3905.39053 1.0237 0 1.4142-.39052.3905-1.02368.3905-1.41421 0l-1.99994-2c-.39052-.3905-.39052-1.0236 0-1.4142l1.99994-1.99991c.39053-.39052 1.02369-.39052 1.41421 0Z"
						clip-rule="evenodd"
					/>
					<path
						d="M12 20h8c1.1046 0 2-.8954 2-2V6c0-1.10457-.8954-2-2-2h-8v16Z"
					/>
				</svg>
			</button>
		</div>

		<!-- Sidebar Content -->
		<div class="p-4">
			<nav class="space-y-2">
				<!-- Open Log on Start Process Toggle -->
				<div
					class="flex items-center justify-between p-3 bg-gray-700 rounded-lg"
				>
					<div class="flex flex-col">
						<span class="text-sm font-medium text-gray-100"
							>Open Logs on Start</span
						>
						<span class="text-xs text-gray-400"
							>Automatically show logs when starting a process</span
						>
					</div>
					<div class="flex items-center gap-2">
						<span class="text-xs text-gray-400">
							{openLogOnStart ? "ON" : "OFF"}
						</span>
						<button
							onclick={() => {
								openLogOnStart = !openLogOnStart;
							}}
							class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 {openLogOnStart
								? 'bg-green-600'
								: 'bg-gray-600'}"
						>
							<span class="sr-only">Toggle open log on start</span
							>
							<span
								class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ease-in-out {openLogOnStart
									? 'translate-x-6'
									: 'translate-x-1'}"
							>
							</span>
						</button>
					</div>
				</div>
			</nav>
		</div>
	</div>
{/if}

<div class="flex h-screen overflow-hidden bg-gray-900 filter transition-all">
	<!-- Main Content -->
	<div
		class="flex-shrink-0 transition-all duration-500 ease-in-out overflow-y-auto {showLogModal
			? 'w-1/2'
			: 'w-full'}"
	>
		<button
			class="{showSidebar
				? 'opacity-30'
				: 'opacity-0 pointer-events-none'} fixed z-20 bg-black w-screen h-screen transition-all animate-all"
			onclick={closeSidebar}
			aria-label="Close sidebar"
			aria-hidden="true"
		></button>
		<div class="container mx-auto p-4 max-w-6xl">
			<!-- Header with hamburger menu -->
			<div class="flex items-center justify-between mb-6">
				<div class="flex items-center gap-4">
					<button
						onclick={toggleSidebar}
						class="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"
						aria-label="Open settings"
					>
						<svg
							class="w-6 h-6 text-gray-800 dark:text-white"
							aria-hidden="true"
							xmlns="http://www.w3.org/2000/svg"
							width="24"
							height="24"
							fill="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								fill-rule="evenodd"
								d="M10 4H4c-1.10457 0-2 .89543-2 2v12c0 1.1046.89543 2 2 2h6V4ZM4.37868 9.29289c-.39052.39053-.39052 1.02371 0 1.41421l1.29283 1.2928-1.29283 1.2929c-.39052.3905-.39052 1.0237 0 1.4142.39052.3905 1.02369.3905 1.41421 0l1.99994-2c.39053-.3905.39053-1.0236 0-1.4142L5.79289 9.29289c-.39052-.39052-1.02369-.39052-1.41421 0Z"
								clip-rule="evenodd"
							/>
							<path
								d="M12 20h8c1.1046 0 2-.8954 2-2V6c0-1.10457-.8954-2-2-2h-8v16Z"
							/>
						</svg>
					</button>
					<h1 class="text-2xl font-bold text-gray-100">
						Process Manager
					</h1>
				</div>
			</div>

			<!-- Search Section -->
			<div class="mb-4 flex gap-3">
				<div class="flex-1">
					<input
						type="text"
						bind:value={searchQuery}
						oninput={debouncedSearch}
						placeholder="Search processes... (e.g., suzuki)"
						class="w-full px-3 py-2 border border-gray-600 rounded-lg bg-gray-800 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
					/>
				</div>
				<button
					onclick={clearSearch}
					disabled={loading}
					class="px-4 py-2 bg-gray-600 text-gray-100 rounded-lg hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Clear
				</button>
			</div>

			<!-- Error Message -->
			{#if error}
				<div
					class="mb-4 p-3 bg-red-900 border border-red-700 text-red-200 rounded-lg"
				>
					<p class="font-semibold">Error:</p>
					<p>{error}</p>
				</div>
			{/if}

			<!-- Loading State -->
			{#if loading}
				<div class="flex justify-center items-center py-8">
					<div
						class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"
					></div>
				</div>
			{/if}

			<!-- Results -->
			{#if !loading && processes.length > 0}
				<div class="mb-3 text-sm text-gray-400">
					Found {processes.length} process{processes.length === 1
						? ""
						: "es"}
				</div>
				<div class="space-y-2">
					{#each processes as process}
						<div
							class="bg-gray-800 border border-gray-700 rounded-lg p-3 hover:bg-gray-750 transition-colors {actionLoading[
								process.alias
							]
								? 'process-loading'
								: ''}"
						>
							<div class="flex items-center justify-between">
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-3 mb-1">
										<h3
											class="text-base font-semibold text-gray-100 truncate"
										>
											{process.alias}
										</h3>
										<span
											class="px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 {process.status ===
											'running'
												? 'bg-green-900 text-green-200 border border-green-700'
												: 'bg-red-900 text-red-200 border border-red-700'}"
										>
											{process.status}
										</span>
									</div>
									<div
										class="bg-gray-900 px-2 py-1 rounded text-xs text-gray-300 font-mono truncate"
									>
										{process.command}
									</div>
								</div>
								<div
									class="flex items-center gap-2 ml-3 flex-shrink-0"
								>
									<div class="flex items-center gap-2">
										<span class="text-xs text-gray-400">
											{process.status === "running"
												? "ON"
												: "OFF"}
										</span>
										<button
											onclick={() => {
												if (
													!actionLoading[
														process.alias
													]
												) {
													if (
														process.status ===
														"running"
													) {
														stopProcess(
															process.alias,
														);
													} else {
														startProcess(
															process.alias,
														);
													}
												}
											}}
											disabled={actionLoading[
												process.alias
											]}
											class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed {process.status ===
											'running'
												? 'bg-green-600'
												: 'bg-gray-600'}"
										>
											<span class="sr-only"
												>Toggle process</span
											>
											<span
												class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ease-in-out {process.status ===
												'running'
													? 'translate-x-6'
													: 'translate-x-1'}"
											>
												{#if actionLoading[process.alias]}
													<div
														class="flex items-center justify-center h-full"
													>
														<div
															class="w-2 h-2 bg-gray-400 rounded-full animate-pulse"
														></div>
													</div>
												{/if}
											</span>
										</button>
									</div>
									<button
										onclick={() =>
											toggleLogViewer(process.alias)}
										class="px-4 py-2 text-sm rounded h-full {showLogModal &&
										currentLogProcess === process.alias
											? 'bg-orange-600 hover:bg-orange-500'
											: 'bg-blue-600 hover:bg-blue-500'} text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
									>
										{showLogModal &&
										currentLogProcess === process.alias
											? "Close"
											: "Logs"}
									</button>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{:else if !loading && processes.length === 0 && !error}
				<div class="text-center py-8">
					<p class="text-gray-400 text-lg">No processes found</p>
					{#if searchQuery}
						<p class="text-gray-500 text-sm mt-2">
							Try a different search term or clear the search
						</p>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<!-- Log Viewer Panel -->
	{#each processes as process}
		<div
			class="w-1/2 h-full bg-gray-800 shadow-xl flex flex-col border-l border-gray-700 {currentLogProcess ===
			process.alias
				? 'block'
				: 'hidden'}"
			transition:fly={{ x: "100%", duration: 500, easing: quintOut }}
		>
			<!-- Panel Header -->
			<div
				class="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-700"
			>
				<h2 class="text-lg font-semibold text-gray-100">
					Logs for {currentLogProcess}
				</h2>
				<button
					onclick={closeLogViewer}
					class="text-gray-400 hover:text-gray-200 text-2xl font-bold"
				>
					×
				</button>
			</div>

			<!-- Log Content -->
			<div
				bind:this={logContainers[process.alias]}
				onscroll={checkScrollPosition}
				class="flex-1 overflow-y-auto p-4 bg-gray-900 text-green-400 font-mono text-sm"
			>
				{#if logMessages.length === 0}
					<div class="text-gray-500 text-center py-8">
						Connecting to log stream...
					</div>
				{:else}
					{#each logMessages as message (message.timestamp.getTime() + Math.random())}
						<div class="mb-1">
							<span class="text-gray-500 text-xs">
								[{message.timestamp.toLocaleTimeString()}]
							</span>
							<span
								class="ml-2 {message.source === 'stderr'
									? 'text-red-400'
									: 'text-green-400'}"
							>
								[{message.source.toUpperCase()}]
							</span>
							<span class="ml-2 whitespace-pre-wrap"
								>{message.data}</span
							>
						</div>
					{/each}
				{/if}
			</div>

			<!-- Panel Footer -->
			<div
				class="flex-shrink-0 p-4 border-t border-gray-700 bg-gray-800 flex justify-between"
			>
				<button
					onclick={clearLogs}
					class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-500"
				>
					Clear Logs
				</button>
				<button
					onclick={closeLogViewer}
					class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500"
				>
					Close
				</button>
			</div>
		</div>
	{/each}
</div>

<style>
	.loading-dots {
		animation: loading-pulse 1.5s infinite;
	}
	.process-loading {
		animation: process-blink 2s ease-in-out infinite;
	}
	@keyframes loading-pulse {
		0% {
			opacity: 0.3;
		}
		50% {
			opacity: 1;
		}
		100% {
			opacity: 0.3;
		}
	}
	@keyframes process-blink {
		0% {
			opacity: 0.6;
			transform: scale(1);
		}
		50% {
			opacity: 1;
			transform: scale(1);
		}
		100% {
			opacity: 0.6;
			transform: scale(1);
		}
	}
</style>
