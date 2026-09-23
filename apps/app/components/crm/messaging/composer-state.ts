import type { RouterOutputs } from "@/lib/trpc/types";

export type ComposerEligibility = RouterOutputs["messaging"]["eligibility"];

export const COMPOSER_NOTE_KEY = "messagingComposerNote";

export type ComposerState =
	| {
			mode: "free-text";
			noteKey: typeof COMPOSER_NOTE_KEY;
			params: { windowClosesAt: string };
	  }
	| { mode: "blocked"; reason: string };

export function composerState(eligibility: ComposerEligibility): ComposerState {
	if (eligibility.mode === "blocked") {
		return { mode: "blocked", reason: eligibility.reason };
	}

	return {
		mode: "free-text",
		noteKey: COMPOSER_NOTE_KEY,
		params: { windowClosesAt: eligibility.windowClosesAt },
	};
}
