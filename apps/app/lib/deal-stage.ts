import { DealStage } from "@crm/db/enums";
import type { StatusTone } from "@crm/ui/components/status-indicator";

type StagePresentation = { labelKey: string; tone: StatusTone };

export type DealStageLabel =
	| { known: true; labelKey: string; tone: StatusTone }
	| { known: false; text: string; tone: StatusTone };

const ORDER = [
	DealStage.INQUIRY,
	DealStage.CONSULT_BOOKED,
	DealStage.CONSULT_DONE,
	DealStage.PROPOSAL_SENT,
	DealStage.ENROLLED,
	DealStage.LOST,
] as const;

const PRESENTATION: Record<DealStage, StagePresentation> = {
	INQUIRY: { labelKey: "stageInquiry", tone: "neutral" },
	CONSULT_BOOKED: { labelKey: "stageConsultBooked", tone: "info" },
	CONSULT_DONE: { labelKey: "stageConsultDone", tone: "info" },
	PROPOSAL_SENT: { labelKey: "stageProposalSent", tone: "warning" },
	ENROLLED: { labelKey: "stageEnrolled", tone: "success" },
	LOST: { labelKey: "stageLost", tone: "error" },
};

export const OPEN_STAGES = ORDER.slice(0, 4) as readonly DealStage[];

export const LOSING_STAGES: readonly DealStage[] = [DealStage.LOST];

export const DEAL_STAGE_OPTIONS = ORDER.map((value) => ({
	value,
	labelKey: PRESENTATION[value].labelKey,
}));

const OPEN_STAGE_COLORS = [
	"var(--chart-1)",
	"var(--chart-2)",
	"var(--chart-3)",
	"var(--chart-4)",
] as const;

export function isClosedStage(stage: DealStage): boolean {
	return !OPEN_STAGES.includes(stage);
}

export function dealStageColor(stage: DealStage): string {
	return OPEN_STAGE_COLORS[OPEN_STAGES.indexOf(stage)] ?? "var(--chart-5)";
}

export function humaniseDealStage(stage: string): string {
	return stage
		.toLowerCase()
		.split("_")
		.map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
		.join(" ");
}

function presentationOf(stage: string): StagePresentation | undefined {
	return Object.hasOwn(PRESENTATION, stage)
		? PRESENTATION[stage as DealStage]
		: undefined;
}

export function resolveDealStageLabel(stage: string): DealStageLabel {
	const known = presentationOf(stage);
	return known
		? { known: true, labelKey: known.labelKey, tone: known.tone }
		: { known: false, text: humaniseDealStage(stage), tone: "neutral" };
}

export function dealStageLabelKey(stage: DealStage): string {
	const label = resolveDealStageLabel(stage);
	return label.known ? label.labelKey : label.text;
}
