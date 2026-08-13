import { DealStage } from "@crm/db/enums";
import type { StatusTone } from "@crm/ui/components/status-indicator";

type StagePresentation = { labelKey: string; tone: StatusTone };

export type DealStageLabel =
	| { known: true; labelKey: string; tone: StatusTone }
	| { known: false; text: string; tone: StatusTone };

const ORDER = [
	DealStage.DEMO_BOOKED,
	DealStage.QUALIFIED_TO_BUY,
	DealStage.DECISION_MAKER_BOUGHT_IN,
	DealStage.CONTRACT_SENT,
	DealStage.CLOSED_WON,
	DealStage.CLOSED_LOST,
	DealStage.UNQUALIFIED_TO_BUY,
] as const;

const PRESENTATION: Record<DealStage, StagePresentation> = {
	DEMO_BOOKED: { labelKey: "stageDemoBooked", tone: "neutral" },
	QUALIFIED_TO_BUY: { labelKey: "stageQualifiedToBuy", tone: "info" },
	DECISION_MAKER_BOUGHT_IN: {
		labelKey: "stageDecisionMakerIn",
		tone: "info",
	},
	CONTRACT_SENT: { labelKey: "stageContractSent", tone: "warning" },
	CLOSED_WON: { labelKey: "stageClosedWon", tone: "success" },
	CLOSED_LOST: { labelKey: "stageClosedLost", tone: "error" },
	UNQUALIFIED_TO_BUY: { labelKey: "stageUnqualified", tone: "neutral" },
};

export const OPEN_STAGES = ORDER.slice(0, 4) as readonly DealStage[];

export const LOSING_STAGES: readonly DealStage[] = [
	DealStage.CLOSED_LOST,
	DealStage.UNQUALIFIED_TO_BUY,
];

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
