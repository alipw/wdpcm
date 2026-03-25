export type ProcessStatus = "running" | "stopped";

export type WorktreeDiscoveryState =
	| "ok"
	| "unconfigured"
	| "git_unavailable"
	| "not_repo";

export interface Process {
	alias: string;
	command: string;
	workingDirectory: string | null;
	selectedWorktreePath: string | null;
	status: ProcessStatus;
}

export interface ProcessGroup {
	id: string;
	name: string;
	processAliases: string[];
}

export interface WorktreeOption {
	path: string;
	branch: string | null;
	isCurrent: boolean;
}

export interface WorktreeDiscovery {
	state: WorktreeDiscoveryState;
	workingDirectory: string | null;
	repoRoot: string | null;
	relativeProjectPath: string | null;
	selectedWorktreePath: string | null;
	worktrees: WorktreeOption[];
}
