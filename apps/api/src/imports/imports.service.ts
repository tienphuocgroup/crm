import { canImportRecords, workspaceRoleOf } from "@crm/auth";
import type { Db, Prisma } from "@crm/db";
import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { normalizeDomain } from "../companies/domain";
import { blankToNull, normalizeEmail } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import type {
	CompanyImportRow,
	ContactImportRow,
	ImportCommitInput,
	ImportCommitResult,
	ImportMode,
	ImportRowIssue,
} from "./imports.contracts";

const emailShape = z.email();

function optional(value: string | undefined): string | null {
	return blankToNull(value ?? "");
}

@Injectable()
export class ImportsService {
	private readonly logger = new Logger(ImportsService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async commit(
		userId: string,
		input: ImportCommitInput,
	): Promise<ImportCommitResult> {
		if (!canImportRecords(await workspaceRoleOf(userId))) {
			throw new ForbiddenException(
				"Only an owner or an admin can import records.",
			);
		}

		const result =
			input.kind === "company"
				? await this.commitCompanies(
						input.rows,
						input.mode,
						input.includeKeyless,
					)
				: await this.commitContacts(
						input.rows,
						input.mode,
						input.includeKeyless,
					);

		this.logger.log({
			message: "Import chunk processed",
			kind: input.kind,
			mode: input.mode,
			rows: input.rows.length,
			created: result.created,
			matchedExisting: result.matchedExisting,
			skipped: result.skipped,
			errors: result.errors.length,
			warnings: result.warnings.length,
		});

		return result;
	}

	private async commitCompanies(
		rows: CompanyImportRow[],
		mode: ImportMode,
		includeKeyless: boolean,
	): Promise<ImportCommitResult> {
		const errors: ImportRowIssue[] = [];
		let skipped = 0;

		const seen = new Set<string>();
		const keyed: Array<{
			row: CompanyImportRow;
			name: string;
			domain: string;
		}> = [];
		const keyless: Array<{ row: CompanyImportRow; name: string }> = [];

		for (const row of rows) {
			const name = optional(row.name);
			if (!name) {
				errors.push({ row: row.row, field: "name", reason: "required" });
				continue;
			}

			const rawDomain = optional(row.domain);
			if (!rawDomain) {
				keyless.push({ row, name });
				continue;
			}

			const domain = normalizeDomain(rawDomain);
			if (!domain) {
				errors.push({ row: row.row, field: "domain", reason: "invalid" });
				continue;
			}

			if (seen.has(domain)) {
				skipped += 1;
				continue;
			}

			seen.add(domain);
			keyed.push({ row, name, domain });
		}

		if (!includeKeyless) {
			skipped += keyless.length;
		}

		const existing = keyed.length
			? await this.db.company.findMany({
					where: {
						domain: {
							in: keyed.map((entry) => entry.domain),
							mode: "insensitive",
						},
					},
					select: { domain: true },
				})
			: [];
		const existingDomains = new Set(
			existing.flatMap((row) => (row.domain ? [row.domain.toLowerCase()] : [])),
		);

		const matchedExisting = keyed.filter((entry) =>
			existingDomains.has(entry.domain),
		).length;
		const creatable = [
			...keyed
				.filter((entry) => !existingDomains.has(entry.domain))
				.map((entry) => ({
					row: entry.row,
					name: entry.name,
					domain: entry.domain as string | null,
				})),
			...(includeKeyless
				? keyless.map((entry) => ({
						row: entry.row,
						name: entry.name,
						domain: null as string | null,
					}))
				: []),
		];

		const data = creatable.map(
			(entry): Prisma.CompanyCreateManyInput => ({
				name: entry.name,
				domain: entry.domain,
				website: optional(entry.row.website),
				industry: optional(entry.row.industry),
				city: optional(entry.row.city),
				country: optional(entry.row.country),
				phone: optional(entry.row.phone),
				email: optional(entry.row.email),
				linkedinUrl: optional(entry.row.linkedinUrl),
				source: "IMPORT",
				enrichmentStatus: "SKIPPED",
			}),
		);

		let created = data.length;
		if (mode === "apply" && data.length) {
			const result = await this.db.company.createMany({
				data,
				skipDuplicates: true,
			});
			created = result.count;
		}

		return { created, matchedExisting, skipped, errors, warnings: [] };
	}

	private async commitContacts(
		rows: ContactImportRow[],
		mode: ImportMode,
		includeKeyless: boolean,
	): Promise<ImportCommitResult> {
		const errors: ImportRowIssue[] = [];
		const warnings: ImportRowIssue[] = [];
		let skipped = 0;

		const seen = new Set<string>();
		const keyed: Array<{
			row: ContactImportRow;
			firstName: string;
			email: string;
		}> = [];
		const keyless: Array<{ row: ContactImportRow; firstName: string }> = [];

		for (const row of rows) {
			const firstName = optional(row.firstName);
			if (!firstName) {
				errors.push({ row: row.row, field: "firstName", reason: "required" });
				continue;
			}

			const rawEmail = optional(row.email);
			if (!rawEmail) {
				keyless.push({ row, firstName });
				continue;
			}

			const email = normalizeEmail(rawEmail);
			if (!email || !emailShape.safeParse(email).success) {
				errors.push({ row: row.row, field: "email", reason: "invalid" });
				continue;
			}

			if (seen.has(email)) {
				skipped += 1;
				continue;
			}

			seen.add(email);
			keyed.push({ row, firstName, email });
		}

		if (!includeKeyless) {
			skipped += keyless.length;
		}

		const keys = keyed.map((entry) => entry.email);
		const suppressed = keys.length
			? await this.db.suppressedContact.findMany({
					where: { email: { in: keys, mode: "insensitive" } },
					select: { email: true },
				})
			: [];
		const suppressedEmails = new Set(
			suppressed.map((row) => row.email.toLowerCase()),
		);

		const allowed = keyed.filter((entry) => !suppressedEmails.has(entry.email));
		skipped += keyed.length - allowed.length;

		const existing = allowed.length
			? await this.db.contact.findMany({
					where: {
						email: {
							in: allowed.map((entry) => entry.email),
							mode: "insensitive",
						},
					},
					select: { email: true },
				})
			: [];
		const existingEmails = new Set(
			existing.flatMap((row) => (row.email ? [row.email.toLowerCase()] : [])),
		);

		const matchedExisting = allowed.filter((entry) =>
			existingEmails.has(entry.email),
		).length;
		const creatable = [
			...allowed
				.filter((entry) => !existingEmails.has(entry.email))
				.map((entry) => ({
					row: entry.row,
					firstName: entry.firstName,
					email: entry.email as string | null,
				})),
			...(includeKeyless
				? keyless.map((entry) => ({
						row: entry.row,
						firstName: entry.firstName,
						email: null as string | null,
					}))
				: []),
		];

		const companyByRow = await this.resolveCompanies(
			creatable.map((entry) => entry.row),
			warnings,
		);

		const data = creatable.map(
			(entry): Prisma.ContactCreateManyInput => ({
				firstName: entry.firstName,
				lastName: optional(entry.row.lastName),
				email: entry.email,
				phone: optional(entry.row.phone),
				title: optional(entry.row.title),
				linkedinUrl: optional(entry.row.linkedinUrl),
				companyId: companyByRow.get(entry.row.row) ?? null,
				source: "IMPORT",
				enrichmentStatus: "SKIPPED",
			}),
		);

		let created = data.length;
		if (mode === "apply" && data.length) {
			const result = await this.db.contact.createMany({
				data,
				skipDuplicates: true,
			});
			created = result.count;
		}

		return { created, matchedExisting, skipped, errors, warnings };
	}

	private async resolveCompanies(
		rows: ContactImportRow[],
		warnings: ImportRowIssue[],
	): Promise<Map<number, string>> {
		const refs = rows.flatMap((row) => {
			const rawDomain = optional(row.companyDomain);
			const name = optional(row.companyName);
			if (!rawDomain && !name) return [];
			return [{ row, domain: normalizeDomain(rawDomain), name, rawDomain }];
		});

		if (!refs.length) return new Map();

		const domains = [
			...new Set(refs.flatMap((ref) => (ref.domain ? [ref.domain] : []))),
		];
		const byDomain = new Map<string, string>();
		if (domains.length) {
			const found = await this.db.company.findMany({
				where: { domain: { in: domains, mode: "insensitive" } },
				select: { id: true, domain: true },
			});
			for (const company of found) {
				if (company.domain) {
					byDomain.set(company.domain.toLowerCase(), company.id);
				}
			}
		}

		const names = [
			...new Set(
				refs.flatMap((ref) =>
					ref.name && !(ref.domain && byDomain.has(ref.domain))
						? [ref.name]
						: [],
				),
			),
		];
		const byName = new Map<string, string>();
		if (names.length) {
			const found = await this.db.company.findMany({
				where: { name: { in: names } },
				select: { id: true, name: true },
				orderBy: [{ createdAt: "asc" }, { id: "asc" }],
			});
			for (const company of found) {
				if (!byName.has(company.name)) {
					byName.set(company.name, company.id);
				}
			}
		}

		const resolved = new Map<number, string>();
		for (const ref of refs) {
			const companyId =
				(ref.domain ? byDomain.get(ref.domain) : undefined) ??
				(ref.name ? byName.get(ref.name) : undefined);

			if (companyId) {
				resolved.set(ref.row.row, companyId);
				continue;
			}

			warnings.push({
				row: ref.row.row,
				field: ref.rawDomain ? "companyDomain" : "companyName",
				reason: "companyNotFound",
			});
		}

		return resolved;
	}
}
