<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import { io, type Socket } from "socket.io-client";
	import { XtermAddon } from "@battlefieldduck/xterm-svelte";
	import type { Terminal } from "@battlefieldduck/xterm-svelte";
	import type { FitAddon } from "@xterm/addon-fit";
	import type { SearchAddon } from "@xterm/addon-search";
	import CreateGroupModal from "$lib/CreateGroupModal.svelte";
	import GroupDetailsModal from "$lib/GroupDetailsModal.svelte";
	import ProcessFormModal from "$lib/ProcessFormModal.svelte";
	import SettingsSidebar from "$lib/SettingsSidebar.svelte";
	import ProcessGroupsSection from "$lib/ProcessGroupsSection.svelte";
	import ProcessSearchToolbar from "$lib/ProcessSearchToolbar.svelte";
	import ProcessRow from "$lib/ProcessRow.svelte";
	import LogViewerPanel from "$lib/LogViewerPanel.svelte";
	import { getApiUrl, getSocketUrl } from "$lib/runtime-config";
	import { processLogTerminalOptions } from "$lib/terminal-options";
	import type {
		Process,
		ProcessGroup,
		WorktreeDiscovery,
	} from "$lib/types/process-manager";

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
	let worktreeSearchQuery = $state("");

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
			worktreeSearchQuery = "";
		}
	}

	function handleWindowResize() {
		fitTerminalSize(currentLogProcess);
	}

	function handleDocumentClick() {
		openWorktreeMenuAlias = null;
		worktreeSearchQuery = "";
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
		worktreeSearchQuery = "";
		if (openWorktreeMenuAlias === alias) {
			await fetchWorktreeInfo(alias);
		}
	}

	async function selectWorktree(
		process: Process,
		selectedWorktreePath: string | null,
	) {
		actionLoading[process.alias] = true;
		actionLoading = { ...actionLoading };

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
			await Promise.all([
				fetchProcesses(false),
				fetchWorktreeInfo(process.alias),
			]);
		} catch (err) {
			error =
				err instanceof Error ? err.message : "Failed to update worktree selection";
			await Promise.allSettled([
				fetchProcesses(false),
				fetchWorktreeInfo(process.alias),
			]);
		} finally {
			openWorktreeMenuAlias = null;
			worktreeSearchQuery = "";
			actionLoading[process.alias] = false;
			actionLoading = { ...actionLoading };
		}
	}

	async function worktreeMenuToggle(process: Process, event: MouseEvent) {
		event.stopPropagation();
		await toggleWorktreeMenu(process.alias);
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
		<SettingsSidebar
			bind:openLogOnStart
			bind:showProcessGroups
			onClose={() => (showSidebar = false)}
		/>
	{/if}

	<div class="flex h-screen bg-gray-800 filter transition-all">
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

				{#if showProcessGroups}
					<ProcessGroupsSection
						groups={processGroups}
						onCreateClick={() => (showCreateGroupModal = true)}
						onViewDetails={viewGroupDetails}
						onEdit={openEditGroupModal}
						onDelete={deleteGroup}
						onStartGroup={startGroup}
						onStopGroup={stopGroup}
					/>
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

				<ProcessSearchToolbar
					bind:searchQuery
					{loading}
					oninput={debouncedSearch}
					onclear={clearSearch}
					onnew={openCreateProcessModal}
				/>

				{#if error}
					<div
						class="mb-4 p-3 bg-red-900 border border-red-700 text-red-200 rounded-lg"
					>
						<p class="font-semibold">Error:</p>
						<p>{error}</p>
					</div>
				{/if}

				{#if loading}
					<div class="flex justify-center items-center py-8">
						<div
							class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"
						></div>
					</div>
				{/if}

				{#if !loading && processes.length > 0}
					<div class="mb-3 text-sm text-gray-400">
						Found {processes.length} process{processes.length === 1
							? ""
							: "es"}
					</div>
					<div class="space-y-2 h-full mb-4">
						{#each processes as process}
							<ProcessRow
								{process}
								worktreeInfo={worktreeInfoByAlias[process.alias]}
								worktreeLoading={worktreeLoadingByAlias[process.alias] ??
									false}
								worktreeError={worktreeErrorByAlias[process.alias] ?? ""}
								menuOpen={openWorktreeMenuAlias === process.alias}
								bind:worktreeSearchQuery
								rowBusy={debouncedActionLoading[process.alias] ?? false}
								runActionPending={actionLoading[process.alias] ?? false}
								onRowClick={() => toggleLogViewer(process.alias)}
								onToggleWorktreeMenu={(e) => worktreeMenuToggle(process, e)}
								onSelectWorktree={selectWorktree}
								onEdit={() => openEditProcessModal(process)}
								onDelete={() => handleDeleteProcess(process.alias)}
								onToggleRun={() => {
									if (!actionLoading[process.alias]) {
										if (process.status === "running") {
											stopProcess(process.alias);
										} else {
											startProcess(process.alias);
										}
									}
								}}
							/>
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

		<LogViewerPanel
			open={showLogModal}
			currentAlias={currentLogProcess}
			{processPids}
			{processes}
			terminalOptions={processLogTerminalOptions}
			onTerminalLoad={onTerminalLoadForProcess}
			showSearchBox={showSearchBox}
			bind:searchTerm
			bind:searchInput
			onFindNext={findNext}
			onFindPrevious={findPrevious}
			onSearchKeyDown={handleSearchKeyDown}
			onCloseSearch={closeSearch}
			onClearLogs={clearLogs}
			onClose={closeLogViewer}
		/>
	</div>
</div>
