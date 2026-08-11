import type { EnrichmentStatus } from "@crm/db/enums";
import type { StatusTone } from "@crm/ui/components/status-indicator";

const PRESENTATION: Record<
	EnrichmentStatus,
	{ labelKey: string; tone: StatusTone; busy?: boolean }
> = {
	PENDING: { labelKey: "enrichmentNotResearched", tone: "neutral" },
	RUNNING: { labelKey: "enrichmentResearching", tone: "info", busy: true },
	COMPLETE: { labelKey: "enrichmentEnriched", tone: "success" },
	FAILED: { labelKey: "enrichmentFailed", tone: "error" },
	SKIPPED: { labelKey: "enrichmentNothingFound", tone: "neutral" },
};

const QUEUED = {
	labelKey: "enrichmentQueued",
	tone: "neutral" as StatusTone,
	busy: false,
};

export const ENRICHMENT_POLL_MS = 3_000;

export const ENRICHMENT_FACET_OPTIONS = (
	Object.keys(PRESENTATION) as EnrichmentStatus[]
).map((value) => ({ value, labelKey: PRESENTATION[value].labelKey }));

export function enrichmentPresentation(
	status: EnrichmentStatus,
	queued: boolean,
) {
	return status === "PENDING" && queued ? QUEUED : PRESENTATION[status];
}

export function isEnriching(status: EnrichmentStatus, queued = false): boolean {
	return status === "RUNNING" || (status === "PENDING" && queued);
}
