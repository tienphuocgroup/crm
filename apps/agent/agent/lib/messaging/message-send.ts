import { db } from "@crm/db";
import { eligibility } from "@crm/db/messaging";
import { messagingError, permittedErrorClass } from "@crm/telemetry";
import { InvalidInput, parse, schemas } from "@crm/validation";
import type { LeasedTask } from "../tasks";
import { reportTokenFailure } from "./message-token-refresh";
import { MESSAGING } from "./messaging-config";
import { sendText, type ZaloResult, type ZaloSentMessage } from "./zalo-client";
import {
	readZaloAccountToken,
	readZaloSendContext,
	type ZaloSendContext,
} from "./zalo-connection";
import {
	classifySendError,
	errorClassFor,
	INTERRUPTED_CODE,
	isTokenFailure,
	logZaloFailure,
	sentenceFor,
	ZALO_CODES,
} from "./zalo-errors";

const SENTENCES = {
	unreadable: "This task names no message and cannot be sent.",
	gone: "The message this names is gone.",
	claimed: "Already claimed.",
	empty: "This reply has no text to send.",
	internal: "The send failed inside the CRM.",
	sent: "Sent.",
	sentUnmatched: "Sent; receipt matching is off for this message.",
} as const;

const ERROR_CODES = {
	ineligible: "ineligible",
	network: "network",
	internal: "internal",
	empty: "empty",
	token: "token",
	interrupted: INTERRUPTED_CODE,
} as const;

async function fail(
	messageId: string,
	errorCode: string,
	errorMessage: string,
): Promise<void> {
	await db.message.updateMany({
		where: { id: messageId, status: { in: ["QUEUED", "SENDING"] } },
		data: {
			status: "FAILED",
			failedAt: new Date(),
			errorCode,
			errorMessage,
		},
	});
}

async function settleSent(
	context: ZaloSendContext,
	externalId: string,
	now: Date,
): Promise<void> {
	await db.$transaction(async (tx) => {
		const receipts = await tx.messageReceipt.findMany({
			where: { accountId: context.account.id, externalId },
			select: { kind: true, at: true },
		});

		const delivered = receipts.find((row) => row.kind === "delivered");
		const seen = receipts.find((row) => row.kind === "seen");

		await tx.message.updateMany({
			where: { id: context.message.id, status: "SENDING" },
			data: {
				status: seen ? "READ" : delivered ? "DELIVERED" : "SENT",
				sentAt: now,
				externalId,
				deliveredAt: delivered?.at,
				readAt: seen?.at,
			},
		});

		if (receipts.length > 0) {
			await tx.messageReceipt.deleteMany({
				where: { accountId: context.account.id, externalId },
			});
		}

		await tx.messageThread.updateMany({
			where: {
				id: context.thread.id,
				OR: [{ lastOutboundAt: null }, { lastOutboundAt: { lt: now } }],
			},
			data: { lastOutboundAt: now, lastMessageAt: now },
		});

		await tx.messagingAccount.updateMany({
			where: {
				id: context.account.id,
				OR: [{ lastOutboundAt: null }, { lastOutboundAt: { lt: now } }],
			},
			data: { lastOutboundAt: now },
		});
	});
}

async function sweepReceipts(accountId: string): Promise<void> {
	try {
		await db.messageReceipt.deleteMany({
			where: {
				accountId,
				at: { lt: new Date(Date.now() - MESSAGING.receipts.staleAfterMs) },
			},
		});
	} catch {
		return;
	}
}

async function vendorFailure(
	context: ZaloSendContext,
	result: Extract<ZaloResult<ZaloSentMessage>, { ok: false }>,
): Promise<string> {
	const verdict = classifySendError(result.failure);
	const silent =
		result.failure.reason === "network" || result.failure.reason === "timeout";
	const code = silent ? ERROR_CODES.network : verdict.code;
	const sentence = sentenceFor(verdict.code);

	messagingError({ error: errorClassFor(verdict.code), stage: "send" });
	logZaloFailure({
		stage: "send",
		id: context.message.id,
		verdict,
		failure: result.failure,
	});

	await fail(context.message.id, code, sentence);

	if (isTokenFailure(result.failure)) {
		await reportTokenFailure(context.account.id, sentence);
	}

	return sentence;
}

async function send(context: ZaloSendContext, body: string): Promise<string> {
	const token = context.account.accessToken;

	if (!token) return missingToken(context);

	const first = await attempt(context, body, token);

	if (first.ok) return settle(context, first.value.message_id);

	if (!isTokenFailure(first.failure)) return vendorFailure(context, first);

	const refreshed = await refreshedToken(context);

	if (!refreshed) return vendorFailure(context, first);

	const second = await attempt(context, body, refreshed);

	if (second.ok) return settle(context, second.value.message_id);

	return vendorFailure(context, second);
}

async function refreshedToken(
	context: ZaloSendContext,
): Promise<string | null> {
	const fresh = await readZaloAccountToken(context.account.id);

	if (!fresh?.accessToken || !fresh.tokenRefreshedAt) return null;

	const before = context.account.tokenRefreshedAt?.getTime() ?? 0;

	return fresh.tokenRefreshedAt.getTime() === before ? null : fresh.accessToken;
}

async function missingToken(context: ZaloSendContext): Promise<string> {
	const sentence = sentenceFor(String(ZALO_CODES.invalidToken));

	messagingError({ error: errorClassFor("no-token"), stage: "send" });
	await fail(context.message.id, ERROR_CODES.token, sentence);
	await reportTokenFailure(context.account.id, sentence);

	return sentence;
}

async function settle(
	context: ZaloSendContext,
	externalId: string,
): Promise<string> {
	const now = new Date();

	try {
		await settleSent(context, externalId, now);

		return SENTENCES.sent;
	} catch (error) {
		console.error("[agent] a delivered Zalo message kept no vendor id", {
			messageId: context.message.id,
			errorClass: permittedErrorClass(error),
		});

		await db.message
			.updateMany({
				where: { id: context.message.id, status: "SENDING" },
				data: { status: "SENT", sentAt: now },
			})
			.catch(() => {});

		return SENTENCES.sentUnmatched;
	}
}

async function claimed(
	context: ZaloSendContext,
	task: LeasedTask,
): Promise<string> {
	if (context.message.status !== "SENDING" || task.attempts <= 1) {
		return SENTENCES.claimed;
	}

	const sentence = sentenceFor(INTERRUPTED_CODE);

	await fail(context.message.id, ERROR_CODES.interrupted, sentence);

	return sentence;
}

function attempt(
	context: ZaloSendContext,
	body: string,
	accessToken: string,
): Promise<ZaloResult<ZaloSentMessage>> {
	return sendText({
		accessToken,
		userId: context.identity.externalId,
		body,
	});
}

export async function runMessageSend(task: LeasedTask): Promise<string> {
	let messageId: string | null = null;

	try {
		try {
			messageId = parse(
				schemas.messaging.sendPayload,
				task.payload,
				"A message-send task carries an unreadable payload",
			).messageId;
		} catch (error) {
			if (!(error instanceof InvalidInput)) throw error;
			return SENTENCES.unreadable;
		}

		const context = await readZaloSendContext(messageId);
		if (!context) return SENTENCES.gone;

		const claim = await db.message.updateMany({
			where: { id: messageId, status: "QUEUED" },
			data: { status: "SENDING" },
		});

		if (claim.count === 0) return claimed(context, task);

		const body = context.message.body?.trim() ?? "";

		if (body.length === 0) {
			await fail(messageId, ERROR_CODES.empty, SENTENCES.empty);
			return SENTENCES.empty;
		}

		const verdict = eligibility({
			now: new Date(),
			lastInboundAt: context.thread.lastInboundAt,
			accountDisconnectedAt: context.account.disconnectedAt,
			accountTokenError: context.account.tokenError,
		});

		if (verdict.mode === "blocked") {
			await fail(messageId, ERROR_CODES.ineligible, verdict.reason);
			return verdict.reason;
		}

		const outcome = await send(context, body);

		await sweepReceipts(context.account.id);

		return outcome;
	} catch (error) {
		messagingError({ error, stage: "send" });

		if (messageId) {
			await fail(messageId, ERROR_CODES.internal, SENTENCES.internal).catch(
				() => {},
			);
		}

		return SENTENCES.internal;
	}
}
