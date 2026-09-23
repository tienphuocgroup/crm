import { PRIORITY } from "@crm/db/agent-tasks";
import { messagingError } from "@crm/telemetry";
import { InvalidInput, parse, schemas } from "@crm/validation";
import { type LeasedTask, scheduleTask } from "../tasks";
import { MESSAGING } from "./messaging-config";
import { refreshAccessToken } from "./zalo-client";
import {
	readZaloAccount,
	writeRefreshedTokens,
	writeTokenError,
	zaloCredentials,
} from "./zalo-connection";
import {
	classifyRefreshError,
	errorClassFor,
	logZaloFailure,
	sentenceFor,
} from "./zalo-errors";

const REASON = "Keep the Zalo token fresh.";

async function book(input: {
	accountId: string;
	dueAt: Date;
	attempt: number;
	exceptId?: string;
}): Promise<void> {
	await scheduleTask({
		kind: "message-token-refresh",
		reason: REASON,
		payload: { accountId: input.accountId, attempt: input.attempt },
		subject: { path: ["accountId"], value: input.accountId },
		...(input.exceptId ? { exceptId: input.exceptId } : {}),
		dueAt: input.dueAt,
		priority: PRIORITY.messageToken,
		budget: 1,
	});
}

async function rebook(
	task: LeasedTask,
	accountId: string,
	dueAt: Date,
	attempt: number,
): Promise<void> {
	await book({ accountId, dueAt, attempt, exceptId: task.id });
}

export async function reportTokenFailure(
	accountId: string,
	sentence: string,
): Promise<void> {
	await writeTokenError({ accountId, sentence });
	await book({ accountId, dueAt: new Date(), attempt: 0 });
}

function backoffMs(attempt: number): number {
	const steps = MESSAGING.zalo.transientRetryMs;
	const index = Math.min(Math.max(attempt, 0), steps.length - 1);

	return steps[index] ?? steps[steps.length - 1] ?? 0;
}

export async function runMessageTokenRefresh(
	task: LeasedTask,
): Promise<string> {
	let accountId: string;
	let attempt: number;
	try {
		const payload = parse(
			schemas.messaging.tokenRefreshPayload,
			task.payload,
			"A message-token-refresh task carries an unreadable payload",
		);
		accountId = payload.accountId;
		attempt = payload.attempt;
	} catch (error) {
		if (!(error instanceof InvalidInput)) throw error;
		return "This task names no account and cannot be run.";
	}

	const account = await readZaloAccount(accountId);
	if (!account) return "The account this names is gone.";
	if (account.disconnectedAt) return "Disconnected; nothing to refresh.";

	const credentials = zaloCredentials();
	if (!credentials) return "Zalo is not configured on this install.";
	if (!account.refreshToken) return "This OA has no refresh token.";

	const now = new Date();
	const dueAt = account.tokenExpiresAt
		? new Date(account.tokenExpiresAt.getTime() - MESSAGING.zalo.refreshAheadMs)
		: now;
	const due = account.tokenError !== null || dueAt.getTime() <= now.getTime();

	if (!due) {
		await rebook(task, accountId, dueAt, 0);
		return "Not due.";
	}

	const result = await refreshAccessToken({
		refreshToken: account.refreshToken,
		credentials,
	});

	if (result.ok) {
		const written = await writeRefreshedTokens({
			accountId,
			accessToken: result.value.access_token,
			refreshToken: result.value.refresh_token,
			expiresInSeconds: result.value.expires_in,
			now,
		});

		if (!written) return "Disconnected during refresh.";

		await rebook(
			task,
			accountId,
			new Date(now.getTime() + MESSAGING.zalo.refreshEveryMs),
			0,
		);
		return "Token refreshed.";
	}

	const verdict = classifyRefreshError(result.failure);

	messagingError({ error: errorClassFor(verdict.code), stage: "token" });
	logZaloFailure({
		stage: "token",
		id: accountId,
		verdict,
		failure: result.failure,
	});

	if (verdict.terminal) {
		const sentence = sentenceFor(verdict.code);
		await writeTokenError({ accountId, sentence });
		return sentence;
	}

	const expired =
		account.tokenExpiresAt !== null &&
		account.tokenExpiresAt.getTime() <= now.getTime();

	if (expired) {
		await writeTokenError({ accountId, sentence: sentenceFor("network") });
	}

	await rebook(
		task,
		accountId,
		new Date(now.getTime() + backoffMs(attempt)),
		attempt + 1,
	);
	return "Refresh retried later.";
}
