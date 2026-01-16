<script lang="ts">
    import { fade, scale } from "svelte/transition";

    interface Process {
        alias: string;
        command: string;
        status: string;
    }

    let {
        process = null,
        onSave,
        onCancel,
    }: {
        process?: Process | null;
        onSave: (alias: string, command: string) => void;
        onCancel: () => void;
    } = $props();

    let alias = $state(process?.alias ?? "");
    let command = $state(process?.command ?? "");
    let error = $state("");

    const isEditing = $derived(process !== null);

    function handleSave() {
        error = "";
        
        if (!alias.trim()) {
            error = "Alias is required";
            return;
        }
        
        if (alias.includes(" ")) {
            error = "Alias cannot contain spaces";
            return;
        }
        
        if (!command.trim()) {
            error = "Command is required";
            return;
        }
        
        onSave(alias.trim(), command.trim());
    }

    function handleKeyDown(event: KeyboardEvent) {
        if (event.key === "Enter" && event.ctrlKey) {
            handleSave();
        } else if (event.key === "Escape") {
            onCancel();
        }
    }
</script>

<svelte:window on:keydown={handleKeyDown} />

<div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    transition:fade={{ duration: 200 }}
>
    <div
        class="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
        transition:scale={{ duration: 200, start: 0.95 }}
    >
        <div class="p-4 border-b border-gray-700 flex justify-between items-center">
            <h2 class="text-xl font-bold text-gray-100">
                {isEditing ? "Edit Process" : "Create Process"}
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
            {#if error}
                <div class="p-3 bg-red-900/50 border border-red-700 text-red-200 rounded-lg text-sm">
                    {error}
                </div>
            {/if}

            <div>
                <label for="alias" class="block text-sm font-medium text-gray-300 mb-1">
                    Alias
                </label>
                <input
                    id="alias"
                    type="text"
                    bind:value={alias}
                    disabled={isEditing}
                    placeholder="e.g., dev-server"
                    class="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                />
                {#if !isEditing}
                    <p class="mt-1 text-xs text-gray-500">Unique identifier, no spaces allowed</p>
                {/if}
            </div>

            <div>
                <label for="command" class="block text-sm font-medium text-gray-300 mb-1">
                    Command
                </label>
                <textarea
                    id="command"
                    bind:value={command}
                    placeholder="e.g., npm run dev"
                    rows="3"
                    class="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm resize-none"
                ></textarea>
            </div>
        </div>

        <div class="p-4 border-t border-gray-700 bg-gray-800/50 flex justify-between items-center">
            <span class="text-xs text-gray-500">Ctrl+Enter to save</span>
            <div class="flex gap-3">
                <button
                    onclick={onCancel}
                    class="px-4 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                >
                    Cancel
                </button>
                <button
                    onclick={handleSave}
                    disabled={!alias.trim() || !command.trim()}
                    class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium shadow-lg shadow-blue-900/20"
                >
                    {isEditing ? "Save Changes" : "Create Process"}
                </button>
            </div>
        </div>
    </div>
</div>
