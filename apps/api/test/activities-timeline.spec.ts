import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { activityCreateInput } from "../src/activities/activities.contracts";
import { ActivitiesService } from "../src/activities/activities.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";

const suffix = process.env.TEST_RUN_ID ?? "activities-timeline-spec";
const userId = `timeline-user-${suffix}`;
const oaId = `timeline-oa-${suffix}`;
const personId = `timeline-person-${suffix}`;
const email = `timeline-contact-${suffix}@example.test`;

const activities = new ActivitiesService(db, new ActivityStampService(db));

let contactId: string;
let threadId: string;

async function clear() {
	await db.messagingAccount.deleteMany({ where: { externalId: oaId } });
	await db.contact.deleteMany({ where: { email } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await clear();

	await db.user.create({
		data: { id: userId, name: "Timeline Rep", email: `${userId}@example.test` },
	});

	const contact = await db.contact.create({
		data: { firstName: "Timeline", lastName: "Person", email },
		select: { id: true },
	});
	contactId = contact.id;

	const account = await db.messagingAccount.create({
		data: {
			channel: "ZALO",
			externalId: oaId,
			label: "Timeline OA",
			connectedById: userId,
		},
		select: { id: true },
	});

	const identity = await db.contactChannelIdentity.create({
		data: {
			channel: "ZALO",
			accountId: account.id,
			externalId: personId,
			displayName: "Nguyen Van A",
			contactId,
		},
		select: { id: true },
	});

	const at = new Date("2026-09-20T09:00:00.000Z");
	const thread = await db.messageThread.create({
		data: {
			accountId: account.id,
			identityId: identity.id,
			contactId,
			firstMessageAt: at,
			lastMessageAt: at,
			messageCount: 2,
			unreadCount: 1,
		},
		select: { id: true },
	});
	threadId = thread.id;

	await db.activity.createMany({
		data: [
			{
				type: "NOTE",
				subject: "A note a rep wrote",
				contactId,
				createdById: userId,
				occurredAt: at,
			},
			{
				type: "MESSAGE",
				subject: "Xin chao",
				contactId,
				createdById: userId,
				occurredAt: at,
				messageThreadId: threadId,
			},
		],
	});
});

afterAll(clear);

describe("the messages timeline filter", () => {
	it("counts the Zalo conversation and nothing else", async () => {
		const counts = await activities.timelineCounts({ contactId });

		expect(counts.all).toBe(2);
		expect(counts.messages).toBe(1);
		expect(counts.notes).toBe(1);
	});

	it("returns the conversation entry with its thread", async () => {
		const page = await activities.timeline({
			contactId,
			filter: "messages",
			limit: 30,
		});

		expect(page.entries).toHaveLength(1);
		expect(page.entries[0]?.type).toBe("MESSAGE");
		expect(page.entries[0]?.messageThread).toEqual({
			id: threadId,
			messageCount: 2,
			unreadCount: 1,
			lastMessageAt: "2026-09-20T09:00:00.000Z",
			displayName: "Nguyen Van A",
			externalId: personId,
		});
	});

	it("leaves the conversation out of the notes filter", async () => {
		const page = await activities.timeline({
			contactId,
			filter: "notes",
			limit: 30,
		});

		expect(page.entries.map((entry) => entry.type)).toEqual(["NOTE"]);
	});

	it("refuses a message a rep tries to compose by hand", () => {
		const refused = activityCreateInput.safeParse({
			type: "MESSAGE",
			subject: "Typed by hand",
			contactId,
		});
		const accepted = activityCreateInput.safeParse({
			type: "NOTE",
			subject: "Typed by hand",
			contactId,
		});

		expect(refused.success).toBe(false);
		expect(accepted.success).toBe(true);
	});
});
