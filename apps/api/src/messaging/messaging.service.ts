import { canManageConnections } from "@crm/auth";
import { type Db, type Prisma, Prisma as PrismaNamespace } from "@crm/db";
import { eligibility } from "@crm/db/messaging";
import {
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { AgentAccessService } from "../agent/agent-access.service";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { InjectDatabase } from "../database/database.constants";
import { type MessageAttachment, messageAttachments } from "./incoming-message";
import type {
	MessagingEligibility,
	MessagingFilter,
	MessagingMessagesInput,
	MessagingSendInput,
	MessagingThreadsInput,
} from "./messaging.contracts";
import {
	MessagingWriterService,
	type QueuedOutbound,
} from "./messaging-writer.service";

const SNIPPET_SELECT = {
	id: true,
	direction: true,
	kind: true,
	body: true,
	sentAt: true,
	queuedAt: true,
} as const;

const THREAD_SELECT = {
	id: true,
	contactId: true,
	companyId: true,
	firstMessageAt: true,
	lastMessageAt: true,
	lastInboundAt: true,
	lastOutboundAt: true,
	messageCount: true,
	unreadCount: true,
	identity: {
		select: {
			id: true,
			externalId: true,
			displayName: true,
			avatarUrl: true,
			followedAt: true,
			unfollowedAt: true,
		},
	},
	contact: { select: { id: true, firstName: true, lastName: true } },
	messages: {
		take: 1,
		orderBy: [{ queuedAt: "desc" }, { id: "desc" }],
		select: SNIPPET_SELECT,
	},
} satisfies Prisma.MessageThreadSelect;

const MESSAGE_SELECT = {
	id: true,
	direction: true,
	status: true,
	kind: true,
	body: true,
	attachments: true,
	queuedAt: true,
	sentAt: true,
	deliveredAt: true,
	readAt: true,
	failedAt: true,
	errorMessage: true,
	sentBy: { select: { id: true, name: true, image: true } },
} satisfies Prisma.MessageSelect;

type ThreadRow = Prisma.MessageThreadGetPayload<{
	select: typeof THREAD_SELECT;
}>;
type MessageRow = Prisma.MessageGetPayload<{ select: typeof MESSAGE_SELECT }>;

@Injectable()
export class MessagingService {
	private readonly logger = new Logger(MessagingService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly access: AgentAccessService,
		private readonly writer: MessagingWriterService,
		private readonly agent: AgentTriggerService,
	) {}

	async eligibilityFor(
		userId: string,
		threadId: string,
	): Promise<MessagingEligibility> {
		await this.access.assertMember(userId);

		const thread = await this.db.messageThread.findUnique({
			where: { id: threadId },
			select: {
				id: true,
				lastInboundAt: true,
				account: { select: { disconnectedAt: true, tokenError: true } },
			},
		});

		if (!thread) {
			throw new NotFoundException(`No conversation with id ${threadId}.`);
		}

		const verdict = eligibility({
			now: new Date(),
			lastInboundAt: thread.lastInboundAt,
			accountDisconnectedAt: thread.account.disconnectedAt,
			accountTokenError: thread.account.tokenError,
		});

		if (verdict.mode === "blocked") return verdict;

		return {
			mode: "free-text",
			windowClosesAt: verdict.windowClosesAt.toISOString(),
		};
	}

	async send(
		userId: string,
		input: MessagingSendInput,
	): Promise<QueuedOutbound> {
		await this.access.assertMember(userId);

		const queued = await this.agent
			.withTasks((tx, queue) =>
				this.writer.queueOutbound(tx, queue, {
					threadId: input.threadId,
					body: input.body,
					sentById: userId,
					clientRequestId: input.clientRequestId,
				}),
			)
			.catch(async (cause: unknown) => {
				const first = isUniqueViolation(cause)
					? await this.outboundByRequest(input)
					: null;

				if (!first) throw cause;

				return first;
			});

		this.logger.log({
			message: "Reply queued",
			threadId: input.threadId,
			userId,
		});

		return queued;
	}

	private async outboundByRequest(
		input: MessagingSendInput,
	): Promise<QueuedOutbound | null> {
		const row = await this.db.message.findFirst({
			where: {
				threadId: input.threadId,
				clientRequestId: input.clientRequestId,
				direction: "OUTBOUND",
			},
			select: { id: true, status: true },
		});

		return row ? { messageId: row.id, status: row.status } : null;
	}

	async threads(userId: string, input: MessagingThreadsInput) {
		await this.access.assertMember(userId);

		const cursor = input.cursor ? { id: input.cursor } : undefined;

		const [rows, needsReply, unmatched] = await Promise.all([
			this.db.messageThread.findMany({
				where: filterClause(input.filter),
				take: input.limit + 1,
				cursor,
				skip: cursor ? 1 : undefined,
				orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
				select: THREAD_SELECT,
			}),
			this.db.messageThread.count({ where: filterClause("needsReply") }),
			this.db.messageThread.count({ where: filterClause("unmatched") }),
		]);

		const hasMore = rows.length > input.limit;
		const page = hasMore ? rows.slice(0, input.limit) : rows;

		return {
			rows: page.map(serializeThread),
			nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
			counts: { needsReply, unmatched },
		};
	}

	async threadByContact(userId: string, contactId: string) {
		await this.access.assertMember(userId);

		const thread = await this.db.messageThread.findFirst({
			where: { contactId },
			orderBy: { lastMessageAt: "desc" },
			select: THREAD_SELECT,
		});

		return { thread: thread ? serializeThread(thread) : null };
	}

	async threadById(userId: string, threadId: string) {
		await this.access.assertMember(userId);

		const thread = await this.db.messageThread.findUnique({
			where: { id: threadId },
			select: THREAD_SELECT,
		});

		return { thread: thread ? serializeThread(thread) : null };
	}

	async unreadCount(userId: string) {
		await this.access.assertMember(userId);

		const total = await this.db.messageThread.aggregate({
			_sum: { unreadCount: true },
		});

		return { count: total._sum.unreadCount ?? 0 };
	}

	async messages(userId: string, input: MessagingMessagesInput) {
		await this.access.assertMember(userId);

		const cursor = input.cursor ? { id: input.cursor } : undefined;

		const rows = await this.db.message.findMany({
			where: { threadId: input.threadId },
			take: input.limit + 1,
			cursor,
			skip: cursor ? 1 : undefined,
			orderBy: [{ queuedAt: "desc" }, { id: "desc" }],
			select: MESSAGE_SELECT,
		});

		const hasMore = rows.length > input.limit;
		const page = hasMore ? rows.slice(0, input.limit) : rows;

		return {
			rows: page.map((row) => this.serializeMessage(row)).reverse(),
			nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
		};
	}

	async markRead(userId: string, threadId: string): Promise<{ ok: true }> {
		await this.access.assertMember(userId);

		await this.writer.markRead(threadId);

		return { ok: true };
	}

	async linkContact(
		userId: string,
		threadId: string,
		contactId: string,
	): Promise<{ ok: true }> {
		await this.access.assertMember(userId);
		await this.writer.linkContact(threadId, contactId);

		this.logger.log({ message: "Conversation linked", threadId, userId });

		return { ok: true };
	}

	async unlinkContact(userId: string, threadId: string): Promise<{ ok: true }> {
		await this.assertCanManage(userId);
		await this.writer.unlinkContact(threadId);

		this.logger.log({ message: "Conversation unlinked", threadId, userId });

		return { ok: true };
	}

	async deleteThread(userId: string, threadId: string): Promise<{ ok: true }> {
		await this.assertCanManage(userId);
		await this.writer.deleteThread(threadId);

		return { ok: true };
	}

	private attachmentsOf(message: MessageRow): MessageAttachment[] {
		if (message.attachments === null) return [];

		const parsed = messageAttachments.safeParse(message.attachments);

		if (parsed.success) return parsed.data;

		this.logger.warn({
			message: "A stored attachment list could not be read.",
			messageId: message.id,
		});

		return [];
	}

	private serializeMessage(message: MessageRow) {
		return {
			id: message.id,
			direction: message.direction,
			status: message.status,
			kind: message.kind,
			body: message.body,
			attachments: this.attachmentsOf(message),
			queuedAt: message.queuedAt.toISOString(),
			sentAt: message.sentAt?.toISOString() ?? null,
			deliveredAt: message.deliveredAt?.toISOString() ?? null,
			readAt: message.readAt?.toISOString() ?? null,
			failedAt: message.failedAt?.toISOString() ?? null,
			errorMessage: message.errorMessage,
			sentBy: message.sentBy,
		};
	}

	private async assertCanManage(userId: string): Promise<void> {
		const role = await this.access.assertMember(userId);

		if (!canManageConnections(role)) {
			throw new ForbiddenException(
				"Only an owner or an admin can change a Zalo conversation.",
			);
		}
	}
}

function isUniqueViolation(cause: unknown): boolean {
	return (
		cause instanceof PrismaNamespace.PrismaClientKnownRequestError &&
		cause.code === "P2002"
	);
}

function filterClause(filter: MessagingFilter): Prisma.MessageThreadWhereInput {
	switch (filter) {
		case "needsReply":
			return { unreadCount: { gt: 0 } };
		case "unmatched":
			return { contactId: null };
		case "all":
			return {};
	}
}

function serializeThread(thread: ThreadRow) {
	const last = thread.messages[0] ?? null;

	return {
		id: thread.id,
		contactId: thread.contactId,
		companyId: thread.companyId,
		firstMessageAt: thread.firstMessageAt.toISOString(),
		lastMessageAt: thread.lastMessageAt.toISOString(),
		lastInboundAt: thread.lastInboundAt?.toISOString() ?? null,
		lastOutboundAt: thread.lastOutboundAt?.toISOString() ?? null,
		messageCount: thread.messageCount,
		unreadCount: thread.unreadCount,
		identity: {
			id: thread.identity.id,
			externalId: thread.identity.externalId,
			displayName: thread.identity.displayName,
			avatarUrl: thread.identity.avatarUrl,
			followedAt: thread.identity.followedAt?.toISOString() ?? null,
			unfollowedAt: thread.identity.unfollowedAt?.toISOString() ?? null,
		},
		contact: thread.contact,
		snippet: last
			? {
					direction: last.direction,
					kind: last.kind,
					body: last.body,
					sentAt: (last.sentAt ?? last.queuedAt).toISOString(),
				}
			: null,
	};
}
