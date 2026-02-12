import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	base: "./",
	plugins: [tailwindcss(), sveltekit()],
	server: {
		port: 7591
	},
	preview: {
		port: 7591
	}
});
