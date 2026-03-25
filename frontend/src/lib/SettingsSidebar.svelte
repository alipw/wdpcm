<script lang="ts">
	import { fly } from "svelte/transition";
	import { quintOut } from "svelte/easing";

	let {
		openLogOnStart = $bindable(false),
		showProcessGroups = $bindable(false),
		onClose,
	}: {
		openLogOnStart?: boolean;
		showProcessGroups?: boolean;
		onClose: () => void;
	} = $props();
</script>

<div class="fixed h-full p-3 overflow-hidden z-40">
	<div
		class="w-80 bg-gray-800 backdrop-blur-xl border border-gray-700 flex-shrink-0 h-full z-40 rounded-lg"
		transition:fly={{ x: "-100%", duration: 400, easing: quintOut }}
	>
		<div
			class="flex items-center justify-between p-3 border-b border-gray-700"
		>
			<h2 class="text-lg font-semibold text-gray-100">Settings</h2>
			<button
				onclick={onClose}
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

		<div class="p-4">
			<nav class="space-y-2">
				<div class="flex items-center justify-between rounded-lg">
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
							class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-400 ease-lienar focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 {openLogOnStart
								? 'bg-green-600'
								: 'bg-gray-600'} cursor-pointer"
						>
							<span class="sr-only">Toggle open log on start</span>
							<span
								class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-400 ease-in-out {openLogOnStart
									? 'translate-x-6'
									: 'translate-x-1'}"
							>
							</span>
						</button>
					</div>
				</div>

				<div class="flex items-center justify-between rounded-lg">
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
