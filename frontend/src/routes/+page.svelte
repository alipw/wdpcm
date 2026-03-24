<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import { fly } from "svelte/transition";
	import { quintOut } from "svelte/easing";
	import { io, type Socket } from "socket.io-client";
	import { Xterm, XtermAddon } from "@battlefieldduck/xterm-svelte";
	import type {
		Terminal,
		ITerminalOptions,
	} from "@battlefieldduck/xterm-svelte";
	import type { FitAddon } from "@xterm/addon-fit";
	import type { SearchAddon } from "@xterm/addon-search";
	import CreateGroupModal from "$lib/CreateGroupModal.svelte";
	import GroupDetailsModal from "$lib/GroupDetailsModal.svelte";
	import ProcessFormModal from "$lib/ProcessFormModal.svelte";
	import { getApiUrl, getSocketUrl } from "$lib/runtime-config";

	type ProcessStatus = "running" | "stopped";
	type WorktreeDiscoveryState =
		| "ok"
		| "unconfigured"
		| "git_unavailable"
		| "not_repo";

	interface Process {
		alias: string;
		command: string;
		workingDirectory: string | null;
		selectedWorktreePath: string | null;
		status: ProcessStatus;
	}

	interface ProcessGroup {
		id: string;
		name: string;
		processAliases: string[];
	}

	interface WorktreeOption {
		path: string;
		branch: string | null;
		isCurrent: boolean;
	}

	interface WorktreeDiscovery {
		state: WorktreeDiscoveryState;
		workingDirectory: string | null;
		repoRoot: string | null;
		relativeProjectPath: string | null;
		selectedWorktreePath: string | null;
		worktrees: WorktreeOption[];
	}

	let processes: Process[] = $state([]);
	let processGroups: ProcessGroup[] = $state([]);
	let showCreateGroupModal = $state(false);
	let showGroupDetailsModal = $state(false);
	let selectedGroup: ProcessGroup | null = $state(null);
	let editingGroup: ProcessGroup | null = $state(null);
	let showProcessFormModal = $state(false);
	let editingProcess: Process | null = $state(null);
	let searchQuery = $state("");
	let loading = $state(false);
	let error = $state("");
	let actionLoading: Record<string, boolean> = $state({});
	let debouncedActionLoading: Record<string, boolean> = $state({});
	let loadingTimeouts: Record<string, ReturnType<typeof setTimeout>> =
		$state({});
	let worktreeInfoByAlias: Record<string, WorktreeDiscovery | undefined> =
		$state({});
	let worktreeLoadingByAlias: Record<string, boolean> = $state({});
	let worktreeErrorByAlias: Record<string, string> = $state({});
	let openWorktreeMenuAlias: string | null = $state(null);

	let searchTimeout: ReturnType<typeof setTimeout> | null = $state(null);
	let showLogModal = $state(false);
	let currentLogProcess = $state("");
	let showSearchBox = $state(false);
	let searchTerm = $state("");
	let searchInput = $state<HTMLInputElement | undefined>(undefined);
	let processPids: Record<string, number | null> = $state({});
	let terminals: Record<
		string,
		{
			term: Terminal;
			fitAddon: FitAddon;
			searchAddon: SearchAddon;
		} | null
	> = $state({});

	const terminalOptions: ITerminalOptions = {
		theme: {
			background: "#192738",
			foreground: "#d1d5db",
			cursor: "#f97316",
		},
		fontFamily: "monospace",
		cursorBlink: true,
	};

	let socket: Socket | null = $state(null);
	let showSidebar = $state(false);
	let openLogOnStart = $state(true);
	let showProcessGroups = $state(true);
	const socketUrl = getSocketUrl();

	function fitTerminalSize(alias: string) {
		const termInfo = terminals[alias];
		if (termInfo) {
			termInfo.fitAddon.fit();
			socket?.emit("pty-resize", {
				alias,
				cols: termInfo.term.cols,
				rows: termInfo.term.rows,
			});
		}
	}

	function updateProcessInList(alias: string, updates: Partial<Process>) {
		processes = processes.map((process) =>
			process.alias === alias ? { ...process, ...updates } : process,
		);
	}

	function clearProcessCaches(alias: string) {
		delete worktreeInfoByAlias[alias];
		delete worktreeLoadingByAlias[alias];
		delete worktreeErrorByAlias[alias];
		delete terminals[alias];
		delete processPids[alias];
		worktreeInfoByAlias = { ...worktreeInfoByAlias };
		worktreeLoadingByAlias = { ...worktreeLoadingByAlias };
		worktreeErrorByAlias = { ...worktreeErrorByAlias };
		terminals = { ...terminals };
		processPids = { ...processPids };
		if (openWorktreeMenuAlias === alias) {
			openWorktreeMenuAlias = null;
		}
	}

	function handleWindowResize() {
		fitTerminalSize(currentLogProcess);
	}

	function handleDocumentClick() {
		openWorktreeMenuAlias = null;
	}

	onMount(() => {
		const savedOpenLogOnStart = localStorage.getItem("openLogOnStart");
		if (savedOpenLogOnStart !== null) {
			openLogOnStart = JSON.parse(savedOpenLogOnStart);
		}

		const savedShowProcessGroups =
			localStorage.getItem("showProcessGroups");
		if (savedShowProcessGroups !== null) {
			showProcessGroups = JSON.parse(savedShowProcessGroups);
		}

		const savedGroups = localStorage.getItem("processGroups");
		if (savedGroups) {
			try {
				processGroups = JSON.parse(savedGroups);
			} catch (e) {
				console.error("Failed to parse process groups", e);
			}
		}

		void fetchProcesses();
		initSocketConnection();

		window.addEventListener("resize", handleWindowResize);
		document.addEventListener("click", handleDocumentClick);
	});

	$effect(() => {
		localStorage.setItem("openLogOnStart", JSON.stringify(openLogOnStart));
		localStorage.setItem(
			"showProcessGroups",
			JSON.stringify(showProcessGroups),
		);
	});

	$effect(() => {
		localStorage.setItem("processGroups", JSON.stringify(processGroups));
	});

	$effect(() => {
		for (const alias in actionLoading) {
			if (actionLoading[alias] && !debouncedActionLoading[alias]) {
				loadingTimeouts[alias] = setTimeout(() => {
					debouncedActionLoading[alias] = true;
					debouncedActionLoading = { ...debouncedActionLoading };
				}, 400);
			} else if (!actionLoading[alias] && debouncedActionLoading[alias]) {
				if (loadingTimeouts[alias]) {
					clearTimeout(loadingTimeouts[alias]);
					delete loadingTimeouts[alias];
				}
				debouncedActionLoading[alias] = false;
				debouncedActionLoading = { ...debouncedActionLoading };
			} else if (!actionLoading[alias] && loadingTimeouts[alias]) {
				clearTimeout(loadingTimeouts[alias]);
				delete loadingTimeouts[alias];
			}
		}
	});

	$effect(() => {
		if (showLogModal && currentLogProcess) {
			fitTerminalSize(currentLogProcess);
		}
	});

	onDestroy(() => {
		socket?.disconnect();
		Object.values(terminals).forEach((termInfo) => {
			termInfo?.term.dispose();
		});
		Object.values(loadingTimeouts).forEach((timeout) => {
			clearTimeout(timeout);
		});
		window.removeEventListener("resize", handleWindowResize);
		document.removeEventListener("click", handleDocumentClick);
	});

	function initSocketConnection() {
		socket = io(socketUrl);

		socket.on("connect", () => {
			for (const alias in terminals) {
				terminals[alias]?.term.write(
					"\r\n[Reconnected to log stream]\r\n",
				);
			}
		});

		socket.on("disconnect", () => {
			console.warn(
				"Socket.IO disconnected. It will try to reconnect automatically.",
			);
			for (const alias in terminals) {
				terminals[alias]?.term.write(
					"\r\n[Disconnected from log stream... attempting to reconnect]\r\n",
				);
			}
		});

		socket.on("connect_error", (err) => {
			console.error("Socket.IO connection error:", err);
		});

		socket.on(
			"process-data",
			(message: { alias: string; data: string }) => {
				terminals[message.alias]?.term.write(message.data);
			},
		);

		socket.on(
			"process-started",
			(message: { alias: string; pid: number }) => {
				processPids[message.alias] = message.pid;
				processPids = { ...processPids };
				terminals[message.alias]?.term.write(
					`\r\n[Process started with PID: ${message.pid}]\r\n`,
				);

				if (showLogModal && currentLogProcess === message.alias) {
					const termInfo = terminals[message.alias];
					if (termInfo) {
						termInfo.fitAddon.fit();
						socket?.emit("pty-resize", {
							alias: message.alias,
							cols: termInfo.term.cols,
							rows: termInfo.term.rows,
						});
					}
				}

				void fetchProcesses(false);
			},
		);

		socket.on(
			"process-exited",
			(message: { alias: string; code: number; signal: number }) => {
				processPids[message.alias] = null;
				processPids = { ...processPids };

				const term = terminals[message.alias]?.term;
				if (term) {
					term.write(
						`\r\n[Process exited with code: ${message.code}${message.signal ? `, signal: ${message.signal}` : ""}]\r\n`,
					);
				}

				updateProcessInList(message.alias, { status: "stopped" });
			},
		);

		socket.on("process-stopped", (message: { alias: string }) => {
			processPids[message.alias] = null;
			processPids = { ...processPids };
			terminals[message.alias]?.term.write(`\r\n[Process stopped]\r\n`);
			void fetchProcesses(false);
		});
	}

	async function fetchProcesses(showLoading: boolean = true) {
		if (showLoading) {
			loading = true;
		}
		error = "";

		try {
			const url = searchQuery
				? `${getApiUrl("/processes")}?search=${encodeURIComponent(searchQuery)}`
				: getApiUrl("/processes");
			const response = await fetch(url);

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const newProcesses = (await response.json()) as Process[];
			for (const process of newProcesses) {
				if (!(process.alias in terminals)) {
					terminals[process.alias] = null;
				}
			}

			const currentAliases = new Set(newProcesses.map((p) => p.alias));
			for (const alias in terminals) {
				if (!currentAliases.has(alias)) {
					terminals[alias]?.term.dispose();
					clearProcessCaches(alias);
				}
			}

			processes = newProcesses;
		} catch (err) {
			error = err instanceof Error ? err.message : "An error occurred";
			processes = [];
		} finally {
			if (showLoading) {
				loading = false;
			}
		}
	}

	async function fetchWorktreeInfo(alias: string) {
		worktreeLoadingByAlias[alias] = true;
		worktreeErrorByAlias[alias] = "";
		worktreeLoadingByAlias = { ...worktreeLoadingByAlias };
		worktreeErrorByAlias = { ...worktreeErrorByAlias };

		try {
			const response = await fetch(getApiUrl(`/processes/${alias}/worktrees`));
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to load worktrees");
			}

			worktreeInfoByAlias[alias] = data as WorktreeDiscovery;
			worktreeInfoByAlias = { ...worktreeInfoByAlias };
		} catch (err) {
			worktreeErrorByAlias[alias] =
				err instanceof Error ? err.message : "Failed to load worktrees";
			worktreeErrorByAlias = { ...worktreeErrorByAlias };
		} finally {
			worktreeLoadingByAlias[alias] = false;
			worktreeLoadingByAlias = { ...worktreeLoadingByAlias };
		}
	}

	async function toggleWorktreeMenu(alias: string) {
		openWorktreeMenuAlias = openWorktreeMenuAlias === alias ? null : alias;
		if (openWorktreeMenuAlias === alias) {
			await fetchWorktreeInfo(alias);
		}
	}

	function getWorktreeButtonLabel(process: Process) {
		const info = worktreeInfoByAlias[process.alias];
		const selectedPath =
			info?.selectedWorktreePath ?? process.selectedWorktreePath;
		if (!selectedPath) {
			return "Worktree";
		}

		const selectedOption = info?.worktrees.find(
			(worktree) => worktree.path === selectedPath,
		);
		return selectedOption?.branch ?? "Selected worktree";
	}

	function getWorktreeStateMessage(info: WorktreeDiscovery) {
		if (info.state === "unconfigured") {
			return "Set a working directory in the process settings to detect worktrees.";
		}
		if (info.state === "git_unavailable") {
			return "Git is not available on this machine.";
		}
		if (info.state === "not_repo") {
			return "The configured working directory is not inside a Git repository.";
		}
		if (info.worktrees.length === 0) {
			return "No worktrees were detected for this repository.";
		}
		return "";
	}

	async function selectWorktree(
		process: Process,
		selectedWorktreePath: string | null,
	) {
		if (process.status === "running") {
			return;
		}

		try {
			const response = await fetch(getApiUrl(`/processes/${process.alias}`), {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ selectedWorktreePath }),
			});
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error || "Failed to update worktree selection");
			}

			updateProcessInList(process.alias, {
				selectedWorktreePath: data.selectedWorktreePath ?? null,
			});
			await fetchWorktreeInfo(process.alias);
		} catch (err) {
			error =
				err instanceof Error ? err.message : "Failed to update worktree selection";
		}
	}

	async function startProcess(alias: string) {
		actionLoading[alias] = true;
		actionLoading = { ...actionLoading };

		if (openLogOnStart && !terminals[alias]) {
			openLogViewer(alias);
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		try {
			const response = await fetch(getApiUrl(`/processes/start/${alias}`), {
				method: "POST",
			});
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error || "Failed to start process");
			}
		} catch (err) {
			error =
				err instanceof Error ? err.message : "Failed to start process";
			await fetchProcesses(false);
		} finally {
			actionLoading[alias] = false;
			actionLoading = { ...actionLoading };
			if (openLogOnStart) {
				openLogViewer(alias);
			}
		}
	}

	async function stopProcess(alias: string) {
		actionLoading[alias] = true;
		actionLoading = { ...actionLoading };

		try {
			const response = await fetch(getApiUrl(`/processes/stop/${alias}`), {
				method: "POST",
			});
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error || `Failed to stop process: ${response.status}`);
			}
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

		if (showLogModal && currentLogProcess !== alias && showSearchBox) {
			closeSearch();
		}

		openLogViewer(alias);
	}

	function openLogViewer(alias: string) {
		currentLogProcess = alias;
		showLogModal = true;
		setTimeout(() => {
			terminals[alias]?.fitAddon.fit();
		}, 200);
	}

	function closeLogViewer() {
		showLogModal = false;
		if (showSearchBox) {
			closeSearch();
		}
	}

	async function onTerminalLoadForProcess(term: Terminal, alias: string) {
		const { FitAddon } = await XtermAddon.FitAddon();
		const { SearchAddon } = await XtermAddon.SearchAddon();
		const fitAddon = new FitAddon();
		const searchAddon = new SearchAddon();
		term.loadAddon(fitAddon);
		term.loadAddon(searchAddon);

		term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
			if (event.ctrlKey && event.key.toLowerCase() === "c") {
				const selection = term.getSelection();
				if (selection) {
					navigator.clipboard.writeText(selection);
					return false;
				}
			}
			if (event.ctrlKey && event.key.toLowerCase() === "f") {
				event.preventDefault();
				openSearch();
				return false;
			}
			if (event.key === "Escape" && showSearchBox) {
				event.preventDefault();
				closeSearch();
				return false;
			}
			return true;
		});

		terminals[alias] = { term, fitAddon, searchAddon };
		terminals = { ...terminals };

		setTimeout(() => {
			fitTerminalSize(alias);
		}, 100);

		term.write(`\r\n[Connected to log stream for ${alias}]\r\n`);
	}

	function clearLogs() {
		terminals[currentLogProcess]?.term.clear();
	}

	function debouncedSearch() {
		if (searchTimeout) {
			clearTimeout(searchTimeout);
		}

		searchTimeout = setTimeout(() => {
			void fetchProcesses();
		}, 500);
	}

	function clearSearch() {
		searchQuery = "";
		if (searchTimeout) {
			clearTimeout(searchTimeout);
		}
		void fetchProcesses();
	}

	function toggleSidebar() {
		showSidebar = !showSidebar;
	}

	function openSearch() {
		showSearchBox = true;
		setTimeout(() => {
			searchInput?.focus();
		}, 50);
	}

	function closeSearch() {
		const termInfo = terminals[currentLogProcess];
		if (termInfo) {
			termInfo.searchAddon.findNext("", { caseSensitive: false });
			termInfo.term.focus();
		}
		showSearchBox = false;
		searchTerm = "";
	}

	function findNext() {
		const termInfo = terminals[currentLogProcess];
		if (termInfo && searchTerm) {
			termInfo.searchAddon.findNext(searchTerm);
		}
	}

	function findPrevious() {
		const termInfo = terminals[currentLogProcess];
		if (termInfo && searchTerm) {
			termInfo.searchAddon.findPrevious(searchTerm);
		}
	}

	function handleSearchKeyDown(event: KeyboardEvent) {
		if (event.key === "Enter") {
			event.preventDefault();
			if (event.shiftKey) {
				findPrevious();
			} else {
				findNext();
			}
		} else if (event.key === "Escape") {
			event.preventDefault();
			closeSearch();
		}
	}

	function createGroup(name: string, aliases: string[]) {
		if (editingGroup) {
			processGroups = processGroups.map((group) =>
				group.id === editingGroup!.id
					? { ...group, name, processAliases: aliases }
					: group,
			);
			editingGroup = null;
		} else {
			processGroups = [
				...processGroups,
				{
					id: crypto.randomUUID(),
					name,
					processAliases: aliases,
				},
			];
		}
		showCreateGroupModal = false;
	}

	function openEditGroupModal(group: ProcessGroup) {
		editingGroup = group;
		showCreateGroupModal = true;
	}

	function deleteGroup(id: string) {
		if (confirm("Are you sure you want to delete this group?")) {
			processGroups = processGroups.filter((group) => group.id !== id);
		}
	}

	function viewGroupDetails(group: ProcessGroup) {
		selectedGroup = group;
		showGroupDetailsModal = true;
	}

	async function startGroup(group: ProcessGroup) {
		for (const alias of group.processAliases) {
			const process = processes.find((entry) => entry.alias === alias);
			if (process && process.status !== "running") {
				await startProcess(alias);
			}
		}
	}

	async function stopGroup(group: ProcessGroup) {
		for (const alias of group.processAliases) {
			const process = processes.find((entry) => entry.alias === alias);
			if (process && process.status === "running") {
				await stopProcess(alias);
			}
		}
	}

	function openCreateProcessModal() {
		editingProcess = null;
		showProcessFormModal = true;
	}

	function openEditProcessModal(process: Process) {
		editingProcess = process;
		showProcessFormModal = true;
	}

	async function handleSaveProcess(
		alias: string,
		command: string,
		workingDirectory: string | null,
	) {
		try {
			if (editingProcess) {
				const workingDirectoryChanged =
					(editingProcess.workingDirectory ?? null) !== workingDirectory;
				const response = await fetch(getApiUrl(`/processes/${alias}`), {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						command,
						workingDirectory,
						selectedWorktreePath: workingDirectoryChanged
							? null
							: editingProcess.selectedWorktreePath,
					}),
				});
				const data = await response.json();
				if (!response.ok) {
					throw new Error(data.error || "Failed to update process");
				}
			} else {
				const response = await fetch(getApiUrl("/processes"), {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ alias, command, workingDirectory }),
				});
				const data = await response.json();
				if (!response.ok) {
					throw new Error(data.error || "Failed to create process");
				}
			}

			showProcessFormModal = false;
			editingProcess = null;
			await fetchProcesses(false);
		} catch (err) {
			error = err instanceof Error ? err.message : "An error occurred";
			throw err;
		}
	}

	async function handleDeleteProcess(alias: string) {
		if (!confirm(`Are you sure you want to delete "${alias}"?`)) {
			return;
		}

		try {
			const response = await fetch(getApiUrl(`/processes/${alias}`), {
				method: "DELETE",
			});
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error || "Failed to delete process");
			}

			if (showLogModal && currentLogProcess === alias) {
				closeLogViewer();
			}

			clearProcessCaches(alias);
			await fetchProcesses(false);
		} catch (err) {
			error = err instanceof Error ? err.message : "An error occurred";
		}
	}
</script>

<div class="overflow-hidden">
	{#if showSidebar}
		<div class="fixed h-full p-3 overflow-hidden z-40">
			<div
				class="w-80 bg-gray-800 backdrop-blur-xl border border-gray-700 flex-shrink-0 h-full z-40 rounded-lg"
				transition:fly={{ x: "-100%", duration: 400, easing: quintOut }}
			>
				<!-- Sidebar Header -->
				<div
					class="flex items-center justify-between p-3 border-b border-gray-700"
				>
					<h2 class="text-lg font-semibold text-gray-100">
						Settings
					</h2>
					<button
						onclick={toggleSidebar}
						class="text-gray-400 hover:text-gray-200 text-2xl font-bold hover:bg-gray-700 rounded-lg p-2 cursor-pointer"
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
							class="flex items-center justify-between rounded-lg"
						>
							<div class="flex flex-col">
								<span class="text-sm font-medium text-gray-100"
									>Open Logs on Start</span
								>
								<span class="text-xs text-gray-400"
									>Automatically show logs when starting a
									process</span
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
									class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-400 ease-lienar focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 {openLogOnStart
										? 'bg-green-600'
										: 'bg-gray-600'} cursor-pointer"
								>
									<span class="sr-only"
										>Toggle open log on start</span
									>
									<span
										class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-400 ease-in-out {openLogOnStart
											? 'translate-x-6'
											: 'translate-x-1'}"
									>
									</span>
								</button>
							</div>
						</div>

						<!-- Show Process Groups Toggle -->
						<div
							class="flex items-center justify-between rounded-lg"
						>
							<div class="flex flex-col">
								<span class="text-sm font-medium text-gray-100"
									>Show Process Groups</span
								>
								<span class="text-xs text-gray-400"
									>Display the process groups section</span
								>
							</div>
							<div class="flex items-center gap-2">
								<span class="text-xs text-gray-400">
									{showProcessGroups ? "ON" : "OFF"}
								</span>
								<button
									onclick={() => {
										showProcessGroups = !showProcessGroups;
									}}
									class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-400 ease-lienar focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 {showProcessGroups
										? 'bg-green-600'
										: 'bg-gray-600'} cursor-pointer"
									aria-label="Toggle process groups visibility"
								>
									<span
										class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-400 ease-in-out {showProcessGroups
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
		</div>
	{/if}

	<div class="flex h-screen bg-gray-800 filter transition-all">
		<!-- Main Content -->
		<div
			class="flex-shrink-0 transition-all duration-400 ease-in-out overflow-y-auto {showLogModal
				? 'w-1/2'
				: 'w-full'}"
		>
			<button
				class="{showSidebar
					? 'opacity-40'
					: 'opacity-0 pointer-events-none'} fixed z-25 w-screen h-screen transition-all animate-all bg-black"
				onclick={toggleSidebar}
				aria-label="Close sidebar"
			></button>
			<div class="container mx-auto p-4 max-w-6xl">
				<!-- Header with hamburger menu -->
				<div class="flex items-center justify-between mb-6">
					<div class="flex items-center gap-4">
						<button
							onclick={toggleSidebar}
							class="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors cursor-pointer"
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

				<!-- Process Groups Section -->
				{#if showProcessGroups}
					<div class="mb-8">
						<div class="flex items-center justify-between mb-4">
							<h2 class="text-xl font-semibold text-gray-200">
								Process Groups
							</h2>
							<button
								onclick={() => (showCreateGroupModal = true)}
								class="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-sm font-medium shadow-lg shadow-blue-900/20"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4"
									viewBox="0 0 20 20"
									fill="currentColor"
								>
									<path
										fill-rule="evenodd"
										d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
										clip-rule="evenodd"
									/>
								</svg>
								Create Group
							</button>
						</div>

						{#if processGroups.length > 0}
							<div
								class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
							>
								{#each processGroups as group}
									<div
										class="bg-gray-800 border border-gray-700 rounded-xl p-4 hover:border-gray-600 transition-all group relative"
									>
										<div
											class="flex justify-between items-start mb-3"
										>
											<h3
												class="font-bold text-gray-100 truncate pr-2"
												title={group.name}
											>
												{group.name}
											</h3>
											<div class="flex gap-1">
												<button
													onclick={() =>
														viewGroupDetails(group)}
													class="p-1 text-gray-400 hover:text-blue-400 transition-colors rounded"
													title="View Details"
													aria-label="View group details"
												>
													<svg
														xmlns="http://www.w3.org/2000/svg"
														class="h-4 w-4"
														fill="none"
														viewBox="0 0 24 24"
														stroke="currentColor"
													>
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															stroke-width="2"
															d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
														/>
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															stroke-width="2"
															d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
														/>
													</svg>
												</button>
												<button
													onclick={() =>
														openEditGroupModal(group)}
													class="p-1 text-gray-400 hover:text-green-400 transition-colors rounded"
													title="Edit Group"
													aria-label="Edit group"
												>
													<svg
														xmlns="http://www.w3.org/2000/svg"
														class="h-4 w-4"
														fill="none"
														viewBox="0 0 24 24"
														stroke="currentColor"
													>
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															stroke-width="2"
															d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
														/>
													</svg>
												</button>
												<button
													onclick={() =>
														deleteGroup(group.id)}
													class="p-1 text-gray-400 hover:text-red-400 transition-colors rounded"
													title="Delete Group"
													aria-label="Delete group"
												>
													<svg
														xmlns="http://www.w3.org/2000/svg"
														class="h-4 w-4"
														fill="none"
														viewBox="0 0 24 24"
														stroke="currentColor"
													>
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															stroke-width="2"
															d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
														/>
													</svg>
												</button>
											</div>
										</div>

										<div class="text-xs text-gray-400 mb-4">
											{group.processAliases.length} processes
										</div>

										<div class="flex gap-2">
											<button
												onclick={() =>
													startGroup(group)}
												class="flex-1 py-2 bg-gray-700 hover:bg-green-600 text-gray-200 hover:text-white rounded-lg transition-colors text-sm font-medium flex justify-center items-center gap-1"
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-3 w-3"
													viewBox="0 0 20 20"
													fill="currentColor"
												>
													<path
														fill-rule="evenodd"
														d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
														clip-rule="evenodd"
													/>
												</svg>
												Start
											</button>
											<button
												onclick={() => stopGroup(group)}
												class="flex-1 py-2 bg-gray-700 hover:bg-red-600 text-gray-200 hover:text-white rounded-lg transition-colors text-sm font-medium flex justify-center items-center gap-1"
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-3 w-3"
													viewBox="0 0 20 20"
													fill="currentColor"
												>
													<path
														fill-rule="evenodd"
														d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z"
														clip-rule="evenodd"
													/>
												</svg>
												Stop
											</button>
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<div
								class="text-center py-8 bg-gray-800/50 border border-gray-700/50 rounded-xl border-dashed"
							>
								<p class="text-gray-400 text-sm">
									No process groups created yet.
								</p>
								<button
									onclick={() =>
										(showCreateGroupModal = true)}
									class="mt-2 text-blue-400 hover:text-blue-300 text-sm font-medium"
								>
									Create your first group
								</button>
							</div>
						{/if}
					</div>
				{/if}

				{#if showCreateGroupModal}
					<CreateGroupModal
						{processes}
						group={editingGroup}
						onSave={createGroup}
						onCancel={() => {
							showCreateGroupModal = false;
							editingGroup = null;
						}}
					/>
				{/if}

				{#if showGroupDetailsModal && selectedGroup}
					<GroupDetailsModal
						group={selectedGroup}
						allProcesses={processes}
						onClose={() => {
							showGroupDetailsModal = false;
							selectedGroup = null;
						}}
					/>
				{/if}

				{#if showProcessFormModal}
					<ProcessFormModal
						process={editingProcess}
						onSave={handleSaveProcess}
						onCancel={() => {
							showProcessFormModal = false;
							editingProcess = null;
						}}
					/>
				{/if}

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
					<button
						onclick={openCreateProcessModal}
						class="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium shadow-lg shadow-blue-900/20"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
							viewBox="0 0 20 20"
							fill="currentColor"
						>
							<path
								fill-rule="evenodd"
								d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
								clip-rule="evenodd"
							/>
						</svg>
						New
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
					<div class="space-y-2 h-full mb-4">
						{#each processes as process}
							<div
								onclick={() => toggleLogViewer(process.alias)}
								class="bg-gray-800 hover:bg-gray-700 rounded-lg p-2 transition-colors cursor-pointer {debouncedActionLoading[
									process.alias
								]
									? 'process-loading'
									: ''}"
								aria-label="Toggle log viewer"
								aria-hidden="true"
								title="Toggle log viewer"
							>
								<div class="flex items-center justify-between">
									<div class="flex-1 min-w-0">
										<div
											class="flex items-center gap-3 mb-1"
										>
											<h3
												class="text-base font-semibold text-gray-100 truncate"
											>
												{process.alias}
											</h3>
										</div>
										<div
											class="py-1 rounded text-xs text-gray-300 font-mono truncate"
										>
											{process.command}
										</div>
										{#if process.workingDirectory}
											<div class="mt-1 text-[11px] text-gray-500 font-mono truncate">
												CWD: {process.workingDirectory}
											</div>
										{/if}
									</div>
									<div
										class="flex items-center gap-2 ml-3 flex-shrink-0"
									>
										<!-- Edit/Delete buttons -->
										<div
											class="flex items-center gap-1 mr-2"
											onclick={(e) => e.stopPropagation()}
											aria-hidden="true"
										>
											<div class="relative">
												<button
													onclick={async (event) => {
														event.stopPropagation();
														await toggleWorktreeMenu(process.alias);
													}}
													disabled={process.status === "running"}
													class="p-1.5 text-gray-400 hover:text-amber-300 hover:bg-gray-600 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-gray-400 disabled:hover:bg-transparent"
													title={process.status === "running"
														? "Stop process before changing worktree"
														: getWorktreeButtonLabel(process)}
													aria-label="Select worktree"
												>
													<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 5a2 2 0 114 0 2 2 0 01-4 0Zm0 14a2 2 0 114 0 2 2 0 01-4 0Zm6-12h2a3 3 0 013 3v1m0 0a2 2 0 100 4 2 2 0 000-4Zm0 0v-1m-8 6h5a3 3 0 003-3v-1" />
													</svg>
												</button>
												{#if openWorktreeMenuAlias === process.alias}
													<div
														class="absolute right-0 top-10 z-20 w-80 rounded-xl border border-gray-700 bg-gray-900/95 shadow-2xl backdrop-blur-sm"
														onclick={(event) => event.stopPropagation()}
														aria-hidden="true"
													>
														<div class="border-b border-gray-700 px-3 py-2">
															<div class="text-sm font-semibold text-gray-100">
																Worktree selection
															</div>
															<div class="mt-1 text-xs text-gray-400 truncate">
																{process.workingDirectory ?? "No working directory configured"}
															</div>
														</div>
														<div class="max-h-72 overflow-y-auto p-2">
															{#if worktreeLoadingByAlias[process.alias]}
																<div class="px-3 py-4 text-sm text-gray-400">
																	Detecting worktrees...
																</div>
															{:else if worktreeErrorByAlias[process.alias]}
																<div class="px-3 py-4 text-sm text-red-300">
																	{worktreeErrorByAlias[process.alias]}
																</div>
															{:else if worktreeInfoByAlias[process.alias]}
																{@const info = worktreeInfoByAlias[process.alias]!}
																{#if info.state !== "ok" || info.worktrees.length === 0}
																	<div class="px-3 py-4 text-sm text-gray-400">
																		{getWorktreeStateMessage(info)}
																	</div>
																{:else}
																	<button
																		onclick={async (event) => {
																			event.stopPropagation();
																			await selectWorktree(process, null);
																			openWorktreeMenuAlias = null;
																		}}
																		class="mb-1 flex w-full flex-col rounded-lg px-3 py-2 text-left transition-colors {!(info.selectedWorktreePath ?? process.selectedWorktreePath)
																			? 'bg-gray-800 text-gray-100'
																			: 'text-gray-300 hover:bg-gray-800'}"
																	>
																		<span class="text-sm font-medium">
																			Configured directory
																		</span>
																		<span class="text-xs text-gray-400 font-mono truncate">
																			{info.workingDirectory}
																		</span>
																	</button>
																	{#each info.worktrees as worktree}
																		<button
																			onclick={async (event) => {
																				event.stopPropagation();
																				await selectWorktree(process, worktree.path);
																				openWorktreeMenuAlias = null;
																			}}
																			class="mb-1 flex w-full flex-col rounded-lg px-3 py-2 text-left transition-colors {worktree.path === (info.selectedWorktreePath ?? process.selectedWorktreePath)
																				? 'bg-amber-500/10 text-amber-100 ring-1 ring-amber-500/40'
																				: 'text-gray-300 hover:bg-gray-800'}"
																		>
																			<div class="flex items-center gap-2">
																				<span class="text-sm font-medium">
																					{worktree.branch ?? "Detached"}
																				</span>
																				{#if worktree.isCurrent}
																					<span class="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-200">
																						current
																					</span>
																				{/if}
																			</div>
																			<span class="text-xs text-gray-400 font-mono truncate">
																				{worktree.path}
																			</span>
																		</button>
																	{/each}
																{/if}
															{/if}
														</div>
													</div>
												{/if}
											</div>
											<button
												onclick={() => openEditProcessModal(process)}
												class="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-600 rounded transition-colors"
												title="Edit process"
												aria-label="Edit process"
											>
												<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
												</svg>
											</button>
											<button
												onclick={() => handleDeleteProcess(process.alias)}
												disabled={process.status === "running"}
												class="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-600 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-gray-400 disabled:hover:bg-transparent"
												title={process.status === "running" ? "Stop process before deleting" : "Delete process"}
												aria-label="Delete process"
											>
												<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
												</svg>
											</button>
										</div>
										<div
											class="flex items-center gap-2"
											onclick={(e) => e.stopPropagation()}
											aria-label="Toggle process"
											aria-hidden="true"
											title="Toggle process"
										>
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
												disabled={debouncedActionLoading[
													process.alias
												]}
												class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-400 ease-in-out focus:outline-none focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed {process.status ===
												'running'
													? 'bg-green-600'
													: 'bg-gray-600'} cursor-pointer"
											>
												<span class="sr-only"
													>Toggle process</span
												>
												<span
													class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-400 ease-in-out {process.status ===
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
		<div
			class="w-1/2 h-full bg-gray-800 shadow-xl flex flex-col border-l border-gray-700 fixed right-0 top-0 transition-transform duration-400 ease-in-out {showLogModal
				? 'translate-x-0'
				: 'translate-x-full'}"
		>
			<!-- Panel Header -->
			<div
				class="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-700"
			>
				<div class="flex items-center gap-2">
					{#if processPids[currentLogProcess]}
						<span
							class="px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 bg-green-900 text-green-200 border border-green-700"
							title="Process ID"
						>
							PID: {processPids[currentLogProcess]}
						</span>
					{/if}
					<h2 class="text-lg font-semibold text-gray-100">
						Logs for {currentLogProcess}
					</h2>
				</div>
				<button
					onclick={closeLogViewer}
					class="text-gray-400 hover:text-gray-200 text-2xl font-bold"
				>
					×
				</button>
			</div>

			<!-- Log Content -->
			<div class="flex-1 p-1 bg-gray-800 relative">
				{#if showSearchBox && showLogModal}
					<div
						transition:fly={{ y: -10, duration: 200 }}
						class="absolute top-2 right-2 bg-gray-800 border border-gray-700 rounded-lg p-2 flex items-center gap-2 shadow-lg z-10 backdrop-blur-sm"
					>
						<input
							type="text"
							bind:this={searchInput}
							bind:value={searchTerm}
							oninput={() => findNext()}
							onkeydown={handleSearchKeyDown}
							placeholder="Search..."
							class="w-48 px-2 py-1 bg-gray-700 text-gray-100 rounded border border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
						/>
						<button
							onclick={findPrevious}
							class="p-1 text-gray-300 hover:bg-gray-700 rounded-md"
							title="Previous (Shift+Enter)"
							aria-label="Previous (Shift+Enter)"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-5 w-5"
								viewBox="0 0 20 20"
								fill="currentColor"
								><path
									fill-rule="evenodd"
									d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
									clip-rule="evenodd"
								/></svg
							>
						</button>
						<button
							onclick={findNext}
							class="p-1 text-gray-300 hover:bg-gray-700 rounded-md"
							title="Next (Enter)"
							aria-label="Next (Enter)"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-5 w-5"
								viewBox="0 0 20 20"
								fill="currentColor"
								><path
									fill-rule="evenodd"
									d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
									clip-rule="evenodd"
								/></svg
							>
						</button>
						<button
							onclick={closeSearch}
							class="p-1 text-gray-300 hover:bg-gray-700 rounded-md"
							title="Close (Esc)"
							aria-label="Close (Esc)"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-5 w-5"
								viewBox="0 0 20 20"
								fill="currentColor"
								><path
									fill-rule="evenodd"
									d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
									clip-rule="evenodd"
								/></svg
							>
						</button>
					</div>
				{/if}
				{#each processes as process}
					<div
						class="w-full h-full absolute top-0 left-0 transition-opacity duration-400 ease-in-out {showLogModal &&
						currentLogProcess === process.alias
							? 'opacity-100'
							: 'opacity-0 pointer-events-none'}"
					>
						<Xterm
							class="w-full h-full rounded-full"
							options={terminalOptions}
							onLoad={(term) =>
								onTerminalLoadForProcess(term, process.alias)}
						/>
					</div>
				{/each}
			</div>

			<!-- Panel Footer -->
			<div
				class="flex-shrink-0 p-4 border-gray-700 bg-gray-800 flex justify-between"
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
	</div>
</div>

<style>
	.process-loading {
		animation: process-blink 2s ease-in-out infinite;
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
