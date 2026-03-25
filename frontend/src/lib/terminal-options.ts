import type { ITerminalOptions } from "@battlefieldduck/xterm-svelte";

export const processLogTerminalOptions: ITerminalOptions = {
	theme: {
		background: "#192738",
		foreground: "#d1d5db",
		cursor: "#f97316",
	},
	fontFamily: "monospace",
	cursorBlink: true,
};
