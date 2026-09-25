import "@crm/env/load";

import { JEV } from "./jev-config";
import {
	type JevAnswers,
	type JevQuestions,
	type JevUsage,
	jevQuestions,
	parseJevResponse,
} from "./jev-schemas";

export type JevOutcome<T> =
	| { ok: true; data: T }
	| { ok: false; reason: string; retryable: boolean };

export type JevState = string | Record<string, unknown> | unknown[];

export type JevRequest = {
	state: JevState;
	questions: JevQuestions;
};

export type JevVerdict = {
	answers: JevAnswers;
	usage: JevUsage;
};

export type JudgeOptions = {
	timeoutMs?: number;
	backoffMs?: number;
};

export function jevEnabled(): boolean {
	return Boolean(process.env.TYPESAFE_API_KEY?.trim());
}

export async function judge(
	request: JevRequest,
	options: JudgeOptions = {},
): Promise<JevOutcome<JevVerdict>> {
	const apiKey = process.env.TYPESAFE_API_KEY?.trim();
	if (!apiKey) {
		return {
			ok: false,
			reason: "Jev is not configured, so this install makes no judgment.",
			retryable: false,
		};
	}

	const questions = jevQuestions.safeParse(request.questions);
	if (!questions.success) {
		return {
			ok: false,
			reason: "The questions are malformed, so nothing was sent.",
			retryable: false,
		};
	}

	let body: string;
	try {
		body = JSON.stringify({
			state: request.state,
			model: JEV.model,
			questions: request.questions,
		});
	} catch {
		return {
			ok: false,
			reason: "The state does not encode as JSON, so nothing was sent.",
			retryable: false,
		};
	}

	const timeoutMs = options.timeoutMs ?? JEV.requestTimeoutMs;

	const first = await attempt(apiKey, body, timeoutMs);
	if (first.ok || !first.retryable) return first;

	await pause(options.backoffMs ?? JEV.backoffMs);

	return attempt(apiKey, body, timeoutMs);
}

async function attempt(
	apiKey: string,
	body: string,
	timeoutMs: number,
): Promise<JevOutcome<JevVerdict>> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(JEV.endpoint, {
			method: "POST",
			headers: {
				authorization: `Bearer ${apiKey}`,
				"content-type": "application/json",
			},
			signal: controller.signal,
			body,
		});

		if (!response.ok) return refusal(response.status);

		let payload: unknown;
		try {
			payload = await response.json();
		} catch {
			return {
				ok: false,
				reason: "The answer is not JSON.",
				retryable: false,
			};
		}

		try {
			const parsed = parseJevResponse(payload);
			return {
				ok: true,
				data: { answers: parsed.answers, usage: parsed.usage },
			};
		} catch (error) {
			return {
				ok: false,
				reason: error instanceof Error ? error.message : String(error),
				retryable: false,
			};
		}
	} catch (error) {
		const aborted = error instanceof Error && error.name === "AbortError";

		return {
			ok: false,
			reason: aborted
				? `Timed out after ${timeoutMs}ms.`
				: error instanceof Error
					? error.message
					: String(error),
			retryable: true,
		};
	} finally {
		clearTimeout(timer);
	}
}

function refusal(status: number): JevOutcome<JevVerdict> {
	if (status === 401) {
		return { ok: false, reason: "Rejected key.", retryable: false };
	}

	return {
		ok: false,
		reason: `HTTP ${status}`,
		retryable: status === 429 || status >= 500,
	};
}

function pause(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
