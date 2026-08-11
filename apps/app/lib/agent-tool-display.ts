const ARTIFACT_KEYS: Record<string, { pending: string; done: string }> = {
	"agent/instructions.md": {
		pending: "toolWritingInstructions",
		done: "toolWroteInstructions",
	},
	"agent/manifest.json": {
		pending: "toolWritingManifest",
		done: "toolWroteManifest",
	},
	"agent/README.md": {
		pending: "toolWritingReadme",
		done: "toolWroteReadme",
	},
};

export type ToolLabel = {
	key: string;
	values?: Record<string, string>;
};

type LabelInput = {
	tool: string;
	input: Record<string, unknown> | null;
	pending: boolean;
};

const INPUT_LABELS: Record<
	string,
	(input: Record<string, unknown>, pending: boolean) => ToolLabel | null
> = {
	write_agent_file: (input, pending) => {
		const path = typeof input.path === "string" ? input.path : null;
		if (!path) return null;

		const artifact = ARTIFACT_KEYS[path];
		if (artifact) return { key: pending ? artifact.pending : artifact.done };

		return {
			key: pending ? "toolWritingFile" : "toolWroteFile",
			values: { name: path },
		};
	},
	save_agent_draft: (input, pending) => {
		const name = typeof input.name === "string" ? input.name.trim() : "";
		if (!name) return { key: pending ? "toolSavingDraft" : "toolSavedDraft" };

		return {
			key: pending ? "toolSavingDraftNamed" : "toolSavedDraftNamed",
			values: { name },
		};
	},
	set_chat_title: (input, pending) => {
		const title = typeof input.title === "string" ? input.title.trim() : "";
		if (!title) return { key: pending ? "toolNamingChat" : "toolNamedChat" };

		return {
			key: pending ? "toolNamingChatTitled" : "toolNamedChatTitled",
			values: { title },
		};
	},
};

export function toolLabel(item: LabelInput): ToolLabel | null {
	if (!item.input) return null;
	return INPUT_LABELS[item.tool]?.(item.input, item.pending) ?? null;
}
