"use client";

import { cn } from "@crm/ui/lib/utils";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { useEffect } from "react";
import { toast } from "sonner";
import { MESSAGING_UI } from "@/components/crm/messaging/messaging-ui-config";
import { ThreadList } from "@/components/crm/messaging/thread-list";
import { ThreadView } from "@/components/crm/messaging/thread-view";
import { selectThread } from "@/lib/messaging";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import {
	MESSAGES_FILTER_PARAM,
	MESSAGES_THREAD_PARAM,
	type MessagingFilter,
	messagesFilterParser,
	messagesThreadParser,
} from "./messages-search-params";

export function MessagesInbox({ canManage }: { canManage: boolean }) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const [filter, setFilter] = useQueryState(
		MESSAGES_FILTER_PARAM,
		messagesFilterParser,
	);
	const [threadId, setThreadId] = useQueryState(
		MESSAGES_THREAD_PARAM,
		messagesThreadParser,
	);

	const threads = useInfiniteQuery({
		...trpc.messaging.threads.infiniteQueryOptions(
			{ filter },
			{ getNextPageParam: (page) => page.nextCursor ?? undefined },
		),
		refetchInterval: MESSAGING_UI.inboxPollMs,
	});

	const rows = threads.data?.pages.flatMap((page) => page.rows) ?? [];
	const counts = threads.data?.pages[0]?.counts ?? null;
	const listed = selectThread(rows, threadId, null);

	const missing = Boolean(threadId) && !listed;

	const fallback = useQuery({
		...trpc.messaging.threadById.queryOptions({ threadId: threadId ?? "" }),
		enabled: missing,
		refetchInterval: MESSAGING_UI.inboxPollMs,
	});

	const selected = selectThread(rows, threadId, fallback.data?.thread ?? null);
	const resolving = missing && fallback.isPending;

	const markRead = useMutation(
		trpc.messaging.markRead.mutationOptions({
			onSuccess: () => cache.messagingRead(),
			onError: (error) => toast.error(error.message),
		}),
	);
	const markReadMutate = markRead.mutate;

	const selectedId = selected?.id ?? null;
	const unreadCount = selected?.unreadCount ?? 0;

	useEffect(() => {
		if (!selectedId || unreadCount === 0) return;
		markReadMutate({ threadId: selectedId });
	}, [selectedId, unreadCount, markReadMutate]);

	return (
		<main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-(--spacing-page-inline) pt-(--spacing-page-top) pb-(--spacing-page-bottom)">
			<div className="mx-auto flex min-h-0 w-full max-w-(--container-page-wide) flex-1 overflow-hidden rounded-lg border">
				<div
					className={cn(
						"flex min-h-0 w-full min-w-0 flex-col md:w-80 md:shrink-0 md:border-e",
						threadId && "hidden md:flex",
					)}
				>
					<ThreadList
						counts={counts}
						filter={filter}
						hasMore={threads.hasNextPage}
						loadingMore={threads.isFetchingNextPage}
						onFilterChange={(next: MessagingFilter) => {
							void setFilter(next);
							void setThreadId(null);
						}}
						onLoadMore={() => void threads.fetchNextPage()}
						onSelect={(id) => void setThreadId(id)}
						pending={threads.isPending}
						selectedId={threadId}
						threads={rows}
					/>
				</div>

				<div
					className={cn(
						"flex min-h-0 min-w-0 flex-1 flex-col",
						!threadId && "hidden md:flex",
					)}
				>
					<ThreadView
						canManage={canManage}
						onBack={() => void setThreadId(null)}
						onDeleted={() => void setThreadId(null)}
						pending={threads.isPending || resolving}
						thread={selected}
					/>
				</div>
			</div>
		</main>
	);
}
