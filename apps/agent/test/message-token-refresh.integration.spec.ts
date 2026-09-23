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
import { runMessageTokenRefresh } from "../agent/lib/messaging/message-token-refresh";
import { MESSAGING } from "../agent/lib/messaging/messaging-config";
import { claimDue, completeTask, type LeasedTask } from "../agent/lib/tasks";

const suffix = process.env.TEST_RUN_ID ?? "token-refresh-spec";
const userId = `zalo-refresh-user-${suffix}`;
const KIND = "message-token-refresh";
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

async function account(
	label: string,
	overrides: {
		tokenExpiresAt?: Date | null;
		tokenError?: string | null;
		disconnectedAt?: Date | null;
		refreshToken?: string | null;
	} = {},
) {
	return db.messagingAccount.create({
		data: {
			channel: "ZALO",
			externalId: `oa-${suffix}-${label}`,
			label: `OA ${label}`,
			accessToken: "access-old",
			refreshToken:
				overrides.refreshToken === undefined
					? "refresh-old"
					: overrides.refreshToken,
			tokenExpiresAt:
				overrides.tokenExpiresAt === undefined
					? new Date(Date.now() + 25 * HOUR_MS)
					: overrides.tokenExpiresAt,
			tokenError: overrides.tokenError ?? null,
			disconnectedAt: overrides.disconnectedAt ?? null,
			connectedById: userId,
		},
		select: { id: true, externalId: true },
	});
}

async function book(
	accountId: string,
	attempt = 0,
	dueAt = new Date(Date.now() - 1000),
) {
	return db.agentTask.create({
		data: {
			kind: KIND,
			reason: "Keep the Zalo token fresh.",
			priority: PRIORITY.messageToken,
			budget: 1,
			dueAt,
			payload: { accountId, attempt },
		},
		select: { id: true },
	});
}

function attemptOf(payload: unknown): number {
	const value = (payload as { attempt?: unknown } | null)?.attempt;
	return typeof value === "number" ? value : -1;
}

async function makeDue(taskId: string) {
	await db.agentTask.update({
		where: { id: taskId },
		data: { dueAt: new Date(Date.now() - 1000) },
	});
}

async function lease(taskId: string): Promise<LeasedTask> {
	const claimed = await claimDue(20, { only: [KIND] });
	const task = claimed.find((row) => row.id === taskId);
	if (!task) throw new Error("the task was not claimed");

	return task;
}

async function openRows(accountId: string) {
	return db.agentTask.findMany({
		where: {
			kind: KIND,
			finishedAt: null,
			payload: { path: ["accountId"], equals: accountId },
		},
		select: { id: true, dueAt: true, payload: true },
	});
}

async function clear() {
	await db.agentTask.deleteMany({ where: { kind: KIND } });
	await db.messagingAccount.deleteMany({
		where: { externalId: { startsWith: `oa-${suffix}-` } },
	});
}

beforeAll(async () => {
	process.env.ZALO_APP_ID = "app-id";
	process.env.ZALO_APP_SECRET = "app-secret";
	await db.user.upsert({
		where: { id: userId },
		create: {
			id: userId,
			name: "Refresh Spec",
			email: `${userId}@example.test`,
		},
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

describe("a refresh that is not due", () => {
	it("rebooks at the moment the token needs refreshing", async () => {
		const oa = await account("a", {
			tokenExpiresAt: new Date(Date.now() + 40 * HOUR_MS),
		});
		const booked = await book(oa.id);
		const task = await lease(booked.id);

		const outcome = await runMessageTokenRefresh(task);
		await completeTask(task.id, outcome);

		const open = await openRows(oa.id);
		const wanted = Date.now() + 40 * HOUR_MS - MESSAGING.zalo.refreshAheadMs;

		expect(outcome).toBe("Not due.");
		expect(open).toHaveLength(1);
		expect(open[0]?.id).not.toBe(task.id);
		expect(Math.abs((open[0]?.dueAt.getTime() ?? 0) - wanted)).toBeLessThan(
			5_000,
		);
		expect(attemptOf(open[0]?.payload)).toBe(0);
	});

	it("completes the leased row through the direct lane", async () => {
		const oa = await account("a", {
			tokenExpiresAt: new Date(Date.now() + 40 * HOUR_MS),
		});
		const task = await lease((await book(oa.id)).id);

		await runDirect(task);

		const row = await db.agentTask.findUnique({
			where: { id: task.id },
			select: { finishedAt: true, outcome: true },
		});
		const open = await openRows(oa.id);

		expect(row?.finishedAt).not.toBeNull();
		expect(row?.outcome).toBe("Not due.");
		expect(open).toHaveLength(1);
		expect(open[0]?.id).not.toBe(task.id);
	});

	it("leaves exactly one open row per account", async () => {
		const first = await account("a", {
			tokenExpiresAt: new Date(Date.now() + 40 * HOUR_MS),
		});
		const second = await account("b", {
			tokenExpiresAt: new Date(Date.now() + 40 * HOUR_MS),
		});
		const firstTask = await lease((await book(first.id)).id);
		const secondTask = await lease((await book(second.id)).id);

		await completeTask(firstTask.id, await runMessageTokenRefresh(firstTask));
		await completeTask(secondTask.id, await runMessageTokenRefresh(secondTask));

		expect(await openRows(first.id)).toHaveLength(1);
		expect(await openRows(second.id)).toHaveLength(1);
		expect(await db.agentTask.count({ where: { kind: KIND } })).toBe(4);
	});
});

describe("a refresh that is due", () => {
	it("writes both tokens, clears the error and rebooks", async () => {
		const oa = await account("a", {
			tokenExpiresAt: new Date(Date.now() + HOUR_MS),
			tokenError: "The Zalo token needs a reconnect.",
		});
		const task = await lease((await book(oa.id)).id);
		answers({
			access_token: "access-new",
			refresh_token: "refresh-new",
			expires_in: "90000",
		});

		const outcome = await runMessageTokenRefresh(task);
		await completeTask(task.id, outcome);

		const row = await db.messagingAccount.findUnique({
			where: { id: oa.id },
			select: {
				accessToken: true,
				refreshToken: true,
				tokenError: true,
				tokenRefreshedAt: true,
				tokenExpiresAt: true,
			},
		});

		expect(outcome).toBe("Token refreshed.");
		expect(row?.accessToken).toBe("access-new");
		expect(row?.refreshToken).toBe("refresh-new");
		expect(row?.tokenError).toBeNull();
		expect(row?.tokenRefreshedAt).not.toBeNull();
		expect(row?.tokenExpiresAt?.getTime()).toBeGreaterThan(Date.now());
		expect(await openRows(oa.id)).toHaveLength(1);
	});

	it("resets the attempt count and clears the error on success", async () => {
		const oa = await account("a", {
			tokenExpiresAt: new Date(Date.now() + HOUR_MS),
			tokenError: "Zalo did not answer.",
		});
		const task = await lease((await book(oa.id, 2)).id);
		answers({
			access_token: "access-new",
			refresh_token: "refresh-new",
			expires_in: 90000,
		});

		const outcome = await runMessageTokenRefresh(task);
		await completeTask(task.id, outcome);

		const row = await db.messagingAccount.findUnique({
			where: { id: oa.id },
			select: { tokenError: true },
		});
		const open = await openRows(oa.id);

		expect(outcome).toBe("Token refreshed.");
		expect(row?.tokenError).toBeNull();
		expect(open).toHaveLength(1);
		expect(attemptOf(open[0]?.payload)).toBe(0);
	});

	it("treats a set token error as due even with 40 hours left", async () => {
		const oa = await account("a", {
			tokenExpiresAt: new Date(Date.now() + 40 * HOUR_MS),
			tokenError: "The Zalo token needs a reconnect.",
		});
		const task = await lease((await book(oa.id)).id);
		answers({
			access_token: "access-new",
			refresh_token: "refresh-new",
			expires_in: 90000,
		});

		expect(await runMessageTokenRefresh(task)).toBe("Token refreshed.");
		expect(calls).toBe(1);
	});
});

describe("a refresh that fails", () => {
	it("writes a fixed sentence and books nothing on a terminal failure", async () => {
		const oa = await account("a", {
			tokenExpiresAt: new Date(Date.now() + HOUR_MS),
		});
		const task = await lease((await book(oa.id)).id);
		answers({ error: -216, message: "Access token is invalid" });

		const outcome = await runMessageTokenRefresh(task);
		await completeTask(task.id, outcome);

		const row = await db.messagingAccount.findUnique({
			where: { id: oa.id },
			select: { tokenError: true, accessToken: true },
		});

		expect(outcome).toBe("The Zalo token needs a reconnect.");
		expect(row?.tokenError).toBe("The Zalo token needs a reconnect.");
		expect(row?.tokenError).not.toContain("Access token is invalid");
		expect(row?.accessToken).toBe("access-old");
		expect(await openRows(oa.id)).toHaveLength(0);
	});

	it("writes no token error and rebooks with backoff on a transient failure", async () => {
		const oa = await account("a", {
			tokenExpiresAt: new Date(Date.now() + HOUR_MS),
		});
		const task = await lease((await book(oa.id)).id);
		rejects("TimeoutError");

		const outcome = await runMessageTokenRefresh(task);
		await completeTask(task.id, outcome);

		const row = await db.messagingAccount.findUnique({
			where: { id: oa.id },
			select: { tokenError: true },
		});
		const open = await openRows(oa.id);
		const firstStep = MESSAGING.zalo.transientRetryMs[0] ?? 0;

		expect(outcome).toBe("Refresh retried later.");
		expect(row?.tokenError).toBeNull();
		expect(open).toHaveLength(1);
		expect(open[0]?.dueAt.getTime()).toBeGreaterThan(
			Date.now() + firstStep - 5_000,
		);
	});

	it("escalates the backoff across three transient failures", async () => {
		const oa = await account("a", {
			tokenExpiresAt: new Date(Date.now() + HOUR_MS),
		});
		let taskId = (await book(oa.id)).id;

		for (const [index, step] of MESSAGING.zalo.transientRetryMs.entries()) {
			const task = await lease(taskId);
			rejects("TimeoutError");

			const outcome = await runMessageTokenRefresh(task);
			await completeTask(task.id, outcome);

			const open = await openRows(oa.id);
			expect(outcome).toBe("Refresh retried later.");
			expect(open).toHaveLength(1);
			expect(attemptOf(open[0]?.payload)).toBe(index + 1);
			expect(
				Math.abs((open[0]?.dueAt.getTime() ?? 0) - (Date.now() + step)),
			).toBeLessThan(10_000);

			taskId = open[0]?.id ?? "";
			await makeDue(taskId);
		}
	});

	it("holds the last step once the table runs out", async () => {
		const oa = await account("a", {
			tokenExpiresAt: new Date(Date.now() + HOUR_MS),
		});
		const steps = MESSAGING.zalo.transientRetryMs;
		const last = steps[steps.length - 1] ?? 0;
		const task = await lease((await book(oa.id, steps.length + 4)).id);
		rejects("TimeoutError");

		await completeTask(task.id, await runMessageTokenRefresh(task));

		const open = await openRows(oa.id);
		expect(open).toHaveLength(1);
		expect(attemptOf(open[0]?.payload)).toBe(steps.length + 5);
		expect(
			Math.abs((open[0]?.dueAt.getTime() ?? 0) - (Date.now() + last)),
		).toBeLessThan(10_000);
	});

	it("names the silence on the account once the token has expired", async () => {
		const oa = await account("a", {
			tokenExpiresAt: new Date(Date.now() - HOUR_MS),
		});
		const task = await lease((await book(oa.id)).id);
		rejects("TimeoutError");

		const outcome = await runMessageTokenRefresh(task);
		await completeTask(task.id, outcome);

		const row = await db.messagingAccount.findUnique({
			where: { id: oa.id },
			select: { tokenError: true },
		});

		expect(outcome).toBe("Refresh retried later.");
		expect(row?.tokenError).toBe("Zalo did not answer.");
		expect(await openRows(oa.id)).toHaveLength(1);
	});

	it("treats the rate limit code as transient", async () => {
		const oa = await account("a", {
			tokenExpiresAt: new Date(Date.now() + HOUR_MS),
		});
		const task = await lease((await book(oa.id)).id);
		answers({ error: -32, message: "Rate limit" });

		expect(await runMessageTokenRefresh(task)).toBe("Refresh retried later.");

		const row = await db.messagingAccount.findUnique({
			where: { id: oa.id },
			select: { tokenError: true },
		});
		expect(row?.tokenError).toBeNull();
	});
});

describe("a refresh against a connection that is gone", () => {
	it("books nothing for a disconnected account", async () => {
		const oa = await account("a", { disconnectedAt: new Date() });
		const task = await lease((await book(oa.id)).id);

		const outcome = await runMessageTokenRefresh(task);
		await completeTask(task.id, outcome);

		expect(outcome).toBe("Disconnected; nothing to refresh.");
		expect(await openRows(oa.id)).toHaveLength(0);
	});

	it("books nothing for an account that no longer exists", async () => {
		const booked = await book(`missing-${suffix}`);
		const task = await lease(booked.id);

		expect(await runMessageTokenRefresh(task)).toBe(
			"The account this names is gone.",
		);
	});

	it("leaves the tokens cleared when a disconnect lands mid-call", async () => {
		const oa = await account("a", {
			tokenExpiresAt: new Date(Date.now() + HOUR_MS),
		});
		const task = await lease((await book(oa.id)).id);

		calls = 0;
		globalThis.fetch = (async () => {
			calls += 1;
			await db.messagingAccount.update({
				where: { id: oa.id },
				data: {
					accessToken: null,
					refreshToken: null,
					disconnectedAt: new Date(),
				},
			});

			return new Response(
				JSON.stringify({
					access_token: "access-new",
					refresh_token: "refresh-new",
					expires_in: 90000,
				}),
				{ headers: { "content-type": "application/json" } },
			);
		}) as typeof fetch;

		const outcome = await runMessageTokenRefresh(task);
		await completeTask(task.id, outcome);

		const row = await db.messagingAccount.findUnique({
			where: { id: oa.id },
			select: { accessToken: true, refreshToken: true },
		});

		expect(outcome).toBe("Disconnected during refresh.");
		expect(row?.accessToken).toBeNull();
		expect(row?.refreshToken).toBeNull();
		expect(await openRows(oa.id)).toHaveLength(0);
	});

	it("refuses a task whose payload names no account", async () => {
		const booked = await db.agentTask.create({
			data: {
				kind: KIND,
				reason: "Keep the Zalo token fresh.",
				priority: PRIORITY.messageToken,
				budget: 1,
				dueAt: new Date(Date.now() - 1000),
				payload: { nothing: true },
			},
			select: { id: true },
		});
		const task = await lease(booked.id);

		expect(await runMessageTokenRefresh(task)).toBe(
			"This task names no account and cannot be run.",
		);
	});
});
