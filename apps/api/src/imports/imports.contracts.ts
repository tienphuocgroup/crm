import { z } from "zod";

export const IMPORT_CHUNK_ROWS = 500;

const cell = z.string().trim().optional();

export const companyImportRow = z.object({
	row: z.number().int().nonnegative(),
	name: cell,
	domain: cell,
	website: cell,
	industry: cell,
	city: cell,
	country: cell,
	phone: cell,
	email: cell,
	linkedinUrl: cell,
});

export type CompanyImportRow = z.infer<typeof companyImportRow>;

export const contactImportRow = z.object({
	row: z.number().int().nonnegative(),
	firstName: cell,
	lastName: cell,
	email: cell,
	phone: cell,
	title: cell,
	linkedinUrl: cell,
	companyDomain: cell,
	companyName: cell,
});

export type ContactImportRow = z.infer<typeof contactImportRow>;

const importMode = z.enum(["dryRun", "apply"]);

export const importCommitInput = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("company"),
		mode: importMode,
		includeKeyless: z.boolean().default(false),
		rows: z.array(companyImportRow).min(1).max(IMPORT_CHUNK_ROWS),
	}),
	z.object({
		kind: z.literal("contact"),
		mode: importMode,
		includeKeyless: z.boolean().default(false),
		rows: z.array(contactImportRow).min(1).max(IMPORT_CHUNK_ROWS),
	}),
]);

export type ImportCommitInput = z.infer<typeof importCommitInput>;

export type ImportMode = z.infer<typeof importMode>;

export interface ImportRowIssue {
	row: number;
	field: string;
	reason: string;
}

export interface ImportCommitResult {
	created: number;
	matchedExisting: number;
	skipped: number;
	errors: ImportRowIssue[];
	warnings: ImportRowIssue[];
}
