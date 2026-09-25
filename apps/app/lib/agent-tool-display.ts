import {
	type EveToolFields,
	type EveToolInput,
	eveToolText,
} from "@crm/validation/eve-tool";

const ARTIFACT_KEYS = {
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
} satisfies Record<string, { pending: string; done: string }>;

function isArtifactPath(path: string): path is keyof typeof ARTIFACT_KEYS {
	return Object.hasOwn(ARTIFACT_KEYS, path);
}

export type ToolLabel = {
	key: string;
	values?: Record<string, string>;
};

type LabelInput = {
	tool: string;
	input: EveToolInput;
	pending: boolean;
};

type ToolInputLabel = (
	input: EveToolFields,
	pending: boolean,
) => ToolLabel | null;

type ToolInputLabels = Record<string, ToolInputLabel>;

const INPUT_LABELS: ToolInputLabels = {
	write_agent_file: (input, pending) => {
		const path = eveToolText.parse(input.path);
		if (!path) return null;

		if (isArtifactPath(path)) {
			const artifact = ARTIFACT_KEYS[path];
			return { key: pending ? artifact.pending : artifact.done };
		}

		return {
			key: pending ? "toolWritingFile" : "toolWroteFile",
			values: { name: path },
		};
	},
	save_agent_draft: (input, pending) => {
		const name = eveToolText.parse(input.name).trim();
		if (!name) return { key: pending ? "toolSavingDraft" : "toolSavedDraft" };

		return {
			key: pending ? "toolSavingDraftNamed" : "toolSavedDraftNamed",
			values: { name },
		};
	},
	set_chat_title: (input, pending) => {
		const title = eveToolText.parse(input.title).trim();
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
