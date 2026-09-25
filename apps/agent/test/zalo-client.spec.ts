import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { schemas } from "@crm/validation";
import type { z } from "zod";
import { MESSAGING } from "../agent/lib/messaging/messaging-config";
import {
	readOaProfile,
	readUserProfile,
	refreshAccessToken,
	sendText,
} from "../agent/lib/messaging/zalo-client";
import {
	classifyRefreshError,
	classifySendError,
	isNotFollower,
	isTokenFailure,
	sentenceFor,
	type ZaloFailure,
} from "../agent/lib/messaging/zalo-errors";

type ZaloJson = z.infer<typeof schemas.messaging.zaloJson>;

const realFetch = globalThis.fetch;

const CREDENTIALS = { appId: "app-1", appSecret: "secret-1" };

const TERMINAL_CODES = [-216, -220, -204, -205, -212, -219];

type Seen = { url: string; headers: Record<string, string>; body: string };

let seen: Seen[] = [];

function answers(payload: ZaloJson, status = 200) {
	globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
		seen.push({
			url: String(input instanceof Request ? input.url : input),
			headers: Object.fromEntries(
				Object.entries((init?.headers ?? {}) as Record<string, string>),
			),
			body: init?.body ? String(init.body) : "",
		});

		return new Response(JSON.stringify(payload), {
			status,
			headers: { "content-type": "application/json" },
		});
	}) as typeof fetch;
}

function rejects(error: Error) {
	globalThis.fetch = (async () => {
		throw error;
	}) as typeof fetch;
}

beforeEach(() => {
	seen = [];
});

afterEach(() => {
	globalThis.fetch = realFetch;
});

describe("the token response schema", () => {
	it("coerces a string expires_in to a number", () => {
		const parsed = schemas.messaging.zaloTokens.parse({
			access_token: "a",
			refresh_token: "r",
			expires_in: "90000",
		});

		expect(parsed.expires_in).toBe(90000);
	});

	it("refuses a response with no refresh token", () => {
		const parsed = schemas.messaging.zaloTokens.safeParse({
			access_token: "a",
			expires_in: 90000,
		});

		expect(parsed.success).toBe(false);
	});

	it("refuses an error envelope in place of tokens", () => {
		const parsed = schemas.messaging.zaloTokens.safeParse({
			error: -216,
			message: "Access token is invalid",
		});

		expect(parsed.success).toBe(false);
	});
});

describe("the OA profile schema", () => {
	it("reads the four fields the card needs", () => {
		const parsed = schemas.messaging.zaloOaProfileResponse.parse({
			error: 0,
			message: "Success",
			data: {
				oaid: 1234567890,
				name: "Tien Phuoc Clinic",
				avatar: "https://zdn.vn/avatar.png",
				is_verified: 1,
			},
		});

		expect(parsed.data.oaid).toBe("1234567890");
		expect(parsed.data.name).toBe("Tien Phuoc Clinic");
		expect(parsed.data.is_verified).toBe(true);
	});

	it("refuses a profile response with no data", () => {
		const parsed = schemas.messaging.zaloOaProfileResponse.safeParse({
			error: -216,
			message: "Access token is invalid",
		});

		expect(parsed.success).toBe(false);
	});
});

describe("refreshing the access token", () => {
	it("posts the three refresh fields with the secret key header", async () => {
		answers({ access_token: "a2", refresh_token: "r2", expires_in: "90000" });

		const result = await refreshAccessToken({
			refreshToken: "r1",
			credentials: CREDENTIALS,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.access_token).toBe("a2");
		expect(seen[0]?.url).toBe(MESSAGING.zalo.endpoints.token);
		expect(seen[0]?.headers.secret_key).toBe("secret-1");
		expect(seen[0]?.body).toContain("refresh_token=r1");
		expect(seen[0]?.body).toContain("app_id=app-1");
		expect(seen[0]?.body).toContain("grant_type=refresh_token");
	});

	it("never puts the secret in the query string", async () => {
		answers({ access_token: "a2", refresh_token: "r2", expires_in: 90000 });
		await refreshAccessToken({
			refreshToken: "r1",
			credentials: CREDENTIALS,
		});

		expect(seen[0]?.url).not.toContain("secret-1");
	});

	it("reports a vendor error code", async () => {
		answers({ error: -216, message: "Access token is invalid" });

		const result = await refreshAccessToken({
			refreshToken: "r1",
			credentials: CREDENTIALS,
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.failure).toEqual({
			reason: "code",
			status: 200,
			error: -216,
			vendorMessage: "Access token is invalid",
		});
	});

	it("reports an unparsed body", async () => {
		answers({ hello: "world" });

		const result = await refreshAccessToken({
			refreshToken: "r1",
			credentials: CREDENTIALS,
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.failure.reason).toBe("unparsed");
	});

	it("reports a server failure", async () => {
		answers({ message: "bad gateway" }, 502);

		const result = await refreshAccessToken({
			refreshToken: "r1",
			credentials: CREDENTIALS,
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.failure).toEqual({ reason: "http", status: 502 });
	});

	it("treats a 500 that carries an error code as transient", async () => {
		answers({ error: -216, message: "Access token is invalid" }, 500);

		const result = await refreshAccessToken({
			refreshToken: "r1",
			credentials: CREDENTIALS,
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.failure).toEqual({ reason: "http", status: 500 });
		expect(classifyRefreshError(result.failure).terminal).toBe(false);
	});

	it("reports a timeout apart from a network failure", async () => {
		rejects(Object.assign(new Error("aborted"), { name: "TimeoutError" }));
		const timedOut = await refreshAccessToken({
			refreshToken: "r1",
			credentials: CREDENTIALS,
		});

		rejects(new TypeError("fetch failed"));
		const offline = await refreshAccessToken({
			refreshToken: "r1",
			credentials: CREDENTIALS,
		});

		expect(timedOut.ok).toBe(false);
		expect(offline.ok).toBe(false);
		if (timedOut.ok || offline.ok) return;
		expect(timedOut.failure.reason).toBe("timeout");
		expect(offline.failure.reason).toBe("network");
	});
});

describe("reading the OA profile", () => {
	it("sends the access token as a header", async () => {
		answers({
			error: 0,
			data: { oaid: "oa-1", name: "Clinic", is_verified: true },
		});

		const result = await readOaProfile({ accessToken: "a2" });

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.oaid).toBe("oa-1");
		expect(seen[0]?.url).toBe(MESSAGING.zalo.endpoints.profile);
		expect(seen[0]?.headers.access_token).toBe("a2");
	});
});

describe("classifying a Zalo failure", () => {
	it("treats the rate limit code as transient", () => {
		const verdict = classifyRefreshError({
			reason: "code",
			status: 200,
			error: -32,
		});

		expect(verdict).toEqual({ code: "-32", terminal: false });
	});

	it("treats every other non-zero code as terminal", () => {
		for (const error of TERMINAL_CODES) {
			const verdict = classifyRefreshError({
				reason: "code",
				status: 200,
				error,
			});

			expect(verdict.terminal).toBe(true);
			expect(verdict.code).toBe(String(error));
		}
	});

	it("treats a server failure, a timeout and an unreadable body as transient", () => {
		const transient: ZaloFailure[] = [
			{ reason: "http", status: 500 },
			{ reason: "http", status: 503 },
			{ reason: "timeout" },
			{ reason: "network" },
			{ reason: "unparsed", status: 200 },
		];

		for (const failure of transient) {
			expect(classifyRefreshError(failure).terminal).toBe(false);
		}
	});

	it("uses one table for a refresh and for a send", () => {
		const failures: ZaloFailure[] = [
			{ reason: "code", status: 200, error: -32 },
			{ reason: "code", status: 200, error: -216 },
			{ reason: "timeout" },
			{ reason: "http", status: 500 },
		];

		for (const failure of failures) {
			expect(classifySendError(failure)).toEqual(classifyRefreshError(failure));
		}
	});
});

describe("the sentence a failure gets", () => {
	it("asks for a reconnect on an invalid or expired token", () => {
		expect(sentenceFor("-216")).toBe("The Zalo token needs a reconnect.");
		expect(sentenceFor("-220")).toBe("The Zalo token needs a reconnect.");
	});

	it("names rate limiting, silence and an unreadable answer", () => {
		expect(sentenceFor("-32")).toBe("Zalo is rate limiting this OA.");
		expect(sentenceFor("timeout")).toBe("Zalo did not answer.");
		expect(sentenceFor("network")).toBe("Zalo did not answer.");
		expect(sentenceFor("unparsed")).toBe(
			"Zalo answered in an unexpected shape.",
		);
		expect(sentenceFor("http-500")).toBe("Zalo did not answer.");
	});

	it("falls back to one refusal sentence", () => {
		expect(sentenceFor("-204")).toBe("Zalo refused the request.");
		expect(sentenceFor("-99999")).toBe("Zalo refused the request.");
	});

	it("never returns vendor text", async () => {
		answers({ error: -216, message: "Access token is invalid or expired" });

		const result = await refreshAccessToken({
			refreshToken: "r1",
			credentials: CREDENTIALS,
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		const sentence = sentenceFor(classifyRefreshError(result.failure).code);
		expect(sentence).not.toContain("Access token");
		expect(sentence).toBe("The Zalo token needs a reconnect.");
	});
});

describe("the send response schema", () => {
	it("coerces a numeric message id to a string", () => {
		const parsed = schemas.messaging.zaloSendResponse.parse({
			error: 0,
			message: "Success",
			data: { message_id: 8899776655 },
		});

		expect(parsed.data.message_id).toBe("8899776655");
	});

	it("refuses a send response with no message id", () => {
		expect(
			schemas.messaging.zaloSendResponse.safeParse({ error: 0, data: {} })
				.success,
		).toBe(false);
	});
});

describe("sending a text", () => {
	it("posts the recipient and the text with the token header", async () => {
		answers({ error: 0, message: "Success", data: { message_id: "m-1" } });

		const result = await sendText({
			accessToken: "access-1",
			userId: "person-1",
			body: "Chao anh",
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.message_id).toBe("m-1");
		expect(seen[0]?.url).toBe(MESSAGING.zalo.endpoints.send);
		expect(seen[0]?.headers.access_token).toBe("access-1");
		expect(JSON.parse(seen[0]?.body ?? "{}")).toEqual({
			recipient: { user_id: "person-1" },
			message: { text: "Chao anh" },
		});
	});

	it("never puts the token in the query string", async () => {
		answers({ error: 0, data: { message_id: "m-1" } });
		await sendText({
			accessToken: "access-1",
			userId: "person-1",
			body: "Chao anh",
		});

		expect(seen[0]?.url).not.toContain("access-1");
	});

	it("reports a token code as a token failure", async () => {
		answers({ error: -216, message: "Access token is invalid" });

		const result = await sendText({
			accessToken: "access-1",
			userId: "person-1",
			body: "Chao anh",
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(isTokenFailure(result.failure)).toBe(true);
		expect(classifySendError(result.failure).terminal).toBe(true);
		expect(sentenceFor(classifySendError(result.failure).code)).toBe(
			"The Zalo token needs a reconnect.",
		);
	});

	it("reports a rate limit as transient", async () => {
		answers({ error: -32, message: "Rate limited" });

		const result = await sendText({
			accessToken: "access-1",
			userId: "person-1",
			body: "Chao anh",
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(isTokenFailure(result.failure)).toBe(false);
		expect(classifySendError(result.failure).terminal).toBe(false);
	});

	it("carries the vendor text on the failure, never in the sentence", async () => {
		answers({ error: -32, message: "Rate limit exceeded for this OA" });

		const result = await sendText({
			accessToken: "access-1",
			userId: "person-1",
			body: "Chao anh",
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.failure).toEqual({
			reason: "code",
			status: 200,
			error: -32,
			vendorMessage: "Rate limit exceeded for this OA",
		});
		expect(sentenceFor(classifySendError(result.failure).code)).toBe(
			"Zalo is rate limiting this OA.",
		);
	});

	it("reports an answer it cannot read", async () => {
		answers({ error: 0, data: { nothing: true } });

		const result = await sendText({
			accessToken: "access-1",
			userId: "person-1",
			body: "Chao anh",
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.failure.reason).toBe("unparsed");
	});
});

describe("the user profile schema", () => {
	it("reads the name and the avatar", () => {
		const parsed = schemas.messaging.zaloUserProfileResponse.parse({
			error: 0,
			message: "Success",
			data: {
				user_id: 56782639,
				display_name: "Pham Khoa",
				avatar: "https://zdn.vn/a.jpg",
				user_gender: 1,
				shared_info: { phone: 841282987721 },
			},
		});

		expect(parsed.data.user_id).toBe("56782639");
		expect(parsed.data.display_name).toBe("Pham Khoa");
		expect(parsed.data.avatar).toBe("https://zdn.vn/a.jpg");
	});

	it("accepts a profile with no avatar", () => {
		const parsed = schemas.messaging.zaloUserProfileResponse.parse({
			error: 0,
			data: { user_id: "u-1", display_name: "Pham Khoa" },
		});

		expect(parsed.data.avatar).toBeUndefined();
	});
});

describe("reading a user profile", () => {
	it("puts the user id in the data query parameter", async () => {
		answers({
			error: 0,
			data: { user_id: "u-1", display_name: "Pham Khoa", avatar: "" },
		});

		const result = await readUserProfile({
			accessToken: "access-1",
			userId: "u-1",
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.display_name).toBe("Pham Khoa");
		expect(seen[0]?.url).toBe(
			`${MESSAGING.zalo.endpoints.userDetail}?data=${encodeURIComponent(
				JSON.stringify({ user_id: "u-1" }),
			)}`,
		);
		expect(seen[0]?.headers.access_token).toBe("access-1");
	});

	it("names the not-a-follower code", async () => {
		answers({ error: -213, message: "User has not followed OA" });

		const result = await readUserProfile({
			accessToken: "access-1",
			userId: "u-1",
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(isNotFollower(result.failure)).toBe(true);
		expect(isTokenFailure(result.failure)).toBe(false);
	});
});
