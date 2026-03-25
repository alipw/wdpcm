<script lang="ts">
	import { fly } from "svelte/transition";
	import { Xterm } from "@battlefieldduck/xterm-svelte";
	import type { Terminal } from "@battlefieldduck/xterm-svelte";
	import type { ITerminalOptions } from "@battlefieldduck/xterm-svelte";
	import type { Process } from "$lib/types/process-manager";

	let {
		open = false,
		currentAlias,
		processPids,
		processes,
		terminalOptions,
		onTerminalLoad,
		showSearchBox = false,
		searchTerm = $bindable(""),
		searchInput = $bindable<HTMLInputElement | undefined>(undefined),
		onFindNext,
		onFindPrevious,
		onSearchKeyDown,
		onCloseSearch,
		onClearLogs,
		onClose,
	}: {
		open?: boolean;
		currentAlias: string;
		processPids: Record<string, number | null>;
		processes: Process[];
		terminalOptions: ITerminalOptions;
		onTerminalLoad: (term: Terminal, alias: string) => void;
		showSearchBox?: boolean;
		searchTerm?: string;
		searchInput?: HTMLInputElement | undefined;
		onFindNext: () => void;
		onFindPrevious: () => void;
		onSearchKeyDown: (event: KeyboardEvent) => void;
		onCloseSearch: () => void;
		onClearLogs: () => void;
		onClose: () => void;
	} = $props();
</script>

<div
	class="w-1/2 h-full bg-gray-800 shadow-xl flex flex-col border-l border-gray-700 fixed right-0 top-0 transition-transform duration-400 ease-in-out {open
		? 'translate-x-0'
		: 'translate-x-full'}"
>
	<div
		class="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-700"
	>
		<div class="flex items-center gap-2">
			{#if currentAlias && processPids[currentAlias]}
				<span
					class="px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 bg-green-900 text-green-200 border border-green-700"
					title="Process ID"
				>
					PID: {processPids[currentAlias]}
				</span>
			{/if}
			<h2 class="text-lg font-semibold text-gray-100">
				Logs for {currentAlias}
			</h2>
		</div>
		<button
			onclick={onClose}
			class="text-gray-400 hover:text-gray-200 text-2xl font-bold"
		>
			×
		</button>
	</div>

	<div class="flex-1 p-1 bg-gray-800 relative">
		{#if showSearchBox && open}
			<div
				transition:fly={{ y: -10, duration: 200 }}
				class="absolute top-2 right-2 bg-gray-800 border border-gray-700 rounded-lg p-2 flex items-center gap-2 shadow-lg z-10 backdrop-blur-sm"
			>
				<input
					type="text"
					bind:this={searchInput}
					bind:value={searchTerm}
					oninput={() => onFindNext()}
					onkeydown={onSearchKeyDown}
					placeholder="Search..."
					class="w-48 px-2 py-1 bg-gray-700 text-gray-100 rounded border border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
				/>
				<button
					onclick={onFindPrevious}
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
					onclick={onFindNext}
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
					onclick={onCloseSearch}
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
				class="w-full h-full absolute top-0 left-0 transition-opacity duration-400 ease-in-out {open &&
				currentAlias === process.alias
					? 'opacity-100'
					: 'opacity-0 pointer-events-none'}"
			>
				<Xterm
					class="w-full h-full rounded-full"
					options={terminalOptions}
					onLoad={(term) => onTerminalLoad(term, process.alias)}
				/>
			</div>
		{/each}
	</div>

	<div
		class="flex-shrink-0 p-4 border-gray-700 bg-gray-800 flex justify-between"
	>
		<button
			onclick={onClearLogs}
			class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-500"
		>
			Clear Logs
		</button>
		<button
			onclick={onClose}
			class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500"
		>
			Close
		</button>
	</div>
</div>
