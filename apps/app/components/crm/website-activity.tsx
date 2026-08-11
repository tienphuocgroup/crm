"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
	DetailSheetProperties,
	DetailSheetProperty,
	DetailSheetSection,
} from "@/components/detail-sheet";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";

type Touch = {
	source: string;
	medium: string | null;
	campaign: string | null;
	at: string | null;
};

export function WebsiteActivity({
	companyId,
	contactId,
}: {
	companyId?: string;
	contactId?: string;
}) {
	const common = useTranslations("common");
	const trpc = useTRPC();

	const company = useQuery({
		...trpc.tracking.companyActivity.queryOptions({
			companyId: companyId ?? "",
		}),
		enabled: Boolean(companyId),
	});

	const contact = useQuery({
		...trpc.tracking.contactActivity.queryOptions({
			contactId: contactId ?? "",
		}),
		enabled: Boolean(contactId) && !companyId,
	});

	const activity = companyId ? company.data : contact.data;

	if (!activity?.identified) return null;
	if (activity.pages.length === 0 && !activity.firstTouch) return null;

	const topPage = activity.pages[0];
	const first = activity.firstTouch;
	const last = activity.lastTouch;
	const channelChanged =
		first != null &&
		last != null &&
		channel(last, common) !== channel(first, common);
	const campaign = last?.campaign ?? first?.campaign ?? null;

	return (
		<DetailSheetSection title={common("websiteActivityTitle")}>
			<DetailSheetProperties>
				<DetailSheetProperty label={common("websiteActivityPageViews")}>
					<span className="tabular-nums">
						{activity.views.toLocaleString()}
					</span>
					{activity.lastSeenAt ? (
						<span className="text-muted-foreground">
							{" "}
							{common("websiteActivityLastSeenPrefix")}{" "}
							<LocalRelativeTime date={activity.lastSeenAt} />
						</span>
					) : null}
				</DetailSheetProperty>

				{first ? (
					<DetailSheetProperty label={common("websiteActivityOriginalSource")}>
						{channel(first, common)}
					</DetailSheetProperty>
				) : null}

				{topPage ? (
					<DetailSheetProperty label={common("websiteActivityTopPage")}>
						<span className="flex min-w-0 items-baseline gap-1">
							<span className="truncate font-mono" title={topPage.path}>
								{topPage.path}
							</span>
							<span className="shrink-0 text-muted-foreground">
								{"· "}
								<span className="tabular-nums">{topPage.views}</span>{" "}
								{common("websiteActivityViewsSuffix")}
							</span>
						</span>
					</DetailSheetProperty>
				) : null}

				{channelChanged ? (
					<DetailSheetProperty label={common("websiteActivityLatestSource")}>
						{channel(last, common)}
					</DetailSheetProperty>
				) : null}

				{first?.at ? (
					<DetailSheetProperty label={common("websiteActivityFirstSeen")}>
						<LocalRelativeTime date={first.at} />
					</DetailSheetProperty>
				) : null}

				{campaign ? (
					<DetailSheetProperty label={common("websiteActivityCampaign")}>
						{campaign}
					</DetailSheetProperty>
				) : null}
			</DetailSheetProperties>
		</DetailSheetSection>
	);
}

function channel(
	touch: Touch | null,
	common: ReturnType<typeof useTranslations<"common">>,
): string {
	if (!touch) return common("websiteActivityUnknownSource");
	if (!touch.medium || touch.medium === "direct") return touch.source;
	return `${touch.source} · ${touch.medium}`;
}
