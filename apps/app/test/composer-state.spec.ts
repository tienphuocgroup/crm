import { describe, expect, it } from "bun:test";
import { BLOCKED_REASONS } from "@crm/db/messaging";
import {
	COMPOSER_NOTE_KEY,
	composerState,
} from "@/components/crm/messaging/composer-state";
import en from "@/messages/en/contacts.json";

describe("composerState", () => {
	it("returns the note key and its params inside the window", () => {
		const state = composerState({
			mode: "free-text",
			windowClosesAt: "2026-09-23T04:00:00.000Z",
		});

		expect(state).toEqual({
			mode: "free-text",
			noteKey: COMPOSER_NOTE_KEY,
			params: { windowClosesAt: "2026-09-23T04:00:00.000Z" },
		});
	});

	it("passes the close time through untouched", () => {
		const state = composerState({
			mode: "free-text",
			windowClosesAt: "2026-01-02T03:04:05.000Z",
		});

		if (state.mode !== "free-text") throw new Error("expected free-text");
		expect(state.params.windowClosesAt).toBe("2026-01-02T03:04:05.000Z");
	});

	it("returns the blocked reason verbatim", () => {
		const reason = BLOCKED_REASONS.windowClosed(
			new Date("2026-09-20T04:00:00.000Z"),
		);

		expect(composerState({ mode: "blocked", reason })).toEqual({
			mode: "blocked",
			reason,
		});
	});
});

describe("the composer note catalog entry", () => {
	it("keeps the placeholder the composer fills", () => {
		const note = en[COMPOSER_NOTE_KEY];

		expect(note).toContain("<closesAt>");
	});
});
