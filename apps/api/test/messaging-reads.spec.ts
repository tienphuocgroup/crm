import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth";
import { db } from "@crm/db";
import { workspaceSlug } from "@crm/db/workspace";
import { AgentAccessService } from "../src/agent/agent-access.service";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import type { IncomingChannelMessage } from "../src/messaging/incoming-message";
import { MessagingService } from "../src/messaging/messaging.service";
import { MessagingWriterService } from "../src/messaging/messaging-writer.service";

const suffix = process.env.TEST_RUN_ID ?? "messaging-reads-spec";
const ownerId = `reads-owner-${suffix}`;
const memberId = `reads-member-${suffix}`;
const oaId = `reads-oa-${suffix}`;
const matchedPerson = `reads-matched-${suffix}`;
const unmatchedPerson = `reads-unmatched-${suffix}`;
const email = `reads-contact-${suffix}@example.test`;

const trigger = new AgentTriggerService(db);
const writer = new MessagingWriterService(
	db,
	new ActivityStampService(db),
	trigger,
);
const service = new MessagingService(
	db,
	new AgentAccessService(db),
	writer,
	trigger,
);

const base = new Date("2026-09-20T08:00:00.000Z");

function inbound(
	person: string,
	overrides: Partial<IncomingChannelMessage> = {},
): IncomingChannelMessage {
	return {
		channel: "ZALO",
		accountExternalIds: [oaId],
		senderExternalId: person,
		displayName: `Person ${person}`,
		avatarUrl: null,
		kind: "TEXT",
		body: "Xin chao",
		attachments: [],
		externalId: `${person}-1`,
		sentAt: base,
		...overrides,
	};
}

async function seed() {
	await db.messagingAccount.create({
		data: {
			channel: "ZALO",
			externalId: oaId,
			label: "Reads OA",
			connectedById: ownerId,
		},
	});

	const contact = await db.contact.create({
		data: { firstName: "Matched", lastName: "Person", email },
		select: { id: true },
	});

	await writer.store(inbound(matchedPerson));
	await writer.store(
		inbound(unmatchedPerson, { sentAt: new Date(base.getTime() + 1000) }),
	);

	const matched = await db.messageThread.findFirst({
		where: { identity: { externalId: matchedPerson } },
		select: { id: true },
	});
	const unmatched = await db.messageThread.findFirst({
		where: { identity: { externalId: unmatchedPerson } },
		select: { id: true },
	});

	await writer.linkContact(matched?.id ?? "", contact.id);

	return {
		contactId: contact.id,
		matchedThreadId: matched?.id ?? "",
		unmatchedThreadId: unmatched?.id ?? "",
	};
}

async function clear() {
	await db.messagingAccount.deleteMany({ where: { externalId: oaId } });
	await db.contact.deleteMany({ where: { email } });
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
			{ id: ownerId, name: "Reads Owner", email: `${ownerId}@example.test` },
			{ id: memberId, name: "Reads Member", email: `${memberId}@example.test` },
		],
		skipDuplicates: true,
	});
	await db.member.createMany({
		data: [
			{
				id: `reads-m-owner-${suffix}`,
				organizationId: WORKSPACE_ID,
				userId: ownerId,
				role: "owner",
				createdAt: new Date(),
			},
			{
				id: `reads-m-member-${suffix}`,
				organizationId: WORKSPACE_ID,
				userId: memberId,
				role: "member",
				createdAt: new Date(),
			},
		],
		skipDuplicates: true,
	});
	await clear();
});

beforeEach(clear);
afterEach(clear);

afterAll(async () => {
	await db.member.deleteMany({
		where: {
			id: { in: [`reads-m-owner-${suffix}`, `reads-m-member-${suffix}`] },
		},
	});
	await db.user.deleteMany({ where: { id: { in: [ownerId, memberId] } } });
});

describe("messaging.threads", () => {
	it("lists the newest conversation first with its counts", async () => {
		await seed();

		const page = await service.threads(ownerId, { limit: 30, filter: "all" });

		expect(page.rows).toHaveLength(2);
		expect(page.rows[0]?.identity.externalId).toBe(unmatchedPerson);
		expect(page.rows[0]?.snippet?.body).toBe("Xin chao");
		expect(page.counts).toEqual({ needsReply: 2, unmatched: 1 });
		expect(page.nextCursor).toBeNull();
	});

	it("filters the conversations nobody answered", async () => {
		const seeded = await seed();
		await service.markRead(ownerId, seeded.matchedThreadId);

		const page = await service.threads(ownerId, {
			limit: 30,
			filter: "needsReply",
		});

		expect(page.rows.map((row) => row.id)).toEqual([seeded.unmatchedThreadId]);
		expect(page.counts.needsReply).toBe(1);
	});

	it("filters the people no contact owns", async () => {
		const seeded = await seed();

		const page = await service.threads(ownerId, {
			limit: 30,
			filter: "unmatched",
		});

		expect(page.rows.map((row) => row.id)).toEqual([seeded.unmatchedThreadId]);
		expect(page.rows[0]?.contact).toBeNull();
	});

	it("hands back a cursor when a page fills up", async () => {
		await seed();

		const first = await service.threads(ownerId, { limit: 1, filter: "all" });
		expect(first.nextCursor).not.toBeNull();

		const second = await service.threads(ownerId, {
			limit: 1,
			filter: "all",
			cursor: first.nextCursor ?? undefined,
		});

		expect(second.rows).toHaveLength(1);
		expect(second.rows[0]?.id).not.toBe(first.rows[0]?.id);
	});
});

describe("messaging.messages", () => {
	it("returns a page oldest first", async () => {
		await seed();
		for (const step of [1, 2]) {
			await writer.store(
				inbound(unmatchedPerson, {
					externalId: `${unmatchedPerson}-${step + 1}`,
					body: `Message ${step}`,
					sentAt: new Date(base.getTime() + step * 60_000),
				}),
			);
		}

		const thread = await db.messageThread.findFirst({
			where: { identity: { externalId: unmatchedPerson } },
			select: { id: true },
		});

		const page = await service.messages(ownerId, {
			threadId: thread?.id ?? "",
			limit: 30,
		});

		expect(page.rows.map((row) => row.body)).toEqual([
			"Xin chao",
			"Message 1",
			"Message 2",
		]);
		expect(page.rows[0]?.direction).toBe("INBOUND");
		expect(page.rows[0]?.attachments).toEqual([]);
	});

	it("orders a replay that arrives late by the time it was sent", async () => {
		await seed();

		await writer.store(
			inbound(unmatchedPerson, {
				externalId: `${unmatchedPerson}-late`,
				body: "Later",
				sentAt: new Date(base.getTime() + 120_000),
			}),
		);
		await writer.store(
			inbound(unmatchedPerson, {
				externalId: `${unmatchedPerson}-early`,
				body: "Earlier",
				sentAt: new Date(base.getTime() + 60_000),
			}),
		);

		const thread = await db.messageThread.findFirstOrThrow({
			where: { identity: { externalId: unmatchedPerson } },
			select: { id: true },
		});

		const page = await service.messages(ownerId, {
			threadId: thread.id,
			limit: 30,
		});

		expect(page.rows.map((row) => row.body)).toEqual([
			"Xin chao",
			"Earlier",
			"Later",
		]);
	});

	it("pages past a queued row that has no sent time", async () => {
		await seed();

		const thread = await db.messageThread.findFirstOrThrow({
			where: { identity: { externalId: unmatchedPerson } },
			select: { id: true },
		});

		await db.message.create({
			data: {
				threadId: thread.id,
				direction: "OUTBOUND",
				status: "QUEUED",
				kind: "TEXT",
				body: "Waiting",
			},
		});

		const first = await service.messages(ownerId, {
			threadId: thread.id,
			limit: 1,
		});

		expect(first.rows.map((row) => row.body)).toEqual(["Waiting"]);
		expect(first.nextCursor).not.toBeNull();

		const second = await service.messages(ownerId, {
			threadId: thread.id,
			limit: 1,
			cursor: first.nextCursor ?? undefined,
		});

		expect(second.rows.map((row) => row.body)).toEqual(["Xin chao"]);
	});

	it("lists a row whose stored attachments cannot be read as empty", async () => {
		await seed();

		const thread = await db.messageThread.findFirstOrThrow({
			where: { identity: { externalId: unmatchedPerson } },
			select: { id: true },
		});

		await writer.store(
			inbound(unmatchedPerson, {
				externalId: `${unmatchedPerson}-broken`,
				body: "Broken",
				sentAt: new Date(base.getTime() + 60_000),
				attachments: [{ url: "https://cdn.zdn.vn/photo.jpg" }],
			}),
		);

		await db.message.updateMany({
			where: { externalId: `${unmatchedPerson}-broken` },
			data: { attachments: [{ url: "https://evil.example/x.jpg" }] },
		});

		const page = await service.messages(ownerId, {
			threadId: thread.id,
			limit: 30,
		});

		expect(page.rows.map((row) => row.body)).toEqual(["Xin chao", "Broken"]);
		expect(page.rows[1]?.attachments).toEqual([]);
	});
});

describe("messaging.unreadCount and markRead", () => {
	it("sums every conversation and clears the one a rep opens", async () => {
		const seeded = await seed();

		expect(await service.unreadCount(ownerId)).toEqual({ count: 2 });

		await service.markRead(memberId, seeded.matchedThreadId);

		expect(await service.unreadCount(ownerId)).toEqual({ count: 1 });
	});
});

describe("messaging.threadByContact", () => {
	it("returns the conversation of a linked contact", async () => {
		const seeded = await seed();

		const found = await service.threadByContact(ownerId, seeded.contactId);
		expect(found.thread?.id).toBe(seeded.matchedThreadId);

		const missing = await service.threadByContact(ownerId, `nobody-${suffix}`);
		expect(missing.thread).toBeNull();
	});
});

describe("messaging.threadById", () => {
	it("returns one conversation and null for an id nobody owns", async () => {
		const seeded = await seed();

		const found = await service.threadById(ownerId, seeded.matchedThreadId);
		expect(found.thread?.id).toBe(seeded.matchedThreadId);
		expect(found.thread?.identity.externalId).toBe(matchedPerson);
		expect(found.thread?.snippet?.body).toBe("Xin chao");

		const missing = await service.threadById(ownerId, `nothread-${suffix}`);
		expect(missing.thread).toBeNull();
	});
});

describe("the connections role", () => {
	it("lets any member link a conversation", async () => {
		const seeded = await seed();
		const contact = await db.contact.create({
			data: { firstName: "Late", email: `late-${email}` },
			select: { id: true },
		});

		expect(
			await service.linkContact(memberId, seeded.unmatchedThreadId, contact.id),
		).toEqual({ ok: true });

		await db.contact.delete({ where: { id: contact.id } });
	});

	it("refuses an unlink and a delete for a member without the role", async () => {
		const seeded = await seed();

		await expect(
			service.unlinkContact(memberId, seeded.matchedThreadId),
		).rejects.toThrow(/owner or an admin/);
		await expect(
			service.deleteThread(memberId, seeded.matchedThreadId),
		).rejects.toThrow(/owner or an admin/);

		expect(
			await db.messageThread.count({ where: { id: seeded.matchedThreadId } }),
		).toBe(1);
	});

	it("lets an owner unlink and delete", async () => {
		const seeded = await seed();

		expect(
			await service.unlinkContact(ownerId, seeded.matchedThreadId),
		).toEqual({ ok: true });
		expect(await service.deleteThread(ownerId, seeded.matchedThreadId)).toEqual(
			{ ok: true },
		);

		expect(
			await db.messageThread.count({ where: { id: seeded.matchedThreadId } }),
		).toBe(0);
	});
});
