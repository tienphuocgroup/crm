import ArrowRight from "@carbon/icons-react/es/ArrowRight";
import Chat from "@carbon/icons-react/es/Chat";
import Email from "@carbon/icons-react/es/Email";
import Events from "@carbon/icons-react/es/Events";
import MagicWand from "@carbon/icons-react/es/MagicWand";
import Phone from "@carbon/icons-react/es/Phone";
import Task from "@carbon/icons-react/es/Task";
import type { ActivityType } from "@crm/db/enums";
import type { CarbonIcon } from "@crm/ui/components/icon";

const PRESENTATION: Record<
	ActivityType,
	{ icon: CarbonIcon; labelKey: string }
> = {
	NOTE: { icon: Chat, labelKey: "activityTypeNote" },
	CALL: { icon: Phone, labelKey: "activityTypeCall" },
	EMAIL: { icon: Email, labelKey: "activityTypeEmail" },
	MEETING: { icon: Events, labelKey: "activityTypeMeeting" },
	TASK: { icon: Task, labelKey: "activityTypeTask" },
	STAGE_CHANGE: { icon: ArrowRight, labelKey: "activityTypeStageChange" },
	ENRICHMENT: { icon: MagicWand, labelKey: "activityTypeEnrichment" },
};

export function activityLabelKey(type: ActivityType): string {
	return PRESENTATION[type].labelKey;
}

export function activityIcon(type: ActivityType): CarbonIcon {
	return PRESENTATION[type].icon;
}
