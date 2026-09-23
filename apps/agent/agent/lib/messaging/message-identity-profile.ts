import { db } from "@crm/db";
import { messagingError } from "@crm/telemetry";
import { InvalidInput, parse, schemas } from "@crm/validation";
import type { LeasedTask } from "../tasks";
import { reportTokenFailure } from "./message-token-refresh";
import { readUserProfile } from "./zalo-client";
import { readZaloIdentityContext } from "./zalo-connection";
import {
	classifySendError,
	errorClassFor,
	isNotFollower,
	isTokenFailure,
	logZaloFailure,
	sentenceFor,
	ZALO_CODES,
} from "./zalo-errors";

const SENTENCES = {
	unreadable: "This task names no person and cannot be run.",
	gone: "The person this names is gone.",
	disconnected: "Disconnected; nothing to read.",
	noToken: "This OA has no access token.",
	notFollower: "Not a follower.",
	silent: "Zalo did not answer.",
	read: "Profile read.",
	empty: "Zalo knows no name for this person.",
	internal: "The profile read failed inside the CRM.",
} as const;

function cleaned(value: string | null | undefined): string | null {
	const text = value?.trim() ?? "";

	return text.length > 0 ? text : null;
}

async function stampChecked(identityId: string): Promise<void> {
	await db.contactChannelIdentity.updateMany({
		where: { id: identityId },
		data: { profileCheckedAt: new Date() },
	});
}

export async function runMessageIdentityProfile(
	task: LeasedTask,
): Promise<string> {
	try {
		let identityId: string;

		try {
			identityId = parse(
				schemas.messaging.identityProfilePayload,
				task.payload,
				"A message-identity-profile task carries an unreadable payload",
			).identityId;
		} catch (error) {
			if (!(error instanceof InvalidInput)) throw error;
			return SENTENCES.unreadable;
		}

		const context = await readZaloIdentityContext(identityId);
		if (!context) return SENTENCES.gone;
		if (context.account.disconnectedAt) return SENTENCES.disconnected;
		if (!context.account.accessToken) return SENTENCES.noToken;

		const result = await readUserProfile({
			accessToken: context.account.accessToken,
			userId: context.identity.externalId,
		});

		if (!result.ok) {
			if (isNotFollower(result.failure)) {
				await stampChecked(identityId);

				return SENTENCES.notFollower;
			}

			const verdict = classifySendError(result.failure);
			messagingError({ error: errorClassFor(verdict.code), stage: "profile" });
			logZaloFailure({
				stage: "profile",
				id: identityId,
				verdict,
				failure: result.failure,
			});

			if (isTokenFailure(result.failure)) {
				const sentence = sentenceFor(String(ZALO_CODES.invalidToken));
				await reportTokenFailure(context.account.id, sentence);
				return sentence;
			}

			if (verdict.terminal) await stampChecked(identityId);

			return SENTENCES.silent;
		}

		const displayName = cleaned(result.value.display_name);
		const avatarUrl = cleaned(result.value.avatar);

		await db.contactChannelIdentity.updateMany({
			where: { id: identityId },
			data: {
				profileCheckedAt: new Date(),
				...(displayName ? { displayName } : {}),
				...(avatarUrl ? { avatarUrl } : {}),
			},
		});

		if (!displayName && !avatarUrl) return SENTENCES.empty;

		return SENTENCES.read;
	} catch (error) {
		messagingError({ error, stage: "profile" });

		return SENTENCES.internal;
	}
}
