export const IMPORT_CSV = {
	chunkRows: 500,
	maxRows: 50_000,
	renderedProblemRows: 200,
} as const;

export const IMPORT_FIELDS = {
	company: [
		"name",
		"domain",
		"website",
		"industry",
		"city",
		"country",
		"phone",
		"email",
		"linkedinUrl",
	],
	contact: [
		"firstName",
		"lastName",
		"email",
		"phone",
		"title",
		"linkedinUrl",
		"companyDomain",
		"companyName",
	],
} as const;

export type ImportKind = keyof typeof IMPORT_FIELDS;

export type ImportField = (typeof IMPORT_FIELDS)[ImportKind][number];

export const REQUIRED_FIELD = {
	company: "name",
	contact: "firstName",
} as const satisfies Record<ImportKind, ImportField>;

export const KEY_FIELD = {
	company: "domain",
	contact: "email",
} as const satisfies Record<ImportKind, ImportField>;

export type ImportRowValues = Partial<Record<ImportField, string>> & {
	row: number;
};

export type ColumnMapping = {
	header: string;
	field: ImportField | null;
};

export type ImportRowIssue = {
	row: number;
	field: string;
	reason: string;
};

export function normalizeHeader(header: string): string {
	return header.toLowerCase().replace(/[\s_-]+/g, "");
}

export function headerTransformer(): (header: string) => string {
	const seen = new Map<string, number>();
	return (header) => {
		const count = seen.get(header) ?? 0;
		seen.set(header, count + 1);
		return count === 0 ? header : `${header} (${count + 1})`;
	};
}

export function autoMatchColumns(
	headers: string[],
	kind: ImportKind,
): ColumnMapping[] {
	const byNormalized = new Map<string, ImportField>(
		IMPORT_FIELDS[kind].map((field) => [normalizeHeader(field), field]),
	);
	const taken = new Set<ImportField>();

	return headers.map((header) => {
		const field = byNormalized.get(normalizeHeader(header)) ?? null;
		if (!field || taken.has(field)) return { header, field: null };
		taken.add(field);
		return { header, field };
	});
}

export function hasRequiredColumn(
	mapping: ColumnMapping[],
	kind: ImportKind,
): boolean {
	return mapping.some((column) => column.field === REQUIRED_FIELD[kind]);
}

export function mapRecords(
	records: Record<string, string>[],
	mapping: ColumnMapping[],
): ImportRowValues[] {
	return records.map((record, index) => {
		const values: ImportRowValues = { row: index + 2 };
		for (const column of mapping) {
			if (!column.field) continue;
			const value = record[column.header];
			if (typeof value === "string" && value.trim() !== "") {
				values[column.field] = value.trim();
			}
		}
		return values;
	});
}

export function normalizeImportDomain(value: string): string | null {
	const trimmed = value.trim().toLowerCase();
	if (!trimmed) return null;

	const withScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(trimmed)
		? trimmed
		: `https://${trimmed}`;

	let host: string;
	try {
		host = new URL(withScheme).hostname;
	} catch {
		return null;
	}

	const bare = host.replace(/^www\./, "");

	return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(bare) ? bare : null;
}

export function rowKey(
	kind: ImportKind,
	values: ImportRowValues,
): string | null {
	const raw = values[KEY_FIELD[kind]]?.trim().toLowerCase() ?? "";
	if (!raw) return null;
	if (kind === "company") return normalizeImportDomain(raw) ?? raw;
	return raw;
}

export type SplitRows = {
	unique: ImportRowValues[];
	duplicates: ImportRowValues[];
	keyless: ImportRowValues[];
};

export function splitRows(
	rows: ImportRowValues[],
	kind: ImportKind,
): SplitRows {
	const seen = new Set<string>();
	const unique: ImportRowValues[] = [];
	const duplicates: ImportRowValues[] = [];
	const keyless: ImportRowValues[] = [];

	for (const row of rows) {
		const key = rowKey(kind, row);
		if (!key) {
			keyless.push(row);
			continue;
		}
		if (seen.has(key)) {
			duplicates.push(row);
			continue;
		}
		seen.add(key);
		unique.push(row);
	}

	return { unique, duplicates, keyless };
}

export function chunkRows<T>(
	rows: T[],
	size: number = IMPORT_CSV.chunkRows,
): T[][] {
	const chunks: T[][] = [];
	for (let index = 0; index < rows.length; index += size) {
		chunks.push(rows.slice(index, index + size));
	}
	return chunks;
}

function csvCell(value: string | number): string {
	const text = String(value);
	return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function problemCsv(
	problems: Array<ImportRowIssue & { severity: "error" | "warning" }>,
): string {
	const lines = [
		"row,severity,field,reason",
		...problems.map((problem) =>
			[problem.row, problem.severity, problem.field, problem.reason]
				.map(csvCell)
				.join(","),
		),
	];
	return lines.join("\n");
}
