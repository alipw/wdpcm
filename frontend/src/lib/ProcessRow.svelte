<script lang="ts">
	import WorktreePickerPopover from "$lib/WorktreePickerPopover.svelte";
	import { getWorktreeButtonLabel } from "$lib/worktree-helpers";
	import type { Process, WorktreeDiscovery } from "$lib/types/process-manager";

	let {
		process,
		worktreeInfo,
		worktreeLoading = false,
		worktreeError = "",
		menuOpen,
		worktreeSearchQuery = $bindable(""),
		rowBusy = false,
		runActionPending = false,
		onRowClick,
		onToggleWorktreeMenu,
		onSelectWorktree,
		onEdit,
		onDelete,
		onToggleRun,
	}: {
		process: Process;
		worktreeInfo: WorktreeDiscovery | undefined;
		worktreeLoading?: boolean;
		worktreeError?: string;
		menuOpen: boolean;
		worktreeSearchQuery?: string;
		rowBusy?: boolean;
		runActionPending?: boolean;
		onRowClick: () => void;
		onToggleWorktreeMenu: (event: MouseEvent) => void | Promise<void>;
		onSelectWorktree: (
			process: Process,
			path: string | null,
		) => void | Promise<void>;
		onEdit: () => void;
		onDelete: () => void;
		onToggleRun: () => void;
	} = $props();

	const worktreeLabel = $derived(
		getWorktreeButtonLabel(process, worktreeInfo),
	);
</script>

<div
	onclick={onRowClick}
	class="bg-gray-800 hover:bg-gray-700 rounded-lg p-2 transition-colors cursor-pointer {rowBusy
		? 'process-loading'
		: ''}"
	aria-label="Toggle log viewer"
	aria-hidden="true"
	title="Toggle log viewer"
	role="presentation"
>
	<div class="flex items-center justify-between">
		<div class="flex-1 min-w-0">
			<div
				class="flex flex-wrap items-center gap-x-2 gap-y-0 min-w-0 mb-1"
			>
				<h3 class="text-base font-semibold text-gray-100 truncate">
					{process.alias}
				</h3>
				{#if worktreeLabel !== "Worktree"}
					<span class="text-gray-600 select-none" aria-hidden="true"
						>·</span
					>
					<span
						class="inline-flex items-center gap-1 min-w-0 max-w-[min(14rem,42vw)] text-gray-500"
						title={worktreeLabel}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-3 w-3 shrink-0 opacity-75"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M6 3v12" /><circle
								cx="18"
								cy="6"
								r="3"
							/><circle cx="6" cy="18" r="3" /><path
								d="M18 9a9 9 0 0 1-9 9"
							/>
						</svg>
						<span class="text-xs font-mono truncate min-w-0">
							{worktreeLabel}
						</span>
					</span>
				{/if}
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
		<div class="flex items-center gap-2 ml-3 flex-shrink-0">
			<div
				class="flex items-center gap-1 mr-2"
				onclick={(e) => e.stopPropagation()}
				aria-hidden="true"
				role="presentation"
			>
				<WorktreePickerPopover
					{process}
					menuOpen={menuOpen}
					bind:searchQuery={worktreeSearchQuery}
					loading={worktreeLoading}
					errorText={worktreeError}
					info={worktreeInfo}
					disabled={rowBusy}
					onToggle={onToggleWorktreeMenu}
					onSelectWorktree={onSelectWorktree}
				/>
				<button
					onclick={onEdit}
					class="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-600 rounded transition-colors"
					title="Edit process"
					aria-label="Edit process"
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
					onclick={onDelete}
					disabled={process.status === "running"}
					class="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-600 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-gray-400 disabled:hover:bg-transparent"
					title={process.status === "running"
						? "Stop process before deleting"
						: "Delete process"}
					aria-label="Delete process"
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
			<div
				class="flex items-center gap-2"
				onclick={(e) => e.stopPropagation()}
				aria-label="Toggle process"
				aria-hidden="true"
				title="Toggle process"
				role="presentation"
			>
				<span class="text-xs text-gray-400">
					{process.status === "running" ? "ON" : "OFF"}
				</span>
				<button
					onclick={onToggleRun}
					disabled={rowBusy}
					class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-400 ease-in-out focus:outline-none focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed {process.status ===
					'running'
						? 'bg-green-600'
						: 'bg-gray-600'} cursor-pointer"
				>
					<span class="sr-only">Toggle process</span>
					<span
						class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-400 ease-in-out {process.status ===
						'running'
							? 'translate-x-6'
							: 'translate-x-1'}"
					>
						{#if runActionPending}
							<div class="flex items-center justify-center h-full">
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
