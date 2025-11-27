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
        group,
        allProcesses,
        onClose,
    }: {
        group: ProcessGroup;
        allProcesses: Process[];
        onClose: () => void;
    } = $props();

    let groupProcesses = $derived(
        group.processAliases
            .map((alias) => allProcesses.find((p) => p.alias === alias))
            .filter((p): p is Process => p !== undefined),
    );
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
            <h2 class="text-xl font-bold text-gray-100">{group.name}</h2>
            <button
                onclick={onClose}
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

        <div class="p-4">
            <h3
                class="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wider"
            >
                Included Processes ({groupProcesses.length})
            </h3>
            <div
                class="max-h-[60vh] overflow-y-auto space-y-2 pr-1 custom-scrollbar"
            >
                {#each groupProcesses as process}
                    <div
                        class="flex items-center justify-between p-3 bg-gray-700/30 border border-gray-700 rounded-lg"
                    >
                        <div class="flex flex-col min-w-0">
                            <span class="font-medium text-gray-200 truncate"
                                >{process.alias}</span
                            >
                            <span
                                class="text-xs text-gray-400 font-mono truncate"
                                >{process.command}</span
                            >
                        </div>
                        <div class="flex items-center gap-2 ml-3">
                            <span
                                class="w-2 h-2 rounded-full {process.status ===
                                'running'
                                    ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]'
                                    : 'bg-gray-500'}"
                            ></span>
                            <span class="text-xs text-gray-400 capitalize"
                                >{process.status}</span
                            >
                        </div>
                    </div>
                {/each}
            </div>
        </div>

        <div
            class="p-4 border-t border-gray-700 bg-gray-800/50 flex justify-end"
        >
            <button
                onclick={onClose}
                class="px-4 py-2 bg-gray-700 text-gray-200 hover:bg-gray-600 rounded-lg transition-colors"
            >
                Close
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
