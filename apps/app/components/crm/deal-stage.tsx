"use client";

import type { DealStage } from "@crm/db/enums";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useTranslations } from "next-intl";
import { dealStagePresentation } from "@/lib/deal-stage";

export function DealStageIndicator({
	stage,
	className,
}: {
	stage: DealStage;
	className?: string;
}) {
	const t = useTranslations("deals");
	const { labelKey, tone } = dealStagePresentation(stage);
	return (
		<StatusIndicator tone={tone} label={t(labelKey)} className={className} />
	);
}
