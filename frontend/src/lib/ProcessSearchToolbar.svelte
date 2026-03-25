<script lang="ts">
	let {
		searchQuery = $bindable(""),
		loading = false,
		oninput,
		onclear,
		onnew,
	}: {
		searchQuery?: string;
		loading?: boolean;
		oninput: () => void;
		onclear: () => void;
		onnew: () => void;
	} = $props();
</script>

<div class="mb-4 flex gap-3">
	<div class="flex-1">
		<input
			type="text"
			bind:value={searchQuery}
			oninput={oninput}
			placeholder="Search processes... (e.g., suzuki)"
			class="w-full px-3 py-2 border border-gray-600 rounded-lg bg-gray-800 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
		/>
	</div>
	<button
		onclick={onclear}
		disabled={loading}
		class="px-4 py-2 bg-gray-600 text-gray-100 rounded-lg hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
	>
		Clear
	</button>
	<button
		onclick={onnew}
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
