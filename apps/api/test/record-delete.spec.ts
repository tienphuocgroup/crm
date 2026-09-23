import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, RecordSource } from "@crm/db";
import { AgentQueueService } from "../src/agent/agent-queue.service";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompaniesService } from "../src/companies/companies.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import { FaviconService } from "../src/companies/favicon.service";
import { ContactsService } from "../src/contacts/contacts.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { EnrichmentLogService } from "../src/crm/enrichment-log.service";
import { ConversionService } from "../src/currency/conversion.service";
import { FieldsService } from "../src/fields/fields.service";
import { MailboxMatchService } from "../src/mailbox/mailbox-match.service";
import { MessagingWriterService } from "../src/messaging/messaging-writer.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "record-delete-spec";
const domain = `delete-${suffix}.test`;
const doomedDomain = `doomed-${suffix}.test`;
const stampDomain = `stamped-${suffix}.test`;
const orphanDomain = `orphaned-${suffix}.test`;
const keptDomain = `kept-${suffix}.test`;
const zaloDomain = `zalo-co-${suffix}.test`;
const email = `gone@${domain}`;
const colleague = `stays@${domain}`;
const userId = `user-${suffix}`;

const stamp = new ActivityStampService(db);

const agent = {
	contactCreated: async () => undefined,
	companyCreated: async () => undefined,
	withCrmEvents: withDiscardedCrmEvents,
	companyRequested: async () => undefined,
} as unknown as AgentTriggerService;

const directory = new CompanyDirectoryService(agent);
const log = new EnrichmentLogService(db, stamp);
const queue = new AgentQueueService(db);
const conversion = new ConversionService(db);

const fields = new FieldsService(db, agent);
const writer = new MessagingWriterService(db, stamp, agent);
const contacts = new ContactsService(
	db,
	directory,
	agent,
	queue,
	stamp,
	fields,
	writer,
);
const companies = new CompaniesService(
	db,
	agent,
	queue,
	{ backfill: async () => undefined } as unknown as FaviconService,
	stamp,
	conversion,
	fields,
);
const match = new MailboxMatchService(db, directory, agent, log);

const zaloOaId = `delete-oa-${suffix}`;

async function zaloHistory(address: string, companyId?: string) {
	const contact = await contacts.create({
		firstName: "Zalo",
		lastName: "Person",
		email: address,
		ownerId: userId,
		...(companyId ? { companyId } : {}),
	});

	await db.messagingAccount.upsert({
		where: { channel_externalId: { channel: "ZALO", externalId: zaloOaId } },
		create: {
			channel: "ZALO",
			externalId: zaloOaId,
			label: "Delete OA",
			connectedById: userId,
		},
		update: {},
	});

	const person = `zalo-person-${address}`;

	await writer.store({
		channel: "ZALO",
		accountExternalIds: [zaloOaId],
		senderExternalId: person,
		displayName: "Nguyen Van A",
		avatarUrl: null,
		kind: "TEXT",
		body: "Xin chao",
		attachments: [],
		externalId: `msg-${address}`,
		sentAt: new Date("2026-09-20T07:00:00.000Z"),
	});

	const thread = await db.messageThread.findFirstOrThrow({
		where: { identity: { externalId: person } },
		select: { id: true, identityId: true },
	});

	await writer.linkContact(thread.id, contact.id);

	const activity = await db.activity.findFirstOrThrow({
		where: { messageThreadId: thread.id },
		select: { id: true },
	});

	return {
		contactId: contact.id,
		identityId: thread.identityId,
		threadId: thread.id,
		activityId: activity.id,
	};
}

async function matchContext() {
	const internal = await match.internalIdentity();
	return {
		ourAddresses: internal.addresses,
		ourDomains: internal.domains,
		suppressedDomains: await match.suppressedDomains(),
		suppressedEmails: await match.suppressedEmails(),
	};
}

const domains = [
	domain,
	doomedDomain,
	stampDomain,
	orphanDomain,
	keptDomain,
	zaloDomain,
];
const ours = {
	OR: domains.map((host) => ({ email: { endsWith: `@${host}` } })),
};

async function parked(subject: {
	contactId?: string;
	companyId?: string;
	dealId?: string;
}) {
	return db.agentTask.create({
		data: {
			...subject,
			kind: "identify",
			reason: `record-delete-spec (${suffix})`,
			dueAt: new Date(Date.now() + 60 * 60 * 1000),
		},
		select: { id: true },
	});
}

async function clean() {
	await db.messagingAccount.deleteMany({ where: { externalId: zaloOaId } });

	const [existingContacts, existingCompanies] = await Promise.all([
		db.contact.findMany({ where: ours, select: { id: true } }),
		db.company.findMany({
			where: { domain: { in: domains } },
			select: { id: true },
		}),
	]);

	const contactIds = existingContacts.map((row) => row.id);
	const companyIds = existingCompanies.map((row) => row.id);

	await db.agentTask.deleteMany({
		where: {
			OR: [
				{ reason: `record-delete-spec (${suffix})` },
				{ contactId: { in: contactIds } },
				{ companyId: { in: companyIds } },
			],
		},
	});
	await db.agentEvent.deleteMany({ where: { contactId: { in: contactIds } } });
	await db.deal.deleteMany({ where: { ownerId: userId } });
	await db.contact.deleteMany({ where: ours });
	await db.company.deleteMany({ where: { domain: { in: domains } } });
	await db.suppressedContact.deleteMany({ where: ours });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await clean();
	await db.user.create({
		data: { id: userId, name: "Test Rep", email: `${userId}@example.test` },
	});
});

afterAll(clean);

describe("deleting a contact", () => {
	let contactId: string;

	it("takes the record, its queued research and its transcript with it", async () => {
		const created = await contacts.create({
			firstName: "Gone",
			lastName: "Person",
			email,
			ownerId: userId,
		});
		contactId = created.id;

		await parked({ contactId });

		await db.agentEvent.create({
			data: {
				id: `evt-${suffix}`,
				sessionId: `ses-${suffix}`,
				contactId,
				type: "session.started",
				data: {},
				emittedAt: new Date(),
			},
		});

		expect(await contacts.delete(contactId)).toEqual({
			id: contactId,
			name: "Gone Person",
		});

		expect(
			await db.contact.findUnique({ where: { id: contactId } }),
		).toBeNull();
		expect(await db.agentTask.count({ where: { contactId } })).toBe(0);
		expect(await db.agentEvent.count({ where: { contactId } })).toBe(0);
	});

	it("remembers the address so the sync cannot bring them back", async () => {
		const suppressed = await db.suppressedContact.findUnique({
			where: { email },
		});
		expect(suppressed).not.toBeNull();

		const result = await match.resolve(
			{
				participants: [{ email, name: "Gone Person" }],
				allowCreate: true,
				source: RecordSource.EMAIL,
				ownerId: userId,
			},
			await matchContext(),
		);

		expect(result.external).toEqual([]);
		expect(result.contactId).toBeNull();
		expect(await db.contact.findFirst({ where: { email } })).toBeNull();
	});

	it("still files the colleagues who were not deleted", async () => {
		const result = await match.resolve(
			{
				participants: [
					{ email, name: "Gone Person" },
					{ email: colleague, name: "Stays Here" },
				],
				allowCreate: true,
				source: RecordSource.EMAIL,
				ownerId: userId,
			},
			await matchContext(),
		);

		expect(result.external.map((person) => person.email)).toEqual([colleague]);

		const created = await db.contact.findFirst({ where: { email: colleague } });
		expect(created?.id).toBe(result.contactId ?? undefined);
	});

	it("lets a rep add them back by hand, which lifts the suppression", async () => {
		const readded = await contacts.create({ firstName: "Gone", email });

		expect(
			await db.suppressedContact.findUnique({ where: { email } }),
		).toBeNull();

		await db.contact.delete({ where: { id: readded.id } });
		await db.suppressedContact.deleteMany({ where: { email } });
	});

	it("suppresses an address a rep typed in caps as the sync will see it", async () => {
		const typed = `Mixed.Case@${domain.toUpperCase()}`;
		const asSynced = typed.toLowerCase();

		const created = await contacts.create({ firstName: "Mixed", email: typed });

		expect(
			await db.contact.findUnique({
				where: { id: created.id },
				select: { email: true },
			}),
		).toEqual({ email: asSynced });

		await contacts.delete(created.id);

		expect(
			await db.suppressedContact.findUnique({ where: { email: asSynced } }),
		).not.toBeNull();

		const result = await match.resolve(
			{
				participants: [{ email: asSynced, name: "Mixed Case" }],
				allowCreate: true,
				source: RecordSource.EMAIL,
				ownerId: userId,
			},
			await matchContext(),
		);

		expect(result.external).toEqual([]);
		expect(
			await db.contact.findFirst({ where: { email: asSynced } }),
		).toBeNull();
	});

	it("keeps the Zalo history and returns the conversation to unmatched", async () => {
		const zalo = await zaloHistory(`zalo-keep@${domain}`);

		await contacts.delete(zalo.contactId);

		const identity = await db.contactChannelIdentity.findUnique({
			where: { id: zalo.identityId },
			select: { contactId: true },
		});
		const thread = await db.messageThread.findUnique({
			where: { id: zalo.threadId },
			select: { contactId: true },
		});
		const activity = await db.activity.findUnique({
			where: { id: zalo.activityId },
			select: { contactId: true, companyId: true, type: true },
		});

		expect(identity).toEqual({ contactId: null });
		expect(thread).toEqual({ contactId: null });
		expect(activity).toEqual({
			contactId: null,
			companyId: null,
			type: "MESSAGE",
		});
		expect(await db.message.count({ where: { threadId: zalo.threadId } })).toBe(
			1,
		);

		await db.messagingAccount.deleteMany({ where: { externalId: zaloOaId } });
	});

	it("clears the company from a conversation whose contact goes", async () => {
		const company = await companies.create({
			name: "Zalo Employer",
			domain: zaloDomain,
		});
		const zalo = await zaloHistory(`zalo-company@${domain}`, company.id);

		const linked = await db.messageThread.findUnique({
			where: { id: zalo.threadId },
			select: { contactId: true, companyId: true },
		});
		expect(linked).toEqual({
			contactId: zalo.contactId,
			companyId: company.id,
		});

		await contacts.delete(zalo.contactId);

		expect(
			await db.messageThread.findUnique({
				where: { id: zalo.threadId },
				select: { contactId: true, companyId: true },
			}),
		).toEqual({ contactId: null, companyId: null });

		await db.messagingAccount.deleteMany({ where: { externalId: zaloOaId } });
		await companies.delete(company.id);
	});

	it("erases all four rows when the conversation itself is deleted", async () => {
		const zalo = await zaloHistory(`zalo-erase@${domain}`);

		await writer.deleteThread(zalo.threadId);

		expect(
			await db.contactChannelIdentity.count({
				where: { id: zalo.identityId },
			}),
		).toBe(0);
		expect(await db.messageThread.count({ where: { id: zalo.threadId } })).toBe(
			0,
		);
		expect(await db.message.count({ where: { threadId: zalo.threadId } })).toBe(
			0,
		);
		expect(await db.activity.count({ where: { id: zalo.activityId } })).toBe(0);
		expect(await db.contact.count({ where: { id: zalo.contactId } })).toBe(1);

		await contacts.delete(zalo.contactId);
		await db.messagingAccount.deleteMany({ where: { externalId: zaloOaId } });
	});
});

describe("deleting a company", () => {
	it("leaves its deals and its people without a company", async () => {
		const company = await companies.create({
			name: "Doomed",
			domain: doomedDomain,
		});
		const contact = await contacts.create({
			firstName: "Left",
			lastName: "Behind",
			email: `left@${doomedDomain}`,
			companyId: company.id,
		});
		const deal = await db.deal.create({
			data: { name: "Doomed deal", companyId: company.id, ownerId: userId },
			select: { id: true },
		});

		await parked({ companyId: company.id });

		expect(await companies.delete(company.id)).toEqual({
			id: company.id,
			name: "Doomed",
		});

		expect(
			await db.deal.findUnique({
				where: { id: deal.id },
				select: { companyId: true },
			}),
		).toEqual({ companyId: null });
		expect(await db.agentTask.count({ where: { companyId: company.id } })).toBe(
			0,
		);

		const survivor = await db.contact.findUnique({
			where: { id: contact.id },
			select: { companyId: true },
		});
		expect(survivor?.companyId).toBeNull();

		await db.deal.delete({ where: { id: deal.id } });
		await db.contact.delete({ where: { id: contact.id } });
	});
});

describe("the activity stamps a delete leaves behind", () => {
	it("are recomputed on every record the deleted one's activities touched", async () => {
		const company = await companies.create({
			name: "Stamped",
			domain: stampDomain,
		});
		const contact = await contacts.create({
			firstName: "Stamped",
			email: `stamped@${stampDomain}`,
			companyId: company.id,
		});
		const deal = await db.deal.create({
			data: { name: "Stamped deal", companyId: company.id, ownerId: userId },
			select: { id: true },
		});

		const at = new Date();
		await db.activity.create({
			data: {
				type: "NOTE",
				subject: "The only thing on this account",
				companyId: company.id,
				contactId: contact.id,
				dealId: deal.id,
				createdById: userId,
				createdAt: at,
			},
		});
		await stamp.touch(
			{ companyId: company.id, contactId: contact.id, dealId: deal.id },
			at,
		);

		await contacts.delete(contact.id);

		expect(
			await db.company.findUnique({
				where: { id: company.id },
				select: { lastActivityAt: true },
			}),
		).toEqual({ lastActivityAt: null });
		expect(
			await db.deal.findUnique({
				where: { id: deal.id },
				select: { lastActivityAt: true },
			}),
		).toEqual({ lastActivityAt: null });
	});

	it("follow a deleted company through the deals it leaves behind", async () => {
		const company = await companies.create({
			name: "Orphaner",
			domain: orphanDomain,
		});
		const contact = await contacts.create({
			firstName: "Orphaned",
			email: `orphaned@${orphanDomain}`,
			companyId: company.id,
		});
		const deal = await db.deal.create({
			data: { name: "Orphaned deal", companyId: company.id, ownerId: userId },
			select: { id: true },
		});

		const at = new Date();
		await db.activity.create({
			data: {
				type: "MEETING",
				subject: "Only ever attached to the deal",
				contactId: contact.id,
				dealId: deal.id,
				createdById: userId,
				createdAt: at,
			},
		});
		await stamp.touch({ contactId: contact.id, dealId: deal.id }, at);

		await companies.delete(company.id);

		expect(
			await db.contact.findUnique({
				where: { id: contact.id },
				select: { companyId: true, lastActivityAt: true },
			}),
		).toEqual({ companyId: null, lastActivityAt: at });
		expect(
			await db.deal.findUnique({
				where: { id: deal.id },
				select: { companyId: true, lastActivityAt: true },
			}),
		).toEqual({ companyId: null, lastActivityAt: at });

		await db.deal.delete({ where: { id: deal.id } });
		await db.contact.delete({ where: { id: contact.id } });
	});
});

describe("deleting a company a deal depends on", () => {
	it("re-anchors the deal's history and takes only what was the company's", async () => {
		const at = new Date("2026-06-01T09:00:00.000Z");

		const company = await companies.create({
			name: "Kept",
			domain: keptDomain,
		});
		const deal = await db.deal.create({
			data: { name: "Kept deal", companyId: company.id, ownerId: userId },
			select: { id: true },
		});

		const dealActivity = await db.activity.create({
			data: {
				type: "STAGE_CHANGE",
				subject: "Stage changed",
				companyId: company.id,
				dealId: deal.id,
				createdById: userId,
				createdAt: at,
				meta: { from: "INQUIRY", to: "CONSULT_BOOKED" },
			},
			select: { id: true },
		});
		const companyActivity = await db.activity.create({
			data: {
				type: "NOTE",
				subject: "About the company and nothing else",
				companyId: company.id,
				createdById: userId,
				createdAt: new Date(at.getTime() + 60_000),
			},
			select: { id: true },
		});

		await stamp.touch({ companyId: company.id, dealId: deal.id }, at);

		const conversation = await db.agentConversation.create({
			data: { userId, dealId: deal.id, companyId: company.id },
			select: { id: true },
		});
		const dealTask = await parked({ dealId: deal.id, companyId: company.id });
		const companyTask = await parked({ companyId: company.id });

		expect(await companies.delete(company.id)).toEqual({
			id: company.id,
			name: "Kept",
		});

		expect(
			await db.activity.findUnique({
				where: { id: dealActivity.id },
				select: { companyId: true, dealId: true, createdAt: true },
			}),
		).toEqual({ companyId: null, dealId: deal.id, createdAt: at });
		expect(
			await db.activity.findUnique({ where: { id: companyActivity.id } }),
		).toBeNull();

		expect(
			await db.agentConversation.findUnique({
				where: { id: conversation.id },
				select: { companyId: true, dealId: true },
			}),
		).toEqual({ companyId: null, dealId: deal.id });

		expect(
			await db.agentTask.findUnique({
				where: { id: dealTask.id },
				select: { companyId: true, dealId: true },
			}),
		).toEqual({ companyId: null, dealId: deal.id });
		expect(
			await db.agentTask.findUnique({ where: { id: companyTask.id } }),
		).toBeNull();

		expect(
			await db.deal.findUnique({
				where: { id: deal.id },
				select: { companyId: true, lastActivityAt: true },
			}),
		).toEqual({ companyId: null, lastActivityAt: at });

		await db.deal.delete({ where: { id: deal.id } });
	});
});
