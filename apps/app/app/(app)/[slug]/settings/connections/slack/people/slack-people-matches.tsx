"use client";

import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { SLACK_CHANNELS } from "@/components/slack/use-slack-channels";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

type SlackSync = "idle" | "syncing" | "stalled";

type MatchRow = {
	crmUserId: string;
	name: string;
	email: string;
	match: {
		slackUserId: string | null;
		slackHandle: string | null;
		slackEmail: string | null;
	} | null;
};

export function SlackPeopleMatches({
	slug,
	initialMatches,
}: {
	slug: string;
	initialMatches: { rows: MatchRow[]; sync: SlackSync };
}) {
	const t = useTranslations("settings");
	const trpc = useTRPC();
	const cache = useCrmCache();
	const matches = useQuery({
		...trpc.slack.matches.queryOptions(),
		initialData: initialMatches,
		refetchInterval: (query) =>
			query.state.data?.sync === "syncing" ? SLACK_CHANNELS.pollMs : false,
	});
	const refresh = useMutation(
		trpc.slack.refreshPeople.mutationOptions({
			onSuccess: () => cache.slack(),
			onError: (error) => toast.error(error.message),
		}),
	);
	const rows = matches.data.rows;
	const refreshing = refresh.isPending || matches.data.sync === "syncing";
	return (
		<div className="flex flex-col gap-4 px-(--spacing-block-inline)">
			<div className="flex items-center justify-center gap-3">
				<p className="font-medium text-xs">
					{t("connections.slackPeopleMatchedCountLabel", {
						matched: rows.filter((row) => row.match?.slackUserId).length,
						total: rows.length,
					})}
				</p>
				<Button
					variant="outline"
					size="sm"
					disabled={refreshing}
					onClick={() => refresh.mutate()}
				>
					{refreshing ? <Spinner data-icon="inline-start" /> : null}
					{refreshing
						? t("connections.slackRefreshingLabel")
						: t("connections.slackRefreshFromSlack")}
				</Button>
			</div>
			{matches.data.sync === "stalled" ? (
				<p className="text-center text-warning text-xs">
					{t("connections.slackSyncStalledPeopleNotice")}
				</p>
			) : null}
			<div className="flex flex-col divide-y border-y">
				{rows.length === 0 ? (
					<p className="py-5 text-center text-muted-foreground text-sm">
						{t("connections.slackNoTeammatesToMatch")}
					</p>
				) : null}
				{rows.map((row) => (
					<div
						className="flex min-h-14 flex-col items-stretch gap-1 py-3 sm:flex-row sm:items-center sm:gap-0"
						key={row.crmUserId}
					>
						<div className="min-w-0 flex-1 pr-4 sm:max-w-75">
							<p className="font-medium text-sm">{row.name}</p>
							<p className="truncate text-muted-foreground text-xs">
								{row.email}
							</p>
						</div>
						<div className="min-w-0 flex-1">
							{row.match?.slackHandle ? (
								<div className="h-8 rounded-md border border-transparent px-2.5 py-2 text-xs">
									{row.match.slackHandle}
								</div>
							) : (
								<p className="px-2.5 py-2 text-muted-foreground text-xs">
									{t("connections.slackNoExactEmailMatch")}
								</p>
							)}
						</div>
					</div>
				))}
			</div>
			<p className="text-muted-foreground text-xs leading-relaxed">
				{t("connections.slackMatchRefreshHint")}
			</p>
			<div className="flex justify-end">
				<Button asChild>
					<Link href={`/${slug}/settings/connections/slack`}>
						{t("connections.slackPeopleContinueButton")}
					</Link>
				</Button>
			</div>
		</div>
	);
}
