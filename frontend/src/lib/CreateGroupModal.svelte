<script lang="ts">
    import { fade, scale } from "svelte/transition";

    interface Process {
        alias: string;
        command: string;
        status: string;
    }

    interface ProcessGroup {
        id: string;
        name: string;
        processAliases: string[];
    }

    let {
        processes,
        group = null,
        onSave,
        onCancel,
    }: {
        processes: Process[];
        group?: ProcessGroup | null;
        onSave: (name: string, selectedAliases: string[]) => void;
        onCancel: () => void;
    } = $props();

    let groupName = $state(group?.name ?? "");
    let selectedAliases: string[] = $state(group?.processAliases ?? []);
    
    const isEditing = $derived(group !== null);

    function toggleSelection(alias: string) {
        if (selectedAliases.includes(alias)) {
            selectedAliases = selectedAliases.filter((a) => a !== alias);
        } else {
            selectedAliases = [...selectedAliases, alias];
        }
    }

    function handleSave() {
        if (groupName.trim() && selectedAliases.length > 0) {
            onSave(groupName, selectedAliases);
        }
    }
</script>

<div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    transition:fade={{ duration: 200 }}
>
    <div
        class="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden"
        transition:scale={{ duration: 200, start: 0.95 }}
    >
        <div
            class="p-4 border-b border-gray-700 flex justify-between items-center"
        >
            <h2 class="text-xl font-bold text-gray-100">
                {isEditing ? "Edit Process Group" : "Create Process Group"}
            </h2>
            <button
                onclick={onCancel}
                class="text-gray-400 hover:text-gray-200 transition-colors"
                aria-label="Close modal"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M6 18L18 6M6 6l12 12"
                    />
                </svg>
            </button>
        </div>

        <div class="p-4 space-y-4">
            <div>
                <label
                    for="groupName"
                    class="block text-sm font-medium text-gray-300 mb-1"
                    >Group Name</label
                >
                <input
                    id="groupName"
                    type="text"
                    bind:value={groupName}
                    placeholder="e.g., Backend Services"
                    class="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
            </div>

            <div>
                <span class="block text-sm font-medium text-gray-300 mb-2"
                    >Select Processes</span
                >
                <div
                    class="max-h-[60vh] overflow-y-auto space-y-2 pr-1 custom-scrollbar"
                >
                    {#each processes as process}
                        <button
                            onclick={() => toggleSelection(process.alias)}
                            class="w-full flex items-center justify-between p-3 rounded-lg border transition-all duration-200 {selectedAliases.includes(
                                process.alias,
                            )
                                ? 'bg-blue-900/30 border-blue-500/50'
                                : 'bg-gray-700/50 border-gray-600 hover:bg-gray-700'}"
                        >
                            <div class="flex flex-col items-start">
                                <span class="font-medium text-gray-200"
                                    >{process.alias}</span
                                >
                                <span
                                    class="text-xs text-gray-400 font-mono truncate max-w-[200px]"
                                    >{process.command}</span
                                >
                            </div>
                            <div
                                class="w-5 h-5 rounded border flex items-center justify-center {selectedAliases.includes(
                                    process.alias,
                                )
                                    ? 'bg-blue-500 border-blue-500'
                                    : 'border-gray-500'}"
                            >
                                {#if selectedAliases.includes(process.alias)}
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        class="h-3.5 w-3.5 text-white"
                                        viewBox="0 0 20 20"
                                        fill="currentColor"
                                    >
                                        <path
                                            fill-rule="evenodd"
                                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                            clip-rule="evenodd"
                                        />
                                    </svg>
                                {/if}
                            </div>
                        </button>
                    {/each}
                </div>
            </div>
        </div>

        <div
            class="p-4 border-t border-gray-700 bg-gray-800/50 flex justify-end gap-3"
        >
            <button
                onclick={onCancel}
                class="px-4 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
            >
                Cancel
            </button>
            <button
                onclick={handleSave}
                disabled={!groupName.trim() || selectedAliases.length === 0}
                class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium shadow-lg shadow-blue-900/20"
            >
                {isEditing ? "Save Changes" : "Create Group"}
            </button>
        </div>
    </div>
</div>

<style>
    .custom-scrollbar::-webkit-scrollbar {
        width: 6px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
        background: rgba(31, 41, 55, 0.5);
        border-radius: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(75, 85, 99, 0.8);
        border-radius: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
        background: rgba(107, 114, 128, 1);
    }
</style>
