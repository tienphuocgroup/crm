import { describe, expect, it } from "bun:test";
import {
	autoMatchColumns,
	chunkRows,
	hasRequiredColumn,
	headerTransformer,
	mapRecords,
	problemCsv,
	splitRows,
} from "../app/(app)/[slug]/settings/import/csv";

describe("autoMatchColumns", () => {
	it("matches headers ignoring case, spaces, underscores and dashes", () => {
		expect(
			autoMatchColumns(["First Name", "LAST_NAME", "e-mail"], "contact"),
		).toEqual([
			{ header: "First Name", field: "firstName" },
			{ header: "LAST_NAME", field: "lastName" },
			{ header: "e-mail", field: "email" },
		]);
	});

	it("leaves unknown columns unmapped and claims a field once", () => {
		expect(autoMatchColumns(["name", "Name", "notes"], "company")).toEqual([
			{ header: "name", field: "name" },
			{ header: "Name", field: null },
			{ header: "notes", field: null },
		]);
	});
});

describe("hasRequiredColumn", () => {
	it("knows the required field per kind", () => {
		const mapping = autoMatchColumns(["name"], "company");
		expect(hasRequiredColumn(mapping, "company")).toBe(true);
		expect(
			hasRequiredColumn(autoMatchColumns(["email"], "contact"), "contact"),
		).toBe(false);
	});
});

describe("mapRecords", () => {
	it("numbers rows from the second CSV line, trims and drops blanks", () => {
		const mapping = autoMatchColumns(["name", "domain"], "company");
		expect(
			mapRecords(
				[
					{ name: "  Acme  ", domain: "" },
					{ name: "Globex", domain: " globex.com " },
				],
				mapping,
			),
		).toEqual([
			{ row: 2, name: "Acme" },
			{ row: 3, name: "Globex", domain: "globex.com" },
		]);
	});
});

describe("splitRows", () => {
	it("dedupes on the normalized key and separates keyless rows", () => {
		const { unique, duplicates, keyless } = splitRows(
			[
				{ row: 2, name: "Acme", domain: "acme.com" },
				{ row: 3, name: "Acme", domain: "www.ACME.com" },
				{ row: 4, name: "Keyless" },
			],
			"company",
		);

		expect(unique.map((entry) => entry.row)).toEqual([2]);
		expect(duplicates.map((entry) => entry.row)).toEqual([3]);
		expect(keyless.map((entry) => entry.row)).toEqual([4]);
	});

	it("keys contacts on the lowercased email", () => {
		const { unique, duplicates } = splitRows(
			[
				{ row: 2, firstName: "Ana", email: "ana@acme.com" },
				{ row: 3, firstName: "Ana", email: "ANA@ACME.COM" },
			],
			"contact",
		);

		expect(unique).toHaveLength(1);
		expect(duplicates).toHaveLength(1);
	});
});

describe("headerTransformer", () => {
	it("suffixes duplicate headers so every column stays addressable", () => {
		const transform = headerTransformer();
		expect(["name", "Name", "name", "notes"].map(transform)).toEqual([
			"name",
			"Name",
			"name (2)",
			"notes",
		]);
	});
});

describe("chunkRows", () => {
	it("splits into fixed-size chunks", () => {
		expect(chunkRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
		expect(chunkRows([], 2)).toEqual([]);
	});
});

describe("problemCsv", () => {
	it("escapes cells containing commas and quotes", () => {
		expect(
			problemCsv([
				{ row: 2, severity: "error", field: "name", reason: 'a,"b"' },
			]),
		).toBe('row,severity,field,reason\n2,error,name,"a,""b"""');
	});
});
