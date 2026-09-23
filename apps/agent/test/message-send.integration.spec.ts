import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { db } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { runDirect } from "../agent/lib/dispatch";
import { runMessageSend } from "../agent/lib/messaging/message-send";
import { MESSAGING } from "../agent/lib/messaging/messaging-config";
import { claimDue, completeTask, type LeasedTask } from "../agent/lib/tasks";

const suffix = process.env.TEST_RUN_ID ?? "message-send-spec";
const userId = `zalo-send-user-${suffix}`;
const oaId = `send-oa-${suffix}`;
const personId = `send-person-${suffix}`;
const KIND = "message-send";
const REFRESH_KIND = "message-token-refresh";
const HOUR_MS = 60 * 60 * 1000;

const realFetch = globalThis.fetch;

let calls = 0;

function answers(payload: unknown, status = 200) {
	calls = 0;
	globalThis.fetch = (async () => {
		calls += 1;
		return new Response(JSON.stringify(payload), {
			status,
			headers: { "content-type": "application/json" },
		});
	}) as typeof fetch;
}

function rejects(name: string) {
	calls = 0;
	globalThis.fetch = (async () => {
		calls += 1;
		throw Object.assign(new Error("no answer"), { name });
	}) as typeof fetch;
}

function refuses() {
	calls = 0;
	globalThis.fetch = (async () => {
		calls += 1;
		throw new Error("fetch must not run");
	}) as typeof fetch;
}

async function scene(
	overrides: {
		accessToken?: string | null;
		tokenRefreshedAt?: Date | null;
		tokenError?: string | null;
		disconnectedAt?: Date | null;
		lastInboundAt?: Date | null;
		status?: "QUEUED" | "SENDING" | "SENT" | "FAILED";
	} = {},
) {
	const account = await db.messagingAccount.create({
		data: {
			channel: "ZALO",
			externalId: oaId,
			label: "Send OA",
			accessToken:
				overrides.accessToken === undefined
					? "access-1"
					: overrides.accessToken,
			tokenRefreshedAt: overrides.tokenRefreshedAt ?? null,
			tokenError: overrides.tokenError ?? null,
			disconnectedAt: overrides.disconnectedAt ?? null,
			connectedById: userId,
		},
		select: { id: true },
	});

	const identity = await db.contactChannelIdentity.create({
		data: {
			channel: "ZALO",
			accountId: account.id,
			externalId: personId,
		},
		select: { id: true },
	});

	const lastInboundAt =
		overrides.lastInboundAt === undefined
			? new Date(Date.now() - HOUR_MS)
			: overrides.lastInboundAt;

	const thread = await db.messageThread.create({
		data: {
			accountId: account.id,
			identityId: identity.id,
			firstMessageAt: lastInboundAt ?? new Date(),
			lastMessageAt: lastInboundAt ?? new Date(),
			lastInboundAt,
			messageCount: 1,
		},
		select: { id: true },
	});

	const message = await db.message.create({
		data: {
			threadId: thread.id,
			direction: "OUTBOUND",
			status: overrides.status ?? "QUEUED",
			kind: "TEXT",
			body: "Chao anh",
			clientRequestId: `req-${suffix}`,
			sentById: userId,
			queuedAt: new Date(),
		},
		select: { id: true },
	});

	return { accountId: account.id, threadId: thread.id, messageId: message.id };
}

async function book(messageId: string) {
	return db.agentTask.create({
		data: {
			kind: KIND,
			reason: "A rep replied on Zalo.",
			priority: PRIORITY.messageSend,
			budget: 0,
			dueAt: new Date(Date.now() - 1000),
			payload: { messageId, clientRequestId: `req-${suffix}` },
		},
		select: { id: true },
	});
}

async function lease(taskId: string): Promise<LeasedTask> {
	const claimed = await claimDue(20, { only: [KIND] });
	const task = claimed.find((row) => row.id === taskId);
	if (!task) throw new Error("the task was not claimed");

	return task;
}

async function messageRow(messageId: string) {
	return db.message.findUniqueOrThrow({
		where: { id: messageId },
		select: {
			status: true,
			externalId: true,
			sentAt: true,
			deliveredAt: true,
			readAt: true,
			failedAt: true,
			errorCode: true,
			errorMessage: true,
		},
	});
}

async function clear() {
	await db.agentTask.deleteMany({
		where: { kind: { in: [KIND, REFRESH_KIND] } },
	});
	await db.messagingAccount.deleteMany({ where: { externalId: oaId } });
}

beforeAll(async () => {
	process.env.ZALO_APP_ID = "app-id";
	process.env.ZALO_APP_SECRET = "app-secret";
	await db.user.upsert({
		where: { id: userId },
		create: { id: userId, name: "Send Spec", email: `${userId}@example.test` },
		update: {},
	});
});

beforeEach(clear);

afterEach(async () => {
	globalThis.fetch = realFetch;
	await clear();
});

afterAll(async () => {
	await db.user.deleteMany({ where: { id: userId } });
});

describe("a send that lands", () => {
	it("writes the vendor id and both outbound stamps", async () => {
		const seeded = await scene();
		const task = await lease((await book(seeded.messageId)).id);
		answers({ error: 0, message: "Success", data: { message_id: "zmsg-1" } });

		const outcome = await runMessageSend(task);
		const row = await messageRow(seeded.messageId);
		const thread = await db.messageThread.findUniqueOrThrow({
			where: { id: seeded.threadId },
			select: { lastOutboundAt: true },
		});
		const account = await db.messagingAccount.findUniqueOrThrow({
			where: { id: seeded.accountId },
			select: { lastOutboundAt: true },
		});

		expect(outcome).toBe("Sent.");
		expect(calls).toBe(1);
		expect(row.status).toBe("SENT");
		expect(row.externalId).toBe("zmsg-1");
		expect(row.sentAt).not.toBeNull();
		expect(thread.lastOutboundAt).not.toBeNull();
		expect(account.lastOutboundAt).not.toBeNull();
	});

	it("applies a receipt that arrived first and deletes it", async () => {
		const seeded = await scene();
		const seenAt = new Date();
		await db.messageReceipt.create({
			data: {
				accountId: seeded.accountId,
				externalId: "zmsg-2",
				kind: "seen",
				at: seenAt,
			},
		});
		const task = await lease((await book(seeded.messageId)).id);
		answers({ error: 0, data: { message_id: "zmsg-2" } });

		await runMessageSend(task);
		const row = await messageRow(seeded.messageId);

		expect(row.status).toBe("READ");
		expect(row.readAt?.getTime()).toBe(seenAt.getTime());
		expect(
			await db.messageReceipt.count({ where: { accountId: seeded.accountId } }),
		).toBe(0);
	});

	it("deletes a receipt older than the stale window", async () => {
		const seeded = await scene();
		await db.messageReceipt.create({
			data: {
				accountId: seeded.accountId,
				externalId: "zmsg-old",
				kind: "delivered",
				at: new Date(Date.now() - MESSAGING.receipts.staleAfterMs - HOUR_MS),
			},
		});
		const task = await lease((await book(seeded.messageId)).id);
		answers({ error: 0, data: { message_id: "zmsg-3" } });

		await runMessageSend(task);

		expect(
			await db.messageReceipt.count({ where: { accountId: seeded.accountId } }),
		).toBe(0);
	});

	it("calls Zalo once across two runs of one row", async () => {
		const seeded = await scene();
		const booked = await book(seeded.messageId);
		const first = await lease(booked.id);
		answers({ error: 0, data: { message_id: "zmsg-4" } });

		const firstOutcome = await runMessageSend(first);
		const secondOutcome = await runMessageSend(first);

		expect(firstOutcome).toBe("Sent.");
		expect(secondOutcome).toBe("Already claimed.");
		expect(calls).toBe(1);
		expect((await messageRow(seeded.messageId)).status).toBe("SENT");
	});

	it("completes the leased row through the direct lane", async () => {
		const seeded = await scene();
		const task = await lease((await book(seeded.messageId)).id);
		answers({ error: 0, data: { message_id: "zmsg-5" } });

		await runDirect(task);

		const row = await db.agentTask.findUniqueOrThrow({
			where: { id: task.id },
			select: { finishedAt: true, outcome: true },
		});

		expect(row.finishedAt).not.toBeNull();
		expect(row.outcome).toBe("Sent.");
		expect((await messageRow(seeded.messageId)).status).toBe("SENT");
	});
});

describe("a send that never runs", () => {
	it("never re-sends a row another lease left in SENDING", async () => {
		const seeded = await scene({ status: "SENDING" });
		const task = await lease((await book(seeded.messageId)).id);
		refuses();

		const outcome = await runMessageSend(task);

		expect(outcome).toBe("Already claimed.");
		expect(calls).toBe(0);
		expect((await messageRow(seeded.messageId)).status).toBe("SENDING");
	});

	it("settles a SENDING row that a dead run left behind", async () => {
		const seeded = await scene({ status: "SENDING" });
		const booked = await book(seeded.messageId);
		await lease(booked.id);
		await db.agentTask.updateMany({
			where: { id: booked.id },
			data: { leasedUntil: new Date(Date.now() - 1000) },
		});
		const task = await lease(booked.id);
		refuses();

		const outcome = await runMessageSend(task);
		const row = await messageRow(seeded.messageId);

		expect(task.attempts).toBe(2);
		expect(calls).toBe(0);
		expect(outcome).toBe(
			"The send was interrupted inside the CRM. Check the phone before you try again.",
		);
		expect(row.status).toBe("FAILED");
		expect(row.errorCode).toBe("interrupted");
		expect(row.errorMessage).toBe(outcome);
		expect(row.failedAt).not.toBeNull();
	});

	it("leaves a settled row alone", async () => {
		const seeded = await scene({ status: "FAILED" });
		const task = await lease((await book(seeded.messageId)).id);
		refuses();

		expect(await runMessageSend(task)).toBe("Already claimed.");
		expect(calls).toBe(0);
	});

	it("completes when the message is gone", async () => {
		const seeded = await scene();
		const booked = await book(seeded.messageId);
		const task = await lease(booked.id);
		await db.message.delete({ where: { id: seeded.messageId } });
		refuses();

		expect(await runMessageSend(task)).toBe("The message this names is gone.");
		expect(calls).toBe(0);
	});

	it("never calls Zalo once the window closed", async () => {
		const seeded = await scene({
			lastInboundAt: new Date(Date.now() - 49 * HOUR_MS),
		});
		const task = await lease((await book(seeded.messageId)).id);
		refuses();

		const outcome = await runMessageSend(task);
		const row = await messageRow(seeded.messageId);

		expect(calls).toBe(0);
		expect(outcome).toContain("The reply window closed at");
		expect(row.status).toBe("FAILED");
		expect(row.errorCode).toBe("ineligible");
		expect(row.errorMessage).toBe(outcome);
	});

	it("never calls Zalo for a disconnected Official Account", async () => {
		const seeded = await scene({ disconnectedAt: new Date() });
		const task = await lease((await book(seeded.messageId)).id);
		refuses();

		const outcome = await runMessageSend(task);

		expect(calls).toBe(0);
		expect(outcome).toBe("Zalo is disconnected.");
		expect((await messageRow(seeded.messageId)).status).toBe("FAILED");
	});
});

describe("a send Zalo refuses", () => {
	it("writes a fixed sentence and never the vendor text", async () => {
		const seeded = await scene();
		const task = await lease((await book(seeded.messageId)).id);
		answers({ error: -32, message: "Rate limit exceeded for this OA" });

		const outcome = await runMessageSend(task);
		const row = await messageRow(seeded.messageId);

		expect(outcome).toBe("Zalo is rate limiting this OA.");
		expect(row.status).toBe("FAILED");
		expect(row.errorCode).toBe("-32");
		expect(row.errorMessage).toBe("Zalo is rate limiting this OA.");
		expect(row.errorMessage).not.toContain("Rate limit");
		expect(row.failedAt).not.toBeNull();
	});

	it("fails without a retry when Zalo does not answer", async () => {
		const seeded = await scene();
		const task = await lease((await book(seeded.messageId)).id);
		rejects("TimeoutError");

		const outcome = await runMessageSend(task);
		const row = await messageRow(seeded.messageId);

		expect(outcome).toBe("Zalo did not answer.");
		expect(calls).toBe(1);
		expect(row.status).toBe("FAILED");
		expect(row.errorCode).toBe("network");
	});

	it("retries once when a refresh lands during the send", async () => {
		const seeded = await scene({
			tokenRefreshedAt: new Date(Date.now() - HOUR_MS),
		});
		const task = await lease((await book(seeded.messageId)).id);
		const seenTokens: string[] = [];

		calls = 0;
		globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
			calls += 1;
			const headers = (init?.headers ?? {}) as Record<string, string>;
			seenTokens.push(headers.access_token ?? "");

			if (calls === 1) {
				await db.messagingAccount.update({
					where: { id: seeded.accountId },
					data: { accessToken: "access-2", tokenRefreshedAt: new Date() },
				});

				return new Response(
					JSON.stringify({ error: -216, message: "Access token is invalid" }),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			}

			return new Response(
				JSON.stringify({ error: 0, data: { message_id: "zmsg-6" } }),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		}) as typeof fetch;

		const outcome = await runMessageSend(task);
		const account = await db.messagingAccount.findUniqueOrThrow({
			where: { id: seeded.accountId },
			select: { tokenError: true },
		});

		expect(outcome).toBe("Sent.");
		expect(calls).toBe(2);
		expect(seenTokens).toEqual(["access-1", "access-2"]);
		expect((await messageRow(seeded.messageId)).externalId).toBe("zmsg-6");
		expect(account.tokenError).toBeNull();
	});

	it("marks the token and books a refresh due now when it stays refused", async () => {
		const seeded = await scene();
		const task = await lease((await book(seeded.messageId)).id);
		answers({ error: -216, message: "Access token is invalid" });

		const outcome = await runMessageSend(task);
		const account = await db.messagingAccount.findUniqueOrThrow({
			where: { id: seeded.accountId },
			select: { tokenError: true },
		});
		const refresh = await db.agentTask.findMany({
			where: {
				kind: REFRESH_KIND,
				finishedAt: null,
				payload: { path: ["accountId"], equals: seeded.accountId },
			},
			select: { dueAt: true },
		});

		expect(outcome).toBe("The Zalo token needs a reconnect.");
		expect(calls).toBe(1);
		expect(account.tokenError).toBe("The Zalo token needs a reconnect.");
		expect(refresh).toHaveLength(1);
		expect(
			Math.abs((refresh[0]?.dueAt.getTime() ?? 0) - Date.now()),
		).toBeLessThan(5_000);
		expect((await messageRow(seeded.messageId)).errorCode).toBe("-216");
	});

	it("asks for a reconnect when the account holds no access token", async () => {
		const seeded = await scene({ accessToken: null });
		const task = await lease((await book(seeded.messageId)).id);
		refuses();

		const outcome = await runMessageSend(task);
		const account = await db.messagingAccount.findUniqueOrThrow({
			where: { id: seeded.accountId },
			select: { tokenError: true },
		});

		expect(calls).toBe(0);
		expect(outcome).toBe("The Zalo token needs a reconnect.");
		expect(account.tokenError).toBe("The Zalo token needs a reconnect.");
		expect((await messageRow(seeded.messageId)).status).toBe("FAILED");
	});
});

describe("a handler that breaks", () => {
	it("keeps a delivered message SENT when the settle write fails", async () => {
		const seeded = await scene();
		await db.message.create({
			data: {
				threadId: seeded.threadId,
				direction: "OUTBOUND",
				status: "SENT",
				kind: "TEXT",
				body: "Earlier",
				externalId: "zmsg-taken",
				queuedAt: new Date(Date.now() - HOUR_MS),
				sentAt: new Date(Date.now() - HOUR_MS),
			},
		});
		const task = await lease((await book(seeded.messageId)).id);
		answers({ error: 0, data: { message_id: "zmsg-taken" } });

		await runDirect(task);
		const row = await messageRow(seeded.messageId);
		const settled = await db.agentTask.findUniqueOrThrow({
			where: { id: task.id },
			select: { outcome: true, finishedAt: true },
		});

		expect(settled.outcome).toBe(
			"Sent; receipt matching is off for this message.",
		);
		expect(settled.finishedAt).not.toBeNull();
		expect(calls).toBe(1);
		expect(row.status).toBe("SENT");
		expect(row.externalId).toBeNull();
		expect(row.sentAt).not.toBeNull();
		expect(row.errorCode).toBeNull();
		expect(task.contactId).toBeNull();
		expect(task.companyId).toBeNull();
	});

	it("completes a task whose payload names nothing", async () => {
		const booked = await db.agentTask.create({
			data: {
				kind: KIND,
				reason: "A rep replied on Zalo.",
				priority: PRIORITY.messageSend,
				budget: 0,
				dueAt: new Date(Date.now() - 1000),
				payload: { clientRequestId: `req-${suffix}` },
			},
			select: { id: true },
		});
		const task = await lease(booked.id);
		refuses();

		const outcome = await runMessageSend(task);
		await completeTask(task.id, outcome);

		expect(outcome).toBe("This task names no message and cannot be sent.");
		expect(calls).toBe(0);
	});
});
