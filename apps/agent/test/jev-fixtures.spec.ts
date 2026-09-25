import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	type JevEvalFixture,
	parseJevEvalFixtures,
} from "../agent/lib/jev-schemas";

const FIXTURE_PATH = resolve(
	import.meta.dir,
	"fixtures",
	"jev-eval",
	"messages.jsonl",
);

const PHONE = /\+?\d{9,}/;
const ZALO_ID = /\b\d{15,}\b/;

let loaded: JevEvalFixture[] | null = null;

function fixtures(): JevEvalFixture[] {
	if (loaded !== null) return loaded;

	if (!existsSync(FIXTURE_PATH)) {
		throw new Error(
			`${FIXTURE_PATH} does not exist. Write the labelled fixture lines before this spec runs.`,
		);
	}

	loaded = parseJevEvalFixtures(readFileSync(FIXTURE_PATH, "utf8"));

	return loaded;
}

function texts(fixture: JevEvalFixture): string[] {
	return [fixture.body, ...fixture.prior];
}

describe("the Jev eval fixtures", () => {
	it("parse, with one id each", () => {
		expect(fixtures().length).toBeGreaterThan(0);
	});

	it("carry no phone number", () => {
		for (const fixture of fixtures()) {
			for (const text of texts(fixture)) {
				expect(PHONE.test(text)).toBe(false);
			}
		}
	});

	it("carry no email address", () => {
		for (const fixture of fixtures()) {
			for (const text of texts(fixture)) {
				expect(text).not.toContain("@");
			}
		}
	});

	it("carry no Zalo user id", () => {
		for (const fixture of fixtures()) {
			for (const text of texts(fixture)) {
				expect(ZALO_ID.test(text)).toBe(false);
			}
		}
	});

	it("label every verdict line with all four questions", () => {
		for (const fixture of fixtures()) {
			if (fixture.expected !== "verdict") continue;

			expect(fixture.intent).toBeDefined();
			expect(fixture.urgency).toBeDefined();
			expect(fixture.language).toBeDefined();
			expect(fixture.injection).toBeDefined();
			expect(fixture.body.trim().length).toBeGreaterThan(0);
		}
	});

	it("leave every skip line unlabelled", () => {
		for (const fixture of fixtures()) {
			if (fixture.expected !== "skip") continue;

			expect(fixture.intent).toBeUndefined();
			expect(fixture.urgency).toBeUndefined();
			expect(fixture.language).toBeUndefined();
			expect(fixture.injection).toBeUndefined();
		}
	});

	it("hold no repeated id", () => {
		const ids = fixtures().map((fixture) => fixture.id);

		expect(new Set(ids).size).toBe(ids.length);
	});
});
