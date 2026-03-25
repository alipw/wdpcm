import type { Process, WorktreeDiscovery } from "$lib/types/process-manager";

export function getWorktreeButtonLabel(
	process: Process,
	info: WorktreeDiscovery | undefined,
): string {
	const selectedPath =
		info?.selectedWorktreePath ?? process.selectedWorktreePath;
	if (!selectedPath) {
		if (process.workingDirectory) {
			const parts = process.workingDirectory.split(/[/\\]/);
			return parts[parts.length - 1] || "Base directory";
		}
		return "Worktree";
	}

	const selectedOption = info?.worktrees.find(
		(worktree) => worktree.path === selectedPath,
	);
	if (selectedOption?.branch) return selectedOption.branch;

	const parts = selectedPath.split(/[/\\]/);
	return parts[parts.length - 1] || "Selected worktree";
}

/** Native `title` / hover text for the worktree picker control. */
export function getWorktreeButtonTooltip(
	process: Process,
	info: WorktreeDiscovery | undefined,
): string {
	const label = getWorktreeButtonLabel(process, info);
	if (label === "Worktree") {
		return "Switch worktree or branch";
	}
	return `Switch worktree · ${label}`;
}

export function getWorktreeStateMessage(info: WorktreeDiscovery): string {
	if (info.state === "unconfigured") {
		return "Set a working directory in the process settings to detect worktrees.";
	}
	if (info.state === "git_unavailable") {
		return "Git is not available on this machine.";
	}
	if (info.state === "not_repo") {
		return "The configured working directory is not inside a Git repository.";
	}
	if (info.worktrees.length === 0) {
		return "No worktrees were detected for this repository.";
	}
	return "";
}
