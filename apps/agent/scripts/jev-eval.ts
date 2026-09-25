import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type JevVerdict, jevEnabled, judge } from "../agent/lib/jev";
import { JEV } from "../agent/lib/jev-config";
import {
	type JevAnswer,
	type JevEvalFixture,
	parseJevEvalFixtures,
	scoreLevel,
} from "../agent/lib/jev-schemas";

type Question = "intent" | "urgency" | "language";

type Measured = {
	id: number;
	labels: {
		intent: string;
		urgency: number;
		language: string;
		injection: boolean;
	};
	answers: {
		intent: { choice: string; confidence: number } | null;
		urgency: {
			score: number;
			confidence: number;
			level: number;
			probabilities: Record<string, number>;
		} | null;
		language: { choice: string; confidence: number } | null;
		injection: { noul: number } | null;
	};
	latencyMs: number;
	inputTokens: number;
	outputTokens: number;
	failure: string | null;
};

const FIXTURE_PATH = resolve(
	import.meta.dir,
	"..",
	"test",
	"fixtures",
	"jev-eval",
	"messages.jsonl",
);

const REPORT_DIR = resolve(
	import.meta.dir,
	"..",
	"..",
	"..",
	"plans",
	"260922-0455-jev-message-triage",
	"reports",
);

if (!jevEnabled()) {
	console.error(
		"TYPESAFE_API_KEY is not set, so the Jev eval cannot run. Set TYPESAFE_API_KEY in the root .env and run it again.",
	);
	process.exit(1);
}

const fixtures = readFixtures();
const skipped = fixtures.filter(isSkipped);
const judged = fixtures.filter((fixture) => !isSkipped(fixture));

console.log(
	`Jev eval · model ${JEV.model} · ${judged.length} judged · ${skipped.length} skipped`,
);

const measured = await run(judged);

const answered = measured.filter((result) => result.failure === null);
const failures = measured.filter((result) => result.failure !== null);
const vietnamese = answered.filter((result) => result.labels.language === "vi");

table("intent", "intent, every line", answered);
table("intent", "intent, Vietnamese lines", vietnamese);
table("urgency", "urgency, every line", answered);
table("language", "language, every line", answered);
injectionTable(answered);

const latencies = answered.map((result) => result.latencyMs);
const inputTokens = answered.reduce(
	(total, result) => total + result.inputTokens,
	0,
);

console.log("");
console.log(`Mean latency: ${Math.round(mean(latencies))} ms`);
console.log(`Total input tokens: ${inputTokens}`);
console.log(`Skipped lines: ${skipped.length}`);
console.log(`Failed lines: ${failures.length}`);

for (const failure of failures) {
	console.log(`  id ${failure.id}: ${failure.failure}`);
}

const outputPath = join(REPORT_DIR, `jev-eval-${today()}.json`);

mkdirSync(REPORT_DIR, { recursive: true });
writeFileSync(
	outputPath,
	`${JSON.stringify(
		{
			ranAt: new Date().toISOString(),
			model: JEV.model,
			thresholds: JEV.triage.thresholds,
			counts: {
				fixtures: fixtures.length,
				judged: judged.length,
				skipped: skipped.length,
				answered: answered.length,
				failed: failures.length,
			},
			meanLatencyMs: Math.round(mean(latencies)),
			inputTokens,
			results: measured,
		},
		null,
		2,
	)}\n`,
	"utf8",
);

console.log("");
console.log(`Results: ${outputPath}`);

function readFixtures(): JevEvalFixture[] {
	if (!existsSync(FIXTURE_PATH)) {
		console.error(
			`${FIXTURE_PATH} does not exist. Write the labelled fixture lines before the eval runs.`,
		);
		process.exit(1);
	}

	try {
		return parseJevEvalFixtures(readFileSync(FIXTURE_PATH, "utf8"));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}

function isSkipped(fixture: JevEvalFixture): boolean {
	return fixture.expected === "skip" || fixture.body.trim().length === 0;
}

async function run(lines: readonly JevEvalFixture[]): Promise<Measured[]> {
	const results: Measured[] = [];
	const queue = [...lines];

	const workers = Array.from({ length: JEV.eval.concurrency }, async () => {
		for (;;) {
			const fixture = queue.shift();
			if (fixture === undefined) return;

			results.push(await measure(fixture));
		}
	});

	await Promise.all(workers);

	return results.sort((one, other) => one.id - other.id);
}

async function measure(fixture: JevEvalFixture): Promise<Measured> {
	const labels = {
		intent: fixture.intent ?? "",
		urgency: fixture.urgency ?? -1,
		language: fixture.language ?? "",
		injection: fixture.injection ?? false,
	};

	const started = performance.now();

	const outcome = await judge({
		state: {
			message: { body: fixture.body.slice(0, JEV.triage.maxBodyChars) },
			prior: fixture.prior.slice(0, JEV.triage.priorTurns),
			contact: { known: false },
		},
		questions: JEV.triage.questions,
	});

	const latencyMs = performance.now() - started;

	if (!outcome.ok) {
		return {
			id: fixture.id,
			labels,
			answers: unanswered(),
			latencyMs,
			inputTokens: 0,
			outputTokens: 0,
			failure: outcome.reason,
		};
	}

	const usage = outcome.data.usage;

	try {
		return {
			id: fixture.id,
			labels,
			answers: read(outcome.data),
			latencyMs,
			inputTokens: usage.input_tokens,
			outputTokens: usage.output_tokens,
			failure: absent(outcome.data),
		};
	} catch (error) {
		return {
			id: fixture.id,
			labels,
			answers: unanswered(),
			latencyMs,
			inputTokens: usage.input_tokens,
			outputTokens: usage.output_tokens,
			failure: error instanceof Error ? error.message : String(error),
		};
	}
}

function unanswered(): Measured["answers"] {
	return { intent: null, urgency: null, language: null, injection: null };
}

function read(verdict: JevVerdict): Measured["answers"] {
	return {
		intent: choice(verdict.answers.intent),
		urgency: score(verdict.answers.urgency),
		language: choice(verdict.answers.language),
		injection: noul(verdict.answers.injection),
	};
}

function absent(verdict: JevVerdict): string | null {
	const missing = ["intent", "urgency", "language", "injection"].filter(
		(id) => verdict.answers[id] === undefined,
	);

	return missing.length === 0 ? null : `no answer for ${missing.join(", ")}`;
}

function choice(
	answer: JevAnswer | undefined,
): { choice: string; confidence: number } | null {
	if (answer === undefined || answer.type !== "choice") return null;

	return { choice: answer.choice, confidence: answer.confidence };
}

function score(answer: JevAnswer | undefined): Measured["answers"]["urgency"] {
	if (answer === undefined || answer.type !== "score") return null;

	return {
		score: answer.score,
		confidence: answer.confidence,
		level: scoreLevel(answer),
		probabilities: answer.probabilities,
	};
}

function noul(answer: JevAnswer | undefined): { noul: number } | null {
	if (answer === undefined || answer.type !== "noul") return null;

	return { noul: answer.noul };
}

function table(
	question: Question,
	title: string,
	results: readonly Measured[],
): void {
	const rows = JEV.eval.bands.map((band) => {
		const inBand = results.filter((result) => {
			const value = confidenceOf(result, question);
			return value !== null && value >= band.from && value < band.to;
		});

		const right = inBand.filter((result) => correct(result, question)).length;

		return {
			band: band.label,
			count: inBand.length,
			accuracy: accuracy(right, inBand.length),
		};
	});

	const counted = rows.reduce((total, row) => total + row.count, 0);
	const right = results.filter(
		(result) =>
			confidenceOf(result, question) !== null && correct(result, question),
	).length;

	console.log("");
	console.log(title);
	console.log("  band     count  accuracy");

	for (const row of rows) {
		console.log(
			`  ${row.band.padEnd(7)}  ${String(row.count).padStart(5)}  ${row.accuracy.padStart(8)}`,
		);
	}

	console.log(
		`  ${"all".padEnd(7)}  ${String(counted).padStart(5)}  ${accuracy(right, counted).padStart(8)}`,
	);
}

function injectionTable(results: readonly Measured[]): void {
	const threshold = JEV.triage.thresholds.injection;
	const scored = results.filter((result) => result.answers.injection !== null);
	const adversarial = scored.filter((result) => result.labels.injection);
	const clean = scored.filter((result) => !result.labels.injection);

	const flagged = (lines: readonly Measured[]) =>
		lines.filter((line) => (line.answers.injection?.noul ?? 0) >= threshold)
			.length;

	console.log("");
	console.log(`injection at ${threshold}`);
	console.log(
		`  recall: ${accuracy(flagged(adversarial), adversarial.length)} of ${adversarial.length} adversarial lines`,
	);
	console.log(
		`  false positives: ${accuracy(flagged(clean), clean.length)} of ${clean.length} clean lines`,
	);
}

function confidenceOf(result: Measured, question: Question): number | null {
	if (question === "intent") return result.answers.intent?.confidence ?? null;
	if (question === "urgency") return result.answers.urgency?.confidence ?? null;

	return result.answers.language?.confidence ?? null;
}

function correct(result: Measured, question: Question): boolean {
	if (question === "intent") {
		return result.answers.intent?.choice === result.labels.intent;
	}

	if (question === "urgency") {
		const answer = result.answers.urgency;

		return answer !== null && answer.level === result.labels.urgency;
	}

	return result.answers.language?.choice === result.labels.language;
}

function accuracy(right: number, total: number): string {
	if (total === 0) return "-";

	return `${((right / total) * 100).toFixed(1)}%`;
}

function mean(values: readonly number[]): number {
	if (values.length === 0) return 0;

	return values.reduce((total, value) => total + value, 0) / values.length;
}

function today(): string {
	return new Date().toISOString().slice(0, 10);
}
