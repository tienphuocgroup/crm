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
import { BLOCKED_REASONS } from "@crm/db/messaging";
import { workspaceSlug } from "@crm/db/workspace";
import { AgentAccessService } from "../src/agent/agent-access.service";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import type { IncomingChannelMessage } from "../src/messaging/incoming-message";
import { MessagingService } from "../src/messaging/messaging.service";
import { MessagingWriterService } from "../src/messaging/messaging-writer.service";

const suffix = process.env.TEST_RUN_ID ?? "messaging-send-spec";
const ownerId = `send-owner-${suffix}`;
const memberRowId = `send-member-row-${suffix}`;
const oaId = `send-oa-${suffix}`;
const personId = `send-person-${suffix}`;

const HOUR_MS = 60 * 60 * 1000;

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

let request = 0;

function uuid(): string {
	request += 1;

	return `00000000-0000-4000-8000-${String(request).padStart(12, "0")}`;
}

function inbound(sentAt: Date): IncomingChannelMessage {
	return {
		channel: "ZALO",
		accountExternalIds: [oaId],
		senderExternalId: personId,
		displayName: "Nguyen Van B",
		avatarUrl: null,
		kind: "TEXT",
		body: "Xin chao",
		attachments: [],
		externalId: `send-msg-${suffix}-${sentAt.getTime()}`,
		sentAt,
	};
}

async function connect(): Promise<string> {
	const account = await db.messagingAccount.create({
		data: {
			channel: "ZALO",
			externalId: oaId,
			label: "Send OA",
			accessToken: "access-1",
			connectedById: ownerId,
		},
		select: { id: true },
	});

	return account.id;
}

async function seed(inboundAt = new Date(Date.now() - HOUR_MS)) {
	const accountId = await connect();
	await writer.store(inbound(inboundAt));

	const thread = await db.messageThread.findFirstOrThrow({
		where: { identity: { externalId: personId } },
		select: { id: true },
	});

	return { accountId, threadId: thread.id };
}

async function sendTasks() {
	return db.agentTask.findMany({
		where: { kind: "message-send" },
		select: {
			id: true,
			contactId: true,
			companyId: true,
			priority: true,
			budget: true,
			payload: true,
			finishedAt: true,
		},
	});
}

async function outbound(threadId: string) {
	return db.message.findMany({
		where: { threadId, direction: "OUTBOUND" },
		orderBy: { queuedAt: "asc" },
		select: {
			id: true,
			status: true,
			body: true,
			sentById: true,
			clientRequestId: true,
		},
	});
}

async function clear() {
	await db.agentTask.deleteMany({ where: { kind: "message-send" } });
	await db.messagingAccount.deleteMany({ where: { externalId: oaId } });
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
			{ id: ownerId, name: "Send Owner", email: `${ownerId}@example.test` },
		],
		skipDuplicates: true,
	});
	await db.member.createMany({
		data: [
			{
				id: memberRowId,
				organizationId: WORKSPACE_ID,
				userId: ownerId,
				role: "owner",
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
	await db.member.deleteMany({ where: { id: memberRowId } });
	await db.user.deleteMany({ where: { id: ownerId } });
});

describe("messaging.send", () => {
	it("writes one queued row and one send task that names no contact", async () => {
		const seeded = await seed();
		const clientRequestId = uuid();

		const queued = await service.send(ownerId, {
			threadId: seeded.threadId,
			body: "Chao anh",
			clientRequestId,
		});

		const rows = await outbound(seeded.threadId);
		const tasks = await sendTasks();

		expect(queued.status).toBe("QUEUED");
		expect(rows).toHaveLength(1);
		expect(rows[0]?.id).toBe(queued.messageId);
		expect(rows[0]?.body).toBe("Chao anh");
		expect(rows[0]?.sentById).toBe(ownerId);
		expect(tasks).toHaveLength(1);
		expect(tasks[0]?.contactId).toBeNull();
		expect(tasks[0]?.companyId).toBeNull();
		expect(tasks[0]?.budget).toBe(0);
		expect(tasks[0]?.payload).toMatchObject({
			messageId: queued.messageId,
			clientRequestId,
		});
	});

	it("counts the reply on the thread and refreshes the activity subject", async () => {
		const seeded = await seed();

		await service.send(ownerId, {
			threadId: seeded.threadId,
			body: "Da nhan duoc",
			clientRequestId: uuid(),
		});

		const thread = await db.messageThread.findUniqueOrThrow({
			where: { id: seeded.threadId },
			select: { messageCount: true, lastMessageAt: true, lastInboundAt: true },
		});
		const activity = await db.activity.findFirstOrThrow({
			where: { messageThreadId: seeded.threadId },
			select: { subject: true, occurredAt: true },
		});

		expect(thread.messageCount).toBe(2);
		expect(activity.subject).toBe("Da nhan duoc");
		expect(activity.occurredAt?.getTime()).toBe(
			thread.lastInboundAt?.getTime(),
		);
	});

	it("queues a second row for a second client request id", async () => {
		const seeded = await seed();

		await service.send(ownerId, {
			threadId: seeded.threadId,
			body: "Mot",
			clientRequestId: uuid(),
		});
		await service.send(ownerId, {
			threadId: seeded.threadId,
			body: "Hai",
			clientRequestId: uuid(),
		});

		expect(await outbound(seeded.threadId)).toHaveLength(2);
		expect(await sendTasks()).toHaveLength(2);
	});

	it("returns the same row for a repeated client request id", async () => {
		const seeded = await seed();
		const clientRequestId = uuid();

		const first = await service.send(ownerId, {
			threadId: seeded.threadId,
			body: "Mot",
			clientRequestId,
		});
		const second = await service.send(ownerId, {
			threadId: seeded.threadId,
			body: "Mot",
			clientRequestId,
		});

		expect(second.messageId).toBe(first.messageId);
		expect(await outbound(seeded.threadId)).toHaveLength(1);
		expect(await sendTasks()).toHaveLength(1);
	});

	it("returns one row for two parallel sends with one client request id", async () => {
		const seeded = await seed();
		const draft = {
			threadId: seeded.threadId,
			body: "Mot",
			clientRequestId: uuid(),
		};

		const [first, second] = await Promise.all([
			service.send(ownerId, draft),
			service.send(ownerId, draft),
		]);

		expect(second.messageId).toBe(first.messageId);
		expect(await outbound(seeded.threadId)).toHaveLength(1);
		expect(await sendTasks()).toHaveLength(1);
	});

	it("refuses a reply after the window closed and writes nothing", async () => {
		const seeded = await seed(new Date(Date.now() - 49 * HOUR_MS));

		const refusal = await service
			.send(ownerId, {
				threadId: seeded.threadId,
				body: "Muon qua",
				clientRequestId: uuid(),
			})
			.catch((error: Error) => error);

		expect(refusal).toBeInstanceOf(Error);
		expect((refusal as Error).message).toContain("The reply window closed at");
		expect(await outbound(seeded.threadId)).toHaveLength(0);
		expect(await sendTasks()).toHaveLength(0);
	});

	it("refuses a reply on a disconnected Official Account", async () => {
		const seeded = await seed();
		await db.messagingAccount.update({
			where: { id: seeded.accountId },
			data: { disconnectedAt: new Date() },
		});

		const refusal = await service
			.send(ownerId, {
				threadId: seeded.threadId,
				body: "Xin chao",
				clientRequestId: uuid(),
			})
			.catch((error: Error) => error);

		expect((refusal as Error).message).toBe(BLOCKED_REASONS.disconnected);
		expect(await outbound(seeded.threadId)).toHaveLength(0);
	});

	it("refuses a reply while the token needs a reconnect", async () => {
		const seeded = await seed();
		await db.messagingAccount.update({
			where: { id: seeded.accountId },
			data: { tokenError: "The Zalo token needs a reconnect." },
		});

		const refusal = await service
			.send(ownerId, {
				threadId: seeded.threadId,
				body: "Xin chao",
				clientRequestId: uuid(),
			})
			.catch((error: Error) => error);

		expect((refusal as Error).message).toBe(BLOCKED_REASONS.tokenError);
		expect(await outbound(seeded.threadId)).toHaveLength(0);
		expect(await sendTasks()).toHaveLength(0);
	});
});

describe("messaging.eligibility", () => {
	it("allows free text inside the window", async () => {
		const seeded = await seed();

		const verdict = await service.eligibilityFor(ownerId, seeded.threadId);

		expect(verdict).toMatchObject({ mode: "free-text" });
	});

	it("blocks with one sentence once the window closed", async () => {
		const seeded = await seed(new Date(Date.now() - 49 * HOUR_MS));

		const verdict = await service.eligibilityFor(ownerId, seeded.threadId);

		expect(verdict.mode).toBe("blocked");
	});

	it("blocks a disconnected Official Account", async () => {
		const seeded = await seed();
		await db.messagingAccount.update({
			where: { id: seeded.accountId },
			data: { disconnectedAt: new Date() },
		});

		expect(await service.eligibilityFor(ownerId, seeded.threadId)).toEqual({
			mode: "blocked",
			reason: BLOCKED_REASONS.disconnected,
		});
	});
});
