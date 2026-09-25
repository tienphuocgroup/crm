import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth";
import { db } from "@crm/db";
import { workspaceSlug } from "@crm/db/workspace";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { MESSAGING_API } from "../src/messaging/messaging-config";
import { MessagingWriterService } from "../src/messaging/messaging-writer.service";
import { zaloSignature } from "../src/messaging/zalo/zalo-signature";

const suffix = process.env.TEST_RUN_ID ?? "zalo-webhook-spec";
const ownerId = `hook-owner-${suffix}`;
const oaId = `hook-oa-${suffix}`;
const personId = `hook-person-${suffix}`;

const appId = "hook-app-id";
const oaSecret = "hook-oa-secret";

const savedEnv: Record<string, string | undefined> = {};

let app: INestApplication;
let writer: MessagingWriterService;

function post(body: string, headers: Record<string, string> = {}) {
	const timestamp = JSON.parse(body).timestamp as string;
	const signature = zaloSignature({
		appId,
		rawBody: body,
		timestamp,
		secret: oaSecret,
	});

	return request(app.getHttpServer())
		.post(MESSAGING_API.webhook.path)
		.set("content-type", "application/json")
		.set(MESSAGING_API.webhook.signatureHeader, signature)
		.set(headers)
		.send(body);
}

function postSignedOver(body: string, signedBody: string) {
	const signature = zaloSignature({
		appId,
		rawBody: signedBody,
		timestamp: JSON.parse(signedBody).timestamp as string,
		secret: oaSecret,
	});

	return request(app.getHttpServer())
		.post(MESSAGING_API.webhook.path)
		.set("content-type", "application/json")
		.set(MESSAGING_API.webhook.signatureHeader, signature)
		.send(body);
}

function seenEvent(ids: string[]): string {
	return JSON.stringify({
		app_id: appId,
		event_name: "user_seen_message",
		sender: { id: oaId },
		recipient: { id: personId },
		message: { msg_ids: ids },
		timestamp: String(Date.now()),
	});
}

async function seedOutbound(externalId: string): Promise<string> {
	const thread = await db.messageThread.findFirstOrThrow({
		where: { identity: { externalId: personId } },
		select: { id: true },
	});

	const row = await db.message.create({
		data: {
			threadId: thread.id,
			direction: "OUTBOUND",
			status: "SENT",
			kind: "TEXT",
			body: "Chao ban",
			externalId,
			sentAt: new Date(),
		},
		select: { id: true },
	});

	return row.id;
}

type TextEventOverrides = {
	event_name?: string;
	timestamp?: string;
	sender?: { id: string };
	recipient?: { id: string };
};

type TextMessageOverrides = {
	msg_id?: string;
	text?: string;
	attachments?: { type: string; payload: { url: string } }[];
};

function textEvent(
	overrides: TextEventOverrides = {},
	message: TextMessageOverrides = {},
): string {
	return JSON.stringify({
		app_id: appId,
		event_name: "user_send_text",
		sender: { id: personId },
		recipient: { id: oaId },
		message: { msg_id: `wire-1-${suffix}`, text: "Xin chao", ...message },
		timestamp: String(Date.now()),
		...overrides,
	});
}

async function connectOa(): Promise<string> {
	const account = await db.messagingAccount.create({
		data: {
			channel: "ZALO",
			externalId: oaId,
			label: "Webhook OA",
			connectedById: ownerId,
		},
		select: { id: true },
	});

	return account.id;
}

async function storedMessages() {
	return db.message.count({
		where: { thread: { identity: { externalId: personId } } },
	});
}

async function clearProfileTasks() {
	const identities = await db.contactChannelIdentity.findMany({
		where: { account: { externalId: oaId } },
		select: { id: true },
	});
	if (identities.length === 0) return;

	await db.agentTask.deleteMany({
		where: {
			kind: "message-identity-profile",
			OR: identities.map((identity) => ({
				payload: { path: ["identityId"], equals: identity.id },
			})),
		},
	});
}

async function clear() {
	await clearProfileTasks();
	await db.messagingAccount.deleteMany({ where: { externalId: oaId } });
}

beforeAll(async () => {
	for (const key of ["ZALO_APP_ID", "ZALO_APP_SECRET", "ZALO_OA_SECRET_KEY"]) {
		savedEnv[key] = process.env[key];
	}
	process.env.ZALO_APP_ID = appId;
	process.env.ZALO_APP_SECRET = "hook-app-secret";
	process.env.ZALO_OA_SECRET_KEY = oaSecret;

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
			{ id: ownerId, name: "Webhook Owner", email: `${ownerId}@example.test` },
		],
		skipDuplicates: true,
	});
	await clear();

	const { createApp } = await import("../src/create-app");
	app = await createApp();
	await app.init();
	writer = app.get(MessagingWriterService);
});

afterEach(clear);

afterAll(async () => {
	await app.close();
	await clear();
	await db.user.deleteMany({ where: { id: ownerId } });

	for (const [key, value] of Object.entries(savedEnv)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

describe("the Zalo webhook door", () => {
	it("refuses a body whose signature does not match", async () => {
		await connectOa();

		const response = await request(app.getHttpServer())
			.post(MESSAGING_API.webhook.path)
			.set("content-type", "application/json")
			.set(MESSAGING_API.webhook.signatureHeader, "0".repeat(64))
			.send(textEvent());

		expect(response.status).toBe(401);
		expect(await storedMessages()).toBe(0);
	});

	it("refuses a body with no signature header", async () => {
		await connectOa();

		const response = await request(app.getHttpServer())
			.post(MESSAGING_API.webhook.path)
			.set("content-type", "application/json")
			.send(textEvent());

		expect(response.status).toBe(401);
	});

	it("refuses a timestamp outside the tolerance", async () => {
		await connectOa();
		const stale = String(Date.now() - MESSAGING_API.webhook.clockSkewMs - 1000);

		expect((await post(textEvent({ timestamp: stale }))).status).toBe(401);
		expect(await storedMessages()).toBe(0);
	});

	it("refuses a body whose content type is not JSON", async () => {
		await connectOa();

		const response = await request(app.getHttpServer())
			.post(MESSAGING_API.webhook.path)
			.set("content-type", "text/plain")
			.set(MESSAGING_API.webhook.signatureHeader, "0".repeat(64))
			.send("not json");

		expect(response.status).toBe(401);
		expect(await storedMessages()).toBe(0);
	});

	it("refuses a form-encoded body and answers at once", async () => {
		await connectOa();

		const filled = await request(app.getHttpServer())
			.post(MESSAGING_API.webhook.path)
			.set("content-type", "application/x-www-form-urlencoded")
			.send("a=b");
		const empty = await request(app.getHttpServer())
			.post(MESSAGING_API.webhook.path)
			.set("content-type", "application/x-www-form-urlencoded")
			.send("");

		expect(filled.status).toBe(401);
		expect(empty.status).toBe(401);
		expect(await storedMessages()).toBe(0);
	});

	it("accepts a charset on the content type", async () => {
		await connectOa();

		const response = await post(textEvent(), {
			"content-type": "application/json; charset=utf-8",
		});

		expect(response.status).toBe(200);
		expect(await storedMessages()).toBe(1);
	});

	it("refuses a timestamp three hours in the future", async () => {
		await connectOa();
		const ahead = String(Date.now() + 3 * 60 * 60 * 1000);

		expect((await post(textEvent({ timestamp: ahead }))).status).toBe(401);
		expect(await storedMessages()).toBe(0);
	});

	it("checks the signature over the bytes on the wire", async () => {
		await connectOa();
		const event = JSON.parse(textEvent());
		const pretty = JSON.stringify(event, null, 2);

		expect((await postSignedOver(pretty, pretty)).status).toBe(200);
		expect(await storedMessages()).toBe(1);
	});

	it("refuses a pretty body signed over its compact form", async () => {
		await connectOa();
		const event = JSON.parse(textEvent());
		const pretty = JSON.stringify(event, null, 2);

		const response = await postSignedOver(pretty, JSON.stringify(event));

		expect(response.status).toBe(401);
		expect(await storedMessages()).toBe(0);
	});

	it("refuses a body over the size cap", async () => {
		await connectOa();
		const body = textEvent(
			{},
			{ text: "x".repeat(MESSAGING_API.webhook.maxBodyBytes) },
		);

		expect((await post(body)).status).toBe(413);
	});
});

describe("the Zalo webhook writes", () => {
	it("stores a text with one activity and marks the account", async () => {
		const accountId = await connectOa();

		expect((await post(textEvent())).status).toBe(200);

		const thread = await db.messageThread.findFirst({
			where: { identity: { externalId: personId } },
			select: { id: true, messageCount: true, unreadCount: true },
		});
		expect(thread?.messageCount).toBe(1);
		expect(thread?.unreadCount).toBe(1);
		expect(
			await db.activity.count({ where: { messageThreadId: thread?.id } }),
		).toBe(1);

		const account = await db.messagingAccount.findUnique({
			where: { id: accountId },
			select: { lastWebhookAt: true, lastInboundAt: true },
		});
		expect(account?.lastWebhookAt).not.toBeNull();
		expect(account?.lastInboundAt).not.toBeNull();
	});

	it("answers a retry of the same body with 200 and keeps one row", async () => {
		await connectOa();
		const body = textEvent();

		expect((await post(body)).status).toBe(200);
		expect((await post(body, { num_retry: "1" })).status).toBe(200);

		expect(await storedMessages()).toBe(1);
	});

	it("lands both texts when two arrive together from a new person", async () => {
		await connectOa();

		const [first, second] = await Promise.all([
			post(textEvent({}, { msg_id: `wire-a-${suffix}`, text: "Mot" })),
			post(textEvent({}, { msg_id: `wire-b-${suffix}`, text: "Hai" })),
		]);

		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		expect(await storedMessages()).toBe(2);
	});

	it("keeps an http attachment on a Zalo host", async () => {
		await connectOa();
		const url = "http://cdn.zdn.vn/photo.jpg";

		const response = await post(
			textEvent(
				{ event_name: "user_send_image" },
				{
					msg_id: `img-${suffix}`,
					text: undefined,
					attachments: [{ type: "image", payload: { url } }],
				},
			),
		);

		expect(response.status).toBe(200);

		const message = await db.message.findFirst({
			where: { externalId: `img-${suffix}` },
			select: { kind: true, attachments: true },
		});
		expect(message?.kind).toBe("IMAGE");
		expect(message?.attachments).toEqual([{ url }]);
	});

	it("drops an attachment on a host it does not trust and still stores the message", async () => {
		await connectOa();

		const response = await post(
			textEvent(
				{ event_name: "user_send_image" },
				{
					msg_id: `bad-${suffix}`,
					attachments: [
						{ type: "image", payload: { url: "https://evil.example/x.jpg" } },
						{ type: "image", payload: { url: "javascript:alert(1)" } },
					],
				},
			),
		);

		expect(response.status).toBe(200);

		const message = await db.message.findFirst({
			where: { externalId: `bad-${suffix}` },
			select: { attachments: true },
		});
		expect(message).not.toBeNull();
		expect(message?.attachments).toBeNull();
	});

	it("records a follow and ignores a follow replayed behind an unfollow", async () => {
		const accountId = await connectOa();
		const followedAt = Date.now() - 120_000;
		const unfollowedAt = Date.now() - 60_000;

		const followBody = JSON.stringify({
			event_name: "follow",
			oa_id: oaId,
			follower: { id: personId },
			timestamp: String(followedAt),
		});

		expect((await post(followBody)).status).toBe(200);

		expect(
			(
				await post(
					JSON.stringify({
						event_name: "unfollow",
						oa_id: oaId,
						follower: { id: personId },
						timestamp: String(unfollowedAt),
					}),
				)
			).status,
		).toBe(200);

		expect((await post(followBody)).status).toBe(200);

		const identity = await db.contactChannelIdentity.findFirst({
			where: { accountId, externalId: personId },
			select: { followedAt: true, unfollowedAt: true },
		});
		expect(identity?.followedAt).toEqual(new Date(followedAt));
		expect(identity?.unfollowedAt).toEqual(new Date(unfollowedAt));
	});

	it("stores a text whose Official Account id sits in sender", async () => {
		await connectOa();

		const response = await post(
			textEvent({ sender: { id: oaId }, recipient: { id: personId } }),
		);

		expect(response.status).toBe(200);
		expect(await storedMessages()).toBe(1);
	});

	it("marks an outbound row delivered on a received event", async () => {
		await connectOa();
		expect((await post(textEvent())).status).toBe(200);
		const outboundId = await seedOutbound(`out-${suffix}`);

		const response = await post(
			JSON.stringify({
				app_id: appId,
				event_name: "user_received_message",
				sender: { id: oaId },
				recipient: { id: personId },
				message: { msg_id: `out-${suffix}` },
				timestamp: String(Date.now()),
			}),
		);

		expect(response.status).toBe(200);

		const row = await db.message.findUnique({
			where: { id: outboundId },
			select: { status: true, deliveredAt: true },
		});
		expect(row?.status).toBe("DELIVERED");
		expect(row?.deliveredAt).not.toBeNull();
	});

	it("settles a full page of seen ids in one round", async () => {
		const accountId = await connectOa();
		expect((await post(textEvent())).status).toBe(200);
		const outboundId = await seedOutbound(`seen-hit-${suffix}`);

		const misses = Array.from(
			{ length: MESSAGING_API.webhook.maxReceiptIds - 1 },
			(_, index) => `seen-miss-${index}-${suffix}`,
		);

		const response = await post(seenEvent([`seen-hit-${suffix}`, ...misses]));

		expect(response.status).toBe(200);

		const row = await db.message.findUnique({
			where: { id: outboundId },
			select: { status: true, readAt: true },
		});
		expect(row?.status).toBe("READ");
		expect(row?.readAt).not.toBeNull();
		expect(await db.messageReceipt.count({ where: { accountId } })).toBe(
			misses.length,
		);
	});

	it("refuses to read a seen event over the id cap", async () => {
		const accountId = await connectOa();

		const ids = Array.from(
			{ length: MESSAGING_API.webhook.maxReceiptIds + 1 },
			(_, index) => `seen-over-${index}-${suffix}`,
		);

		expect((await post(seenEvent(ids))).status).toBe(200);
		expect(await db.messageReceipt.count({ where: { accountId } })).toBe(0);
	});

	it("keeps a seen event that arrives before the outbound row", async () => {
		const accountId = await connectOa();

		const response = await post(
			JSON.stringify({
				app_id: appId,
				event_name: "user_seen_message",
				sender: { id: oaId },
				recipient: { id: personId },
				message: { msg_ids: [`seen-${suffix}`] },
				timestamp: String(Date.now()),
			}),
		);

		expect(response.status).toBe(200);

		const receipts = await db.messageReceipt.findMany({
			where: { accountId },
			select: { externalId: true, kind: true },
		});
		expect(receipts).toEqual([{ externalId: `seen-${suffix}`, kind: "seen" }]);
	});
});

describe("the Zalo webhook answers without writing", () => {
	it("accepts an event for an Official Account it does not know", async () => {
		expect((await post(textEvent())).status).toBe(200);
		expect(await storedMessages()).toBe(0);
	});

	it("accepts an event for a disconnected Official Account", async () => {
		const accountId = await connectOa();
		await db.messagingAccount.update({
			where: { id: accountId },
			data: { disconnectedAt: new Date() },
		});

		expect((await post(textEvent())).status).toBe(200);
		expect(await storedMessages()).toBe(0);
	});

	it("accepts an event name it does not know", async () => {
		await connectOa();

		const response = await post(
			JSON.stringify({
				event_name: "oa_send_text",
				oa_id: oaId,
				timestamp: String(Date.now()),
			}),
		);

		expect(response.status).toBe(200);
		expect(await storedMessages()).toBe(0);
	});

	it("accepts a known event whose shape it cannot read", async () => {
		await connectOa();

		const response = await post(
			JSON.stringify({
				event_name: "user_send_text",
				sender: { id: personId },
				recipient: { id: oaId },
				message: { text: "no message id" },
				timestamp: String(Date.now()),
			}),
		);

		expect(response.status).toBe(200);
		expect(await storedMessages()).toBe(0);
	});
});

describe("the Zalo webhook asks for a retry", () => {
	it("answers 500 with an empty body when the write fails", async () => {
		await connectOa();
		const real = writer.store.bind(writer);
		writer.store = async () => {
			throw new Error("the database is down");
		};

		try {
			const response = await post(textEvent());

			expect(response.status).toBe(500);
			expect(response.text).toBe("");
		} finally {
			writer.store = real;
		}
	});
});
