import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { jevEnabled, judge } from "../agent/lib/jev";
import { JEV } from "../agent/lib/jev-config";

const realFetch = globalThis.fetch;
const savedKey = process.env.TYPESAFE_API_KEY;

const SECRET = "Xin chao, dat lich kham SECRET-BODY-TOKEN";

let calls = 0;
let seenUrls: string[] = [];
let seenBodies: string[] = [];
let seenHeaders: Record<string, string>[] = [];
let seenSignals: (AbortSignal | null | undefined)[] = [];

const request = {
	state: {
		message: { body: SECRET },
		prior: [],
		contact: { known: false },
	},
	questions: JEV.triage.questions,
};

function record(input: URL | RequestInfo, init?: RequestInit): void {
	calls += 1;
	seenUrls.push(String(input instanceof Request ? input.url : input));
	seenBodies.push(String(init?.body ?? ""));
	seenHeaders.push((init?.headers ?? {}) as Record<string, string>);
	seenSignals.push(init?.signal);
}

function answers(payload: unknown, status = 200) {
	globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
		record(input, init);

		return new Response(JSON.stringify(payload), {
			status,
			headers: { "content-type": "application/json" },
		});
	}) as typeof fetch;
}

function statuses(...codes: number[]) {
	globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
		const code = codes[calls] ?? codes[codes.length - 1] ?? 500;
		record(input, init);

		if (code === 200) {
			return new Response(JSON.stringify(verdict()), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}

		return new Response("<html>rate limited</html>", {
			status: code,
			headers: { "content-type": "text/html" },
		});
	}) as typeof fetch;
}

function hangs() {
	globalThis.fetch = ((input: URL | RequestInfo, init?: RequestInit) => {
		record(input, init);

		return new Promise<Response>((_resolve, reject) => {
			init?.signal?.addEventListener("abort", () => {
				reject(
					Object.assign(new Error("The operation was aborted."), {
						name: "AbortError",
					}),
				);
			});
		});
	}) as typeof fetch;
}

function refuses() {
	globalThis.fetch = (async () => {
		calls += 1;
		throw new Error("fetch must not run");
	}) as typeof fetch;
}

function verdict() {
	return {
		model: JEV.model,
		answers: {
			intent: {
				type: "choice",
				choice: "booking",
				confidence: 0.92,
				probabilities: { booking: 0.95, question: 0.03 },
			},
			urgency: {
				type: "score",
				score: 0.42,
				confidence: 0.58,
				legend: {
					"0": "The customer asks for no answer at a set time.",
					"1": "The customer asks for an answer today.",
					"2": "The customer asks for an answer now.",
					"3": "The customer is in distress.",
				},
				probabilities: { "0": 0.66, "1": 0.28, "2": 0.04, "3": 0.02 },
			},
			language: { type: "choice", choice: "vi", confidence: 0.99 },
			injection: { type: "noul", noul: 0.02 },
		},
		usage: { input_tokens: 412, output_tokens: 0 },
	};
}

beforeEach(() => {
	calls = 0;
	seenUrls = [];
	seenBodies = [];
	seenHeaders = [];
	seenSignals = [];
	process.env.TYPESAFE_API_KEY = "ts-test-key";
});

afterEach(() => {
	globalThis.fetch = realFetch;

	if (savedKey === undefined) delete process.env.TYPESAFE_API_KEY;
	else process.env.TYPESAFE_API_KEY = savedKey;
});

describe("the Jev client", () => {
	it("reads the key live, so a late-configured process is not stuck off", () => {
		expect(jevEnabled()).toBe(true);

		process.env.TYPESAFE_API_KEY = "   ";
		expect(jevEnabled()).toBe(false);

		delete process.env.TYPESAFE_API_KEY;
		expect(jevEnabled()).toBe(false);
	});

	it("parses the answers of a 200 and keeps the pinned model in the request", async () => {
		answers(verdict());

		const outcome = await judge(request, { backoffMs: 1 });

		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;

		expect(outcome.data.answers.intent).toEqual({
			type: "choice",
			choice: "booking",
			confidence: 0.92,
			probabilities: { booking: 0.95, question: 0.03 },
		});
		expect(outcome.data.answers.urgency).toEqual(verdict().answers.urgency);
		expect(outcome.data.answers.injection).toEqual({
			type: "noul",
			noul: 0.02,
		});
		expect(outcome.data.usage.input_tokens).toBe(412);

		expect(calls).toBe(1);
		expect(seenUrls[0]).toBe(JEV.endpoint);
		expect(seenHeaders[0]?.authorization).toBe("Bearer ts-test-key");
		expect(JSON.parse(seenBodies[0] ?? "{}").model).toBe("jev-1.13.0");
		expect(seenSignals[0]).toBeInstanceOf(AbortSignal);
	});

	it("short-circuits a missing key before any request", async () => {
		delete process.env.TYPESAFE_API_KEY;
		refuses();

		const outcome = await judge(request, { backoffMs: 1 });

		expect(outcome.ok).toBe(false);
		if (outcome.ok) return;

		expect(outcome.reason).toContain("not configured");
		expect(outcome.retryable).toBe(false);
		expect(calls).toBe(0);
	});

	it("treats a rejected key as final and asks once", async () => {
		statuses(401);

		const outcome = await judge(request, { backoffMs: 1 });

		expect(outcome).toEqual({
			ok: false,
			reason: "Rejected key.",
			retryable: false,
		});
		expect(calls).toBe(1);
	});

	it("treats a 422 as final and never repeats the body", async () => {
		statuses(422);

		const outcome = await judge(request, { backoffMs: 1 });

		expect(outcome).toEqual({
			ok: false,
			reason: "HTTP 422",
			retryable: false,
		});
		expect(calls).toBe(1);
	});

	it("retries a 429 once and succeeds", async () => {
		statuses(429, 200);

		const outcome = await judge(request, { backoffMs: 1 });

		expect(outcome.ok).toBe(true);
		expect(calls).toBe(2);
	});

	it("retries a 529 once and succeeds", async () => {
		statuses(529, 200);

		const outcome = await judge(request, { backoffMs: 1 });

		expect(outcome.ok).toBe(true);
		expect(calls).toBe(2);
	});

	it("gives up after two 429s and leaves the retry to the caller", async () => {
		statuses(429, 429);

		const outcome = await judge(request, { backoffMs: 1 });

		expect(outcome).toEqual({
			ok: false,
			reason: "HTTP 429",
			retryable: true,
		});
		expect(calls).toBe(2);
	});

	it("aborts at the timeout and reports a retryable failure", async () => {
		hangs();

		const outcome = await judge(request, { timeoutMs: 5, backoffMs: 1 });

		expect(outcome).toEqual({
			ok: false,
			reason: "Timed out after 5ms.",
			retryable: true,
		});
		expect(calls).toBe(2);
	});

	it("retries a network error once, then reports it as retryable", async () => {
		globalThis.fetch = (async () => {
			calls += 1;
			throw new Error("connect ECONNREFUSED");
		}) as typeof fetch;

		const outcome = await judge(request, { backoffMs: 1 });

		expect(outcome).toEqual({
			ok: false,
			reason: "connect ECONNREFUSED",
			retryable: true,
		});
		expect(calls).toBe(2);
	});

	it("treats an unreadable answer as final and names the question", async () => {
		answers({
			model: JEV.model,
			answers: { intent: { type: "choice", choice: "booking" } },
			usage: { input_tokens: 10, output_tokens: 0 },
		});

		const outcome = await judge(request, { backoffMs: 1 });

		expect(outcome.ok).toBe(false);
		if (outcome.ok) return;

		expect(outcome.reason).toContain('question "intent"');
		expect(outcome.retryable).toBe(false);
		expect(calls).toBe(1);
	});

	it("treats an answer that is not JSON as final", async () => {
		globalThis.fetch = (async (
			input: URL | RequestInfo,
			init?: RequestInit,
		) => {
			record(input, init);

			return new Response("not json at all", { status: 200 });
		}) as typeof fetch;

		const outcome = await judge(request, { backoffMs: 1 });

		expect(outcome).toEqual({
			ok: false,
			reason: "The answer is not JSON.",
			retryable: false,
		});
		expect(calls).toBe(1);
	});

	it("never throws when the state does not encode as JSON", async () => {
		const circular: Record<string, unknown> = {};
		circular.self = circular;
		refuses();

		const outcome = await judge(
			{ state: circular, questions: JEV.triage.questions },
			{ backoffMs: 1 },
		);

		expect(outcome.ok).toBe(false);
		if (outcome.ok) return;

		expect(outcome.retryable).toBe(false);
		expect(calls).toBe(0);
	});

	it("writes no log line at all, so the message text cannot leak", async () => {
		const log = spyOn(console, "log").mockImplementation(() => {});
		const error = spyOn(console, "error").mockImplementation(() => {});
		const warn = spyOn(console, "warn").mockImplementation(() => {});

		statuses(429, 422);
		const failed = await judge(request, { backoffMs: 1 });

		answers(verdict());
		const passed = await judge(request, { backoffMs: 1 });

		const written = [log.mock.calls, error.mock.calls, warn.mock.calls]
			.flat(2)
			.map(String)
			.join(" ");

		expect(written).not.toContain("SECRET-BODY-TOKEN");
		expect(written).toBe("");

		expect(failed.ok).toBe(false);
		if (!failed.ok) expect(failed.reason).not.toContain("SECRET-BODY-TOKEN");
		expect(passed.ok).toBe(true);

		log.mockRestore();
		error.mockRestore();
		warn.mockRestore();
	});
});
