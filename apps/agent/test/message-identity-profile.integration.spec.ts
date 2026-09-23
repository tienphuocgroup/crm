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
import { runMessageIdentityProfile } from "../agent/lib/messaging/message-identity-profile";
import { claimDue, type LeasedTask } from "../agent/lib/tasks";

const suffix = process.env.TEST_RUN_ID ?? "message-profile-spec";
const userId = `zalo-profile-user-${suffix}`;
const oaId = `profile-oa-${suffix}`;
const personId = `profile-person-${suffix}`;
const KIND = "message-identity-profile";
const REFRESH_KIND = "message-token-refresh";

const realFetch = globalThis.fetch;

let calls = 0;
let seenUrls: string[] = [];

function answers(payload: unknown, status = 200) {
	calls = 0;
	seenUrls = [];
	globalThis.fetch = (async (input: URL | RequestInfo) => {
		calls += 1;
		seenUrls.push(String(input instanceof Request ? input.url : input));

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
	overrides: { accessToken?: string | null; disconnectedAt?: Date | null } = {},
) {
	const account = await db.messagingAccount.create({
		data: {
			channel: "ZALO",
			externalId: oaId,
			label: "Profile OA",
			accessToken:
				overrides.accessToken === undefined
					? "access-1"
					: overrides.accessToken,
			disconnectedAt: overrides.disconnectedAt ?? null,
			connectedById: userId,
		},
		select: { id: true },
	});

	const identity = await db.contactChannelIdentity.create({
		data: { channel: "ZALO", accountId: account.id, externalId: personId },
		select: { id: true },
	});

	return { accountId: account.id, identityId: identity.id };
}

async function book(identityId: string) {
	return db.agentTask.create({
		data: {
			kind: KIND,
			reason: "Read the Zalo profile of a person who wrote to the OA.",
			priority: PRIORITY.messageProfile,
			budget: 0,
			dueAt: new Date(Date.now() - 1000),
			payload: { identityId },
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

async function identityRow(identityId: string) {
	return db.contactChannelIdentity.findUniqueOrThrow({
		where: { id: identityId },
		select: {
			displayName: true,
			avatarUrl: true,
			profileCheckedAt: true,
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
		create: {
			id: userId,
			name: "Profile Spec",
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

describe("reading a Zalo profile", () => {
	it("writes the name and the avatar", async () => {
		const seeded = await scene();
		const task = await lease((await book(seeded.identityId)).id);
		answers({
			error: 0,
			message: "Success",
			data: {
				user_id: personId,
				display_name: "Nguyen Van A",
				avatar: "https://zdn.vn/a.jpg",
			},
		});

		const outcome = await runMessageIdentityProfile(task);
		const row = await identityRow(seeded.identityId);

		expect(outcome).toBe("Profile read.");
		expect(calls).toBe(1);
		expect(row.displayName).toBe("Nguyen Van A");
		expect(row.avatarUrl).toBe("https://zdn.vn/a.jpg");
		expect(row.profileCheckedAt).not.toBeNull();
		expect(seenUrls[0]).toContain(
			`data=${encodeURIComponent(JSON.stringify({ user_id: personId }))}`,
		);
	});

	it("writes nothing for a person who does not follow the OA", async () => {
		const seeded = await scene();
		const task = await lease((await book(seeded.identityId)).id);
		answers({ error: -213, message: "User has not followed OA" });

		const outcome = await runMessageIdentityProfile(task);
		const row = await identityRow(seeded.identityId);

		expect(outcome).toBe("Not a follower.");
		expect(row.displayName).toBeNull();
		expect(row.avatarUrl).toBeNull();
		expect(row.profileCheckedAt).not.toBeNull();
	});

	it("stamps the read when Zalo knows no name", async () => {
		const seeded = await scene();
		const task = await lease((await book(seeded.identityId)).id);
		answers({
			error: 0,
			data: { user_id: personId, display_name: "", avatar: "" },
		});

		const outcome = await runMessageIdentityProfile(task);
		const row = await identityRow(seeded.identityId);

		expect(outcome).toBe("Zalo knows no name for this person.");
		expect(row.displayName).toBeNull();
		expect(row.profileCheckedAt).not.toBeNull();
	});

	it("writes nothing when Zalo does not answer", async () => {
		const seeded = await scene();
		const task = await lease((await book(seeded.identityId)).id);
		rejects("TimeoutError");

		const outcome = await runMessageIdentityProfile(task);
		const row = await identityRow(seeded.identityId);

		expect(outcome).toBe("Zalo did not answer.");
		expect(row.displayName).toBeNull();
		expect(row.profileCheckedAt).toBeNull();
	});

	it("books a refresh due now when the token is refused", async () => {
		const seeded = await scene();
		const task = await lease((await book(seeded.identityId)).id);
		answers({ error: -216, message: "Access token is invalid" });

		const outcome = await runMessageIdentityProfile(task);
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

		const identity = await db.contactChannelIdentity.findUniqueOrThrow({
			where: { id: seeded.identityId },
			select: { profileCheckedAt: true },
		});

		expect(outcome).toBe("The Zalo token needs a reconnect.");
		expect(account.tokenError).toBe("The Zalo token needs a reconnect.");
		expect(identity.profileCheckedAt).toBeNull();
		expect(refresh).toHaveLength(1);
		expect(
			Math.abs((refresh[0]?.dueAt.getTime() ?? 0) - Date.now()),
		).toBeLessThan(5_000);
	});

	it("completes when the person is gone", async () => {
		const seeded = await scene();
		const booked = await book(seeded.identityId);
		const task = await lease(booked.id);
		await db.contactChannelIdentity.delete({
			where: { id: seeded.identityId },
		});
		refuses();

		expect(await runMessageIdentityProfile(task)).toBe(
			"The person this names is gone.",
		);
		expect(calls).toBe(0);
	});

	it("reads nothing from a disconnected Official Account", async () => {
		const seeded = await scene({ disconnectedAt: new Date() });
		const task = await lease((await book(seeded.identityId)).id);
		refuses();

		expect(await runMessageIdentityProfile(task)).toBe(
			"Disconnected; nothing to read.",
		);
		expect(calls).toBe(0);
	});

	it("reads nothing when the OA holds no access token", async () => {
		const seeded = await scene({ accessToken: null });
		const task = await lease((await book(seeded.identityId)).id);
		refuses();

		expect(await runMessageIdentityProfile(task)).toBe(
			"This OA has no access token.",
		);
		expect(calls).toBe(0);
	});

	it("completes the leased row through the direct lane", async () => {
		const seeded = await scene();
		const task = await lease((await book(seeded.identityId)).id);
		answers({
			error: 0,
			data: { user_id: personId, display_name: "Tran Thi B", avatar: "" },
		});

		await runDirect(task);

		const row = await db.agentTask.findUniqueOrThrow({
			where: { id: task.id },
			select: { finishedAt: true, outcome: true },
		});

		expect(row.finishedAt).not.toBeNull();
		expect(row.outcome).toBe("Profile read.");
		expect((await identityRow(seeded.identityId)).displayName).toBe(
			"Tran Thi B",
		);
		expect((await identityRow(seeded.identityId)).avatarUrl).toBeNull();
	});
});
