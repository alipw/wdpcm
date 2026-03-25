<script lang="ts">
	import type { ProcessGroup } from "$lib/types/process-manager";

	let {
		groups,
		onCreateClick,
		onViewDetails,
		onEdit,
		onDelete,
		onStartGroup,
		onStopGroup,
	}: {
		groups: ProcessGroup[];
		onCreateClick: () => void;
		onViewDetails: (group: ProcessGroup) => void;
		onEdit: (group: ProcessGroup) => void;
		onDelete: (id: string) => void;
		onStartGroup: (group: ProcessGroup) => void;
		onStopGroup: (group: ProcessGroup) => void;
	} = $props();
</script>

<div class="mb-8">
	<div class="flex items-center justify-between mb-4">
		<h2 class="text-xl font-semibold text-gray-200">Process Groups</h2>
		<button
			onclick={onCreateClick}
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

	{#if groups.length > 0}
		<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
			{#each groups as group}
				<div
					class="bg-gray-800 border border-gray-700 rounded-xl p-4 hover:border-gray-600 transition-all group relative"
				>
					<div class="flex justify-between items-start mb-3">
						<h3
							class="font-bold text-gray-100 truncate pr-2"
							title={group.name}
						>
							{group.name}
						</h3>
						<div class="flex gap-1">
							<button
								onclick={() => onViewDetails(group)}
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
								onclick={() => onEdit(group)}
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
								onclick={() => onDelete(group.id)}
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
							onclick={() => onStartGroup(group)}
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
							onclick={() => onStopGroup(group)}
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
			<p class="text-gray-400 text-sm">No process groups created yet.</p>
			<button
				onclick={onCreateClick}
				class="mt-2 text-blue-400 hover:text-blue-300 text-sm font-medium"
			>
				Create your first group
			</button>
		</div>
	{/if}
</div>
