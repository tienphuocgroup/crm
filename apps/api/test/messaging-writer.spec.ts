import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth";
import { db } from "@crm/db";
import { workspaceSlug } from "@crm/db/workspace";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import type { IncomingChannelMessage } from "../src/messaging/incoming-message";
import { MESSAGING_API } from "../src/messaging/messaging-config";
import { MessagingWriterService } from "../src/messaging/messaging-writer.service";

const suffix = process.env.TEST_RUN_ID ?? "messaging-writer-spec";
const ownerId = `writer-owner-${suffix}`;
const oaId = `writer-oa-${suffix}`;
const personId = `writer-person-${suffix}`;
const email = `writer-contact-${suffix}@example.test`;

const writer = new MessagingWriterService(
	db,
	new ActivityStampService(db),
	new AgentTriggerService(db),
);

const base = new Date("2026-09-20T10:00:00.000Z");

const PROFILE_KIND = "message-identity-profile";

function inbound(
	overrides: Partial<IncomingChannelMessage> = {},
): IncomingChannelMessage {
	return {
		channel: "ZALO",
		accountExternalIds: [oaId],
		senderExternalId: personId,
		displayName: "Nguyen Van A",
		avatarUrl: null,
		kind: "TEXT",
		body: "Xin chao",
		attachments: [],
		externalId: `msg-1-${suffix}`,
		sentAt: base,
		...overrides,
	};
}

async function connectOa(): Promise<string> {
	const account = await db.messagingAccount.create({
		data: {
			channel: "ZALO",
			externalId: oaId,
			label: "Writer OA",
			connectedById: ownerId,
		},
		select: { id: true },
	});

	return account.id;
}

async function threadOf() {
	return db.messageThread.findFirst({
		where: { identity: { externalId: personId } },
		select: {
			id: true,
			contactId: true,
			companyId: true,
			messageCount: true,
			unreadCount: true,
			firstMessageAt: true,
			lastMessageAt: true,
			lastInboundAt: true,
		},
	});
}

async function clear() {
	await db.agentTask.deleteMany({ where: { kind: PROFILE_KIND } });
	await db.messagingAccount.deleteMany({ where: { externalId: oaId } });
	await db.contact.deleteMany({ where: { email } });
}

async function profileTasks() {
	return db.agentTask.findMany({
		where: { kind: PROFILE_KIND },
		select: { id: true, payload: true, budget: true, finishedAt: true },
	});
}

beforeAll(async () => {
	await db.organization.upsert({
		where: { id: WORKSPACE_ID },
		update: {},
		create: {
			id: WORKSPACE_ID,
			name: DEFAULT_WORKSPACE_NAME,
			slug: workspaceSlug(DEFAULT_WORKSPACE_NAME),
			createdAt: new Date(),
		},
	});
	await db.user.createMany({
		data: [
			{ id: ownerId, name: "Writer Owner", email: `${ownerId}@example.test` },
		],
		skipDuplicates: true,
	});
	await clear();
});

afterEach(clear);

afterAll(async () => {
	await clear();
	await db.user.deleteMany({ where: { id: ownerId } });
});

describe("storing an inbound message", () => {
	it("refuses an Official Account this CRM does not know", async () => {
		expect(await writer.store(inbound())).toEqual({
			stored: false,
			reason: "no-account",
		});
	});

	it("refuses a disconnected Official Account", async () => {
		const accountId = await connectOa();
		await db.messagingAccount.update({
			where: { id: accountId },
			data: { disconnectedAt: new Date() },
		});

		expect(await writer.store(inbound())).toEqual({
			stored: false,
			reason: "disconnected",
		});
		expect(
			await db.message.count({
				where: { thread: { identity: { externalId: personId } } },
			}),
		).toBe(0);
		expect(await threadOf()).toBeNull();
	});

	it("writes the identity, the thread, the message and one activity", async () => {
		const accountId = await connectOa();

		const result = await writer.store(inbound());
		const thread = await threadOf();

		expect(result.stored).toBe(true);
		expect(thread?.messageCount).toBe(1);
		expect(thread?.unreadCount).toBe(1);
		expect(thread?.firstMessageAt).toEqual(base);
		expect(thread?.lastInboundAt).toEqual(base);

		const identity = await db.contactChannelIdentity.findFirst({
			where: { accountId, externalId: personId },
			select: { displayName: true, lastInboundAt: true, contactId: true },
		});
		expect(identity?.displayName).toBe("Nguyen Van A");
		expect(identity?.lastInboundAt).toEqual(base);
		expect(identity?.contactId).toBeNull();

		const activity = await db.activity.findFirst({
			where: { messageThreadId: thread?.id },
			select: { type: true, subject: true, createdById: true },
		});
		expect(activity?.type).toBe("MESSAGE");
		expect(activity?.subject).toBe("Xin chao");
		expect(activity?.createdById).toBe(ownerId);

		const account = await db.messagingAccount.findUnique({
			where: { id: accountId },
			select: { lastInboundAt: true },
		});
		expect(account?.lastInboundAt).toEqual(base);
	});

	it("reports a replayed message id as a duplicate and bumps nothing", async () => {
		await connectOa();
		await writer.store(inbound());

		expect(await writer.store(inbound())).toEqual({
			stored: false,
			reason: "duplicate",
		});

		const thread = await threadOf();
		expect(thread?.messageCount).toBe(1);
		expect(thread?.unreadCount).toBe(1);
		expect(await db.message.count({ where: { threadId: thread?.id } })).toBe(1);
	});

	it("never moves the last message time backwards", async () => {
		await connectOa();
		const later = new Date(base.getTime() + 60_000);
		const earlier = new Date(base.getTime() - 60_000);

		await writer.store(inbound({ externalId: `a-${suffix}`, sentAt: later }));
		await writer.store(inbound({ externalId: `b-${suffix}`, sentAt: earlier }));

		const thread = await threadOf();
		expect(thread?.lastMessageAt).toEqual(later);
		expect(thread?.messageCount).toBe(2);

		const activity = await db.activity.findFirst({
			where: { messageThreadId: thread?.id },
			select: { occurredAt: true },
		});
		expect(activity?.occurredAt).toEqual(later);
	});

	it("keeps one activity for three messages", async () => {
		await connectOa();

		for (const step of [0, 1, 2]) {
			await writer.store(
				inbound({
					externalId: `m-${step}-${suffix}`,
					sentAt: new Date(base.getTime() + step * 1000),
					body: `Message ${step}`,
				}),
			);
		}

		const thread = await threadOf();
		expect(thread?.messageCount).toBe(3);
		expect(
			await db.activity.count({ where: { messageThreadId: thread?.id } }),
		).toBe(1);

		const activity = await db.activity.findFirst({
			where: { messageThreadId: thread?.id },
			select: { subject: true },
		});
		expect(activity?.subject).toBe("Message 2");
	});

	it("names a sticker, an image and a file when there is no text", async () => {
		await connectOa();

		await writer.store(
			inbound({ externalId: `s-${suffix}`, kind: "STICKER", body: null }),
		);

		const thread = await threadOf();
		const activity = await db.activity.findFirst({
			where: { messageThreadId: thread?.id },
			select: { subject: true },
		});
		expect(activity?.subject).toBe("Sticker");
	});

	it("keeps the attachment list on the stored row", async () => {
		await connectOa();
		const url = "https://cdn.zdn.vn/photo.jpg";

		await writer.store(
			inbound({
				externalId: `img-${suffix}`,
				kind: "IMAGE",
				body: null,
				attachments: [{ url }],
			}),
		);

		const message = await db.message.findFirst({
			where: { externalId: `img-${suffix}` },
			select: { attachments: true, kind: true, status: true },
		});
		expect(message?.kind).toBe("IMAGE");
		expect(message?.status).toBe("DELIVERED");
		expect(message?.attachments).toEqual([{ url }]);
	});

	it("stamps the contact and the company of a matched thread", async () => {
		const accountId = await connectOa();
		const contact = await db.contact.create({
			data: { firstName: "Matched", lastName: "Person", email },
			select: { id: true },
		});
		await db.contactChannelIdentity.create({
			data: {
				channel: "ZALO",
				accountId,
				externalId: personId,
				contactId: contact.id,
			},
		});

		await writer.store(inbound());

		const thread = await threadOf();
		expect(thread?.contactId).toBe(contact.id);

		const stamped = await db.contact.findUnique({
			where: { id: contact.id },
			select: { lastActivityAt: true },
		});
		expect(stamped?.lastActivityAt).toEqual(base);

		const activity = await db.activity.findFirst({
			where: { messageThreadId: thread?.id },
			select: { contactId: true },
		});
		expect(activity?.contactId).toBe(contact.id);
	});

	it("leaves an unmatched thread without a contact and stamps nothing", async () => {
		await connectOa();

		await writer.store(inbound());

		const thread = await threadOf();
		expect(thread?.contactId).toBeNull();
		expect(thread?.companyId).toBeNull();
	});
});

describe("follow and unfollow", () => {
	it("records a follow and clears it on an unfollow", async () => {
		const accountId = await connectOa();
		const followedAt = base;
		const unfollowedAt = new Date(base.getTime() + 60_000);

		await writer.follow({
			channel: "ZALO",
			accountExternalId: oaId,
			senderExternalId: personId,
			kind: "follow",
			at: followedAt,
		});

		let identity = await db.contactChannelIdentity.findFirst({
			where: { accountId, externalId: personId },
			select: { followedAt: true, unfollowedAt: true },
		});
		expect(identity?.followedAt).toEqual(followedAt);
		expect(identity?.unfollowedAt).toBeNull();

		await writer.unfollow({
			channel: "ZALO",
			accountExternalId: oaId,
			senderExternalId: personId,
			kind: "unfollow",
			at: unfollowedAt,
		});

		identity = await db.contactChannelIdentity.findFirst({
			where: { accountId, externalId: personId },
			select: { followedAt: true, unfollowedAt: true },
		});
		expect(identity?.unfollowedAt).toEqual(unfollowedAt);

		await writer.follow({
			channel: "ZALO",
			accountExternalId: oaId,
			senderExternalId: personId,
			kind: "follow",
			at: followedAt,
		});

		identity = await db.contactChannelIdentity.findFirst({
			where: { accountId, externalId: personId },
			select: { followedAt: true, unfollowedAt: true },
		});
		expect(identity?.unfollowedAt).toEqual(unfollowedAt);
		expect(identity?.followedAt).toEqual(followedAt);
	});

	it("creates no thread", async () => {
		await connectOa();

		await writer.follow({
			channel: "ZALO",
			accountExternalId: oaId,
			senderExternalId: personId,
			kind: "follow",
			at: base,
		});

		expect(await threadOf()).toBeNull();
	});
});

describe("receipts", () => {
	it("keeps one row per receipt when the outbound message has no id yet", async () => {
		const accountId = await connectOa();

		for (const step of [0, 1]) {
			await writer.receipt({
				channel: "ZALO",
				accountExternalIds: [oaId],
				externalId: `zalo-msg-${suffix}`,
				kind: "seen",
				at: new Date(base.getTime() + step * 1000),
			});
		}

		expect(await db.messageReceipt.count({ where: { accountId } })).toBe(1);
	});

	it("settles the outbound row it finds", async () => {
		const accountId = await connectOa();
		await writer.store(inbound());
		const thread = await threadOf();

		const outbound = await db.message.create({
			data: {
				threadId: thread?.id ?? "",
				direction: "OUTBOUND",
				status: "SENT",
				kind: "TEXT",
				body: "Chao ban",
				externalId: `out-${suffix}`,
				sentAt: base,
			},
			select: { id: true },
		});

		await writer.receipt({
			channel: "ZALO",
			accountExternalIds: [oaId],
			externalId: `out-${suffix}`,
			kind: "delivered",
			at: new Date(base.getTime() + 1000),
		});

		let row = await db.message.findUnique({
			where: { id: outbound.id },
			select: { status: true, deliveredAt: true, readAt: true },
		});
		expect(row?.status).toBe("DELIVERED");
		expect(row?.deliveredAt).not.toBeNull();

		await writer.receipt({
			channel: "ZALO",
			accountExternalIds: [oaId],
			externalId: `out-${suffix}`,
			kind: "seen",
			at: new Date(base.getTime() + 2000),
		});

		row = await db.message.findUnique({
			where: { id: outbound.id },
			select: { status: true, deliveredAt: true, readAt: true },
		});
		expect(row?.status).toBe("READ");
		expect(row?.readAt).not.toBeNull();
		expect(await db.messageReceipt.count({ where: { accountId } })).toBe(0);
	});

	it("settles the outbound rows and files the rest in one batch", async () => {
		const accountId = await connectOa();
		await writer.store(inbound());
		const thread = await threadOf();

		const settled = await db.message.create({
			data: {
				threadId: thread?.id ?? "",
				direction: "OUTBOUND",
				status: "SENT",
				kind: "TEXT",
				body: "Chao ban",
				externalId: `batch-out-${suffix}`,
				sentAt: base,
			},
			select: { id: true },
		});

		const pending = Array.from(
			{ length: MESSAGING_API.webhook.maxReceiptIds - 1 },
			(_, index) => `batch-pending-${index}-${suffix}`,
		);

		await writer.receipts(
			accountId,
			[`batch-out-${suffix}`, ...pending],
			"seen",
			new Date(base.getTime() + 1000),
		);

		const row = await db.message.findUnique({
			where: { id: settled.id },
			select: { status: true, readAt: true },
		});
		expect(row?.status).toBe("READ");
		expect(row?.readAt).toEqual(new Date(base.getTime() + 1000));
		expect(await db.messageReceipt.count({ where: { accountId } })).toBe(
			pending.length,
		);
	});
});

describe("linking, unlinking and deleting a conversation", () => {
	it("moves the activity to the contact and stamps it", async () => {
		await connectOa();
		await writer.store(inbound());
		const thread = await threadOf();
		const contact = await db.contact.create({
			data: { firstName: "Linked", lastName: "Person", email },
			select: { id: true },
		});

		await writer.linkContact(thread?.id ?? "", contact.id);

		const linked = await threadOf();
		expect(linked?.contactId).toBe(contact.id);

		const identity = await db.contactChannelIdentity.findFirst({
			where: { externalId: personId },
			select: { contactId: true },
		});
		expect(identity?.contactId).toBe(contact.id);

		const activity = await db.activity.findFirst({
			where: { messageThreadId: thread?.id },
			select: { contactId: true },
		});
		expect(activity?.contactId).toBe(contact.id);

		const stamped = await db.contact.findUnique({
			where: { id: contact.id },
			select: { lastActivityAt: true },
		});
		expect(stamped?.lastActivityAt).toEqual(base);
	});

	it("refuses a second contact on the same person", async () => {
		await connectOa();
		await writer.store(inbound());
		const thread = await threadOf();
		const first = await db.contact.create({
			data: { firstName: "First", email },
			select: { id: true },
		});
		const second = await db.contact.create({
			data: { firstName: "Second", email: `second-${email}` },
			select: { id: true },
		});

		await writer.linkContact(thread?.id ?? "", first.id);

		await expect(
			writer.linkContact(thread?.id ?? "", second.id),
		).rejects.toThrow(/already belongs/);

		await db.contact.delete({ where: { id: second.id } });
	});

	it("returns the conversation to unmatched on an unlink", async () => {
		await connectOa();
		await writer.store(inbound());
		const thread = await threadOf();
		const contact = await db.contact.create({
			data: { firstName: "Linked", email },
			select: { id: true },
		});

		await writer.linkContact(thread?.id ?? "", contact.id);
		await writer.unlinkContact(thread?.id ?? "");

		const unlinked = await threadOf();
		expect(unlinked?.contactId).toBeNull();
		expect(unlinked?.companyId).toBeNull();

		const identity = await db.contactChannelIdentity.findFirst({
			where: { externalId: personId },
			select: { contactId: true },
		});
		expect(identity?.contactId).toBeNull();

		const activity = await db.activity.findFirst({
			where: { messageThreadId: thread?.id },
			select: { contactId: true, companyId: true },
		});
		expect(activity?.contactId).toBeNull();
		expect(activity?.companyId).toBeNull();
	});

	it("erases the identity, the thread, the messages and the activity", async () => {
		await connectOa();
		await writer.store(inbound());
		const thread = await threadOf();

		await writer.deleteThread(thread?.id ?? "");

		expect(await threadOf()).toBeNull();
		expect(
			await db.contactChannelIdentity.count({
				where: { externalId: personId },
			}),
		).toBe(0);
		expect(await db.message.count({ where: { threadId: thread?.id } })).toBe(0);
		expect(
			await db.activity.count({ where: { messageThreadId: thread?.id } }),
		).toBe(0);
	});

	it("refuses a conversation it cannot find", async () => {
		await expect(writer.deleteThread(`missing-${suffix}`)).rejects.toThrow(
			/No conversation/,
		);
	});
});

describe("reading the profile of a person with no name", () => {
	it("queues one task for a stored first message and none for the second", async () => {
		await connectOa();

		await writer.store(inbound({ displayName: null }));

		const first = await profileTasks();
		const identity = await db.contactChannelIdentity.findFirstOrThrow({
			where: { externalId: personId },
			select: { id: true },
		});

		await writer.store(
			inbound({
				displayName: null,
				externalId: `msg-2-${suffix}`,
				sentAt: new Date(base.getTime() + 1000),
			}),
		);

		expect(first).toHaveLength(1);
		expect(first[0]?.payload).toEqual({ identityId: identity.id });
		expect(first[0]?.budget).toBe(0);
		expect(await profileTasks()).toHaveLength(1);
	});

	it("queues nothing for a delivery it already stored", async () => {
		await connectOa();

		await writer.store(inbound({ displayName: null }));
		await db.agentTask.updateMany({
			where: { kind: PROFILE_KIND },
			data: { finishedAt: new Date(), outcome: "Not a follower." },
		});

		const second = await writer.store(inbound({ displayName: null }));

		expect(second.stored).toBe(false);
		expect(await profileTasks()).toHaveLength(1);
	});

	it("queues nothing once a read stamped the person", async () => {
		await connectOa();

		await writer.store(inbound({ displayName: null }));
		await db.agentTask.updateMany({
			where: { kind: PROFILE_KIND },
			data: { finishedAt: new Date(), outcome: "Not a follower." },
		});
		await db.contactChannelIdentity.updateMany({
			where: { externalId: personId },
			data: { profileCheckedAt: new Date() },
		});

		await writer.store(
			inbound({
				displayName: null,
				externalId: `msg-3-${suffix}`,
				sentAt: new Date(base.getTime() + 2000),
			}),
		);

		expect(await profileTasks()).toHaveLength(1);
	});

	it("queues one more task when a stamped person follows", async () => {
		await connectOa();

		await writer.store(inbound({ displayName: null }));
		await db.agentTask.updateMany({
			where: { kind: PROFILE_KIND },
			data: { finishedAt: new Date(), outcome: "Not a follower." },
		});
		await db.contactChannelIdentity.updateMany({
			where: { externalId: personId },
			data: { profileCheckedAt: new Date() },
		});

		await writer.follow({
			channel: "ZALO",
			accountExternalId: oaId,
			senderExternalId: personId,
			kind: "follow",
			at: new Date(base.getTime() + 3000),
		});

		const identity = await db.contactChannelIdentity.findFirstOrThrow({
			where: { externalId: personId },
			select: { profileCheckedAt: true },
		});

		expect(identity.profileCheckedAt).toBeNull();
		expect(await profileTasks()).toHaveLength(2);
	});

	it("queues nothing when the person already has a name", async () => {
		await connectOa();

		await writer.store(inbound());

		expect(await profileTasks()).toHaveLength(0);
	});

	it("queues one task for a follow event from an unknown person", async () => {
		await connectOa();

		await writer.follow({
			channel: "ZALO",
			accountExternalId: oaId,
			senderExternalId: personId,
			kind: "follow",
			at: base,
		});

		expect(await profileTasks()).toHaveLength(1);
	});
});
