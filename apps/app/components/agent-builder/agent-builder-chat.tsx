"use client";

import Add from "@carbon/icons-react/es/Add";
import Application from "@carbon/icons-react/es/Application";
import ArrowRight from "@carbon/icons-react/es/ArrowRight";
import Building from "@carbon/icons-react/es/Building";
import Checkmark from "@carbon/icons-react/es/Checkmark";
import Copy from "@carbon/icons-react/es/Copy";
import Partnership from "@carbon/icons-react/es/Partnership";
import Play from "@carbon/icons-react/es/Play";
import Renew from "@carbon/icons-react/es/Renew";
import Reply from "@carbon/icons-react/es/Reply";
import ThumbsDown from "@carbon/icons-react/es/ThumbsDown";
import ThumbsUp from "@carbon/icons-react/es/ThumbsUp";
import User from "@carbon/icons-react/es/User";
import WarningAlt from "@carbon/icons-react/es/WarningAlt";
import {
	AsyncButtonContent,
	useAsyncAction,
} from "@crm/ui/components/async-action";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { DotMatrix } from "@crm/ui/components/dot-matrix";
import { Icon } from "@crm/ui/components/icon";
import { Markdown } from "@crm/ui/components/markdown";
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
} from "@crm/ui/components/message-scroller";
import { Reasoning } from "@crm/ui/components/reasoning";
import { ThinkingIndicator } from "@crm/ui/components/thinking-indicator";
import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { cn } from "@crm/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Client, type MessageStreamEvent } from "eve/client";
import type { EveMessage, EveMessageInputRequest } from "eve/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment, type ReactNode, useState } from "react";
import { toast } from "sonner";
import {
	AgentClarificationComposer,
	type ClarificationResponse,
} from "@/components/agent-clarification-composer";
import { LocalDateTime } from "@/components/local-date-time";
import {
	consumeBuilderCommand,
	hasCreateAgentCommand,
} from "@/lib/agent-builder";
import {
	agentBuilderCallIsActive,
	builderConversationIsWorking,
	builderSessionStreamKey,
	completedBuilderSteps,
	displayedArtifactVersionId,
	latestCompletedArtifactVersionId,
	reviewVersionId,
} from "@/lib/agent-builder-state";
import { toolLabel } from "@/lib/agent-tool-display";
import {
	type AgentTurnFailure,
	conversationTimeline,
	eventStreamSettled,
	latestTurnFailure,
	messagesFromEvents,
	splitMarkdownTable,
	type TranscriptItem,
	toTranscript,
} from "@/lib/agent-transcript";
import { isSharedChatToken } from "@/lib/chat-route";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { AgentCodeWorkspace } from "./agent-code-workspace";
import { AgentComposer, type BuilderPrompt } from "./agent-composer";
import {
	agentResultSkeleton,
	agentResultsByItem,
	hasAgentResult,
} from "./agent-result";
import { AgentScopeBadges } from "./agent-scope-badges";
import {
	ChatAttachmentChip,
	ChatCommandChip,
	ChatReferenceChip,
} from "./chat-chips";
import { DeleteChatAction } from "./delete-chat-action";
import { ShareChatDialog } from "./share-chat-dialog";

type Conversation = RouterOutputs["conversations"]["builderById"];
type SharedConversation = RouterOutputs["conversations"]["shared"];

const BUILDER_STEPS = ["scope", "instructions", "manifest", "review"] as const;
const BUILDER_STEP_KEYS: Record<(typeof BUILDER_STEPS)[number], string> = {
	scope: "agentCreationStepScope",
	instructions: "agentCreationStepInstructions",
	manifest: "agentCreationStepManifest",
	review: "agentCreationStepReview",
};
const BUILDER_STEP_ARTIFACTS = [
	null,
	"agent/instructions.md",
	"agent/manifest.json",
	"agent/README.md",
] as const;
type DraftVersion = {
	id: string;
	status: string;
	manifest: unknown;
};

type BuilderSubmission = {
	id: string;
	createdAt: string;
	clientRequestId?: string | null;
	commandType: "CHAT" | "CREATE_AGENT";
	message: unknown;
	status: string;
	errorMessage: string | null;
};

type PendingSubmission = {
	clientRequestId: string;
	createdAt: string;
	commandType: "CHAT" | "CREATE_AGENT";
	message: unknown;
};

export function AgentBuilderChat({
	conversationId,
	initialData,
}: {
	conversationId: string;
	initialData: Conversation | SharedConversation | null;
}) {
	const t = useTranslations("agent-panel");
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const sharedChat = isSharedChatToken(conversationId);
	const [liveStream, setLiveStream] = useState<{
		key: string;
		events: readonly MessageStreamEvent[];
	} | null>(null);
	const [sending, setSending] = useState<PendingSubmission[]>([]);
	const conversation = useQuery({
		...trpc.conversations.builderById.queryOptions({ id: conversationId }),
		enabled: !sharedChat,
		initialData: sharedChat ? undefined : (initialData as Conversation),
		refetchInterval: (query) => {
			const data = query.state.data;
			return data && builderConversationNeedsPolling(data) ? 2500 : false;
		},
	});
	const shared = useQuery({
		...trpc.conversations.shared.queryOptions({ token: conversationId }),
		enabled: sharedChat,
		initialData:
			sharedChat && initialData
				? (initialData as SharedConversation)
				: undefined,
		refetchInterval: (query) =>
			sharedConversationNeedsPolling(query.state.data) ? 5000 : false,
	});
	const events = useQuery({
		...trpc.conversations.events.queryOptions({
			id: conversationId,
			limit: 5000,
		}),
		enabled: !sharedChat && Boolean(conversation.data?.sessionId),
		refetchInterval: (query) =>
			conversation.data &&
			(builderConversationNeedsPolling(conversation.data) ||
				!eventStreamSettled(query.state.data ?? []))
				? 2500
				: false,
	});
	const submit = useMutation(
		trpc.conversations.submitBuilder.mutationOptions({
			onSuccess: async () => {
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: trpc.conversations.builderById.pathKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.conversations.builderList.pathKey(),
					}),
				]);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const answerQuestion = useMutation(
		trpc.conversations.answerBuilderQuestion.mutationOptions({
			onSuccess: async () => {
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: trpc.conversations.builderById.pathKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.conversations.builderList.pathKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.conversations.events.pathKey(),
					}),
				]);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const markRead = useMutation(
		trpc.conversations.markRead.mutationOptions({
			onSuccess: () =>
				queryClient.invalidateQueries({
					queryKey: trpc.conversations.builderList.pathKey(),
				}),
		}),
	);

	if (sharedChat) {
		if (shared.isPending) {
			return (
				<main
					className="flex flex-1 items-center justify-center p-8"
					aria-busy="true"
				>
					<span className="text-muted-foreground text-sm">
						{t("openingChat")}
					</span>
				</main>
			);
		}
		if (shared.isError || !shared.data) return <ChatUnavailable />;
		return <SharedAgentChat conversation={shared.data} />;
	}

	if (conversation.isError && !conversation.data) {
		return <ChatUnavailable />;
	}

	const data = conversation.data ?? (initialData as Conversation);
	const submissions = data.submissions as BuilderSubmission[];
	const confirmedRequestIds = new Set(
		submissions
			.map((submission) => submission.clientRequestId)
			.filter((id): id is string => Boolean(id)),
	);
	const pendingSubmissions = sending.filter(
		(item) => !confirmedRequestIds.has(item.clientRequestId),
	);
	const persistedEvents = (events.data ??
		[]) as unknown as MessageStreamEvent[];
	const streamKey = builderSessionStreamKey(
		data.sessionId,
		submissions.at(-1)?.id ?? null,
	);
	const transcriptEvents =
		streamKey && liveStream?.key === streamKey
			? liveStream.events
			: persistedEvents;
	const agentMessages = messagesFromEvents(transcriptEvents);
	const timeline = conversationTimeline(
		submissions,
		transcriptEvents,
		agentMessages,
	);
	const answeredQuestionIds = questionResponseIds(submissions);
	const waitingQuestion = data.pendingQuestion;
	const question =
		waitingQuestion &&
		!hasQueuedQuestionResponse(submissions, waitingQuestion.requestId)
			? waitingQuestion
			: null;
	const failure = latestTurnFailure(transcriptEvents);
	const creatingAgent = hasCreateAgentCommand(submissions);
	const working = builderConversationIsWorking(data) && !failure;
	const builderCallActive = agentBuilderCallIsActive(transcriptEvents);
	const currentSubmissionCreatesAgent =
		submissions.at(-1)?.commandType === "CREATE_AGENT";
	const reviewVersion = reviewVersionId(data);
	const artifactVersion = displayedArtifactVersionId(data, working);
	const retryPrompt = retryPromptOf(submissions.at(-1));
	const send = async (
		prompt: BuilderPrompt,
		clientRequestId = crypto.randomUUID(),
	) => {
		setSending((current) => [
			...current,
			{
				clientRequestId,
				createdAt: new Date().toISOString(),
				commandType: prompt.commandType ?? "CHAT",
				message: {
					text: prompt.message,
					resources: prompt.resources,
					attachments: prompt.attachments,
				},
			},
		]);

		try {
			await submit.mutateAsync({
				id: conversationId,
				clientRequestId,
				...prompt,
			});
		} finally {
			setSending((current) =>
				current.filter((item) => item.clientRequestId !== clientRequestId),
			);
		}
	};

	return (
		<main
			className="flex min-h-0 flex-1 flex-col"
			onPointerEnter={() => {
				if (
					data.lastAssistantAt &&
					(!data.lastReadAt ||
						new Date(data.lastAssistantAt) > new Date(data.lastReadAt)) &&
					!markRead.isPending
				) {
					markRead.mutate({ id: conversationId });
				}
			}}
		>
			{streamKey && data.sessionId ? (
				<BuilderEventFollower
					key={streamKey}
					conversationId={conversationId}
					sessionId={data.sessionId}
					onSnapshot={(snapshot) =>
						setLiveStream({ key: streamKey, events: snapshot })
					}
					onEvent={(event) =>
						setLiveStream((current) => ({
							key: streamKey,
							events:
								current?.key === streamKey
									? appendEvent(current.events, event)
									: [event],
						}))
					}
					onEnded={() =>
						setLiveStream((current) =>
							current?.key === streamKey ? null : current,
						)
					}
				/>
			) : null}
			<ChatHeader
				conversation={data}
				working={working}
				creatingAgent={creatingAgent}
			/>

			<MessageScrollerProvider autoScroll defaultScrollPosition="last-anchor">
				<MessageScroller className="flex-1">
					<MessageScrollerViewport>
						<MessageScrollerContent
							aria-busy={working}
							className="mx-auto w-full max-w-3xl gap-4 px-4 py-6 sm:gap-5 sm:px-5 sm:py-9"
						>
							{timeline.map((item) => (
								<MessageScrollerItem
									key={item.id}
									messageId={item.id}
									scrollAnchor={item.kind === "submission"}
								>
									{item.kind === "submission" ? (
										<UserSubmission
											submission={item.submission}
											failed={item.submission.status === "FAILED"}
											error={item.submission.errorMessage}
										/>
									) : (
										<AssistantMessage
											conversation={data}
											message={item.message}
											answeredQuestionIds={answeredQuestionIds}
										/>
									)}
								</MessageScrollerItem>
							))}

							{pendingSubmissions.map((item) => (
								<MessageScrollerItem
									key={item.clientRequestId}
									messageId={`sending:${item.clientRequestId}`}
									scrollAnchor
								>
									<UserSubmission
										submission={{
											id: item.clientRequestId,
											createdAt: item.createdAt,
											commandType: item.commandType,
											message: item.message,
											status: "PENDING",
											errorMessage: null,
										}}
										failed={false}
										error={null}
										sending
									/>
								</MessageScrollerItem>
							))}

							{pendingSubmissions.length > 0 ||
							(working && !builderCallActive) ? (
								<MessageScrollerItem messageId={`thinking:${conversationId}`}>
									<ThinkingIndicator />
								</MessageScrollerItem>
							) : null}

							{working && builderCallActive ? (
								<MessageScrollerItem
									messageId={`building-agent:${conversationId}`}
								>
									<BuildingAgentCard
										conversationId={conversationId}
										sessionId={data.sessionId}
										artifacts={data.builderArtifacts}
										startedAt={submissions.at(-1)?.createdAt ?? null}
									/>
								</MessageScrollerItem>
							) : null}

							{creatingAgent && data.builderArtifacts.length > 0 ? (
								<MessageScrollerItem
									messageId={`agent-workspace:${conversationId}`}
								>
									<AgentCodeWorkspace
										artifacts={data.builderArtifacts}
										working={working}
										versionId={artifactVersion}
									/>
								</MessageScrollerItem>
							) : null}

							{!working && failure ? (
								<MessageScrollerItem
									messageId={`builder-failure:${conversationId}`}
								>
									<BuilderFailureCard
										failure={failure}
										creatingAgent={currentSubmissionCreatesAgent}
										retrying={submit.isPending}
										onRetry={retryPrompt ? () => send(retryPrompt) : null}
									/>
								</MessageScrollerItem>
							) : null}

							{creatingAgent && !working && reviewVersion ? (
								<MessageScrollerItem
									messageId={`review-agent:${conversationId}`}
								>
									<ReviewAgentCard
										conversation={data}
										versionId={reviewVersion}
									/>
								</MessageScrollerItem>
							) : null}

							{creatingAgent &&
							data.agent?.status === "LIVE" &&
							!reviewVersion ? (
								<MessageScrollerItem
									messageId={`deployed-agent:${conversationId}`}
								>
									<DeployedAgentCard
										conversation={data}
										onFollowUp={(message) =>
											send({
												commandType: "CREATE_AGENT",
												message,
												resources: [],
												attachments: [],
											})
										}
									/>
								</MessageScrollerItem>
							) : null}
						</MessageScrollerContent>
					</MessageScrollerViewport>
					<MessageScrollerButton />
				</MessageScroller>
			</MessageScrollerProvider>

			<div className="min-h-0 shrink overflow-y-auto overscroll-contain border-t px-4 py-3 sm:px-5">
				<div className="mx-auto w-full max-w-3xl">
					{question ? (
						<AgentClarificationComposer
							key={question.requestId}
							question={question}
							pending={answerQuestion.isPending}
							onSubmit={async (response: ClarificationResponse) => {
								await answerQuestion.mutateAsync({
									id: conversationId,
									clientRequestId: crypto.randomUUID(),
									...response,
								});
							}}
						/>
					) : (
						<AgentComposer mode="chat" disabled={working} onSubmit={send} />
					)}
				</div>
			</div>
		</main>
	);
}

function BuilderEventFollower({
	conversationId,
	sessionId,
	onSnapshot,
	onEvent,
	onEnded,
}: {
	conversationId: string;
	sessionId: string;
	onSnapshot: (events: readonly MessageStreamEvent[]) => void;
	onEvent: (event: MessageStreamEvent) => void;
	onEnded: () => void;
}) {
	useMountEffect(() => {
		const controller = new AbortController();
		const client = new Client({
			headers: { "x-crm-builder-conversation": conversationId },
			host: "",
		});

		const follow = async () => {
			const session = client.session({ sessionId, streamIndex: 0 });
			const snapshot = await session.snapshot({ signal: controller.signal });
			if (controller.signal.aborted) return;
			onSnapshot(snapshot.events);

			for await (const event of session.stream({
				startIndex: snapshot.session.streamIndex,
				signal: controller.signal,
			})) {
				if (controller.signal.aborted) return;
				onEvent(event);
			}
		};

		void follow()
			.catch((error: unknown) => {
				if (!controller.signal.aborted) console.error(error);
			})
			.finally(() => {
				if (!controller.signal.aborted) onEnded();
			});

		return () => controller.abort();
	});

	return null;
}

function withoutTable(text: string): string {
	const { before, after } = splitMarkdownTable(text);
	return [before, after].filter(Boolean).join("\n\n").trim();
}

function AgentToolStep({
	item,
}: {
	item: Extract<TranscriptItem, { kind: "did" }>;
}) {
	const t = useTranslations("agent-panel");
	const specific = toolLabel(item);
	const verb = item.label.key ? t(item.label.key) : item.label.fallback;
	const text = specific
		? t(specific.key, specific.values)
		: item.label.reason
			? t("stepWithReason", { step: verb, reason: item.label.reason })
			: verb;

	return (
		<div className="flex min-w-0 flex-col gap-1">
			<div className="flex min-w-0 items-start gap-2 text-sm">
				{item.pending ? (
					<DotMatrix decorative className="mt-0.5" />
				) : item.tone === "warning" ? (
					<Icon icon={WarningAlt} className="size-3.5 text-warning" />
				) : (
					<Icon icon={Checkmark} className="size-3.5 text-ring" />
				)}
				<span className="min-w-0 wrap-break-word">{text}</span>
			</div>
			{item.errorText ? (
				<p className="pl-[22px] wrap-break-word text-destructive text-xs leading-5">
					{item.errorText}
				</p>
			) : null}
			{hasAgentResult(item.tool) && item.pending
				? agentResultSkeleton(item.tool)
				: null}
		</div>
	);
}

function appendEvent(
	events: readonly MessageStreamEvent[],
	event: MessageStreamEvent,
): readonly MessageStreamEvent[] {
	return events.some((candidate) => candidate.meta.id === event.meta.id)
		? events
		: [...events, event];
}

function SharedAgentChat({
	conversation,
}: {
	conversation: SharedConversation;
}) {
	const t = useTranslations("agent-panel");
	const submissions =
		conversation.submissions as unknown as BuilderSubmission[];
	const events = conversation.events as unknown as MessageStreamEvent[];
	const messages = messagesFromEvents(events);
	const timeline = conversationTimeline(submissions, events, messages);
	const answeredQuestionIds = questionResponseIds(submissions);
	const working = events.length > 0 && !eventStreamSettled(events);
	const artifactVersion = working
		? null
		: latestCompletedArtifactVersionId(conversation.builderArtifacts);

	return (
		<main className="flex min-h-0 flex-1 flex-col">
			<header className="flex h-12 shrink-0 items-center gap-3 border-b px-5">
				<h1 className="min-w-0 flex-1 truncate font-medium text-sm">
					{conversation.agent?.name ??
						conversation.title ??
						t("sharedChatTitleFallback")}
				</h1>
				<span className="text-muted-foreground text-xs">
					{t("readOnlyLabel")}
				</span>
			</header>

			<MessageScrollerProvider autoScroll defaultScrollPosition="last-anchor">
				<MessageScroller className="flex-1">
					<MessageScrollerViewport>
						<MessageScrollerContent
							aria-busy={working}
							className="mx-auto w-full max-w-3xl gap-4 px-4 py-6 sm:gap-5 sm:px-5 sm:py-9"
						>
							<MessageScrollerItem messageId="shared-chat-notice">
								<div className="rounded-lg border bg-card px-4 py-3 text-sm">
									<p className="font-medium">
										{t("sharedChatSharedBy", { name: conversation.ownerName })}
									</p>
									<p className="mt-1 text-muted-foreground text-xs">
										{t("sharedChatReadOnlyNotice")}
									</p>
								</div>
							</MessageScrollerItem>

							{timeline.map((item) => (
								<MessageScrollerItem
									key={item.id}
									messageId={item.id}
									scrollAnchor={item.kind === "submission"}
								>
									{item.kind === "submission" ? (
										<UserSubmission
											submission={item.submission}
											failed={item.submission.status === "FAILED"}
											error={item.submission.errorMessage}
										/>
									) : (
										<AssistantMessage
											conversation={null}
											message={item.message}
											answeredQuestionIds={answeredQuestionIds}
										/>
									)}
								</MessageScrollerItem>
							))}

							{conversation.builderArtifacts.length > 0 ? (
								<MessageScrollerItem
									messageId={`agent-workspace:${conversation.id}`}
								>
									<AgentCodeWorkspace
										artifacts={conversation.builderArtifacts}
										working={working}
										versionId={artifactVersion}
									/>
								</MessageScrollerItem>
							) : null}
						</MessageScrollerContent>
					</MessageScrollerViewport>
					<MessageScrollerButton />
				</MessageScroller>
			</MessageScrollerProvider>
		</main>
	);
}

function ChatHeader({
	conversation,
	working,
	creatingAgent,
}: {
	conversation: Conversation;
	working: boolean;
	creatingAgent: boolean;
}) {
	const t = useTranslations("agent-panel");
	const workspaceUrl = useWorkspaceUrl();
	const title =
		(creatingAgent ? conversation.agent?.name : null) ??
		conversation.title ??
		t("chatTitleFallback");

	return (
		<header className="flex h-12 shrink-0 items-center gap-2 border-b px-4 sm:gap-2.5 sm:pr-4 sm:pl-5">
			<div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
				<h1 className="truncate font-medium text-sm">{title}</h1>
				<span className="hidden shrink-0 text-muted-foreground text-xs sm:inline">
					{t("chatVisibilityPrivate")}
				</span>
				{working ? (
					<span className="flex shrink-0 items-center gap-2 text-muted-foreground text-xs">
						<Icon
							icon={Renew}
							className="size-3.5 animate-spin text-ring"
							motion="none"
						/>
						<span className="sr-only">{t("chatWorkingInBackground")}</span>
						<span aria-hidden="true" className="hidden sm:inline">
							{t("chatWorkingInBackground")}
						</span>
					</span>
				) : null}
			</div>
			<Button asChild variant="ghost" size="icon-sm">
				<Link href={workspaceUrl("/chat")} aria-label={t("startNewChat")}>
					<Icon icon={Add} />
				</Link>
			</Button>
			<ShareChatDialog conversationId={conversation.id} title={title} />
			<DeleteChatAction
				conversationId={conversation.id}
				title={title}
				trigger="menu"
				returnToChatList
			/>
		</header>
	);
}

function UserSubmission({
	submission,
	failed,
	error,
	sending = false,
}: {
	submission: BuilderSubmission;
	failed: boolean;
	error: string | null;
	sending?: boolean;
}) {
	const t = useTranslations("agent-panel");
	const message = builderMessageOf(submission.message, t);
	const command =
		submission.commandType === "CREATE_AGENT"
			? consumeBuilderCommand(message.text)
			: null;
	const text = command?.body ?? message.text;
	const response = inputResponseOf(submission.message);

	return (
		<div
			className={cn(
				"flex min-w-0 w-full justify-end transition-opacity",
				sending && "opacity-60",
			)}
		>
			<div
				className={cn(
					"flex w-fit min-w-0 max-w-full flex-col gap-2 rounded-md bg-muted px-3 py-2.5 text-sm leading-5 sm:max-w-[620px] sm:px-3.5 sm:py-3",
					response &&
						"max-w-sm gap-1.5 border-ring border-r-2 bg-muted/70 py-2 sm:max-w-sm sm:py-2.5",
				)}
			>
				{response ? (
					<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
						<Icon icon={Reply} className="size-3.5" />
						<span>{t("answerToFollowUp")}</span>
					</div>
				) : null}
				{submission.commandType === "CREATE_AGENT" ? (
					<div className="flex flex-wrap gap-1">
						<ChatCommandChip
							label={t("createAgentCommandLabel")}
							icon={Application}
						/>
					</div>
				) : null}
				<p className="wrap-break-word">{text}</p>
				{message.resources.length > 0 || message.attachments.length > 0 ? (
					<div className="flex flex-wrap gap-1 pt-1">
						{message.resources.map((resource) => (
							<ChatReferenceChip
								key={`${resource.kind}:${resource.id}`}
								resource={resource}
								icon={RESOURCE_ICONS[resource.kind]}
							/>
						))}
						{message.attachments.map((attachment) => (
							<ChatAttachmentChip
								key={`${attachment.name}:${attachment.size}`}
								attachment={attachment}
							/>
						))}
					</div>
				) : null}
				{failed ? (
					<p className="mt-2 text-destructive text-xs">
						{error ?? t("messageSendFailed")}
					</p>
				) : null}
			</div>
		</div>
	);
}

function AssistantMessage({
	conversation,
	message,
	answeredQuestionIds,
}: {
	conversation: Conversation | null;
	message: EveMessage;
	answeredQuestionIds: ReadonlySet<string>;
}) {
	const t = useTranslations("agent-panel");
	const [transcript] = toTranscript([message]);
	if (!transcript || transcript.mine) return null;

	const textParts: string[] = [];
	for (const item of transcript.items) {
		if (item.kind === "said") textParts.push(item.text);
	}
	const markdown = textParts.join("\n\n");
	const results = agentResultsByItem(transcript.items);

	return (
		<div className="flex w-full min-w-0 max-w-[640px] flex-col gap-2">
			{transcript.items.map((item) => {
				if (item.kind === "reasoned") {
					return (
						<Reasoning
							key={item.id}
							isStreaming={item.streaming}
							label={t("reasoningLabel")}
						>
							<Markdown className="wrap-break-word leading-5">
								{item.text}
							</Markdown>
						</Reasoning>
					);
				}

				if (item.kind === "did") {
					return (
						<Fragment key={item.id}>
							<AgentToolStep item={item} />
							{results.get(item.id)}
						</Fragment>
					);
				}

				if (item.kind === "said") {
					const text = results.size > 0 ? withoutTable(item.text) : item.text;
					if (!text) return null;

					return (
						<Markdown
							key={item.id}
							className="wrap-break-word text-sm leading-5"
						>
							{text}
						</Markdown>
					);
				}

				return conversation === null ||
					answeredQuestionIds.has(item.question.requestId) ? (
					<FollowUpTranscriptItem
						key={item.id}
						question={item.question}
						answered={answeredQuestionIds.has(item.question.requestId)}
					/>
				) : null;
			})}
			{markdown ? (
				conversation ? (
					<ResponseActions
						conversation={conversation}
						messageId={transcript.id}
						markdown={markdown}
					/>
				) : (
					<CopyResponseAction markdown={markdown} />
				)
			) : null}
		</div>
	);
}

function FollowUpTranscriptItem({
	question,
	answered,
}: {
	question: EveMessageInputRequest;
	answered: boolean;
}) {
	const t = useTranslations("agent-panel");

	return (
		<div className="w-full max-w-sm border-ring/50 border-l-2 bg-muted/40 px-3 py-2.5">
			<div className="flex items-center justify-between gap-3 text-xs">
				<span className="font-medium">{t("followUpLabel")}</span>
				<span className="text-muted-foreground">
					{answered ? t("followUpAnswered") : t("followUpWaiting")}
				</span>
			</div>
			<Markdown className="mt-1.5 wrap-break-word text-sm leading-5">
				{question.prompt}
			</Markdown>
		</div>
	);
}

function CopyResponseAction({ markdown }: { markdown: string }) {
	const t = useTranslations("agent-panel");

	return (
		<div className="flex h-7 items-center">
			<Button
				variant="ghost"
				size="icon-xs"
				aria-label={t("copyResponseMarkdown")}
				onClick={() => {
					void navigator.clipboard.writeText(markdown);
					toast.success(t("responseCopiedMarkdown"));
				}}
			>
				<Icon icon={Copy} />
			</Button>
		</div>
	);
}

function ResponseActions({
	conversation,
	messageId,
	markdown,
}: {
	conversation: Conversation;
	messageId: string;
	markdown: string;
}) {
	const t = useTranslations("agent-panel");
	const trpc = useTRPC();
	const initial = conversation.feedback.find(
		(item) => item.messageId === messageId,
	)?.rating;
	const [rating, setRating] = useState<"UP" | "DOWN" | null>(initial ?? null);
	const rate = useMutation(
		trpc.conversations.rateBuilderResponse.mutationOptions({
			onError: (error) => toast.error(error.message),
		}),
	);

	const choose = (next: "UP" | "DOWN") => {
		const value = rating === next ? null : next;
		setRating(value);
		rate.mutate({ id: conversation.id, messageId, rating: value });
	};

	return (
		<div className="flex h-7 items-center gap-0.5">
			<Button
				variant="ghost"
				size="icon-xs"
				aria-label={t("copyResponseMarkdown")}
				onClick={() => {
					void navigator.clipboard.writeText(markdown);
					toast.success(t("responseCopiedMarkdown"));
				}}
			>
				<Icon icon={Copy} />
			</Button>
			<Button
				variant="ghost"
				size="icon-xs"
				aria-label={t("rateResponseHelpful")}
				aria-pressed={rating === "UP"}
				className={cn(rating === "UP" && "bg-muted text-foreground")}
				onClick={() => choose("UP")}
			>
				<Icon icon={ThumbsUp} />
			</Button>
			<Button
				variant="ghost"
				size="icon-xs"
				aria-label={t("rateResponseNotHelpful")}
				aria-pressed={rating === "DOWN"}
				className={cn(rating === "DOWN" && "bg-muted text-foreground")}
				onClick={() => choose("DOWN")}
			>
				<Icon icon={ThumbsDown} />
			</Button>
		</div>
	);
}

function BuildingAgentCard({
	conversationId,
	sessionId,
	artifacts,
	startedAt,
}: {
	conversationId: string;
	sessionId: string | null;
	artifacts: Conversation["builderArtifacts"];
	startedAt: string | null;
}) {
	const t = useTranslations("agent-panel");
	const common = useTranslations("common");
	const completed = completedBuilderSteps(artifacts, startedAt, sessionId);
	const stop = useAsyncAction({
		action: async () => {
			if (!sessionId) return;
			const response = await fetch(`/eve/v1/session/${sessionId}/cancel`, {
				method: "POST",
				headers: { "x-crm-builder-conversation": conversationId },
			});
			if (!response.ok) throw new Error(await response.text());
		},
		onSuccess: () => toast.success(t("stopRequestedToast")),
		onError: () => toast.error(t("stopFailedToast")),
	});

	const writingPath =
		artifacts.find((artifact) => artifact.status === "WRITING")?.path ?? null;

	return (
		<div className="w-full max-w-lg">
			<div className="overflow-hidden rounded-lg border bg-card">
				<div className="flex items-center gap-2 px-4 pt-4">
					<span className="min-w-0 flex-1 font-medium text-sm">
						{t("buildingAgent")}
					</span>
					<span className="shrink-0 font-mono text-muted-foreground text-xs">
						{t("agentCreationStepProgress", { completed })}
					</span>
				</div>
				<ol
					className="flex flex-col gap-1 p-3"
					aria-label={t("agentCreationLabel")}
				>
					{BUILDER_STEPS.map((step, index) => {
						const done = index < completed;
						const active =
							index === completed && completed < BUILDER_STEPS.length;
						const artifact = BUILDER_STEP_ARTIFACTS[index];

						return (
							<li
								key={step}
								className={cn(
									"flex min-h-8 min-w-0 flex-col justify-center gap-1 rounded-md px-2",
									active && "bg-muted py-2",
								)}
								aria-current={active ? "step" : undefined}
							>
								<div className="flex min-w-0 items-center gap-2">
									<span
										className={cn(
											"flex size-5 shrink-0 items-center justify-center font-mono text-xs",
											(done || active) && "text-ring",
											!done && !active && "text-muted-foreground",
										)}
									>
										{done ? (
											<Icon icon={Checkmark} className="size-3.5" />
										) : active ? (
											<DotMatrix decorative />
										) : (
											index + 1
										)}
									</span>
									<span
										className={cn(
											"min-w-0 flex-1 wrap-break-word text-sm",
											!done && !active && "text-muted-foreground",
										)}
									>
										{t(BUILDER_STEP_KEYS[step])}
									</span>
									<span
										className={cn(
											"shrink-0 text-xs",
											done && artifact && "font-mono",
											active ? "text-foreground" : "text-muted-foreground",
										)}
									>
										{done && artifact
											? artifact.replace("agent/", "")
											: done
												? t("agentCreationStepStatusDone")
												: active
													? t("agentCreationStepStatusWorking")
													: t("agentCreationStepStatusQueued")}
									</span>
								</div>
								{active && writingPath ? (
									<p className="pl-7 font-mono text-muted-foreground text-xs">
										{t("agentCreationWritingPath", { path: writingPath })}
									</p>
								) : null}
							</li>
						);
					})}
				</ol>
				<footer className="flex items-center gap-2 border-t bg-muted px-4 py-3">
					<p className="min-w-0 flex-1 text-pretty text-muted-foreground text-xs">
						{t("agentCreationRunsInBackground")}
					</p>
					<Button
						variant="outline"
						size="sm"
						disabled={!sessionId || stop.pending}
						aria-busy={stop.pending}
						onClick={() => stop.run()}
					>
						<AsyncButtonContent
							status={stop.status}
							pendingLabel={t("stoppingLabel")}
							successLabel={t("stoppingLabel")}
							errorLabel={common("tryAgain")}
						>
							{t("stopButton")}
						</AsyncButtonContent>
					</Button>
				</footer>
			</div>
		</div>
	);
}

function BuilderFailureCard({
	failure,
	creatingAgent,
	retrying,
	onRetry,
}: {
	failure: AgentTurnFailure;
	creatingAgent: boolean;
	retrying: boolean;
	onRetry: (() => void) | null;
}) {
	const t = useTranslations("agent-panel");
	const common = useTranslations("common");
	const message =
		failure.kind === "rate-limit"
			? t("builderFailureRateLimit")
			: failure.kind === "restricted"
				? t("builderFailureRestricted")
				: failure.kind === "credits"
					? t("builderFailureCredits")
					: t("builderFailureUnknown");

	return (
		<div
			role="alert"
			className="flex flex-col items-stretch gap-3 rounded-lg border border-destructive/30 bg-card px-4 py-3 sm:flex-row sm:items-start"
		>
			<div className="flex min-w-0 flex-1 items-start gap-3">
				<Icon icon={WarningAlt} className="mt-0.5 size-4 text-destructive" />
				<div className="min-w-0 flex-1">
					<p className="font-medium text-sm">
						{creatingAgent
							? t("builderFailureTitleCreatingAgent")
							: t("builderFailureTitleChat")}
					</p>
					<p className="mt-0.5 text-pretty text-muted-foreground text-xs leading-5">
						{message}
					</p>
				</div>
			</div>
			{onRetry ? (
				<Button
					variant="outline"
					size="sm"
					disabled={retrying}
					aria-busy={retrying}
					onClick={onRetry}
				>
					<AsyncButtonContent
						status={retrying ? "pending" : "idle"}
						pendingLabel={t("retryingLabel")}
					>
						{common("tryAgain")}
					</AsyncButtonContent>
				</Button>
			) : null}
		</div>
	);
}

function ReviewAgentCard({
	conversation,
	versionId,
}: {
	conversation: Conversation;
	versionId: string;
}) {
	const t = useTranslations("agent-panel");
	const workspaceUrl = useWorkspaceUrl();
	const version = conversation.createdVersions.find(
		(candidate) => candidate.id === versionId,
	) as DraftVersion | undefined;
	const agent = conversation.agent;
	const manifest = manifestOf(version?.manifest, t);

	if (!version || !agent) return null;

	return (
		<div className="flex flex-col gap-5">
			<p className="max-w-[640px] text-pretty text-sm leading-5">
				{t("reviewDraftReady")}
			</p>
			<AgentCardShell
				name={manifest.name ?? agent.name}
				status={t("agentStatusPrivate")}
			>
				<div className="flex flex-col gap-2 p-4">
					<ReviewRow label={t("reviewRowWhen")} value={manifest.trigger} />
					<ReviewRow label={t("reviewRowFind")} value={manifest.looksAt} />
					<ReviewRow label={t("reviewRowThen")} value={manifest.action} />
					<ReviewRow label={t("reviewRowScope")}>
						<AgentScopeBadges
							scopes={manifest.access}
							fallback={t("agentScopeFallback")}
						/>
					</ReviewRow>
				</div>
				<AgentCardFooter note={t("reviewCardFooterNote")}>
					<Button asChild size="sm">
						<Link
							href={workspaceUrl(`/agents/${agent.id}`)}
							transitionTypes={["nav-forward"]}
						>
							{t("viewDetails")}
							<Icon icon={ArrowRight} data-icon="inline-end" />
						</Link>
					</Button>
				</AgentCardFooter>
			</AgentCardShell>
		</div>
	);
}

function AgentCardShell({
	name,
	status,
	children,
}: {
	name: string;
	status: string;
	children: ReactNode;
}) {
	return (
		<div className="flex w-full max-w-lg flex-col overflow-hidden rounded-lg border bg-card">
			<div className="flex items-center gap-2 px-4 pt-4">
				<h2 className="min-w-0 flex-1 wrap-break-word font-medium text-sm">
					{name}
				</h2>
				<Badge variant="token">{status}</Badge>
			</div>
			{children}
		</div>
	);
}

function AgentCardFooter({
	note,
	children,
}: {
	note: string;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col items-stretch gap-3 border-t bg-muted px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
			<p className="text-pretty text-muted-foreground text-xs">{note}</p>
			<div className="sm:shrink-0">{children}</div>
		</div>
	);
}

function ReviewRow({
	label,
	value,
	children,
}: {
	label: string;
	value?: ReactNode;
	children?: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:gap-4">
			<span className="text-muted-foreground text-sm leading-5 sm:w-16 sm:shrink-0">
				{label}
			</span>
			<div className="min-w-0 flex-1 wrap-break-word font-medium text-sm leading-5">
				{children ?? value}
			</div>
		</div>
	);
}

function DeployedAgentCard({
	conversation,
	onFollowUp,
}: {
	conversation: Conversation;
	onFollowUp: (message: string) => Promise<void>;
}) {
	const t = useTranslations("agent-panel");
	const common = useTranslations("common");
	const trpc = useTRPC();
	const workspaceUrl = useWorkspaceUrl();
	const queryClient = useQueryClient();
	const agent = conversation.agent;
	const run = useMutation(
		trpc.agents.runNow.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.agents.history.pathKey(),
				});
				toast.success(t("agentRunQueuedToast"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const runAction = useAsyncAction({
		action: () =>
			run.mutateAsync({
				id: agent?.id ?? "",
				clientRequestId: crypto.randomUUID(),
			}),
	});

	if (!agent) return null;
	const enabledTriggers = agent.triggers.filter((trigger) => trigger.enabled);
	const nextRun =
		enabledTriggers.length === 1 ? enabledTriggers[0]?.nextRunAt : null;
	const triggerSummary =
		enabledTriggers.map((trigger) => trigger.name).join(" · ") ||
		t("manualOnlyLabel");

	return (
		<div className="flex flex-col gap-[18px]">
			<div className="flex flex-col gap-1">
				<p className="text-sm leading-5">
					{t("deployedAgentLive", { name: agent.name })}
				</p>
				<p className="text-muted-foreground text-sm leading-5">
					{t("deployedAgentLiveDescription")}
				</p>
			</div>
			<AgentCardShell name={agent.name} status={t("agentStatusLive")}>
				<div className="flex flex-col gap-2 p-4">
					<ReviewRow
						label={t("runMetaTrigger")}
						value={
							nextRun ? (
								<LocalDateTime
									date={nextRun}
									options={{
										weekday: "short",
										hour: "numeric",
										minute: "2-digit",
										timeZoneName: "short",
									}}
								/>
							) : (
								triggerSummary
							)
						}
					/>
					<ReviewRow
						label={t("reviewRowRunsIn")}
						value={t("deployedAgentRuntime")}
					/>
					<ReviewRow
						label={common("ownerLabel")}
						value={t("deployedAgentOwner", { name: agent.createdBy.name })}
					/>
				</div>
				<AgentCardFooter note={t("deployedAgentFooterNote")}>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={runAction.pending}
							aria-busy={runAction.pending}
							onClick={() => runAction.run()}
						>
							<AsyncButtonContent
								status={runAction.status}
								pendingLabel={t("queueingLabel")}
								successLabel={t("queuedLabel")}
								errorLabel={common("tryAgain")}
							>
								<Icon icon={Play} data-icon="inline-start" />
								{t("runNowButton")}
							</AsyncButtonContent>
						</Button>
						<Button asChild size="sm">
							<Link href={workspaceUrl(`/agents/${agent.id}`)}>
								{t("openAgent")}
								<Icon icon={ArrowRight} data-icon="inline-end" />
							</Link>
						</Button>
					</div>
				</AgentCardFooter>
			</AgentCardShell>

			<div>
				<p className="flex h-7 items-center text-muted-foreground text-sm">
					{t("suggestedFollowUps")}
				</p>
				{[t("followUpSuggestionAddTeammate")].map((suggestion) => (
					<button
						key={suggestion}
						type="button"
						onClick={() => void onFollowUp(suggestion)}
						className="flex w-full items-center gap-3 border-t py-2.5 text-left outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
					>
						<span className="min-w-0 flex-1 wrap-break-word text-sm">
							{suggestion}
						</span>
						<Icon icon={ArrowRight} className="size-4 text-muted-foreground" />
					</button>
				))}
			</div>
		</div>
	);
}

function ChatUnavailable() {
	const t = useTranslations("agent-panel");
	const workspaceUrl = useWorkspaceUrl();

	return (
		<main className="flex flex-1 items-center justify-center p-8">
			<div className="max-w-md text-center">
				<h1 className="font-medium text-lg">{t("chatUnavailableTitle")}</h1>
				<p className="mt-2 text-muted-foreground text-sm">
					{t("chatUnavailableDescription")}
				</p>
				<Button asChild variant="outline" className="mt-5">
					<Link href={workspaceUrl("/chat")}>{t("startNewChat")}</Link>
				</Button>
			</div>
		</main>
	);
}

const RESOURCE_ICONS = {
	integration: Application,
	company: Building,
	contact: User,
	deal: Partnership,
} as const;

function builderMessageOf(
	message: unknown,
	t: ReturnType<typeof useTranslations>,
) {
	const row = recordOf(message);
	return {
		text: typeof row.text === "string" ? row.text : t("messageUnavailable"),
		resources: Array.isArray(row.resources)
			? (row.resources as BuilderPrompt["resources"])
			: [],
		attachments: Array.isArray(row.attachments)
			? (row.attachments as BuilderPrompt["attachments"])
			: [],
	};
}

function hasQueuedQuestionResponse(
	submissions: BuilderSubmission[],
	requestId: string,
): boolean {
	return submissions.some((submission) => {
		if (submission.status === "FAILED" || submission.status === "CANCELLED") {
			return false;
		}

		return inputResponseOf(submission.message)?.requestId === requestId;
	});
}

function questionResponseIds(
	submissions: readonly BuilderSubmission[],
): ReadonlySet<string> {
	return new Set(
		submissions.flatMap((submission) => {
			if (submission.status === "FAILED" || submission.status === "CANCELLED") {
				return [];
			}

			const response = inputResponseOf(submission.message);
			return response ? [response.requestId] : [];
		}),
	);
}

function inputResponseOf(message: unknown): { requestId: string } | null {
	const response = recordOf(recordOf(message).inputResponse);
	return typeof response.requestId === "string" && response.requestId
		? { requestId: response.requestId }
		: null;
}

function retryPromptOf(
	submission: BuilderSubmission | undefined,
): BuilderPrompt | null {
	if (!submission) return null;
	const row = recordOf(submission.message);
	if (Object.keys(recordOf(row.inputResponse)).length > 0) return null;
	if (typeof row.text !== "string" || !row.text.trim()) return null;

	return {
		commandType: submission.commandType,
		message: row.text,
		resources: Array.isArray(row.resources)
			? (row.resources as BuilderPrompt["resources"])
			: [],
		attachments: Array.isArray(row.attachments)
			? (row.attachments as BuilderPrompt["attachments"])
			: [],
	};
}

function builderConversationNeedsPolling(conversation: Conversation): boolean {
	return builderConversationIsWorking(conversation);
}

function sharedConversationNeedsPolling(
	conversation: SharedConversation | undefined,
): boolean {
	if (!conversation?.events.length) return false;

	return !eventStreamSettled(conversation.events);
}

function manifestOf(value: unknown, t: ReturnType<typeof useTranslations>) {
	const manifest = recordOf(value);
	const triggers = Array.isArray(manifest.triggers)
		? manifest.triggers.map(recordOf)
		: [];
	const dataScope = recordOf(manifest.dataScope);
	const actions = Array.isArray(manifest.actions)
		? manifest.actions.map(recordOf)
		: [];
	const access = Array.isArray(manifest.access)
		? manifest.access.filter((item): item is string => typeof item === "string")
		: [];

	return {
		name:
			typeof manifest.name === "string" && manifest.name.trim()
				? manifest.name.trim()
				: null,
		description:
			typeof manifest.description === "string" && manifest.description.trim()
				? manifest.description.trim()
				: null,
		trigger:
			triggers
				.map((trigger) =>
					trigger.type === "MANUAL"
						? t("triggerOnDemand")
						: compactSummary(
								trigger.summary,
								trigger.type === "EVENT"
									? t("triggerOnEvent")
									: t("triggerOnSchedule"),
							),
				)
				.join(" · ") || t("triggerOnDemand"),
		looksAt: textOf(dataScope.summary, t("scopeApprovedFallback")),
		action: compactSummary(actions[0]?.summary, t("actionRequestedFallback")),
		access,
	};
}

function compactSummary(value: unknown, fallback: string): string {
	return textOf(value, fallback).replace(/\s+\([^()]+\)\s*\.?$/, "");
}

function recordOf(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function textOf(value: unknown, fallback: string): string {
	return typeof value === "string" && value.trim() ? value : fallback;
}
