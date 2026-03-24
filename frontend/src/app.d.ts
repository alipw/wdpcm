// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	interface Window {
		wdpcmDesktopConfig?: {
			apiBaseUrl?: string;
			socketUrl?: string;
			pickDirectory?: () => Promise<string | null>;
		};
	}

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
