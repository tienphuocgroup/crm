"use client";

import type { DealStage } from "@crm/db/enums";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useTranslations } from "next-intl";
import { resolveDealStageLabel } from "@/lib/deal-stage";

export function DealStageIndicator({
	stage,
	className,
}: {
	stage: DealStage;
	className?: string;
}) {
	const t = useTranslations("deals");
	const label = resolveDealStageLabel(stage);
	return (
		<StatusIndicator
			tone={label.tone}
			label={label.known ? t(label.labelKey) : label.text}
			className={className}
		/>
	);
}
