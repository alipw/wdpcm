<script lang="ts">
	import {
		getWorktreeButtonTooltip,
		getWorktreeStateMessage,
	} from "$lib/worktree-helpers";
	import type { Process, WorktreeDiscovery } from "$lib/types/process-manager";

	let {
		process,
		menuOpen,
		searchQuery = $bindable(""),
		loading = false,
		errorText = "",
		info,
		disabled = false,
		onToggle,
		onSelectWorktree,
	}: {
		process: Process;
		menuOpen: boolean;
		searchQuery?: string;
		loading?: boolean;
		errorText?: string;
		info: WorktreeDiscovery | undefined;
		disabled?: boolean;
		onToggle: (event: MouseEvent) => void | Promise<void>;
		onSelectWorktree: (
			process: Process,
			path: string | null,
		) => void | Promise<void>;
	} = $props();

	const worktreeTooltip = $derived(getWorktreeButtonTooltip(process, info));
</script>

<div class="relative">
	<button
		onclick={onToggle}
		{disabled}
		class="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-600 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-gray-400 disabled:hover:bg-transparent"
		title={worktreeTooltip}
		aria-label="Switch worktree or branch"
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
				d="M7 5a2 2 0 114 0 2 2 0 01-4 0Zm0 14a2 2 0 114 0 2 2 0 01-4 0Zm6-12h2a3 3 0 013 3v1m0 0a2 2 0 100 4 2 2 0 000-4Zm0 0v-1m-8 6h5a3 3 0 003-3v-1"
			/>
		</svg>
	</button>
	{#if menuOpen}
		<div
			class="absolute right-0 top-10 z-20 w-80 rounded-xl border border-gray-700 bg-gray-900/95 shadow-2xl backdrop-blur-sm flex flex-col overflow-hidden"
			onclick={(event) => event.stopPropagation()}
			aria-hidden="true"
			role="presentation"
		>
			<div class="px-2 pt-2 pb-1">
				<!-- svelte-ignore a11y_autofocus -->
				<input
					type="text"
					autofocus
					bind:value={searchQuery}
					onclick={(e) => e.stopPropagation()}
					placeholder="Type to search all branches"
					class="w-full bg-gray-800 text-[13px] text-gray-200 placeholder-gray-500 border border-gray-700 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
				/>
			</div>
			<div
				class="max-h-72 overflow-y-auto p-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
			>
				{#if loading}
					<div class="px-2 py-2 text-[13px] text-gray-400">
						Detecting worktrees...
					</div>
				{:else if errorText}
					<div class="px-2 py-2 text-[13px] text-red-400">
						{errorText}
					</div>
				{:else if info}
					{#if info.state !== "ok" || info.worktrees.length === 0}
						<div class="px-2 py-2 text-[13px] text-gray-400">
							{getWorktreeStateMessage(info)}
						</div>
					{:else}
						{#if !searchQuery || "configured directory".includes(searchQuery.toLowerCase())}
							<div
								class="px-2 py-1 mt-1 text-[11px] font-semibold text-gray-500 uppercase tracking-wider"
							>
								Your branches
							</div>
							<button
								onclick={async (event) => {
									event.stopPropagation();
									await onSelectWorktree(process, null);
								}}
								class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors {!(
									info.selectedWorktreePath ??
									process.selectedWorktreePath
								)
									? 'bg-gray-700 text-gray-100 ring-1 ring-gray-600'
									: 'text-gray-300 hover:bg-gray-800'}"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-3.5 w-3.5 opacity-70 flex-shrink-0"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M6 3v12" /><circle
										cx="18"
										cy="6"
										r="3"
									/><circle cx="6" cy="18" r="3" /><path
										d="M18 9a9 9 0 0 1-9 9"
									/>
								</svg>
								<span class="truncate">Configured directory</span>
							</button>
						{/if}

						{@const filteredWorktrees = info.worktrees.filter(
							(w) =>
								!searchQuery ||
								(w.branch ?? "Detached")
									.toLowerCase()
									.includes(searchQuery.toLowerCase()) ||
								w.path
									.toLowerCase()
									.includes(searchQuery.toLowerCase()),
						)}
						{#if filteredWorktrees.length > 0}
							<div
								class="px-2 py-1 mt-1 text-[11px] font-semibold text-gray-500 uppercase tracking-wider"
							>
								Other branches
							</div>
							{#each filteredWorktrees as worktree}
								<button
									onclick={async (event) => {
										event.stopPropagation();
										await onSelectWorktree(
											process,
											worktree.path,
										);
									}}
									class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors {worktree.path ===
									(info.selectedWorktreePath ??
										process.selectedWorktreePath)
										? 'bg-gray-700 text-gray-100 ring-1 ring-gray-600'
										: 'text-gray-300 hover:bg-gray-800'}"
									title={worktree.path}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-3.5 w-3.5 opacity-70 flex-shrink-0"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M6 3v12" /><circle
											cx="18"
											cy="6"
											r="3"
										/><circle cx="6" cy="18" r="3" /><path
											d="M18 9a9 9 0 0 1-9 9"
										/>
									</svg>
									<span class="truncate"
										>{worktree.branch ?? "Detached"}</span
									>
								</button>
							{/each}
						{/if}
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</div>
