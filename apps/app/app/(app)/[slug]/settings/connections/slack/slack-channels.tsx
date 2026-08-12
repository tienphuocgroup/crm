"use client";
import Search from "@carbon/icons-react/es/Search";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@crm/ui/components/alert-dialog";
import {
	AsyncButtonContent,
	useAsyncAction,
} from "@crm/ui/components/async-action";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@crm/ui/components/input-group";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import {
	ChannelPicker,
	type PickerChannel,
} from "@/components/slack/channel-picker";
import { useSlackChannels } from "@/components/slack/use-slack-channels";
import { useTRPC } from "@/lib/trpc/client";

const INVITE_COMMAND = "/invite @Comp AI";

export function SlackChannels() {
	const t = useTranslations("settings");
	const trpc = useTRPC();
	const [asking, setAsking] = useState<PickerChannel | null>(null);
	const [query, setQuery] = useState("");
	const search = useDeferredValue(query);
	const channels = useSlackChannels({ query: search });
	const join = useMutation(
		trpc.slack.joinChannel.mutationOptions({
			onSuccess: async (result) => {
				await channels.reload();
				setAsking(null);
				toast.success(
					result.alreadyJoined
						? t("connections.slackAlreadyInThereToast")
						: result.queued
							? t("connections.slackJoiningToast")
							: t("connections.slackAskInsideToast"),
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const joinAction = useAsyncAction({
		action: async (channelId: string) => join.mutateAsync({ channelId }),
	});
	const refresh = useMutation(
		trpc.slack.refreshPeople.mutationOptions({
			onSuccess: async () => {
				toast.success(t("connections.slackReadingChannelListToast"));
				await channels.reload();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const refreshing = refresh.isPending || channels.syncing;
	const rows = channels.channels;
	const canInviteItself = channels.canInviteItself;

	return (
		<section className="flex flex-col gap-3 px-(--spacing-block-inline)">
			<div className="flex items-end justify-between gap-4">
				<div>
					<h2 className="font-medium text-sm">
						{t("connections.slackChannelsReachableTitle")}
					</h2>
					<p className="text-muted-foreground text-xs">
						{t("connections.slackChannelsPickHint")}
					</p>
				</div>
				<Button
					disabled={refreshing}
					onClick={() => refresh.mutate()}
					size="sm"
					variant="outline"
				>
					{refreshing
						? t("connections.slackRefreshingLabel")
						: t("connections.slackRefreshButton")}
				</Button>
			</div>

			{channels.stalled ? (
				<p className="text-warning text-xs">
					{t("connections.slackChannelListStaleNotice")}
				</p>
			) : null}

			{rows.length > 0 || query ? (
				<InputGroup>
					<InputGroupAddon>
						<Icon icon={Search} motion="none" className="size-4" />
					</InputGroupAddon>
					<InputGroupInput
						onChange={(event) => setQuery(event.target.value)}
						placeholder={t("connections.slackSearchChannelsPlaceholder")}
						value={query}
					/>
				</InputGroup>
			) : null}

			<ChannelPicker
				canInviteItself={canInviteItself}
				channels={rows}
				empty={
					<p className="px-4 py-4 text-muted-foreground text-sm">
						{channels.pending
							? t("connections.slackReadingChannelListEllipsis")
							: query
								? t("connections.slackNoChannelMatches", { query })
								: t("connections.slackNoChannelsYet")}
					</p>
				}
				onAdd={(channel) => void joinAction.run(channel.id)}
				onRequest={(channel) => setAsking(channel)}
				pending={joinAction.pending}
			/>

			{channels.hasMore ? (
				<Button
					disabled={channels.fetchingMore}
					onClick={channels.loadMore}
					size="sm"
					variant="outline"
				>
					{channels.fetchingMore
						? t("connections.slackLoadingMoreLabel")
						: t("connections.slackLoadMoreButton")}
				</Button>
			) : null}

			<AskDialog
				canInviteItself={canInviteItself}
				channel={asking}
				onCancel={() => setAsking(null)}
				onConfirm={() => asking && void joinAction.run(asking.id)}
				status={joinAction.status}
			/>
		</section>
	);
}

function AskDialog({
	canInviteItself,
	channel,
	onCancel,
	onConfirm,
	status,
}: {
	canInviteItself: boolean;
	channel: PickerChannel | null;
	onCancel: () => void;
	onConfirm: () => void;
	status: "idle" | "pending" | "success" | "error";
}) {
	const t = useTranslations("settings");
	const common = useTranslations("common");

	if (!channel) return null;

	async function copyThenConfirm() {
		try {
			await navigator.clipboard.writeText(INVITE_COMMAND);
		} catch {
			toast.error(t("connections.slackCopyFailedToast"));
			return;
		}

		toast.success(t("connections.slackCommandCopiedToast"));
		onConfirm();
	}

	return (
		<AlertDialog open onOpenChange={(open) => !open && onCancel()}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{canInviteItself
							? t("connections.slackAddToChannelTitle", {
									channel: channel.name,
								})
							: t("connections.slackAskSomeoneTitle")}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{canInviteItself
							? t("connections.slackPrivateJoinDescription")
							: t("connections.slackPrivateNeedsHumanDescription", {
									channel: channel.name,
								})}
					</AlertDialogDescription>
				</AlertDialogHeader>

				{canInviteItself ? null : (
					<div className="rounded-md bg-muted px-3 py-2.5 font-mono text-sm">
						{INVITE_COMMAND}
					</div>
				)}

				<AlertDialogFooter>
					<AlertDialogCancel disabled={status === "pending"}>
						{common("cancel")}
					</AlertDialogCancel>
					<Button
						disabled={status === "pending"}
						onClick={canInviteItself ? onConfirm : () => void copyThenConfirm()}
					>
						<AsyncButtonContent
							pendingLabel={t("connections.slackAddingLabel")}
							status={status}
						>
							{canInviteItself
								? t("connections.slackAddButton")
								: t("connections.slackCopyAndMarkAskedButton")}
						</AsyncButtonContent>
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
