const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export const MESSAGING_POLICY = {
	zalo: {
		replyWindowMs: 48 * HOUR_MS,
		attachmentHosts: ["zdn.vn", "zadn.vn", "zalo.me"],
	},
	snippetLength: 140,
	maxBodyLength: 2000,
} as const;

export type Eligibility =
	| { mode: "free-text"; windowClosesAt: Date }
	| { mode: "blocked"; reason: string };

export type EligibilityInput = {
	now: Date;
	lastInboundAt: Date | null;
	accountDisconnectedAt: Date | null;
	accountTokenError: string | null;
};

export const BLOCKED_REASONS = {
	disconnected: "Zalo is disconnected.",
	tokenError: "The Zalo token needs a reconnect.",
	neverWrote: "This customer has not written to the OA yet.",
	windowClosed: (windowClosesAt: Date) =>
		`The reply window closed at ${windowClosesAt.toISOString()}. Zalo charges per message after that and this CRM does not send.`,
} as const;

export function eligibility(input: EligibilityInput): Eligibility {
	if (input.accountDisconnectedAt !== null) {
		return { mode: "blocked", reason: BLOCKED_REASONS.disconnected };
	}

	if (input.accountTokenError !== null) {
		return { mode: "blocked", reason: BLOCKED_REASONS.tokenError };
	}

	if (input.lastInboundAt === null) {
		return { mode: "blocked", reason: BLOCKED_REASONS.neverWrote };
	}

	const windowClosesAt = new Date(
		input.lastInboundAt.getTime() + MESSAGING_POLICY.zalo.replyWindowMs,
	);

	if (input.now.getTime() >= windowClosesAt.getTime()) {
		return {
			mode: "blocked",
			reason: BLOCKED_REASONS.windowClosed(windowClosesAt),
		};
	}

	return { mode: "free-text", windowClosesAt };
}
