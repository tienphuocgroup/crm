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
import { ZaloConnectionService } from "../src/messaging/zalo/zalo-connection.service";

const suffix = process.env.TEST_RUN_ID ?? "zalo-connection-spec";
const ownerId = `zalo-owner-${suffix}`;
const memberId = `zalo-member-${suffix}`;
const externalId = `oa-${suffix}`;

const service = new ZaloConnectionService(db, new AgentAccessService(db));

const savedEnv: Record<string, string | undefined> = {};

function setCredentials(appId: string | null, appSecret: string | null) {
	if (appId === null) delete process.env.ZALO_APP_ID;
	else process.env.ZALO_APP_ID = appId;

	if (appSecret === null) delete process.env.ZALO_APP_SECRET;
	else process.env.ZALO_APP_SECRET = appSecret;
}

async function connectOa(tokenError: string | null = null) {
	return db.messagingAccount.create({
		data: {
			channel: "ZALO",
			externalId,
			label: "Spec OA",
			avatarUrl: "https://zdn.vn/avatar.png",
			verified: true,
			accessToken: "access-secret",
			refreshToken: "refresh-secret",
			tokenExpiresAt: new Date(Date.now() + 25 * 60 * 60 * 1000),
			tokenRefreshedAt: new Date(),
			tokenError,
			connectedById: ownerId,
		},
		select: { id: true },
	});
}

async function clear() {
	await db.agentTask.deleteMany({
		where: { kind: { in: ["message-token-refresh", "message-send"] } },
	});
	await db.messagingAccount.deleteMany({ where: { externalId } });
}

beforeAll(async () => {
	for (const key of ["ZALO_APP_ID", "ZALO_APP_SECRET"]) {
		savedEnv[key] = process.env[key];
	}

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
			{ id: memberId, name: "Zalo Member", email: `${memberId}@example.test` },
		],
		skipDuplicates: true,
	});
	await db.member.createMany({
		data: [
			{
				id: `m-owner-${suffix}`,
				organizationId: WORKSPACE_ID,
				userId: ownerId,
				role: "owner",
				createdAt: new Date(),
			},
			{
				id: `m-member-${suffix}`,
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
	setCredentials("app-id", "app-secret");
});

afterEach(clear);

afterAll(async () => {
	for (const [key, value] of Object.entries(savedEnv)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}

	await db.member.deleteMany({
		where: { id: { in: [`m-owner-${suffix}`, `m-member-${suffix}`] } },
	});
	await db.user.deleteMany({ where: { id: { in: [ownerId, memberId] } } });
});

describe("zalo.status", () => {
	it("never returns a token field", async () => {
		await connectOa();

		const status = await service.status(ownerId);
		const keys = Object.keys(status);

		expect(keys).not.toContain("accessToken");
		expect(keys).not.toContain("refreshToken");
		expect(JSON.stringify(status)).not.toContain("access-secret");
		expect(JSON.stringify(status)).not.toContain("refresh-secret");
	});

	it("reports the OA name, the verified badge and token health", async () => {
		await connectOa();

		const status = await service.status(ownerId);

		expect(status.connected).toBe(true);
		expect(status.oaName).toBe("Spec OA");
		expect(status.verified).toBe(true);
		expect(status.tokenRefreshedAt).not.toBeNull();
		expect(status.tokenError).toBeNull();
	});

	it("returns the stored fixed sentence as the token error", async () => {
		await connectOa("The Zalo token needs a reconnect.");

		const status = await service.status(ownerId);

		expect(status.tokenError).toBe("The Zalo token needs a reconnect.");
	});

	it("says configured false when the env pair is missing", async () => {
		setCredentials(null, null);

		expect((await service.status(ownerId)).configured).toBe(false);
	});

	it("says configured false when only one of the pair is set", async () => {
		setCredentials("app-id", null);

		expect((await service.status(ownerId)).configured).toBe(false);
	});

	it("disables the button for a member who cannot manage connections", async () => {
		await connectOa();

		expect((await service.status(ownerId)).canManage).toBe(true);
		expect((await service.status(memberId)).canManage).toBe(false);
	});

	it("counts the people no contact owns yet", async () => {
		const account = await connectOa();
		await db.contactChannelIdentity.create({
			data: {
				channel: "ZALO",
				accountId: account.id,
				externalId: `person-${suffix}`,
			},
		});

		expect((await service.status(ownerId)).unmatchedCount).toBe(1);
	});
});

describe("zalo.disconnect", () => {
	it("is refused for a member without the connections role", async () => {
		await connectOa();

		await expect(service.disconnect(memberId)).rejects.toThrow(
			/owner or an admin/,
		);

		const account = await db.messagingAccount.findFirst({
			where: { externalId },
			select: { accessToken: true, disconnectedAt: true },
		});
		expect(account?.accessToken).toBe("access-secret");
		expect(account?.disconnectedAt).toBeNull();
	});

	it("clears both tokens and keeps the row", async () => {
		await connectOa();

		await service.disconnect(ownerId);

		const account = await db.messagingAccount.findFirst({
			where: { externalId },
			select: {
				accessToken: true,
				refreshToken: true,
				tokenExpiresAt: true,
				disconnectedAt: true,
				label: true,
			},
		});

		expect(account?.accessToken).toBeNull();
		expect(account?.refreshToken).toBeNull();
		expect(account?.tokenExpiresAt).toBeNull();
		expect(account?.disconnectedAt).not.toBeNull();
		expect(account?.label).toBe("Spec OA");
	});

	it("completes the open refresh and send tasks", async () => {
		const account = await connectOa();
		await db.agentTask.createMany({
			data: [
				{
					kind: "message-token-refresh",
					reason: "Keep the Zalo token fresh.",
					priority: 940,
					budget: 1,
					dueAt: new Date(),
					payload: { accountId: account.id },
				},
				{
					kind: "message-send",
					reason: "Send one reply.",
					priority: 950,
					budget: 1,
					dueAt: new Date(),
					payload: { messageId: `message-${suffix}` },
				},
			],
		});

		await service.disconnect(ownerId);

		const open = await db.agentTask.count({
			where: {
				kind: { in: ["message-token-refresh", "message-send"] },
				finishedAt: null,
			},
		});
		const settled = await db.agentTask.findMany({
			where: { kind: { in: ["message-token-refresh", "message-send"] } },
			select: { outcome: true },
		});

		expect(open).toBe(0);
		expect(settled).toHaveLength(2);
		expect(settled.every((task) => task.outcome === "Disconnected")).toBe(true);
	});

	it("answers a second disconnect with ok and changes nothing", async () => {
		await connectOa();
		await service.disconnect(ownerId);

		expect(await service.disconnect(ownerId)).toEqual({ ok: true });
		expect(await service.disconnect(ownerId)).toEqual({ ok: true });
	});

	it("answers ok when no Official Account was ever connected", async () => {
		expect(await service.disconnect(ownerId)).toEqual({ ok: true });
	});
});
