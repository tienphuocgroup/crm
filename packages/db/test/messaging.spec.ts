import { describe, expect, test } from "bun:test";
import {
	type EligibilityInput,
	eligibility,
	MESSAGING_POLICY,
} from "../src/messaging";

const NOW = new Date("2026-09-21T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

function input(overrides: Partial<EligibilityInput> = {}): EligibilityInput {
	return {
		now: NOW,
		lastInboundAt: new Date(NOW.getTime() - HOUR_MS),
		accountDisconnectedAt: null,
		accountTokenError: null,
		...overrides,
	};
}

describe("the reply policy", () => {
	test("holds the 48-hour window", () => {
		expect(MESSAGING_POLICY.zalo.replyWindowMs).toBe(48 * HOUR_MS);
		expect(MESSAGING_POLICY.maxBodyLength).toBe(2000);
		expect(MESSAGING_POLICY.snippetLength).toBe(140);
	});

	test("names the Zalo attachment hosts", () => {
		expect([...MESSAGING_POLICY.zalo.attachmentHosts]).toEqual([
			"zdn.vn",
			"zadn.vn",
			"zalo.me",
		]);
	});
});

describe("eligibility inside the window", () => {
	test("allows free text and says when the window closes", () => {
		const result = eligibility(input());

		expect(result.mode).toBe("free-text");
		if (result.mode !== "free-text") return;
		expect(result.windowClosesAt.toISOString()).toBe(
			new Date(NOW.getTime() + 47 * HOUR_MS).toISOString(),
		);
	});
});

describe("eligibility when the CRM must not send", () => {
	test("blocks a closed window and names the closing time", () => {
		const lastInboundAt = new Date(NOW.getTime() - 49 * HOUR_MS);
		const result = eligibility(input({ lastInboundAt }));

		expect(result.mode).toBe("blocked");
		if (result.mode !== "blocked") return;
		expect(result.reason).toContain("The reply window closed at");
		expect(result.reason).toContain(
			new Date(lastInboundAt.getTime() + 48 * HOUR_MS).toISOString(),
		);
		expect(result.reason).toContain("this CRM does not send");
	});

	test("blocks the exact moment the window closes", () => {
		const result = eligibility(
			input({ lastInboundAt: new Date(NOW.getTime() - 48 * HOUR_MS) }),
		);

		expect(result.mode).toBe("blocked");
	});

	test("blocks a customer who never wrote", () => {
		const result = eligibility(input({ lastInboundAt: null }));

		expect(result).toEqual({
			mode: "blocked",
			reason: "This customer has not written to the OA yet.",
		});
	});

	test("blocks a disconnected account", () => {
		const result = eligibility(input({ accountDisconnectedAt: NOW }));

		expect(result).toEqual({
			mode: "blocked",
			reason: "Zalo is disconnected.",
		});
	});

	test("blocks an account whose token needs a reconnect", () => {
		const result = eligibility(
			input({ accountTokenError: "The Zalo token needs a reconnect." }),
		);

		expect(result).toEqual({
			mode: "blocked",
			reason: "The Zalo token needs a reconnect.",
		});
	});
});

describe("the order of the blocked reasons", () => {
	test("puts disconnection before every other reason", () => {
		const result = eligibility(
			input({
				accountDisconnectedAt: NOW,
				accountTokenError: "anything",
				lastInboundAt: null,
			}),
		);

		expect(result).toEqual({
			mode: "blocked",
			reason: "Zalo is disconnected.",
		});
	});

	test("puts the token error before a silent customer", () => {
		const result = eligibility(
			input({ accountTokenError: "anything", lastInboundAt: null }),
		);

		expect(result).toEqual({
			mode: "blocked",
			reason: "The Zalo token needs a reconnect.",
		});
	});

	test("puts a silent customer before a closed window", () => {
		const result = eligibility(
			input({
				lastInboundAt: null,
				now: new Date(NOW.getTime() + 72 * HOUR_MS),
			}),
		);

		expect(result).toEqual({
			mode: "blocked",
			reason: "This customer has not written to the OA yet.",
		});
	});
});

describe("the blocked reason text", () => {
	test("never carries vendor wording", () => {
		const reasons = [
			eligibility(input({ accountDisconnectedAt: NOW })),
			eligibility(input({ accountTokenError: "-216" })),
			eligibility(input({ lastInboundAt: null })),
			eligibility(
				input({ lastInboundAt: new Date(NOW.getTime() - 72 * HOUR_MS) }),
			),
		];

		for (const result of reasons) {
			expect(result.mode).toBe("blocked");
			if (result.mode !== "blocked") continue;
			expect(result.reason.endsWith(".")).toBe(true);
			expect(result.reason).not.toContain("-216");
		}
	});
});
