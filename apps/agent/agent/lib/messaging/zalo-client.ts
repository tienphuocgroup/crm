import { schemas } from "@crm/validation";
import type { z } from "zod";
import { MESSAGING } from "./messaging-config";
import type { ZaloFailure } from "./zalo-errors";

export type ZaloResult<Value> =
	| { ok: true; value: Value }
	| { ok: false; failure: ZaloFailure };

export type ZaloTokens = z.infer<typeof schemas.messaging.zaloTokens>;
export type ZaloOaProfile = z.infer<typeof schemas.messaging.zaloOaProfile>;
export type ZaloSentMessage = z.infer<typeof schemas.messaging.zaloSentMessage>;
export type ZaloUserProfile = z.infer<typeof schemas.messaging.zaloUserProfile>;

export type ZaloCredentials = { appId: string; appSecret: string };

type ZaloJson = z.infer<typeof schemas.messaging.zaloJson>;
type ZaloCodeFailure = Extract<ZaloFailure, { reason: "code" }>;

async function call<Value>(
	request: () => Promise<Response>,
	read: (body: ZaloJson, status: number) => ZaloResult<Value>,
): Promise<ZaloResult<Value>> {
	let response: Response;

	try {
		response = await request();
	} catch (error) {
		const timedOut =
			error instanceof Error &&
			(error.name === "AbortError" || error.name === "TimeoutError");

		return { ok: false, failure: { reason: timedOut ? "timeout" : "network" } };
	}

	let body: ZaloJson;
	try {
		body = schemas.messaging.zaloJson.parse(await response.json());
	} catch {
		return {
			ok: false,
			failure: { reason: "unparsed", status: response.status },
		};
	}

	if (response.status >= 500) {
		return { ok: false, failure: { reason: "http", status: response.status } };
	}

	const envelope = schemas.messaging.zaloErrorEnvelope.safeParse(body);
	if (envelope.success && envelope.data.error !== 0) {
		const vendorMessage = envelope.data.message?.trim();
		const failure: ZaloCodeFailure = {
			reason: "code",
			status: response.status,
			error: envelope.data.error,
		};
		if (vendorMessage) failure.vendorMessage = vendorMessage;

		return { ok: false, failure };
	}

	if (!response.ok) {
		return { ok: false, failure: { reason: "http", status: response.status } };
	}

	return read(body, response.status);
}

export function refreshAccessToken(input: {
	refreshToken: string;
	credentials: ZaloCredentials;
	signal?: AbortSignal;
}): Promise<ZaloResult<ZaloTokens>> {
	return call(
		() =>
			fetch(MESSAGING.zalo.endpoints.token, {
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					secret_key: input.credentials.appSecret,
				},
				body: new URLSearchParams({
					refresh_token: input.refreshToken,
					app_id: input.credentials.appId,
					grant_type: "refresh_token",
				}),
				signal:
					input.signal ?? AbortSignal.timeout(MESSAGING.zalo.requestTimeoutMs),
			}),
		(body, status) => {
			const parsed = schemas.messaging.zaloTokens.safeParse(body);
			if (!parsed.success) {
				return { ok: false, failure: { reason: "unparsed", status } };
			}

			return { ok: true, value: parsed.data };
		},
	);
}

export function readOaProfile(input: {
	accessToken: string;
	signal?: AbortSignal;
}): Promise<ZaloResult<ZaloOaProfile>> {
	return call(
		() =>
			fetch(MESSAGING.zalo.endpoints.profile, {
				method: "GET",
				headers: { access_token: input.accessToken },
				signal:
					input.signal ?? AbortSignal.timeout(MESSAGING.zalo.requestTimeoutMs),
			}),
		(body, status) => {
			const parsed = schemas.messaging.zaloOaProfileResponse.safeParse(body);
			if (!parsed.success) {
				return { ok: false, failure: { reason: "unparsed", status } };
			}

			return { ok: true, value: parsed.data.data };
		},
	);
}

export function sendText(input: {
	accessToken: string;
	userId: string;
	body: string;
	signal?: AbortSignal;
}): Promise<ZaloResult<ZaloSentMessage>> {
	return call(
		() =>
			fetch(MESSAGING.zalo.endpoints.send, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					access_token: input.accessToken,
				},
				body: JSON.stringify({
					recipient: { user_id: input.userId },
					message: { text: input.body },
				}),
				signal:
					input.signal ?? AbortSignal.timeout(MESSAGING.zalo.requestTimeoutMs),
			}),
		(body, status) => {
			const parsed = schemas.messaging.zaloSendResponse.safeParse(body);
			if (!parsed.success) {
				return { ok: false, failure: { reason: "unparsed", status } };
			}

			return { ok: true, value: parsed.data.data };
		},
	);
}

export function readUserProfile(input: {
	accessToken: string;
	userId: string;
	signal?: AbortSignal;
}): Promise<ZaloResult<ZaloUserProfile>> {
	const data = encodeURIComponent(JSON.stringify({ user_id: input.userId }));

	return call(
		() =>
			fetch(`${MESSAGING.zalo.endpoints.userDetail}?data=${data}`, {
				method: "GET",
				headers: { access_token: input.accessToken },
				signal:
					input.signal ?? AbortSignal.timeout(MESSAGING.zalo.requestTimeoutMs),
			}),
		(body, status) => {
			const parsed = schemas.messaging.zaloUserProfileResponse.safeParse(body);
			if (!parsed.success) {
				return { ok: false, failure: { reason: "unparsed", status } };
			}

			return { ok: true, value: parsed.data.data };
		},
	);
}
