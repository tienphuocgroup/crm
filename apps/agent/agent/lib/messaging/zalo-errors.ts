import type { MessagingStage } from "@crm/telemetry";

export const ZALO_CODES = {
	rateLimit: -32,
	invalidToken: -216,
	expiredToken: -220,
	notFollower: -213,
} as const;

const TOKEN_CODES: ReadonlySet<number> = new Set([
	ZALO_CODES.invalidToken,
	ZALO_CODES.expiredToken,
]);

export type ZaloFailure =
	| { reason: "code"; status: number; error: number; vendorMessage?: string }
	| { reason: "http"; status: number }
	| { reason: "unparsed"; status: number }
	| { reason: "network" }
	| { reason: "timeout" };

export type ZaloVerdict = { code: string; terminal: boolean };

const RECONNECT = "The Zalo token needs a reconnect.";
const RATE_LIMITED = "Zalo is rate limiting this OA.";
const SILENT = "Zalo did not answer.";
const UNREADABLE = "Zalo answered in an unexpected shape.";
const REFUSED = "Zalo refused the request.";
const INTERRUPTED =
	"The send was interrupted inside the CRM. Check the phone before you try again.";

export const INTERRUPTED_CODE = "interrupted";

const SENTENCES: ReadonlyMap<string, string> = new Map([
	[String(ZALO_CODES.invalidToken), RECONNECT],
	[String(ZALO_CODES.expiredToken), RECONNECT],
	[String(ZALO_CODES.rateLimit), RATE_LIMITED],
	["network", SILENT],
	["timeout", SILENT],
	["unparsed", UNREADABLE],
	[INTERRUPTED_CODE, INTERRUPTED],
]);

function classify(failure: ZaloFailure): ZaloVerdict {
	if (failure.reason === "timeout") return { code: "timeout", terminal: false };
	if (failure.reason === "network") return { code: "network", terminal: false };
	if (failure.reason === "unparsed") {
		return { code: "unparsed", terminal: false };
	}
	if (failure.reason === "http") {
		return { code: `http-${failure.status}`, terminal: false };
	}

	if (failure.error === ZALO_CODES.rateLimit) {
		return { code: String(failure.error), terminal: false };
	}

	return { code: String(failure.error), terminal: failure.error !== 0 };
}

export function classifyRefreshError(failure: ZaloFailure): ZaloVerdict {
	return classify(failure);
}

export function classifySendError(failure: ZaloFailure): ZaloVerdict {
	return classify(failure);
}

export function isTokenFailure(failure: ZaloFailure): boolean {
	return failure.reason === "code" && TOKEN_CODES.has(failure.error);
}

export function isNotFollower(failure: ZaloFailure): boolean {
	return failure.reason === "code" && failure.error === ZALO_CODES.notFollower;
}

export function errorClassFor(code: string): string {
	return `zalo.${code}`;
}

export function sentenceFor(code: string): string {
	if (code.startsWith("http-")) return SILENT;

	return SENTENCES.get(code) ?? REFUSED;
}

function vendorMessageOf(failure: ZaloFailure): string | null {
	return failure.reason === "code" ? (failure.vendorMessage ?? null) : null;
}

export function logZaloFailure(input: {
	stage: MessagingStage;
	id: string;
	verdict: ZaloVerdict;
	failure: ZaloFailure;
}): void {
	console.error("[agent] a Zalo call failed", {
		stage: input.stage,
		id: input.id,
		errorClass: errorClassFor(input.verdict.code),
		reason: input.failure.reason,
		vendorMessage: vendorMessageOf(input.failure),
	});
}
