"use client";

import Chat from "@carbon/icons-react/es/Chat";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@crm/ui/components/empty";
import { Icon } from "@crm/ui/components/icon";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import { Spinner } from "@crm/ui/components/spinner";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { cn } from "@crm/ui/lib/utils";
import { useTranslations } from "next-intl";
import {
	MESSAGING_FILTERS,
	type MessagingFilter,
} from "@/app/(app)/[slug]/messages/messages-search-params";
import { LocalRelativeTime } from "@/components/local-date-time";
import { avatarUrl, messageKindKey, threadLabel } from "@/lib/messaging";
import type { RouterOutputs } from "@/lib/trpc/types";
import { usePersonLabel } from "./use-person-label";

export type MessagingThread =
	RouterOutputs["messaging"]["threads"]["rows"][number];

type ThreadCounts = { needsReply: number; unmatched: number };

type EmptyCopyKeys = { title: string; description: string };

const FILTER_LABEL_KEY = {
	all: "messagingFilterAll",
	needsReply: "messagingFilterNeedsReply",
	unmatched: "messagingFilterUnmatched",
} satisfies Record<MessagingFilter, string>;

const EMPTY_KEY = {
	all: {
		title: "messagingEmptyAllTitle",
		description: "messagingEmptyAllDescription",
	},
	needsReply: {
		title: "messagingEmptyNeedsReplyTitle",
		description: "messagingEmptyNeedsReplyDescription",
	},
	unmatched: {
		title: "messagingEmptyUnmatchedTitle",
		description: "messagingEmptyUnmatchedDescription",
	},
} satisfies Record<MessagingFilter, EmptyCopyKeys>;

export function ThreadList({
	counts,
	filter,
	hasMore,
	loadingMore,
	onFilterChange,
	onLoadMore,
	onSelect,
	pending,
	selectedId,
	threads,
}: {
	counts: ThreadCounts | null;
	filter: MessagingFilter;
	hasMore: boolean;
	loadingMore: boolean;
	onFilterChange: (filter: MessagingFilter) => void;
	onLoadMore: () => void;
	onSelect: (threadId: string) => void;
	pending: boolean;
	selectedId: string | null;
	threads: MessagingThread[];
}) {
	const t = useTranslations("contacts");

	const countFor = (option: MessagingFilter): number =>
		option === "all" ? 0 : (counts?.[option] ?? 0);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="shrink-0 border-b p-3">
				<ToggleGroup
					type="single"
					value={filter}
					onValueChange={(next) => {
						if (next) onFilterChange(next as MessagingFilter);
					}}
					size="sm"
					spacing={0}
				>
					{MESSAGING_FILTERS.map((option) => (
						<ToggleGroupItem key={option} value={option}>
							{t(FILTER_LABEL_KEY[option])}
							{countFor(option) > 0 ? (
								<span className="tabular-nums opacity-60">
									{countFor(option)}
								</span>
							) : null}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</div>

			{pending ? (
				<div className="flex min-h-0 flex-1 items-center justify-center">
					<Spinner />
				</div>
			) : threads.length === 0 ? (
				<div className="flex min-h-0 flex-1 items-center">
					<Empty>
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<Icon icon={Chat} />
							</EmptyMedia>
							<EmptyTitle>{t(EMPTY_KEY[filter].title)}</EmptyTitle>
							<EmptyDescription>
								{t(EMPTY_KEY[filter].description)}
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				</div>
			) : (
				<div className="min-h-0 flex-1 overflow-y-auto">
					<ul className="divide-y">
						{threads.map((thread) => (
							<li key={thread.id}>
								<ThreadRow
									onSelect={onSelect}
									selected={thread.id === selectedId}
									thread={thread}
								/>
							</li>
						))}
					</ul>

					{hasMore ? (
						<div className="p-3">
							<Button
								variant="outline"
								size="sm"
								disabled={loadingMore}
								onClick={onLoadMore}
							>
								{loadingMore ? <Spinner /> : null}
								{t("messagingLoadMoreAction")}
							</Button>
						</div>
					) : null}
				</div>
			)}
		</div>
	);
}

function ThreadRow({
	onSelect,
	selected,
	thread,
}: {
	onSelect: (threadId: string) => void;
	selected: boolean;
	thread: MessagingThread;
}) {
	const t = useTranslations("contacts");
	const personLabel = usePersonLabel();
	const name = personLabel(threadLabel(thread));
	const snippet = snippetText(thread, t);

	return (
		<button
			type="button"
			aria-current={selected ? "true" : undefined}
			onClick={() => onSelect(thread.id)}
			className={cn(
				"flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-muted",
				selected && "bg-muted",
			)}
		>
			<PersonAvatar
				name={name}
				size="sm"
				src={avatarUrl(thread.identity.avatarUrl)}
			/>
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="flex items-center gap-2">
					<span className="min-w-0 flex-1 truncate font-medium text-sm">
						{name}
					</span>
					<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
						<LocalRelativeTime date={thread.lastMessageAt} />
					</span>
				</span>
				<span className="flex items-center gap-2">
					<span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
						{snippet}
					</span>
					{thread.unreadCount > 0 ? <Badge>{thread.unreadCount}</Badge> : null}
				</span>
			</span>
		</button>
	);
}

function snippetText(
	thread: MessagingThread,
	t: ReturnType<typeof useTranslations<"contacts">>,
): string {
	const snippet = thread.snippet;
	if (!snippet) return "";

	const body = snippet.body?.trim();
	if (body) return body;

	const key = messageKindKey(snippet.kind);

	return key ? t(key) : "";
}
