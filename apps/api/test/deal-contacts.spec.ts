import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { DealsService } from "../src/deals/deals.service";
import { FieldsService } from "../src/fields/fields.service";
import { crmEventRecorder } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "deal-contacts-spec";
const userId = `user-${suffix}`;
const domain = `dealpeople-${suffix}.test`;
const otherDomain = `elsewhere-${suffix}.test`;

const crmEvents = crmEventRecorder();

const agent = {
	withCrmEvents: crmEvents.withCrmEvents,
} as unknown as AgentTriggerService;

const deals = new DealsService(
	db,
	agent,
	new ActivityStampService(db),
	new ConversionService(db),
	new FieldsService(db, { fieldBackfill: async () => undefined } as never),
);

let companyId: string;
let dealId: string;
let championId: string;
let colleagueId: string;
let outsiderId: string;

async function clean() {
	await db.deal.deleteMany({
		where: { OR: [{ company: { domain } }, { ownerId: userId }] },
	});
	await db.contact.deleteMany({
		where: { company: { domain: { in: [domain, otherDomain] } } },
	});
	await db.company.deleteMany({
		where: { domain: { in: [domain, otherDomain] } },
	});
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await clean();

	await db.user.create({
		data: {
			id: userId,
			name: "Deal Rep",
			email: `${userId}@example.test`,
			emailVerified: true,
		},
	});

	const company = await db.company.create({
		data: { name: `People Co ${suffix}`, domain },
		select: { id: true },
	});
	companyId = company.id;

	const other = await db.company.create({
		data: { name: `Other Co ${suffix}`, domain: otherDomain },
		select: { id: true },
	});

	const champion = await db.contact.create({
		data: { firstName: "Ada", lastName: "Champion", companyId },
		select: { id: true },
	});
	championId = champion.id;

	const colleague = await db.contact.create({
		data: { firstName: "Beau", lastName: "Colleague", companyId },
		select: { id: true },
	});
	colleagueId = colleague.id;

	const outsider = await db.contact.create({
		data: { firstName: "Cass", lastName: "Outsider", companyId: other.id },
		select: { id: true },
	});
	outsiderId = outsider.id;

	const deal = await deals.create({
		name: `Renewal ${suffix}`,
		companyId,
		ownerId: userId,
	});
	dealId = deal.id;
});

afterAll(clean);

describe("bringing a contact onto a deal", () => {
	it("offers the people at the deal's company and nobody else", async () => {
		const options = await deals.contactOptions(dealId);
		const ids = options.map((option) => option.id);

		expect(ids).toContain(championId);
		expect(ids).toContain(colleagueId);
		expect(ids).not.toContain(outsiderId);
	});

	it("attaches with a role and reads back on the deal", async () => {
		await deals.attachContact({
			dealId,
			contactId: championId,
			role: "Champion",
		});

		const deal = await deals.byId(dealId);

		expect(deal.contacts).toHaveLength(1);
		expect(deal.contacts[0]?.id).toBe(championId);
		expect(deal.contacts[0]?.role).toBe("Champion");
	});

	it("stops offering somebody already on it", async () => {
		const options = await deals.contactOptions(dealId);

		expect(options.map((option) => option.id)).not.toContain(championId);
	});

	it("attaching twice keeps the role it already has", async () => {
		await deals.attachContact({ dealId, contactId: championId });

		const deal = await deals.byId(dealId);

		expect(deal.contacts).toHaveLength(1);
		expect(deal.contacts[0]?.role).toBe("Champion");
	});

	it("refuses somebody who works somewhere else", async () => {
		await expect(
			deals.attachContact({ dealId, contactId: outsiderId }),
		).rejects.toThrow(`That contact does not work at People Co ${suffix}.`);
	});

	it("blanks a role rather than storing an empty string", async () => {
		await deals.setContactRole({ dealId, contactId: championId, role: "  " });

		const deal = await deals.byId(dealId);

		expect(deal.contacts[0]?.role).toBeNull();
	});

	it("will not set a role on somebody who is not on the deal", async () => {
		await expect(
			deals.setContactRole({
				dealId,
				contactId: colleagueId,
				role: "Blocker",
			}),
		).rejects.toThrow("That contact is not on this deal.");
	});

	it("takes them off again, leaving the contact in the CRM", async () => {
		await deals.detachContact({ dealId, contactId: championId });

		const deal = await deals.byId(dealId);

		expect(deal.contacts).toHaveLength(0);
		expect(await db.contact.count({ where: { id: championId } })).toBe(1);
	});

	it("says so when they were never on it", async () => {
		await expect(
			deals.detachContact({ dealId, contactId: championId }),
		).rejects.toThrow("That contact is not on this deal.");
	});
});

describe("a deal that has no company", () => {
	it("starts in the first stage with no company on it", async () => {
		const deal = await deals.create({
			name: `Walk-in ${suffix}`,
			ownerId: userId,
		});

		expect(
			await db.deal.findUnique({
				where: { id: deal.id },
				select: { companyId: true, stage: true },
			}),
		).toEqual({ companyId: null, stage: "INQUIRY" });

		const created = crmEvents.emitted.find(
			(event) => event.type === "deal.created" && event.record.id === deal.id,
		);

		expect(created?.data).toEqual({ companyId: null, stage: "INQUIRY" });
	});

	it("attaches the contact it was started from, in the same write", async () => {
		const deal = await deals.create({
			name: `Walk-in with a contact ${suffix}`,
			ownerId: userId,
			contactId: outsiderId,
		});

		const read = await deals.byId(deal.id);

		expect(read.company).toBeNull();
		expect(read.contacts.map((contact) => contact.id)).toEqual([outsiderId]);
		expect(
			await db.dealContact.count({
				where: { dealId: deal.id, contactId: outsiderId },
			}),
		).toBe(1);
	});

	it("writes no deal at all when the contact works somewhere else", async () => {
		const name = `Mismatched ${suffix}`;

		await expect(
			deals.create({
				name,
				companyId,
				ownerId: userId,
				contactId: outsiderId,
			}),
		).rejects.toThrow(`That contact does not work at People Co ${suffix}.`);

		expect(await db.deal.count({ where: { name } })).toBe(0);
	});

	it("keeps the company and the contact when they match", async () => {
		const deal = await deals.create({
			name: `Matched ${suffix}`,
			companyId,
			ownerId: userId,
			contactId: colleagueId,
		});

		const read = await deals.byId(deal.id);

		expect(read.company?.id).toBe(companyId);
		expect(read.contacts.map((contact) => contact.id)).toEqual([colleagueId]);
	});

	it("takes a contact from any company onto it", async () => {
		const deal = await deals.create({
			name: `Open door ${suffix}`,
			ownerId: userId,
		});

		await deals.attachContact({
			dealId: deal.id,
			contactId: outsiderId,
			role: "Patient",
		});

		const read = await deals.byId(deal.id);

		expect(read.contacts[0]?.id).toBe(outsiderId);
		expect(read.contacts[0]?.role).toBe("Patient");
	});

	it("still refuses that contact on a deal that has a company", async () => {
		const deal = await deals.create({
			name: `Anchored ${suffix}`,
			companyId,
			ownerId: userId,
		});

		await expect(
			deals.attachContact({ dealId: deal.id, contactId: outsiderId }),
		).rejects.toThrow(`That contact does not work at People Co ${suffix}.`);
	});

	it("offers contacts from every company", async () => {
		const deal = await deals.create({
			name: `Choices ${suffix}`,
			ownerId: userId,
		});

		const ids = (await deals.contactOptions(deal.id)).map(
			(option) => option.id,
		);

		expect(ids).toContain(colleagueId);
		expect(ids).toContain(outsiderId);
	});

	it("drops the company when a rep clears it", async () => {
		const deal = await deals.create({
			name: `Leaving ${suffix}`,
			companyId,
			ownerId: userId,
		});

		await deals.update(deal.id, { companyId: null });

		expect(
			await db.deal.findUnique({
				where: { id: deal.id },
				select: { companyId: true },
			}),
		).toEqual({ companyId: null });
	});

	it("keeps the company when the update does not mention it", async () => {
		const deal = await deals.create({
			name: `Staying ${suffix}`,
			companyId,
			ownerId: userId,
		});

		await deals.update(deal.id, { name: `Staying put ${suffix}` });

		expect(
			await db.deal.findUnique({
				where: { id: deal.id },
				select: { companyId: true },
			}),
		).toEqual({ companyId });
	});
});
