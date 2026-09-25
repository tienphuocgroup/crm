import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { WORKSPACE_ID } from "@crm/auth";
import { db } from "@crm/db";
import { ForbiddenException } from "@nestjs/common";
import { ImportsService } from "../src/imports/imports.service";

const suffix = process.env.TEST_RUN_ID ?? "imports-spec";
const adminId = `import-admin-${suffix}`;
const memberId = `import-member-${suffix}`;
const domain = (label: string) => `${label}-${suffix}.test`;
const companyName = (label: string) => `${label} ${suffix}`;

const service = new ImportsService(db);

const testDomains = ["acme", "alpha", "beta", "solo"].map(domain);
const testNames = ["Acme", "Alpha", "Beta", "Keyless", "Solo"].map(companyName);
const contactEmails = {
	OR: [
		{ email: { endsWith: `@${domain("acme")}` } },
		{ email: { endsWith: `@${domain("beta")}` } },
	],
};

async function clean() {
	await db.contact.deleteMany({ where: contactEmails });
	await db.contact.deleteMany({
		where: { firstName: { endsWith: suffix } },
	});
	await db.company.deleteMany({ where: { domain: { in: testDomains } } });
	await db.company.deleteMany({ where: { name: { in: testNames } } });
	await db.suppressedContact.deleteMany({
		where: { email: { endsWith: `@${domain("acme")}` } },
	});
	await db.member.deleteMany({
		where: { userId: { in: [adminId, memberId] } },
	});
	await db.user.deleteMany({ where: { id: { in: [adminId, memberId] } } });
}

beforeAll(async () => {
	await clean();
	await db.organization.upsert({
		where: { id: WORKSPACE_ID },
		create: {
			id: WORKSPACE_ID,
			name: "CRM",
			slug: "crm",
			createdAt: new Date(),
		},
		update: {},
	});
	await db.user.createMany({
		data: [
			{ id: adminId, name: "Import Admin", email: `${adminId}@example.test` },
			{
				id: memberId,
				name: "Import Member",
				email: `${memberId}@example.test`,
			},
		],
	});
	await db.member.createMany({
		data: [
			{
				id: `member-${adminId}`,
				organizationId: WORKSPACE_ID,
				userId: adminId,
				role: "admin",
				createdAt: new Date(),
			},
			{
				id: `member-${memberId}`,
				organizationId: WORKSPACE_ID,
				userId: memberId,
				role: "member",
				createdAt: new Date(),
			},
		],
	});
});

afterAll(clean);

describe("permission", () => {
	it("rejects a member before reading a single row", async () => {
		await expect(
			service.commit(memberId, {
				kind: "company",
				mode: "dryRun",
				includeKeyless: false,
				rows: [{ row: 1, name: companyName("Acme"), domain: domain("acme") }],
			}),
		).rejects.toBeInstanceOf(ForbiddenException);
	});
});

describe("importing companies", () => {
	it("dry-run classifies without writing", async () => {
		const result = await service.commit(adminId, {
			kind: "company",
			mode: "dryRun",
			includeKeyless: false,
			rows: [
				{ row: 1, name: companyName("Acme"), domain: domain("acme") },
				{ row: 2, name: companyName("Alpha"), domain: domain("alpha") },
			],
		});

		expect(result.created).toBe(2);
		expect(result.matchedExisting).toBe(0);
		expect(result.errors).toEqual([]);
		expect(
			await db.company.count({ where: { domain: { in: testDomains } } }),
		).toBe(0);
	});

	it("apply creates, re-run matches everything and creates nothing", async () => {
		const rows = [
			{ row: 1, name: companyName("Acme"), domain: domain("acme") },
			{ row: 2, name: companyName("Alpha"), domain: domain("alpha") },
		];
		const first = await service.commit(adminId, {
			kind: "company",
			mode: "apply",
			includeKeyless: false,
			rows,
		});
		expect(first.created).toBe(2);

		const second = await service.commit(adminId, {
			kind: "company",
			mode: "apply",
			includeKeyless: false,
			rows,
		});
		expect(second.created).toBe(0);
		expect(second.matchedExisting).toBe(2);
		expect(
			await db.company.count({ where: { domain: { in: testDomains } } }),
		).toBe(2);
	});

	it("matches a case-variant domain against the stored canonical one", async () => {
		const result = await service.commit(adminId, {
			kind: "company",
			mode: "apply",
			includeKeyless: false,
			rows: [
				{
					row: 1,
					name: companyName("Acme"),
					domain: `ACME-${suffix}.TEST`,
				},
			],
		});

		expect(result.created).toBe(0);
		expect(result.matchedExisting).toBe(1);
	});

	it("skips keyless rows by default and imports them on request", async () => {
		const row = { row: 7, name: companyName("Keyless"), domain: "" };

		const skippedRun = await service.commit(adminId, {
			kind: "company",
			mode: "apply",
			includeKeyless: false,
			rows: [row],
		});
		expect(skippedRun.skipped).toBe(1);
		expect(skippedRun.created).toBe(0);

		const includedRun = await service.commit(adminId, {
			kind: "company",
			mode: "apply",
			includeKeyless: true,
			rows: [row],
		});
		expect(includedRun.created).toBe(1);
		expect(
			await db.company.count({ where: { name: companyName("Keyless") } }),
		).toBe(1);
	});

	it("reports a nameless row as an error and an unparsable domain as invalid", async () => {
		const result = await service.commit(adminId, {
			kind: "company",
			mode: "dryRun",
			includeKeyless: false,
			rows: [
				{ row: 3, name: " ", domain: domain("acme") },
				{ row: 4, name: companyName("Beta"), domain: "not a domain!!" },
			],
		});

		expect(result.errors).toEqual([
			{ row: 3, field: "name", reason: "required" },
			{ row: 4, field: "domain", reason: "invalid" },
		]);
		expect(result.created).toBe(0);
	});
});

describe("importing contacts", () => {
	it("is idempotent on email and writes source IMPORT with enrichment SKIPPED", async () => {
		const rows = [
			{
				row: 1,
				firstName: `Ana ${suffix}`,
				email: `ana@${domain("acme")}`,
				companyDomain: domain("acme"),
			},
		];

		const first = await service.commit(adminId, {
			kind: "contact",
			mode: "apply",
			includeKeyless: false,
			rows,
		});
		expect(first.created).toBe(1);

		const second = await service.commit(adminId, {
			kind: "contact",
			mode: "apply",
			includeKeyless: false,
			rows,
		});
		expect(second.created).toBe(0);
		expect(second.matchedExisting).toBe(1);

		const contact = await db.contact.findUnique({
			where: { email: `ana@${domain("acme")}` },
			select: {
				source: true,
				enrichmentStatus: true,
				company: { select: { domain: true } },
			},
		});
		expect(contact?.source).toBe("IMPORT");
		expect(contact?.enrichmentStatus).toBe("SKIPPED");
		expect(contact?.company?.domain).toBe(domain("acme"));
	});

	it("never recreates a suppressed contact", async () => {
		const email = `left@${domain("acme")}`;
		await db.suppressedContact.create({ data: { email } });

		const result = await service.commit(adminId, {
			kind: "contact",
			mode: "apply",
			includeKeyless: false,
			rows: [
				{ row: 1, firstName: `Lee ${suffix}`, email: email.toUpperCase() },
			],
		});

		expect(result.skipped).toBe(1);
		expect(result.created).toBe(0);
		expect(await db.contact.findFirst({ where: { email } })).toBeNull();
	});

	it("resolves the company by domain before falling back to the exact name", async () => {
		await db.company.create({
			data: {
				name: companyName("Solo"),
				domain: domain("beta"),
				source: "IMPORT",
				enrichmentStatus: "SKIPPED",
			},
		});

		const result = await service.commit(adminId, {
			kind: "contact",
			mode: "apply",
			includeKeyless: false,
			rows: [
				{
					row: 1,
					firstName: `Bo ${suffix}`,
					email: `bo@${domain("beta")}`,
					companyDomain: domain("beta"),
					companyName: companyName("Acme"),
				},
			],
		});

		expect(result.warnings).toEqual([]);
		const contact = await db.contact.findUnique({
			where: { email: `bo@${domain("beta")}` },
			select: { company: { select: { domain: true } } },
		});
		expect(contact?.company?.domain).toBe(domain("beta"));
	});

	it("imports unlinked with a warning when the company reference matches nothing", async () => {
		const result = await service.commit(adminId, {
			kind: "contact",
			mode: "apply",
			includeKeyless: false,
			rows: [
				{
					row: 9,
					firstName: `Uma ${suffix}`,
					email: `uma@${domain("beta")}`,
					companyName: `Nowhere ${suffix}`,
				},
			],
		});

		expect(result.created).toBe(1);
		expect(result.warnings).toEqual([
			{ row: 9, field: "companyName", reason: "companyNotFound" },
		]);
		const contact = await db.contact.findUnique({
			where: { email: `uma@${domain("beta")}` },
			select: { companyId: true },
		});
		expect(contact?.companyId).toBeNull();
	});

	it("dry-run flags a malformed email and writes nothing", async () => {
		const result = await service.commit(adminId, {
			kind: "contact",
			mode: "dryRun",
			includeKeyless: false,
			rows: [
				{ row: 2, firstName: `Mal ${suffix}`, email: "not-an-email" },
				{ row: 3, firstName: " ", email: `ok@${domain("beta")}` },
			],
		});

		expect(result.errors).toEqual([
			{ row: 2, field: "email", reason: "invalid" },
			{ row: 3, field: "firstName", reason: "required" },
		]);
		expect(result.created).toBe(0);
		expect(
			await db.contact.findFirst({ where: { email: `ok@${domain("beta")}` } }),
		).toBeNull();
	});
});
