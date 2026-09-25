import { z } from "zod";

const criteriaByLabel = z.record(z.string(), z.string()).readonly();

export const jevQuestion = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("noul"),
		instructions: z.string().min(1),
		criteria: criteriaByLabel,
	}),
	z.object({
		type: z.literal("choice"),
		instructions: z.string().min(1),
		criteria: criteriaByLabel,
	}),
	z.object({
		type: z.literal("score"),
		instructions: z.string().min(1),
		criteria: z.array(z.string().min(1)).min(2).max(10).readonly(),
	}),
]);

export const jevQuestions = z.record(z.string(), jevQuestion).readonly();

export const jevNoulAnswer = z.object({
	type: z.literal("noul"),
	noul: z.number().min(0).max(1),
});

const probabilityByLevel = z.record(z.string(), z.number().min(0).max(1));

export const jevChoiceAnswer = z.object({
	type: z.literal("choice"),
	choice: z.string().min(1),
	confidence: z.number().min(0).max(1),
	probabilities: probabilityByLevel.optional(),
});

export const jevScoreAnswer = z.object({
	type: z.literal("score"),
	score: z.number(),
	confidence: z.number().min(0).max(1),
	legend: z.record(z.string(), z.string()),
	probabilities: probabilityByLevel,
});

export const jevAnswer = z.discriminatedUnion("type", [
	jevNoulAnswer,
	jevChoiceAnswer,
	jevScoreAnswer,
]);

export const jevAnswers = z.record(z.string(), jevAnswer);

export const jevUsage = z.object({
	input_tokens: z.number().int().min(0),
	output_tokens: z.number().int().min(0),
});

export const jevResponse = z.object({
	model: z.string().min(1),
	answers: jevAnswers,
	usage: jevUsage,
});

export type JevQuestion = z.infer<typeof jevQuestion>;
export type JevQuestions = z.infer<typeof jevQuestions>;
export type JevAnswer = z.infer<typeof jevAnswer>;
export type JevScoreAnswer = z.infer<typeof jevScoreAnswer>;
export type JevAnswers = z.infer<typeof jevAnswers>;
export type JevUsage = z.infer<typeof jevUsage>;
export type JevResponse = z.infer<typeof jevResponse>;

export class InvalidJevResponse extends Error {
	constructor(readonly issues: string) {
		super(`Jev's response is unreadable: ${issues}`);
		this.name = "InvalidJevResponse";
	}
}

export function parseAnswers(value: unknown): JevAnswers {
	const parsed = jevAnswers.safeParse(value);
	if (parsed.success) return parsed.data;

	throw new InvalidJevResponse(byQuestion(parsed.error));
}

export function parseJevResponse(value: unknown): JevResponse {
	const parsed = jevResponse.safeParse(value);
	if (parsed.success) return parsed.data;

	throw new InvalidJevResponse(byQuestion(parsed.error));
}

export function scoreLevel(answer: JevScoreAnswer): number {
	let best: { level: number; probability: number } | null = null;

	for (const [key, probability] of Object.entries(answer.probabilities)) {
		if (!/^\d+$/.test(key)) {
			throw new InvalidJevResponse(
				`a score answer names the level "${key}", which is not a whole number`,
			);
		}

		const level = Number(key);

		const wins =
			best === null ||
			probability > best.probability ||
			(probability === best.probability && level < best.level);

		if (wins) best = { level, probability };
	}

	if (best === null) {
		throw new InvalidJevResponse(
			"a score answer carries no probability, so it names no level",
		);
	}

	return best.level;
}

const intentLabel = z.enum([
	"booking",
	"question",
	"complaint",
	"pricing",
	"spam",
	"other",
]);

const urgencyLabel = z.union([
	z.literal(0),
	z.literal(1),
	z.literal(2),
	z.literal(3),
]);

const languageLabel = z.enum(["vi", "en", "other"]);

export const jevEvalFixture = z
	.object({
		id: z.number().int().min(1),
		body: z.string(),
		prior: z.array(z.string()).default([]),
		expected: z.enum(["verdict", "skip"]),
		intent: intentLabel.optional(),
		urgency: urgencyLabel.optional(),
		language: languageLabel.optional(),
		injection: z.boolean().optional(),
	})
	.superRefine((fixture, context) => {
		const labels = ["intent", "urgency", "language", "injection"] as const;

		if (fixture.expected === "verdict") {
			if (fixture.body.trim().length === 0) {
				context.addIssue({
					code: "custom",
					path: ["body"],
					message:
						"a verdict line needs a body, because the eval skips a blank one",
				});
			}

			for (const label of labels) {
				if (fixture[label] === undefined) {
					context.addIssue({
						code: "custom",
						path: [label],
						message: "a verdict line needs this label",
					});
				}
			}

			return;
		}

		for (const label of labels) {
			if (fixture[label] !== undefined) {
				context.addIssue({
					code: "custom",
					path: [label],
					message: "a skip line carries no label, because it never reaches Jev",
				});
			}
		}
	});

export type JevEvalFixture = z.infer<typeof jevEvalFixture>;

export class InvalidJevFixtures extends Error {
	constructor(readonly issues: string) {
		super(`The Jev eval fixtures are unreadable: ${issues}`);
		this.name = "InvalidJevFixtures";
	}
}

export function parseJevEvalFixtures(text: string): JevEvalFixture[] {
	const fixtures: JevEvalFixture[] = [];
	const lineOfId = new Map<number, number>();

	let lineNumber = 0;

	for (const raw of text.split("\n")) {
		lineNumber += 1;

		const line = raw.trim();
		if (line.length === 0) continue;

		let value: unknown;
		try {
			value = JSON.parse(line);
		} catch {
			throw new InvalidJevFixtures(`line ${lineNumber} is not JSON`);
		}

		const parsed = jevEvalFixture.safeParse(value);
		if (!parsed.success) {
			throw new InvalidJevFixtures(
				`line ${lineNumber}: ${byPath(parsed.error)}`,
			);
		}

		const first = lineOfId.get(parsed.data.id);
		if (first !== undefined) {
			throw new InvalidJevFixtures(
				`line ${lineNumber} repeats id ${parsed.data.id} from line ${first}`,
			);
		}

		lineOfId.set(parsed.data.id, lineNumber);
		fixtures.push(parsed.data);
	}

	if (fixtures.length === 0) {
		throw new InvalidJevFixtures("the file holds no fixture line");
	}

	return fixtures;
}

function byQuestion(error: z.ZodError): string {
	return error.issues
		.map((issue) => {
			const path = issue.path.map(String);
			const inner = path[0] === "answers" ? path.slice(1) : path;
			const [id, ...rest] = inner;

			if (id === undefined) return issue.message;

			const field = rest.length > 0 ? ` (${rest.join(".")})` : "";
			return `question "${id}"${field}: ${issue.message}`;
		})
		.join("; ");
}

function byPath(error: z.ZodError): string {
	return error.issues
		.map(
			(issue) =>
				`${issue.path.map(String).join(".") || "line"} ${issue.message}`,
		)
		.join("; ");
}
