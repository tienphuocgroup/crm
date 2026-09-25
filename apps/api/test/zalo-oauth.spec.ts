import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { createHash } from "node:crypto";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth";
import { db } from "@crm/db";
import { workspaceSlug } from "@crm/db/workspace";
import { AgentAccessService } from "../src/agent/agent-access.service";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { MESSAGING_API } from "../src/messaging/messaging-config";
import { ZaloOauthController } from "../src/messaging/zalo/zalo-oauth.controller";
import { ZaloOauthService } from "../src/messaging/zalo/zalo-oauth.service";

const suffix = process.env.TEST_RUN_ID ?? "zalo-oauth-spec";
const ownerId = `zalo-oauth-owner-${suffix}`;
const otherOwnerId = `zalo-oauth-other-${suffix}`;
const memberId = `zalo-oauth-member-${suffix}`;
const returnTo = "/acme/settings/connections/zalo";

const service = new ZaloOauthService(
	db,
	new AgentAccessService(db),
	new AgentTriggerService(db),
);

const controller = new ZaloOauthController(service);

type ConnectArgs = Parameters<ZaloOauthController["connect"]>;

function asSession(userId: string): ConnectArgs[0] {
	return { user: { id: userId } } as unknown as ConnectArgs[0];
}

type ZaloQuery = {
	returnTo?: string | string[];
	code?: string | string[];
	oa_id?: string | string[];
	state?: string | string[];
};

function asRequest(query: ZaloQuery): ConnectArgs[1] {
	return { query } as unknown as ConnectArgs[1];
}

function recorder() {
	const targets: string[] = [];
	const response = {
		redirect: (target: string) => {
			targets.push(target);
		},
	} as unknown as ConnectArgs[2];

	return { targets, response };
}

const realFetch = globalThis.fetch;
const savedEnv: Record<string, string | undefined> = {};

let calls: string[] = [];

function zaloAnswers(oaId: string) {
	calls = [];
	globalThis.fetch = (async (input: Request | URL | string) => {
		const url = String(input instanceof Request ? input.url : input);
		calls.push(url);

		const payload = url.startsWith(MESSAGING_API.zalo.tokenUrl)
			? {
					access_token: `access-${oaId}`,
					refresh_token: `refresh-${oaId}`,
					expires_in: "90000",
				}
			: {
					error: 0,
					data: { oaid: oaId, name: `OA ${oaId}`, is_verified: true },
				};

		return new Response(JSON.stringify(payload), {
			headers: { "content-type": "application/json" },
		});
	}) as unknown as typeof fetch;
}

async function stateFor(userId: string, path = returnTo) {
	const { authorizeUrl } = await service.start({ userId, returnTo: path });
	const state = new URL(authorizeUrl).searchParams.get("state");
	if (!state) throw new Error("the authorize URL carries no state");

	return state;
}

async function clear() {
	await db.verification.deleteMany({
		where: { identifier: MESSAGING_API.oauth.identifier },
	});
	await db.agentTask.deleteMany({
		where: { kind: { in: ["message-token-refresh", "message-send"] } },
	});
	await db.messagingAccount.deleteMany({
		where: { externalId: { startsWith: `oa-${suffix}` } },
	});
}

beforeAll(async () => {
	for (const key of ["ZALO_APP_ID", "ZALO_APP_SECRET", "AGENT_URL"]) {
		savedEnv[key] = process.env[key];
	}
	delete process.env.AGENT_URL;

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
			{ id: ownerId, name: "Zalo Owner", email: `${ownerId}@example.test` },
			{
				id: otherOwnerId,
				name: "Zalo Other Owner",
				email: `${otherOwnerId}@example.test`,
			},
			{ id: memberId, name: "Zalo Member", email: `${memberId}@example.test` },
		],
		skipDuplicates: true,
	});
	await db.member.createMany({
		data: [
			{
				id: `mo-${suffix}`,
				organizationId: WORKSPACE_ID,
				userId: ownerId,
				role: "owner",
				createdAt: new Date(),
			},
			{
				id: `mo2-${suffix}`,
				organizationId: WORKSPACE_ID,
				userId: otherOwnerId,
				role: "admin",
				createdAt: new Date(),
			},
			{
				id: `mm-${suffix}`,
				organizationId: WORKSPACE_ID,
				userId: memberId,
				role: "member",
				createdAt: new Date(),
			},
		],
		skipDuplicates: true,
	});
});

beforeEach(async () => {
	await clear();
	process.env.ZALO_APP_ID = "app-id";
	process.env.ZALO_APP_SECRET = "app-secret";
	calls = [];
	globalThis.fetch = (async () => {
		throw new Error("no Zalo call was expected here");
	}) as unknown as typeof fetch;
});

afterEach(async () => {
	globalThis.fetch = realFetch;
	await clear();
});

afterAll(async () => {
	for (const [key, value] of Object.entries(savedEnv)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}

	await db.member.deleteMany({
		where: { id: { in: [`mo-${suffix}`, `mo2-${suffix}`, `mm-${suffix}`] } },
	});
	await db.user.deleteMany({
		where: { id: { in: [ownerId, otherOwnerId, memberId] } },
	});
});

describe("starting the connect", () => {
	it("stores the verifier, the user and the return path", async () => {
		const state = await stateFor(ownerId);

		const row = await db.verification.findUnique({ where: { id: state } });
		const value = JSON.parse(row?.value ?? "{}");

		expect(row?.identifier).toBe(MESSAGING_API.oauth.identifier);
		expect(value.userId).toBe(ownerId);
		expect(value.returnTo).toBe(returnTo);
		expect(value.verifier).toHaveLength(43);
	});

	it("sends the four authorize parameters and no method", async () => {
		const { authorizeUrl } = await service.start({
			userId: ownerId,
			returnTo,
		});
		const url = new URL(authorizeUrl);
		const state = url.searchParams.get("state") ?? "";
		const row = await db.verification.findUnique({ where: { id: state } });
		const verifier = JSON.parse(row?.value ?? "{}").verifier as string;
		const challenge = url.searchParams.get("code_challenge") ?? "";

		expect(url.origin + url.pathname).toBe(MESSAGING_API.zalo.authorizeUrl);
		expect(url.searchParams.get("app_id")).toBe("app-id");
		expect(state).toBeTruthy();
		expect(url.searchParams.get("redirect_uri")).toContain(
			MESSAGING_API.oauth.callbackPath,
		);
		expect(url.searchParams.get("code_challenge_method")).toBeNull();
		expect(challenge).toBe(
			createHash("sha256").update(verifier, "ascii").digest("base64url"),
		);
		expect(challenge).not.toContain("=");
	});

	it("never sends the app secret to the browser", async () => {
		const { authorizeUrl } = await service.start({ userId: ownerId });

		expect(authorizeUrl).not.toContain("app-secret");
	});

	it("refuses a returnTo that leaves this CRM", async () => {
		for (const bad of ["//evil.test/steal", "https://evil.test", "evil"]) {
			await expect(
				service.start({ userId: ownerId, returnTo: bad }),
			).rejects.toThrow(/path inside this CRM/);
		}

		expect(
			await db.verification.count({
				where: { identifier: MESSAGING_API.oauth.identifier },
			}),
		).toBe(0);
	});

	it("refuses a member without the connections role", async () => {
		await expect(service.start({ userId: memberId })).rejects.toThrow(
			/owner or an admin/,
		);
	});

	it("refuses when the env pair is missing", async () => {
		delete process.env.ZALO_APP_ID;

		await expect(service.start({ userId: ownerId })).rejects.toThrow(
			/no Zalo app configured/,
		);
	});
});

describe("completing the callback", () => {
	it("writes the account, both tokens and one refresh task", async () => {
		const state = await stateFor(ownerId);
		zaloAnswers(`oa-${suffix}-1`);

		const target = await service.complete({
			userId: ownerId,
			code: "code-1",
			state,
		});

		const account = await db.messagingAccount.findFirst({
			where: { externalId: `oa-${suffix}-1` },
			select: {
				id: true,
				accessToken: true,
				refreshToken: true,
				tokenExpiresAt: true,
				tokenError: true,
				verified: true,
				connectedById: true,
				disconnectedAt: true,
			},
		});
		const tasks = await db.agentTask.findMany({
			where: { kind: "message-token-refresh", finishedAt: null },
			select: { payload: true },
		});

		expect(account?.accessToken).toBe(`access-oa-${suffix}-1`);
		expect(account?.refreshToken).toBe(`refresh-oa-${suffix}-1`);
		expect(account?.tokenExpiresAt).not.toBeNull();
		expect(account?.tokenError).toBeNull();
		expect(account?.verified).toBe(true);
		expect(account?.connectedById).toBe(ownerId);
		expect(account?.disconnectedAt).toBeNull();
		expect(tasks).toHaveLength(1);
		const booked = tasks[0]?.payload as { accountId: string } | undefined;
		expect(booked?.accountId).toBe(account?.id ?? "");
		expect(target).toContain("provider=zalo");
		expect(target).toContain("connected=1");
		expect(target).toContain(returnTo);
	});

	it("deletes the verifier row so a replay cannot reuse it", async () => {
		const state = await stateFor(ownerId);
		zaloAnswers(`oa-${suffix}-1`);
		await service.complete({ userId: ownerId, code: "code-1", state });

		expect(
			await db.verification.findUnique({ where: { id: state } }),
		).toBeNull();

		const replay = await service.complete({
			userId: ownerId,
			code: "code-1",
			state,
		});
		expect(replay).toContain("error=state");
	});

	it("refuses an expired state before any Zalo call", async () => {
		const state = await stateFor(ownerId);
		await db.verification.update({
			where: { id: state },
			data: { expiresAt: new Date(Date.now() - 1000) },
		});

		const target = await service.complete({
			userId: ownerId,
			code: "code-1",
			state,
		});

		expect(target).toContain("provider=zalo");
		expect(target).toContain("error=state");
		expect(calls).toHaveLength(0);
	});

	it("refuses a callback from a different session before any Zalo call", async () => {
		const state = await stateFor(ownerId);

		const target = await service.complete({
			userId: otherOwnerId,
			code: "code-1",
			state,
		});

		expect(target).toContain("error=state");
		expect(calls).toHaveLength(0);
		expect(
			await db.messagingAccount.count({
				where: { externalId: { startsWith: `oa-${suffix}` } },
			}),
		).toBe(0);
	});

	it("refuses a member without the connections role before any Zalo call", async () => {
		const state = await stateFor(ownerId);

		await expect(
			service.complete({ userId: memberId, code: "code-1", state }),
		).rejects.toThrow(/owner or an admin/);
		expect(calls).toHaveLength(0);
	});

	it("takes the newest row of this session when Zalo sends no state", async () => {
		await stateFor(otherOwnerId, "/other/settings/connections/zalo");
		await stateFor(ownerId);
		zaloAnswers(`oa-${suffix}-1`);

		const target = await service.complete({ userId: ownerId, code: "code-1" });

		expect(target).toContain("connected=1");
		expect(target).toContain(returnTo);
		expect(
			await db.verification.count({
				where: { identifier: MESSAGING_API.oauth.identifier },
			}),
		).toBe(1);
	});

	it("carries provider=zalo on every redirect", async () => {
		const expired = await stateFor(ownerId);
		await db.verification.update({
			where: { id: expired },
			data: { expiresAt: new Date(Date.now() - 1000) },
		});
		const refusedState = await service.complete({
			userId: ownerId,
			code: "code-1",
			state: expired,
		});

		const live = await stateFor(ownerId);
		const refusedCode = await service.complete({
			userId: ownerId,
			state: live,
		});

		const last = await stateFor(ownerId);
		zaloAnswers(`oa-${suffix}-1`);
		const connected = await service.complete({
			userId: ownerId,
			code: "code-1",
			state: last,
		});

		for (const target of [refusedState, refusedCode, connected]) {
			expect(target).toContain("provider=zalo");
		}
	});
});

describe("connecting a second OA", () => {
	it("disconnects the first and completes its open tasks", async () => {
		const first = await stateFor(ownerId);
		zaloAnswers(`oa-${suffix}-1`);
		await service.complete({ userId: ownerId, code: "code-1", state: first });

		const second = await stateFor(ownerId);
		zaloAnswers(`oa-${suffix}-2`);
		await service.complete({ userId: ownerId, code: "code-2", state: second });

		const older = await db.messagingAccount.findFirst({
			where: { externalId: `oa-${suffix}-1` },
			select: {
				id: true,
				accessToken: true,
				refreshToken: true,
				disconnectedAt: true,
			},
		});
		const newer = await db.messagingAccount.findFirst({
			where: { externalId: `oa-${suffix}-2` },
			select: { id: true, disconnectedAt: true },
		});
		const open = await db.agentTask.findMany({
			where: { kind: "message-token-refresh", finishedAt: null },
			select: { payload: true },
		});
		const replaced = await db.agentTask.findMany({
			where: { kind: "message-token-refresh", finishedAt: { not: null } },
			select: { outcome: true },
		});

		expect(older?.accessToken).toBeNull();
		expect(older?.refreshToken).toBeNull();
		expect(older?.disconnectedAt).not.toBeNull();
		expect(newer?.disconnectedAt).toBeNull();
		expect(open).toHaveLength(1);
		const booked = open[0]?.payload as { accountId: string } | undefined;
		expect(booked?.accountId).toBe(newer?.id ?? "");
		expect(replaced).toHaveLength(1);
		expect(replaced.every((t) => t.outcome === "Replaced by another OA")).toBe(
			true,
		);
	});
});

describe("the query the controller receives", () => {
	it("refuses a repeated returnTo key", async () => {
		const { targets, response } = recorder();

		await expect(
			controller.connect(
				asSession(ownerId),
				asRequest({ returnTo: ["/acme/a", "/acme/b"] }),
				response,
			),
		).rejects.toThrow(/return path/);

		expect(targets).toHaveLength(0);
		expect(
			await db.verification.count({
				where: { identifier: MESSAGING_API.oauth.identifier },
			}),
		).toBe(0);
	});

	it("refuses a returnTo that carries a fragment", async () => {
		const { targets, response } = recorder();

		await expect(
			controller.connect(
				asSession(ownerId),
				asRequest({ returnTo: "/x#y" }),
				response,
			),
		).rejects.toThrow(/return path/);

		expect(targets).toHaveLength(0);
	});

	it("sends a repeated state key to the error redirect before any Zalo call", async () => {
		const { targets, response } = recorder();

		await controller.callback(
			asSession(ownerId),
			asRequest({ code: "code-1", state: ["a", "b"] }),
			response,
		);

		expect(targets).toHaveLength(1);
		expect(targets[0]).toContain("provider=zalo");
		expect(targets[0]).toContain("error=state");
		expect(targets[0]).toContain(MESSAGING_API.oauth.fallbackReturnTo);
		expect(calls).toHaveLength(0);
	});
});
