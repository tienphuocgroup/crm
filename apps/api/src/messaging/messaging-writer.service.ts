import {
	ActivityType,
	type Db,
	MessageDirection,
	MessageKind,
	MessageStatus,
	type MessagingChannel,
	type Prisma,
} from "@crm/db";
import { eligibility, MESSAGING_POLICY } from "@crm/db/messaging";
import {
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
	UnprocessableEntityException,
} from "@nestjs/common";
import {
	type AgentTaskQueue,
	AgentTriggerService,
} from "../agent/agent-trigger.service";
import { ActivityStampService } from "../crm/activity-stamp.service";
import { InjectDatabase } from "../database/database.constants";
import type {
	IdentityEvent,
	IncomingChannelMessage,
	ReceiptEvent,
	StoreResult,
} from "./incoming-message";
import { MESSAGING_API } from "./messaging-config";

export type OutboundDraft = {
	threadId: string;
	body: string;
	sentById: string;
	clientRequestId: string;
};

export type QueuedOutbound = { messageId: string; status: MessageStatus };

type ChannelIdentity = {
	id: string;
	displayName: string | null;
	profileCheckedAt: Date | null;
};

export type WriterAccount = {
	id: string;
	externalId: string;
	connectedById: string;
	disconnectedAt: Date | null;
};

const ACCOUNT_SELECT = {
	id: true,
	externalId: true,
	connectedById: true,
	disconnectedAt: true,
} as const;

@Injectable()
export class MessagingWriterService {
	private readonly logger = new Logger(MessagingWriterService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly stamp: ActivityStampService,
		private readonly agent: AgentTriggerService,
	) {}

	async accountFor(
		channel: MessagingChannel,
		externalIds: string[],
	): Promise<WriterAccount | null> {
		const candidates = externalIds.filter((value) => value.length > 0);
		if (candidates.length === 0) return null;

		return this.db.messagingAccount.findFirst({
			where: { channel, externalId: { in: candidates } },
			orderBy: { connectedAt: "desc" },
			select: ACCOUNT_SELECT,
		});
	}

	async touchWebhook(accountId: string, at: Date): Promise<void> {
		await this.db.messagingAccount.updateMany({
			where: { id: accountId },
			data: { lastWebhookAt: at },
		});
	}

	async store(incoming: IncomingChannelMessage): Promise<StoreResult> {
		const account = await this.accountFor(
			incoming.channel,
			incoming.accountExternalIds,
		);

		if (!account) return { stored: false, reason: "no-account" };
		if (account.disconnectedAt !== null) {
			return { stored: false, reason: "disconnected" };
		}

		const identity = await this.identityOf({
			channel: incoming.channel,
			accountId: account.id,
			externalId: incoming.senderExternalId,
			displayName: incoming.displayName,
			avatarUrl: incoming.avatarUrl,
		});

		const result = await this.db.$transaction(async (tx) => {
			const owner = await this.lock(tx, identity.id);

			await tx.contactChannelIdentity.updateMany({
				where: {
					id: identity.id,
					OR: [
						{ lastInboundAt: null },
						{ lastInboundAt: { lt: incoming.sentAt } },
					],
				},
				data: { lastInboundAt: incoming.sentAt },
			});

			const contact = owner.contactId
				? await tx.contact.findUnique({
						where: { id: owner.contactId },
						select: { companyId: true },
					})
				: null;

			const thread = await tx.messageThread.upsert({
				where: { identityId: identity.id },
				create: {
					accountId: account.id,
					identityId: identity.id,
					contactId: owner.contactId,
					companyId: contact?.companyId ?? null,
					firstMessageAt: incoming.sentAt,
					lastMessageAt: incoming.sentAt,
					lastInboundAt: incoming.sentAt,
				},
				update: {},
				select: {
					id: true,
					contactId: true,
					companyId: true,
					lastMessageAt: true,
				},
			});

			const inserted = await tx.message.createMany({
				data: [
					{
						threadId: thread.id,
						direction: MessageDirection.INBOUND,
						status: MessageStatus.DELIVERED,
						kind: incoming.kind,
						body: incoming.body,
						attachments:
							incoming.attachments.length > 0
								? incoming.attachments
								: undefined,
						externalId: incoming.externalId,
						queuedAt: incoming.sentAt,
						sentAt: incoming.sentAt,
						deliveredAt: incoming.sentAt,
					},
				],
				skipDuplicates: true,
			});

			if (inserted.count === 0) {
				return { stored: false, reason: "duplicate" } as const;
			}

			await tx.messageThread.update({
				where: { id: thread.id },
				data: {
					messageCount: { increment: 1 },
					unreadCount: { increment: 1 },
				},
			});

			await tx.messageThread.updateMany({
				where: { id: thread.id, lastMessageAt: { lt: incoming.sentAt } },
				data: { lastMessageAt: incoming.sentAt },
			});

			await tx.messageThread.updateMany({
				where: {
					id: thread.id,
					OR: [
						{ lastInboundAt: null },
						{ lastInboundAt: { lt: incoming.sentAt } },
					],
				},
				data: { lastInboundAt: incoming.sentAt },
			});

			const newest =
				incoming.sentAt.getTime() >= thread.lastMessageAt.getTime();
			const subject = subjectOf(incoming);

			await tx.activity.upsert({
				where: { messageThreadId: thread.id },
				create: {
					type: ActivityType.MESSAGE,
					subject,
					occurredAt: incoming.sentAt,
					contactId: thread.contactId,
					companyId: thread.companyId,
					createdById: account.connectedById,
					messageThreadId: thread.id,
				},
				update: newest ? { subject, occurredAt: incoming.sentAt } : {},
			});

			await tx.messagingAccount.updateMany({
				where: {
					id: account.id,
					OR: [
						{ lastInboundAt: null },
						{ lastInboundAt: { lt: incoming.sentAt } },
					],
				},
				data: { lastInboundAt: incoming.sentAt },
			});

			return {
				stored: true,
				threadId: thread.id,
				contactId: thread.contactId,
				companyId: thread.companyId,
			} as const;
		});

		if (!result.stored) return result;

		if (result.contactId) {
			await this.stamp.touch(
				{ contactId: result.contactId, companyId: result.companyId },
				incoming.sentAt,
			);
		}

		await this.requestProfile(identity);

		return result;
	}

	async queueOutbound(
		tx: Prisma.TransactionClient,
		queue: AgentTaskQueue,
		draft: OutboundDraft,
	): Promise<QueuedOutbound> {
		const existing = await tx.message.findFirst({
			where: {
				threadId: draft.threadId,
				clientRequestId: draft.clientRequestId,
				direction: MessageDirection.OUTBOUND,
			},
			select: { id: true, status: true },
		});

		if (existing) {
			return { messageId: existing.id, status: existing.status };
		}

		const thread = await tx.messageThread.findUnique({
			where: { id: draft.threadId },
			select: {
				id: true,
				lastInboundAt: true,
				account: { select: { disconnectedAt: true, tokenError: true } },
			},
		});

		if (!thread) throw new NotFoundException(threadNotFound(draft.threadId));

		const now = new Date();
		const verdict = eligibility({
			now,
			lastInboundAt: thread.lastInboundAt,
			accountDisconnectedAt: thread.account.disconnectedAt,
			accountTokenError: thread.account.tokenError,
		});

		if (verdict.mode === "blocked") {
			throw new UnprocessableEntityException(verdict.reason);
		}

		const message = await tx.message.create({
			data: {
				threadId: thread.id,
				direction: MessageDirection.OUTBOUND,
				status: MessageStatus.QUEUED,
				kind: MessageKind.TEXT,
				body: draft.body,
				sentById: draft.sentById,
				clientRequestId: draft.clientRequestId,
				queuedAt: now,
			},
			select: { id: true, status: true },
		});

		await queue.messageSendRequested(message.id, draft.clientRequestId);

		await tx.messageThread.update({
			where: { id: thread.id },
			data: { messageCount: { increment: 1 }, lastMessageAt: now },
		});

		await tx.activity.updateMany({
			where: { messageThreadId: thread.id },
			data: { subject: snippetOf(draft.body) },
		});

		return { messageId: message.id, status: message.status };
	}

	async follow(event: IdentityEvent): Promise<void> {
		const identity = await this.identityForEvent(event);
		if (!identity) return;

		const followed = await this.db.contactChannelIdentity.updateMany({
			where: {
				id: identity.id,
				AND: [
					{ OR: [{ followedAt: null }, { followedAt: { lt: event.at } }] },
					{
						OR: [{ unfollowedAt: null }, { unfollowedAt: { lte: event.at } }],
					},
				],
			},
			data: {
				followedAt: event.at,
				unfollowedAt: null,
				profileCheckedAt: null,
			},
		});

		await this.requestProfile(
			followed.count > 0 ? { ...identity, profileCheckedAt: null } : identity,
		);
	}

	async unfollow(event: IdentityEvent): Promise<void> {
		const identity = await this.identityForEvent(event);
		if (!identity) return;

		await this.db.contactChannelIdentity.updateMany({
			where: {
				id: identity.id,
				AND: [
					{ OR: [{ unfollowedAt: null }, { unfollowedAt: { lt: event.at } }] },
					{ OR: [{ followedAt: null }, { followedAt: { lte: event.at } }] },
				],
			},
			data: { unfollowedAt: event.at },
		});
	}

	async receipt(event: ReceiptEvent): Promise<void> {
		const account = await this.accountFor(
			event.channel,
			event.accountExternalIds,
		);

		if (!account || account.disconnectedAt !== null) return;

		await this.receipts(account.id, [event.externalId], event.kind, event.at);
	}

	async receipts(
		accountId: string,
		externalIds: string[],
		kind: ReceiptEvent["kind"],
		at: Date,
	): Promise<void> {
		const ids = [...new Set(externalIds.filter((value) => value.length > 0))];
		if (ids.length === 0) return;

		const rows = await this.db.message.findMany({
			where: {
				externalId: { in: ids },
				direction: MessageDirection.OUTBOUND,
				thread: { accountId },
			},
			select: { id: true, externalId: true },
		});

		if (rows.length > 0) {
			const settled =
				kind === "delivered"
					? {
							statuses: [MessageStatus.SENT],
							data: { deliveredAt: at, status: MessageStatus.DELIVERED },
						}
					: {
							statuses: [MessageStatus.SENT, MessageStatus.DELIVERED],
							data: { readAt: at, status: MessageStatus.READ },
						};

			await this.db.message.updateMany({
				where: {
					id: { in: rows.map((row) => row.id) },
					status: { in: settled.statuses },
				},
				data: settled.data,
			});
		}

		const matched = new Set(
			rows
				.map((row) => row.externalId)
				.filter((value): value is string => value !== null),
		);
		const pending = ids.filter((value) => !matched.has(value));

		if (pending.length === 0) return;

		await this.db.messageReceipt.createMany({
			data: pending.map((externalId) => ({
				accountId,
				externalId,
				kind,
				at,
			})),
			skipDuplicates: true,
		});
	}

	async markRead(threadId: string): Promise<void> {
		await this.db.messageThread.updateMany({
			where: { id: threadId },
			data: { unreadCount: 0 },
		});
	}

	async detachContact(
		tx: Prisma.TransactionClient,
		contactId: string,
	): Promise<void> {
		await tx.messageThread.updateMany({
			where: { contactId },
			data: { companyId: null },
		});
	}

	async linkContact(threadId: string, contactId: string): Promise<void> {
		const linked = await this.db.$transaction(async (tx) => {
			const thread = await tx.messageThread.findUnique({
				where: { id: threadId },
				select: {
					identityId: true,
					lastMessageAt: true,
					identity: { select: { contactId: true } },
				},
			});

			if (!thread) throw new NotFoundException(threadNotFound(threadId));

			if (
				thread.identity.contactId !== null &&
				thread.identity.contactId !== contactId
			) {
				throw new ConflictException(
					"This conversation already belongs to another contact. Unlink it first.",
				);
			}

			const contact = await tx.contact.findUnique({
				where: { id: contactId },
				select: { companyId: true },
			});

			if (!contact) {
				throw new NotFoundException(`No contact with id ${contactId}.`);
			}

			await tx.contactChannelIdentity.update({
				where: { id: thread.identityId },
				data: { contactId },
			});

			await tx.messageThread.update({
				where: { id: threadId },
				data: { contactId, companyId: contact.companyId },
			});

			await tx.activity.updateMany({
				where: { messageThreadId: threadId },
				data: { contactId, companyId: contact.companyId },
			});

			return { companyId: contact.companyId, at: thread.lastMessageAt };
		});

		await this.stamp.touch(
			{ contactId, companyId: linked.companyId },
			linked.at,
		);
	}

	async unlinkContact(threadId: string): Promise<void> {
		await this.db.$transaction(async (tx) => {
			const thread = await tx.messageThread.findUnique({
				where: { id: threadId },
				select: { identityId: true },
			});

			if (!thread) throw new NotFoundException(threadNotFound(threadId));

			await tx.contactChannelIdentity.update({
				where: { id: thread.identityId },
				data: { contactId: null },
			});

			await tx.messageThread.update({
				where: { id: threadId },
				data: { contactId: null, companyId: null },
			});

			await tx.activity.updateMany({
				where: { messageThreadId: threadId },
				data: { contactId: null, companyId: null },
			});
		});
	}

	async deleteThread(threadId: string): Promise<void> {
		const thread = await this.db.messageThread.findUnique({
			where: { id: threadId },
			select: { identityId: true },
		});

		if (!thread) throw new NotFoundException(threadNotFound(threadId));

		await this.db.contactChannelIdentity.delete({
			where: { id: thread.identityId },
		});

		this.logger.log({ message: "Message thread deleted", threadId });
	}

	private async identityForEvent(
		event: IdentityEvent,
	): Promise<ChannelIdentity | null> {
		const account = await this.accountFor(event.channel, [
			event.accountExternalId,
		]);

		if (!account || account.disconnectedAt !== null) return null;

		return this.identityOf({
			channel: event.channel,
			accountId: account.id,
			externalId: event.senderExternalId,
			displayName: null,
			avatarUrl: null,
		});
	}

	private async identityOf(input: {
		channel: MessagingChannel;
		accountId: string;
		externalId: string;
		displayName: string | null;
		avatarUrl: string | null;
	}): Promise<ChannelIdentity & { contactId: string | null }> {
		const key = {
			channel: input.channel,
			accountId: input.accountId,
			externalId: input.externalId,
		};

		await this.db.contactChannelIdentity.createMany({
			data: [
				{ ...key, displayName: input.displayName, avatarUrl: input.avatarUrl },
			],
			skipDuplicates: true,
		});

		const identity = await this.db.contactChannelIdentity.findUniqueOrThrow({
			where: { channel_accountId_externalId: key },
			select: {
				id: true,
				contactId: true,
				displayName: true,
				profileCheckedAt: true,
			},
		});

		const fresh = {
			...(input.displayName ? { displayName: input.displayName } : {}),
			...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
		};

		if (Object.keys(fresh).length > 0) {
			await this.db.contactChannelIdentity.updateMany({
				where: { id: identity.id },
				data: fresh,
			});
		}

		return {
			...identity,
			displayName: input.displayName ?? identity.displayName,
		};
	}

	private async requestProfile(identity: ChannelIdentity): Promise<void> {
		if (identity.displayName !== null) return;
		if (identity.profileCheckedAt !== null) return;

		await this.agent.messageIdentityProfileRequested(identity.id);
	}

	private async lock(
		tx: Prisma.TransactionClient,
		identityId: string,
	): Promise<{ contactId: string | null }> {
		const [locked] = await tx.$queryRaw<{ contactId: string | null }[]>`
			SELECT "contactId"
			FROM "contactChannelIdentity"
			WHERE "id" = ${identityId}
			FOR UPDATE
		`;

		return locked ?? { contactId: null };
	}
}

function threadNotFound(threadId: string): string {
	return `No conversation with id ${threadId}.`;
}

function snippetOf(body: string | null): string {
	const text = body?.trim() ?? "";

	return text.length > MESSAGING_POLICY.snippetLength
		? `${text.slice(0, MESSAGING_POLICY.snippetLength - 1)}…`
		: text;
}

function subjectOf(incoming: IncomingChannelMessage): string {
	const text = snippetOf(incoming.body);

	if (text.length > 0) return text;

	switch (incoming.kind) {
		case MessageKind.IMAGE:
			return MESSAGING_API.subjects.IMAGE;
		case MessageKind.FILE:
			return MESSAGING_API.subjects.FILE;
		case MessageKind.STICKER:
			return MESSAGING_API.subjects.STICKER;
		default:
			return MESSAGING_API.subjects.OTHER;
	}
}
