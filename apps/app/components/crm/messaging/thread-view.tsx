"use client";

import ArrowLeft from "@carbon/icons-react/es/ArrowLeft";
import Chat from "@carbon/icons-react/es/Chat";
import OverflowMenuVertical from "@carbon/icons-react/es/OverflowMenuVertical";
import TrashCan from "@carbon/icons-react/es/TrashCan";
import UserFollow from "@carbon/icons-react/es/UserFollow";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@crm/ui/components/alert-dialog";
import { Button } from "@crm/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
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
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CreateContactSheet } from "@/app/(app)/[slug]/contacts/create-contact-sheet";
import { RecordLink } from "@/components/crm/record-sheet/record-link";
import {
	avatarUrl,
	hasPendingSend,
	mergeOptimistic,
	nameParts,
	threadLabel,
} from "@/lib/messaging";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { LinkContactDialog, useLinkContact } from "./link-contact-dialog";
import { MessageBubble } from "./message-bubble";
import { MessageComposer } from "./message-composer";
import { MESSAGING_UI } from "./messaging-ui-config";
import type { MessagingThread } from "./thread-list";
import { usePersonLabel } from "./use-person-label";
import { useSendMessage } from "./use-send-message";

export function ThreadView({
	canManage,
	onBack,
	onDeleted,
	pending,
	thread,
}: {
	canManage: boolean;
	onBack?: () => void;
	onDeleted: () => void;
	pending: boolean;
	thread: MessagingThread | null;
}) {
	const t = useTranslations("contacts");

	if (pending) {
		return (
			<div className="flex min-h-0 flex-1 items-center justify-center">
				<Spinner />
			</div>
		);
	}

	if (!thread) {
		return (
			<div className="flex min-h-0 flex-1 items-center">
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Icon icon={Chat} />
						</EmptyMedia>
						<EmptyTitle>{t("messagingPickThreadTitle")}</EmptyTitle>
						<EmptyDescription>
							{t("messagingPickThreadDescription")}
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		);
	}

	return (
		<ThreadConversation
			canManage={canManage}
			key={thread.id}
			onBack={onBack}
			onDeleted={onDeleted}
			thread={thread}
		/>
	);
}

function ThreadConversation({
	canManage,
	onBack,
	onDeleted,
	thread,
}: {
	canManage: boolean;
	onBack?: () => void;
	onDeleted: () => void;
	thread: MessagingThread;
}) {
	const t = useTranslations("contacts");
	const common = useTranslations("common");
	const trpc = useTRPC();
	const cache = useCrmCache();
	const personLabel = usePersonLabel();
	const [linking, setLinking] = useState(false);
	const [confirmingDelete, setConfirmingDelete] = useState(false);

	const name = personLabel(threadLabel(thread));
	const initial = nameParts(thread.identity.displayName ?? "");

	const sender = useSendMessage(thread.id);

	const messages = useInfiniteQuery({
		...trpc.messaging.messages.infiniteQueryOptions(
			{ threadId: thread.id },
			{ getNextPageParam: (page) => page.nextCursor ?? undefined },
		),
		refetchInterval: (query) => {
			const pages = query.state.data?.pages ?? [];

			return hasPendingSend(pages.flatMap((page) => page.rows))
				? MESSAGING_UI.queuedPollMs
				: MESSAGING_UI.inboxPollMs;
		},
	});

	const link = useLinkContact();

	const unlink = useMutation(
		trpc.messaging.unlinkContact.mutationOptions({
			onSuccess: async () => {
				await cache.messaging();
				toast.success(t("messagingUnlinkedToast"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const remove = useMutation(
		trpc.messaging.deleteThread.mutationOptions({
			onSuccess: async () => {
				setConfirmingDelete(false);
				onDeleted();
				await cache.messaging();
				toast.success(t("messagingDeletedToast"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const rows = mergeOptimistic(
		[...(messages.data?.pages ?? [])].reverse().flatMap((page) => page.rows),
		sender.optimistic,
	);

	const scrollRef = useRef<HTMLDivElement>(null);
	const earlierHeight = useRef<number | null>(null);
	const nearBottom = useRef(true);
	const opened = useRef(false);

	const firstMessageId = rows[0]?.id ?? null;
	const lastMessageId = rows.at(-1)?.id ?? null;
	const { isOwn } = sender;

	useLayoutEffect(() => {
		const container = scrollRef.current;

		if (!container || !lastMessageId) return;

		const jump = !opened.current || nearBottom.current || isOwn(lastMessageId);

		opened.current = true;

		if (!jump) return;

		container.scrollTop = container.scrollHeight;
		nearBottom.current = true;
	}, [lastMessageId, isOwn]);

	useLayoutEffect(() => {
		const container = scrollRef.current;
		const previousHeight = earlierHeight.current;

		if (!container || !firstMessageId || previousHeight === null) return;

		earlierHeight.current = null;
		container.scrollTop += container.scrollHeight - previousHeight;
	}, [firstMessageId]);

	const loadEarlier = () => {
		earlierHeight.current = scrollRef.current?.scrollHeight ?? null;
		void messages.fetchNextPage();
	};

	const trackScroll = (container: HTMLDivElement) => {
		const distance =
			container.scrollHeight - container.scrollTop - container.clientHeight;

		nearBottom.current = distance <= MESSAGING_UI.nearBottomPx;
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<header className="flex shrink-0 items-center gap-3 border-b px-(--spacing-block-inline) py-3">
				{onBack ? (
					<Button
						className="md:hidden"
						onClick={onBack}
						size="icon-sm"
						variant="ghost"
					>
						<Icon icon={ArrowLeft} />
						<span className="sr-only">{common("back")}</span>
					</Button>
				) : null}

				<PersonAvatar
					name={name}
					size="sm"
					src={avatarUrl(thread.identity.avatarUrl)}
				/>

				<div className="flex min-w-0 flex-1 flex-col">
					<span className="truncate font-medium text-sm">{name}</span>
					{thread.contactId ? (
						<RecordLink kind="contact" id={thread.contactId}>
							{t("messagingOpenContactAction")}
						</RecordLink>
					) : (
						<span className="text-muted-foreground text-xs">
							{t("messagingUnmatchedLabel")}
						</span>
					)}
				</div>

				{canManage ? (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								disabled={unlink.isPending || remove.isPending}
								size="icon-sm"
								variant="ghost"
							>
								<Icon icon={OverflowMenuVertical} />
								<span className="sr-only">
									{t("messagingMoreActionsLabel")}
								</span>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="min-w-44">
							{thread.contactId ? (
								<DropdownMenuItem
									onSelect={() => unlink.mutate({ threadId: thread.id })}
								>
									<Icon icon={UserFollow} />
									{t("messagingUnlinkAction")}
								</DropdownMenuItem>
							) : null}
							<DropdownMenuItem
								onSelect={() => setConfirmingDelete(true)}
								variant="destructive"
							>
								<Icon icon={TrashCan} />
								{t("messagingDeleteAction")}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				) : null}
			</header>

			{thread.contactId ? null : (
				<div className="flex shrink-0 flex-wrap items-center gap-3 border-b px-(--spacing-block-inline) py-3">
					<p className="min-w-0 flex-1 text-muted-foreground text-xs">
						{t("messagingUnmatchedDescription")}
					</p>
					<Button
						disabled={link.isPending}
						onClick={() => setLinking(true)}
						size="sm"
						variant="outline"
					>
						{t("messagingLinkContactAction")}
					</Button>
					<CreateContactSheet
						initialFirstName={initial.firstName}
						initialLastName={initial.lastName}
						onCreated={(contactId) =>
							link.mutate({ threadId: thread.id, contactId })
						}
						openRecordOnSuccess={false}
					/>
				</div>
			)}

			<div
				className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-(--spacing-block-inline) py-4"
				onScroll={(event) => trackScroll(event.currentTarget)}
				ref={scrollRef}
			>
				{messages.isPending ? (
					<div className="flex flex-1 items-center justify-center">
						<Spinner />
					</div>
				) : (
					<>
						{messages.hasNextPage ? (
							<Button
								className="self-center"
								disabled={messages.isFetchingNextPage}
								onClick={loadEarlier}
								size="sm"
								variant="outline"
							>
								{messages.isFetchingNextPage ? <Spinner /> : null}
								{t("messagingLoadEarlierAction")}
							</Button>
						) : null}

						{rows.map((message) => (
							<MessageBubble
								key={message.id}
								message={message}
								onRetry={(body) => sender.send(body)}
								retrying={sender.pending}
							/>
						))}
					</>
				)}
			</div>

			<MessageComposer sender={sender} threadId={thread.id} />

			<LinkContactDialog
				onOpenChange={setLinking}
				open={linking}
				threadId={thread.id}
			/>

			<AlertDialog
				open={confirmingDelete}
				onOpenChange={(open) => {
					if (!remove.isPending) setConfirmingDelete(open);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t("messagingDeleteConfirmTitle")}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{t("messagingDeleteConfirmDescription")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={remove.isPending}>
							{common("cancel")}
						</AlertDialogCancel>
						<Button
							disabled={remove.isPending}
							onClick={() => remove.mutate({ threadId: thread.id })}
							variant="destructive"
						>
							{remove.isPending ? <Spinner /> : null}
							{t("messagingDeleteAction")}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
